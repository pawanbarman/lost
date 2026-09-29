# ML Image Matching — Progress

Last updated: 2026-09-29 · Repo: `F:\lost` · Branch: `main` (uncommitted work in tree)

Fast-orientation doc for the DINOv2 image-matching integration. Complementary to `README.md`
(architecture + how to run) and `ml-service/README.md` (Python service runbook). This file records
**what was built, what was verified, and what still blocks deployment**.

Status: **code complete and verified. NOT ready to deploy — 2 hard blockers, see §5.**

---

## 1. What this is

An optional Python service that adds `image_similarity` as extra evidence to the existing
weighted matcher. The Oak/Supabase API is unchanged in its scoring authority.

```
POST /api/reports
    ↓
matchingService.findMatches()
    ↓
async rankMatches()                    ← one ML budget per operation
    ↓
mlImageSimilarityProvider()            ← only when BOTH reports have an imageUrl
    ↓
getImageSimilarity()                   ← LEFTBEHIND_ML_SERVICE_URL
    ↓
Python FastAPI  POST /predict
    ↓
DINOv2 (facebook/dinov2-base) → cosine similarity
    ↓
image_similarity ──▶ existing weighted scoring → persistence threshold
    ↓
create_match_and_notify RPC
```

**The Python `final_score` is never used.** The API reads only `image_similarity` and passes it
in as one evidence field among twelve (weight `0.10`) in a renormalized weighted average.

---

## 2. Done & verified

### Phase A — Integration ✅
- `matching/mlClient.ts` (new) — env-driven HTTP client, abortable timeout, validates the
  response, returns `null` on every failure mode.
- `matching/mlImageProvider.ts` (new) — returns `null` unless both items have an `imageUrl`.
- `matching/aiMatchingService.ts` — async worker pool, per-operation promise memo.
- `matching/matchingService.ts`, `routers/reports.ts` — wired to the provider.
- `ml-service/` (new) — FastAPI app, matcher, secure remote-image loader, metadata artifacts.

### Phase B — Reliability hardening ✅
- Default timeout `8000 → 2000` ms; `LEFTBEHIND_ML_TIMEOUT_MS` still overrides.
- Per-operation promise memo keyed `${lost.id}:${found.id}`, sharing in-flight requests.
- Sync provider throws made safe (`Promise.resolve().then(...)`).
- Best-effort FastAPI lifespan warmup — non-fatal, `/health` and metadata-only unaffected.
- **Whole-operation ML deadline** — `LEFTBEHIND_ML_MATCHING_DEADLINE_MS` (default 5000).
  Races each request against the remaining budget; expired candidates get `image_similarity = null`
  and are never started. Cannot throw, cannot hang.

### Phase C — Verification ✅
Full read-only audit, all against the real code (transport stubbed only where noted):

- **Code path** — all 18 checkpoints traced to file:line.
- **Score semantics** — proved empirically, not by inspection. Against a live service with
  `sim = 0.0082`: metadata-only `0.7600` → with image `0.6716`. A `0.9/0.1` ensemble would give
  `0.6848`, so the ensemble definitively does **not** exist. `score(null) === metadata-only` is
  `true`, so ML-off reproduces the pre-existing score exactly.
- **Security** — 11 hostile URLs rejected (including `res.cloudinary.com.evil.test` and
  `res.cloudinary.com@evil.test`), redirects refused, 10 MB cap enforced by streaming counter
  against a *lying* `Content-Length`, no host/path/traceback in any error.
- **Test totals** — Deno **112/112** (17 files) · Python **46/46**.

### Phase D — Documentation ✅
- `.env.example` — ML block, 3 variables, annotated.
- `README.md` — "ML Image Matching (optional)" + env table rows + deployment bullet.
- `ml-service/README.md` (new) — runbook, model caching, production checklist.
- `.gitignore` — Python artifacts + model-weight guards (`*.bin`, `*.safetensors`, `.huggingface/`).
  Verified the 2 KB metadata artifacts stay trackable.

### Phase E — Deployment audit ✅
Read-only Render compatibility audit. Findings in §5.

---

## 3. Files touched

| File | Status |
|---|---|
| `supabase/functions/api/matching/mlClient.ts` | new |
| `supabase/functions/api/matching/mlImageProvider.ts` | new |
| `supabase/functions/api/matching/aiMatchingService.ts` | modified |
| `supabase/functions/api/matching/matchingService.ts` | modified |
| `supabase/functions/api/routers/reports.ts` | modified |
| `supabase/functions/api/tests/mlClient.test.ts` | new |
| `supabase/functions/api/tests/mlImageWiring.test.ts` | new |
| `supabase/functions/api/tests/matchingEngine.test.ts` | modified |
| `ml-service/app.py`, `ml-service/services/matcher.py`, `ml-service/requirements.txt` | new |
| `ml-service/model/metadata.json`, `metadata_matcher.joblib` | new (tracked artifacts) |
| `ml-service/README.md`, `README.md`, `.env.example`, `.gitignore` | new / modified |

**Deliberately untouched:** `ruleBasedMatcher.ts`, `featureExtractor.ts`, the RPC migration,
Prisma, claims, found feed, admin, handover, frontend.

---

## 4. Environment facts (these cost real time to discover)

### Measured ML latency (warm DINOv2, real Cloudinary downloads, public internet)
- 8 warm requests: `1123 1216 1399 1404 1434 1436 1719 1956` ms — median ~1419 ms.
- Two 592 KB images: **2465 ms**.
- Warm `/health` after process start: **~21 s** (synchronous lifespan warmup).

This is why the timeout is 5000 ms and not 2000 — the original 2000 ms default was measured
exceeding real latency and silently dropping image evidence.

### Prototype defaults
`timeout 5000 ms` · `matching deadline 5000 ms` · `concurrency 2` — concurrency is a build-time
constant, only the other two are env-tunable.

### Commands that work
```bash
# Python (from ml-service/)
HF_HUB_OFFLINE=1 py -3 -W ignore -m uvicorn app:app --host 0.0.0.0 --port 8001

# Deno (from supabase/functions/api/)
deno test --config ../deno.json --allow-env --allow-net tests/     # 112/112
deno check index.ts
deno lint matching/ tests/mlClient.test.ts tests/mlImageWiring.test.ts
```

### Live smoke test (both services, no config change needed)
Start Python on `:8011`, then:
```bash
LEFTBEHIND_ML_SERVICE_URL=http://127.0.0.1:8011 LEFTBEHIND_ML_TIMEOUT_MS=5000 \
  deno run --config ../deno.json --allow-env --allow-net <script>.ts
```
`https://res.cloudinary.com/demo/image/upload/sample.jpg` and `cld-sample-5.jpg` are public
Cloudinary demo images that work for this.

### Gotchas
- `ml-service/` is **untracked** — `git ls-files ml-service/` returns nothing.
- `PORT=x uvicorn --port $PORT` fails (the var isn't set until the command runs). Export first.
- `metadata_matcher.joblib` was pickled with **scikit-learn 1.6.1**; local env has 1.9.1 and
  emits `InconsistentVersionWarning`.
- The DINOv2 model id is **not** hardcoded in Python — it comes from `metadata.json`
  (`image_model: "facebook/dinov2-base"`), so the tracked artifact is the source of truth.
- 12 Deno lint findings in edited pre-existing files are baseline, not from this work.
- Root `.gitignore` lost its `uploads/*` rules in an earlier (Express→Oak) migration, before this
  work — not collateral from the ML tasks.

---

## 5. NOT DEPLOYED — blockers

| # | Severity | Blocker | Fix |
|---|---|---|---|
| 1 | **Hard** | `ml-service/` is entirely untracked. Render builds from a commit. | `git add ml-service/` |
| 2 | **Hard** | `uvicorn app:app` ignores `$PORT` and binds `127.0.0.1`. Verified: `PORT=9999` → served on `:8000`. | Start command: `uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1` |
| 3 | **High** | `requirements.txt` has **zero pins**; joblib needs scikit-learn 1.6.1. | `scikit-learn==1.6.1` |
| 4 | **High** | Unpinned `torch` on Linux pulls the **CUDA** build (multi-GB) from PyPI. Local is `+cpu`. | `pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu` |
| 5 | Medium | No `.python-version` / `runtime.txt` / `pyproject.toml`. | Set `PYTHON_VERSION` in Render |
| 6 | Medium | DINOv2 downloads at **startup**, not build. Cold start can be minutes with `/health` unreachable meanwhile. | Pre-download in build, or `HF_HOME` on a persistent disk |
| 7 | Low | Bare `uvicorn` — no uvloop/httptools. | `uvicorn[standard]` |

### Recommended Render config (prototype)
| Setting | Value |
|---|---|
| Type | Web Service |
| Root Directory | `ml-service` |
| Runtime | Python 3.12 |
| Build | `pip install --upgrade pip && pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu && pip install -r requirements.txt` |
| Start | `uvicorn app:app --host 0.0.0.0 --port $PORT --workers 1 --log-level info` |
| Health check | `/health` |
| Instance | Starter (512 MB likely too small; budget ~1.5–2 GB RSS) |
| Env | `PYTHON_VERSION=3.12.x`, `HF_HOME=/opt/render/project/src/.hf` |
| Auto-deploy | **off** until 1 and 3 are resolved |

### Security note
The Python service is **unauthenticated**. A public Render URL means anyone can `POST /predict`
and force DINOv2 inference. Keep it private or put it behind a network boundary.

### Then, on the Oak side
```
LEFTBEHIND_ML_SERVICE_URL=https://<service>.onrender.com
LEFTBEHIND_ML_TIMEOUT_MS=5000
LEFTBEHIND_ML_MATCHING_DEADLINE_MS=5000
```
Leaving `LEFTBEHIND_ML_SERVICE_URL` unset is fully supported — matching runs metadata-only.

---

## 6. Not run / out of scope

- `tests/flows/integration.flow.ts` — **NOT RUN: external integration environment unavailable.**
  Hard-exits without `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. No config was changed to
  force it. The Oak→Supabase legs (DB, RPC, notifications) are verified statically and by unit
  tests only, not end-to-end.
- Not created: Dockerfile, `render.yaml`, `Procfile`, deploy scripts, cloud resources.
- No credentials touched. Only `.env.example` is tracked; no `.env` committed.

---

## 7. Fresh-session guide

```bash
cd F:/lost
git status --short                 # confirm nothing new appeared
cd supabase/functions/api
deno test --config ../deno.json --allow-env --allow-net tests/   # expect 112/112
```
Read §4 before touching the ML service — the latency numbers and the sklearn pin are the two
things most likely to bite. Read §5 before any deploy attempt.

**Do not** change the scoring algorithm, `PERSISTENCE_THRESHOLD`, the RPC, or the six ML env vars'
semantics without re-running the full audit — the "existing score preserved" guarantee is asserted
in `tests/mlImageWiring.test.ts` and must stay true.
