"""LeftBehind prototype matching engine (self-contained, inference only).

Two evidence sources are combined:

  1. METADATA MODEL - the trained scikit-learn Pipeline in
     model/metadata_matcher.joblib (StandardScaler -> LogisticRegression).
     It consumes the 11 similarity features named in model/metadata.json.
     The feature order is read from that file, never hardcoded, so retraining
     with a different column order stays correct. The class-1 probability from
     predict_proba() is the metadata score. This module never trains,
     mutates, or overwrites the artifact.

  2. DINOV2 IMAGE SIMILARITY - facebook/dinov2-base via Hugging Face
     Transformers (AutoImageProcessor + AutoModel). The CLS token of the last
     hidden state is the 768-d embedding; it is L2-normalized, so the cosine
     similarity of two images is just their dot product.

  3. 90/10 ENSEMBLE - when both images are present,
        final = 0.9 * metadata_probability + 0.1 * image_similarity
     using the weights in metadata.json. The image term carries little weight
     in this prototype.

  4. PROTOTYPE DECISION THRESHOLDS - the cut-offs in metadata.json
     (0.70 / 0.40) map a final score onto HIGH_CONFIDENCE, POSSIBLE_MATCH, or
     LOW_CONFIDENCE. These are uncalibrated application thresholds for this
     prototype: final_score is a ranking score for triage, not a statistically
     validated probability of a true match.

  5. IMAGE FALLBACK - images are optional. With zero or only one image there is
     no image evidence, image_similarity is None, and the final score falls
     back to metadata_probability alone.

Artifacts and DINOv2 are loaded once and cached in module state, so repeated
predictions never reload them. DINOv2 is loaded on first image use rather than
at import: it is ~350MB and no prediction may need it. Call warmup() at
startup to pay that cost ahead of the first request.
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Mapping
from urllib.parse import urlsplit

import joblib
import numpy as np
import torch
from PIL import Image, UnidentifiedImageError
from transformers import AutoImageProcessor, AutoModel

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"
MODEL_PATH = MODEL_DIR / "metadata_matcher.joblib"
METADATA_PATH = MODEL_DIR / "metadata.json"

# Remote image downloads. Production Item.imageUrl values are Cloudinary
# secure_urls, which always resolve to res.cloudinary.com; nothing else is
# fetched, so this cannot be turned into a general-purpose URL reader.
ALLOWED_IMAGE_HOSTS = ("res.cloudinary.com",)
MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024
_REMOTE_READ_CHUNK = 64 * 1024

_load_lock = threading.Lock()
_state: dict[str, Any] = {}


# --------------------------------------------------------------------------
# metadata model
# --------------------------------------------------------------------------
def _load() -> None:
    """Load the metadata artifacts once. DINOv2 stays unloaded until needed."""
    if _state:
        return
    with _load_lock:
        if _state:
            return
        if not MODEL_PATH.is_file() or not METADATA_PATH.is_file():
            raise RuntimeError("model artifacts are missing")

        try:
            with METADATA_PATH.open(encoding="utf-8") as fh:
                meta = json.load(fh)
            classifier = joblib.load(MODEL_PATH)
        except Exception as exc:  # corrupt/missing artifact, unreadable pickle
            raise RuntimeError("failed to load the metadata model") from exc

        _state.update(
            features=list(meta["metadata_features"]),
            image_model=meta["image_model"],
            dim=int(meta["image_embedding_dimension"]),
            weights=meta["ensemble_weights"],
            thresholds=meta["decision_thresholds"],
            classifier=classifier,
            image_loaded=False,
        )


def required_features() -> list[str]:
    """The metadata feature names the trained model expects, in order."""
    _load()
    return list(_state["features"])


def metadata_probability(metadata_features: Mapping[str, Any]) -> float:
    """Class-1 probability from the trained Pipeline.

    Raises ValueError when a required feature is missing or a value cannot be
    converted to a float.
    """
    _load()
    names: list[str] = _state["features"]

    if not isinstance(metadata_features, Mapping):
        raise ValueError("metadata_features must be a mapping of feature name to number")

    missing = [name for name in names if name not in metadata_features]
    if missing:
        raise ValueError(f"missing metadata features: {', '.join(missing)}")

    values = []
    for name in names:
        raw = metadata_features[name]
        try:
            values.append(float(raw))
        except (TypeError, ValueError):
            raise ValueError(f"metadata feature '{name}' must be a number") from None

    try:
        # shape (1, n) so sklearn sees a single sample
        proba = _state["classifier"].predict_proba(np.asarray([values]))
    except Exception as exc:
        raise RuntimeError("metadata model inference failed") from exc
    return float(proba[0][1])


# --------------------------------------------------------------------------
# DINOv2 image similarity
# --------------------------------------------------------------------------
def _device() -> torch.device:
    """CUDA when available, otherwise CPU."""
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def _ensure_image_model() -> None:
    """Load facebook/dinov2-base once, on the best available device."""
    _load()
    if _state.get("image_loaded"):
        return
    with _load_lock:
        if _state.get("image_loaded"):
            return
        device = _device()
        name = _state["image_model"]
        try:
            processor = AutoImageProcessor.from_pretrained(name)
            model = AutoModel.from_pretrained(name).to(device)
        except Exception as exc:
            raise RuntimeError("failed to load the DINOv2 image model") from exc

        _state.update(
            processor=processor,
            image_model_obj=model.eval(),
            image_device=device,
            image_loaded=True,
        )


def _looks_remote(value: str) -> bool:
    """True when the string is meant as a URL rather than a local path."""
    return "://" in value


def _validate_remote_url(value: str) -> str:
    """Accept only https:// on a Cloudinary delivery host.

    Anything else - http, file, ftp, data, javascript, a look-alike host such
    as res.cloudinary.com.evil.test - is rejected before a socket is opened.
    """
    parts = urlsplit(value)
    if parts.scheme.lower() != "https":
        raise ValueError("invalid image path")
    host = (parts.hostname or "").lower()
    if not any(host == allowed or host.endswith("." + allowed) for allowed in ALLOWED_IMAGE_HOSTS):
        raise ValueError("invalid image path")
    return value


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """Refuse redirects so a Cloudinary URL cannot bounce us to another host."""

    def redirect_request(self, *args: Any, **kwargs: Any) -> None:
        return None


def _download_image(value: str) -> bytes:
    """Fetch an allow-listed https image, capped at MAX_REMOTE_IMAGE_BYTES.

    Content-Length is checked first as a cheap rejection, but is not trusted:
    the body is streamed in chunks and cut off the moment it runs past the cap.
    Errors are collapsed into the same terse ValueErrors the local path uses,
    so a client never learns the host, the status, or the reason.
    """
    url = _validate_remote_url(value)
    opener = urllib.request.build_opener(_NoRedirect)
    request = urllib.request.Request(url, headers={"Accept": "image/*"})
    try:
        with opener.open(request, timeout=10) as response:
            status = getattr(response, "status", None) or response.getcode()
            if not 200 <= int(status) < 300:
                raise ValueError("image could not be read")

            declared = response.headers.get("Content-Length")
            # cheap first pass only; a missing or unparsable header is fine
            # because the streaming cap below is what actually enforces the limit
            if declared is not None and declared.strip().isdigit():
                if int(declared) > MAX_REMOTE_IMAGE_BYTES:
                    raise ValueError("image could not be read")

            data = bytearray()
            while True:
                chunk = response.read(_REMOTE_READ_CHUNK)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > MAX_REMOTE_IMAGE_BYTES:
                    raise ValueError("image could not be read")
    except ValueError:
        raise
    except urllib.error.HTTPError as exc:
        # covers 3xx (redirect refused) and 4xx/5xx alike
        raise ValueError("image could not be read") from None
    except Exception:
        # URLError, socket timeouts, TLS failures, protocol errors
        raise ValueError("image could not be read") from None

    if not data:
        raise ValueError("image could not be read")
    return bytes(data)


def _to_pil(image: Any) -> Image.Image:
    """Open a PIL image, raw bytes, a local path, or an https image URL as RGB."""
    try:
        if isinstance(image, Image.Image):
            pil = image
        elif isinstance(image, (bytes, bytearray)):
            import io

            pil = Image.open(io.BytesIO(bytes(image)))
        elif isinstance(image, (str, Path)):
            value = str(image)
            if _looks_remote(value):
                # https Cloudinary URL: fetch it, then decode the bytes
                import io

                pil = Image.open(io.BytesIO(_download_image(value)))
            else:
                # validate the path before opening so failures are cheap and clear
                path = Path(value)
                if not path.is_file():
                    raise ValueError("invalid image path")
                pil = Image.open(path)
        else:
            raise ValueError("unsupported image input")
    except ValueError:
        raise
    except (OSError, UnidentifiedImageError):
        raise ValueError("image could not be read") from None

    if pil.width < 1 or pil.height < 1:
        raise ValueError("image could not be read")
    return pil.convert("RGB")


def embed_image(image: Any) -> np.ndarray:
    """L2-normalized 768-d DINOv2 CLS embedding for one image."""
    _ensure_image_model()
    device: torch.device = _state["image_device"]
    pil = _to_pil(image)

    try:
        inputs = _state["processor"](images=pil, return_tensors="pt")
        # every tensor goes to the model's device, not just the pixel values
        inputs = {k: v.to(device) for k, v in inputs.items()}
        with torch.no_grad():
            out = _state["image_model_obj"](**inputs)
            cls = out.last_hidden_state[:, 0, :]  # CLS token
            vector = torch.nn.functional.normalize(cls, p=2, dim=1)
    except ValueError:
        raise
    except Exception as exc:
        raise RuntimeError("image model inference failed") from exc

    embedding = vector.squeeze(0).cpu().numpy().astype(np.float32)
    if embedding.size != _state["dim"]:
        raise RuntimeError("unexpected image embedding dimension")
    return embedding


def cosine_similarity(a: Any, b: Any) -> float:
    """Cosine similarity of two L2-normalized embeddings (i.e. a dot product)."""
    va = np.asarray(a, dtype=np.float32).reshape(-1)
    vb = np.asarray(b, dtype=np.float32).reshape(-1)
    if va.size != vb.size:
        raise ValueError("image embeddings have different sizes")
    return float(np.clip(float(np.dot(va, vb)), -1.0, 1.0))


# --------------------------------------------------------------------------
# ensemble + decision
# --------------------------------------------------------------------------
def _decide(final_score: float) -> str:
    """Prototype application thresholds from metadata.json, not calibrated."""
    thresholds = _state["thresholds"]
    if final_score >= thresholds["high_confidence"]:
        return "HIGH_CONFIDENCE"
    if final_score >= thresholds["possible_match"]:
        return "POSSIBLE_MATCH"
    return "LOW_CONFIDENCE"


# --------------------------------------------------------------------------
# public API used by app.py
# --------------------------------------------------------------------------
def score_pair(
    metadata_features: Mapping[str, Any],
    image_a: Any = None,
    image_b: Any = None,
) -> dict[str, Any]:
    """Score one lost/found pair.

    metadata_features: mapping of the 11 metadata feature names to numbers.
    image_a / image_b: optional PIL images, raw bytes, or local paths. Image
    evidence is used only when BOTH are given; otherwise the final score falls
    back to the metadata probability.
    """
    _load()

    meta_score = metadata_probability(metadata_features)

    image_sim: float | None = None
    if image_a is not None and image_b is not None:
        image_sim = cosine_similarity(embed_image(image_a), embed_image(image_b))

    weights = _state["weights"]
    if image_sim is None:
        final = meta_score
    else:
        final = weights["metadata"] * meta_score + weights["image"] * image_sim

    return {
        "metadata_probability": meta_score,
        "image_similarity": image_sim,
        "final_score": final,
        "decision": _decide(final),
    }


def warmup() -> None:
    """Optional startup call to load DINOv2 ahead of the first prediction."""
    _ensure_image_model()
