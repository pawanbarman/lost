"""LeftBehind ML inference API (prototype).

Thin HTTP layer over services.matcher: it validates the request, calls
matcher.score_pair, and maps matcher errors onto status codes. All matching
logic lives in the matcher, not here.

Run from ml-service/:  uvicorn app:app --reload
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, AsyncIterator

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# make `services` importable regardless of the process working directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from services import matcher  # noqa: E402

log = logging.getLogger("leftbehind.ml")


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Best-effort DINOv2 warmup.

    Loading the image model at startup moves the multi-second first-inference
    cost out of the request path. It is deliberately non-fatal: a cold cache or
    a missing model must not stop the service from booting, because /health and
    metadata-only /predict stay useful either way. The matcher still loads
    lazily on first use if this did not succeed.
    """
    try:
        matcher.warmup()
        log.info("image model warmed up")
    except Exception:
        log.warning("image model warmup failed; will retry on first use", exc_info=True)
    yield


app = FastAPI(title="LeftBehind ML", version="0.1.0", lifespan=lifespan)


class PredictRequest(BaseModel):
    # values stay untyped here so the matcher owns the numeric check and can
    # report which feature was bad
    metadata_features: dict[str, Any] = Field(
        description="similarity values keyed by feature name, as listed in metadata.json"
    )
    image_a: str | None = Field(default=None, description="local image path, optional")
    image_b: str | None = Field(default=None, description="local image path, optional")


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    """Generic 4xx body: pydantic's default detail can echo client input back."""
    log.info("rejected malformed request: %s", exc.errors()[0].get("type"))
    return JSONResponse(status_code=422, content={"detail": "invalid request"})


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness only. Deliberately does not touch the metadata or image model."""
    return {"status": "ok", "service": "leftbehind-ml"}


@app.post("/predict")
def predict(req: PredictRequest) -> dict[str, Any]:
    """Score one lost/found pair. Images are optional and handled by the matcher:
    without both of them the score falls back to metadata only."""
    # required feature names come from metadata.json via the matcher, so the
    # list is never duplicated here
    missing = [name for name in matcher.required_features() if name not in req.metadata_features]
    if missing:
        raise HTTPException(
            status_code=422,
            detail={"error": "missing_metadata_features", "missing": missing},
        )

    try:
        result = matcher.score_pair(req.metadata_features, req.image_a, req.image_b)
    except ValueError as exc:
        # non-numeric feature value, invalid image path, unreadable image
        log.info("invalid predict input: %s", exc)
        raise HTTPException(status_code=422, detail=str(exc)) from None
    except RuntimeError as exc:
        # model load / inference failure: log the cause, return nothing specific
        log.exception("inference failed")
        raise HTTPException(status_code=500, detail="inference failed") from None

    return {
        "metadata_probability": result["metadata_probability"],
        "image_similarity": result["image_similarity"],
        "final_score": result["final_score"],
        "decision": result["decision"],
    }
