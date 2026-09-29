# LeftBehind ML Service

Optional Python service that adds **image similarity** as extra evidence to
Lost&Found matching. It is a separate process from the Oak/Supabase API and can
be omitted entirely — see "Degraded mode" below.

## What it does

```
Oak API  ──POST /predict──▶  FastAPI  ──▶  DINOv2 (facebook/dinov2-base)
                                                    │
                                          image_similarity (cosine, [-1, 1])
                                                    │
Oak API  ◀──── JSON ────────────────────────────────┘
                    { image_similarity, metadata_probability,
                      final_score, decision }
```

Two models, loaded once and cached in process memory:

| Model | Source | Size | Needed for |
|--------|--------|------|------------|
| scikit-learn `LogisticRegression` pipeline | `model/metadata_matcher.joblib` (tracked, 2 KB) | tiny | every request |
| DINOv2 `facebook/dinov2-base` | Hugging Face hub, **runtime download** | ~350 MB | requests carrying images |

The Oak API reads **only** `image_similarity`. `metadata_probability`,
`final_score` and `decision` are returned for standalone exploration and are
deliberately ignored by the production TypeScript matcher, which stays
authoritative for the final score.

## Requirements

- Python 3.10+ (developed on 3.13)
- `pip install -r requirements.txt` — `torch` is the heavy one; the CPU wheel is
  several hundred MB. Pin it in your deploy image rather than resolving latest.
- `model/metadata.json` and `model/metadata_matcher.joblib` must be present
  (they are tracked in Git)

### DINOv2 availability

`facebook/dinov2-base` is pulled from the Hugging Face hub on **first image
request**, not at install time, into the standard HF cache:

| Platform | Default cache location | Override |
|----------|------------------------|----------|
| Linux / production | `~/.cache/huggingface` | `HF_HOME` |
| Windows | `%USERPROFILE%\.cache\huggingface` | `HF_HOME` |

Implications for deployment:

- **Pre-warm the cache.** Start the service and issue one request with two image
  URLs before routing traffic to it, otherwise the first real request pays a
  multi-second model download. The service does this automatically at startup
  (best effort, non-fatal), but that warmup will itself block on the download.
- **Bake it into the image.** For immutable deploys, `pip install` at build time
  followed by a one-off download in the same build step gives a hermetic image
  with no runtime hub dependency.
- **Air-gapped or offline:** set `HF_HUB_OFFLINE=1`. The service will still boot;
  if DINOv2 is absent it logs a warning, serves `/health`, answers
  metadata-only requests, and retries the load on first image use.
- The download is **not** committed to this repo, and `.gitignore` blocks
  `*.safetensors` / `*.pt` / `*.pth` / `.huggingface/` from being added by
  accident.

## Running

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8001
```

| Flag | Prototype value | Notes |
|------|-----------------|-------|
| host | `0.0.0.0` | must bind `0.0.0.0`, not `127.0.0.1`, or the Oak API container cannot reach it |
| port | `8001` | any free port; must match `LEFTBEHIND_ML_SERVICE_URL` on the Oak side |
| workers | 1 (default) | **do not use `--workers N > 1` casually** — each worker process loads its own DINOv2 copy (~350 MB × N) and its own 10 MB image cache. Scale with replicas, not workers. |
| reload | off in production | reload re-forks and re-downloads |

Then point the API at it:

```bash
# in the Oak API environment (.env)
LEFTBEHIND_ML_SERVICE_URL=http://<host>:8001
```

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness. Touches no model — returns even with DINOv2 missing. |
| `POST` | `/predict` | `{"metadata_features": {...}, "image_a": "<url>", "image_b": "<url>"}`. Both images optional. |

## Image retrieval rules

The loader is deliberately narrow, because an image URL is attacker-controlled
data arriving from a user report:

- only `https://` is accepted;
- only Cloudinary delivery hosts (`res.cloudinary.com`) — `http://`,
  `file://`, `data:`, and lookalikes such as `res.cloudinary.com.evil.test` or
  `res.cloudinary.com@evil.test` are all rejected;
- redirects are refused, so an allowed host cannot bounce the fetch elsewhere;
- responses are capped at 10 MB, enforced by a streaming counter as well as
  `Content-Length`, and the declared length is not trusted;
- errors are generic — the host, path, status and stack trace never reach the
  client.

Local filesystem paths, `Path` objects, raw bytes and `PIL.Image` are still
accepted for offline/CLI use; the allowlist applies only to string URLs.

## Degraded mode

The service is **optional**. The Oak API treats every ML outcome as advisory:

| Condition | Result |
|-----------|--------|
| `LEFTBEHIND_ML_SERVICE_URL` unset | no HTTP request at all |
| Service down / unreachable | `image_similarity = null` |
| Request exceeds `LEFTBEHIND_ML_TIMEOUT_MS` | `image_similarity = null` |
| Whole run exceeds `LEFTBEHIND_ML_MATCHING_DEADLINE_MS` | remaining candidates get `null` |
| Source or candidate has no `imageUrl` | no request for that pair |

`null` means "no image evidence", which the existing weighted scorer treats
exactly as it treated a missing image before this service existed: the image
field drops out of both numerator and denominator and the score is the
metadata-only score. Report creation, Match persistence and notifications are
never blocked by ML.

## Production checklist

- [ ] DINOv2 cache pre-warmed in the image, or egress to the HF hub allowed
- [ ] `LEFTBEHIND_ML_SERVICE_URL` set on the Oak API, no trailing slash
- [ ] `LEFTBEHIND_ML_TIMEOUT_MS` and `LEFTBEHIND_ML_MATCHING_DEADLINE_MS` set
      on the Oak API (see `.env.example` in the repo root)
- [ ] Service reachable from the Oak API network, and **not** public — it has no
      auth; treat it as an internal service on a private network
- [ ] `/health` used as the readiness/liveness probe
- [ ] Memory sized for torch + one DINOv2 copy (budget ~1.5–2 GB RSS)
- [ ] `--workers 1`, scale via replicas
- [ ] Log level `warning` or higher; `info` prints a Hugging Face progress bar
