# Lost&Found — Lost & Found Platform

> **Lost something? Found something? Lost&Found helps connect the right person with the right item while protecting ownership information.**

Lost&Found is a full-stack Lost & Found web platform featuring smart matching, ownership verification, admin moderation, event management, and a polished dark-themed UI.

---

## Problem

Every day, thousands of items are lost across campuses, offices, events, and public spaces. The traditional lost-and-found system is broken: items pile up, owners never know their item was found, and finders have no easy way to return items.

## Solution

LeftBehind uses a **weighted matching algorithm** to automatically connect lost items with found items. When someone reports a lost item, the system scans all found items, surfaces possible matches ranked by confidence score, and facilitates secure ownership verification before handover.

---

## Features

- **User Authentication** — Secure registration/login with JWT
- **Lost & Found Reporting** — Detailed reports with image upload, categories, locations, and timestamps
- **Smart Matching** — Automatic weighted matching with transparent score breakdowns (0-100%)
- **Ownership Verification** — Private verification details only the genuine owner would know
- **Claims System** — Submit claims, admin review, approval/rejection workflow
- **Status Lifecycle** — Clean report status flow: LOST/FOUND → MATCHED → CLAIMED → VERIFIED → RETURNED → CLOSED
- **Notifications** — Real-time notifications for matches, claims, and status changes
- **Admin Dashboard** — Stats, report moderation, claim management, user management, audit logs
- **Event Management** — Create events with QR codes for location-based lost & found
- **Search & Filters** — Full-text search with type, category, status, location, and date filters
- **Report Editing** — Edit your own reports with pre-filled data
- **User Dashboard** — Overview of your reports, matches, claims, and notifications
- **Responsive Design** — Mobile-first dark theme UI
- **Security** — bcrypt, JWT, RBAC, rate limiting, CORS, Helmet, input validation, XSS prevention

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, React Router 6, Tailwind CSS, Lucide Icons, Axios |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| ORM | Prisma 5 |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Validation | Zod |
| Uploads | Multer |
| Security | Helmet, CORS, express-rate-limit |

---

## System Architecture

```
┌─────────────┐     HTTP/REST     ┌──────────────────┐     Prisma     ┌────────────┐
│  React SPA  │ ◄──────────────► │  Express Server  │ ◄────────────► │ PostgreSQL │
│  (Vite)     │   Port 5173      │  Port 5000       │               │            │
└─────────────┘                   └──────────────────┘               └────────────┘
                                    │       │       │
                                    ▼       ▼       ▼
                                  Auth   Upload   Matching
                                  (JWT)  (Multer) (Service)
```

---

## Database Architecture

```
User ──────┬──── Report ──────── Item
           │       │
           │    Match ──────── Match
           │       │
           │    Claim
           │
           ├──── Notification
           │
           └──── AuditLog

Event ───── Report
Category (standalone)
Location (standalone)
```

---

## Smart Matching Algorithm

The matching system uses a **weighted scoring** approach:

| Factor | Weight | Method |
|--------|--------|--------|
| Category | 25% | Exact match (0 or 100) |
| Keywords/Title | 25% | Jaccard word similarity |
| Description | 20% | Jaccard word similarity |
| Location | 20% | Jaccard location word similarity |
| Date/Time | 10% | Time proximity decay |

### Score Ranges

| Score | Rating | Action |
|-------|--------|--------|
| 90-100 | Very Strong Match | Highlighted, high priority |
| 75-89 | Strong Match | Prominently displayed |
| 60-74 | Possible Match | Suggested to user |
| 0-59 | Low Confidence | Not shown |

---

## Ownership Verification

1. **Reporter** sets private verification details (only visible to owner + admin)
2. **Claimant** provides their own verification details
3. **Admin** compares both sets to verify ownership
4. **Private details are never exposed publicly**

---

## Core User Flow

```
Register/Login → Post Lost Item → Upload Image → Category → Description
→ Location → Save Report → Automatic Match Search → Show Matches → Notification
→ Claim → Ownership Verification → Admin Review → Accept/Reject
→ Handover → Item Returned → Report Closed
```

---

## Installation

### Prerequisites
- Node.js v18+
- PostgreSQL v14+
- npm

### 1. Set up database
```sql
CREATE DATABASE leftbehind;
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env with your database credentials and JWT secret
```

### 3. Install dependencies
```bash
# From project root
npm install

# Backend
cd server && npm install && cd ..

# Frontend
cd client && npm install && cd ..
```

### 4. Run migrations and seed
```bash
npx prisma migrate dev
cd server && npm run prisma:seed && cd ..
```

### 5. Run the application
```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

---

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/leftbehind` |
| JWT_SECRET | Secret for JWT signing | Use a strong random string |
| PORT | Server port | `5000` |
| NODE_ENV | Environment | `development` or `production` |
| CLIENT_URL | Frontend URL for CORS | `http://localhost:5173` |
| MAX_FILE_SIZE | Max upload size in bytes | `5242880` (5MB) |
| UPLOAD_DIR | Upload directory path | `./uploads` |
| LEFTBEHIND_ML_SERVICE_URL | **Optional.** Internal URL of the Python ML service | `http://127.0.0.1:8001` |
| LEFTBEHIND_ML_TIMEOUT_MS | Per-request ML timeout in ms | `5000` |
| LEFTBEHIND_ML_MATCHING_DEADLINE_MS | Whole-run ML budget in ms | `5000` |

See `.env.example` for the full annotated list.

---

## ML Image Matching (optional)

An independent Python service adds **image similarity** to the existing
weighted matcher. It is a separate deployment and is **not required** — the
platform matches on metadata alone without it.

```
POST /api/reports
    ↓
matchingService.findMatches()
    ↓
async rankMatches()          ← one ML budget per operation
    ↓
mlImageSimilarityProvider()  ← only when BOTH reports have an imageUrl
    ↓
getImageSimilarity()         ← LEFTBEHIND_ML_SERVICE_URL
    ↓
Python FastAPI  POST /predict
    ↓
DINOv2 (facebook/dinov2-base) → cosine similarity
    ↓
image_similarity ──▶ existing weighted scoring → persistence threshold
    ↓
create_match_and_notify RPC
```

### Required backend variables

| Variable | Default | Meaning |
|----------|---------|---------|
| `LEFTBEHIND_ML_SERVICE_URL` | *(unset)* | Internal URL of the FastAPI service. Unset ⇒ ML disabled, no HTTP requests are made. |
| `LEFTBEHIND_ML_TIMEOUT_MS` | `5000` | Per-request timeout. Must exceed one round trip (measured 1.2–2.5 s warm). |
| `LEFTBEHIND_ML_MATCHING_DEADLINE_MS` | `5000` | Total budget for the image-evidence phase of one match run. Invalid values fall back to 5000. |

Prototype defaults: **timeout 5000 ms, matching deadline 5000 ms, concurrency 2.**
These are build-time constants, not env-tunable; only the three variables above
are configurable.

### What the Python service is and is not responsible for

- The service is **optional and advisory**. If it is unavailable, timing out, or
  missing entirely, `image_similarity` becomes `null` and matching degrades to
  **metadata-only** — the existing weighted score, persistence threshold, Match
  creation and notifications all behave exactly as they did before.
- **The Python `final_score` is NOT used.** The Oak API reads only
  `image_similarity` and feeds it in as one evidence field. The final score,
  confidence and persistence decisions remain entirely the responsibility of the
  existing TypeScript rule-based matcher.
- **DINOv2 provides `image_similarity` only** — a cosine similarity in
  `[-1, 1]` over 768-dimensional embeddings. It never influences the score on
  its own; it is one field among twelve in a weighted average (weight `0.10`).
- **Images are retrieved from Cloudinary** URLs stored on the report items. The
  service accepts **only** allowed HTTPS Cloudinary delivery URLs: `http://`,
  `file://`, non-Cloudinary hosts, and lookalike hosts are rejected, redirects
  are not followed, and responses are size-capped. It has no secrets and no
  database access.

### Operational notes

- ML requests run at most **2 concurrently**; every failure mode resolves to
  `null` rather than throwing, so a broken ML service can never fail report
  creation.
- The whole-run deadline bounds how long report creation waits for image
  evidence regardless of the per-request timeout.
- Python service requirements, model caching and the production checklist:
  [`ml-service/README.md`](ml-service/README.md).
- No Dockerfile or hosting config is included yet; deployment of the Python
  service is a separate step.

---

## API Overview

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /register`, `POST /login`, `GET /me`, `POST /forgot-password`, `POST /reset-password` |
| Reports | CRUD + `GET /my` + image upload |
| Search | Full-text with type/category/status/location/date filters |
| Matches | List, detail, update status (with auth) |
| Claims | Create (with reportId), list, detail, admin status update |
| Notifications | List, unread-count, mark-read, mark-all-read |
| Admin | Dashboard stats, report moderation, user management, audit logs |
| Events | CRUD (admin), public list |
| Categories | CRUD (admin), public list |

---

## Deployment

- **Frontend**: https://lost-found-client.vercel.app (Vercel; `VITE_API_URL` points at the Edge Function).
- **Backend**: Supabase Edge Function `api` → `https://cuhngnehtlswsdemsdpr.supabase.co/functions/v1/api` (deploy-verified 2026-09-25: health 200, CORS from `localhost:5173` + Vercel origin, register/login and forgot/reset-password round-trips green).
- **Password reset**: `POST /api/auth/forgot-password` returns a short-lived reset token directly in the JSON response (no email delivery yet); `POST /api/auth/reset-password` exchanges that token for a new password.
- **ML image service (optional)**: separate Python deployment, currently *not*
  deployed. Leaving `LEFTBEHIND_ML_SERVICE_URL` unset is a fully supported
  configuration — matching runs metadata-only. See
  [ML Image Matching](#ml-image-matching-optional).

## Security Features

- **Password hashing** with bcrypt (10 rounds)
- **JWT authentication** with 7-day expiry
- **RBAC** — Admin-only endpoints protected server-side
- **Ownership checks** — Users can only modify their own reports/matches
- **Input validation** — Zod schemas on all create/update endpoints
- **File upload validation** — Type (JPEG/PNG/WEBP) and size (5MB) limits
- **Rate limiting** — 100 requests per 15 minutes per IP
- **Security headers** — Helmet
- **CORS** — Configured for frontend origin only
- **SQL injection prevention** — Prisma ORM parameterized queries
- **Private details protection** — Never exposed publicly
- **Error handling** — No stack traces in production

---

## Known Limitations

- No real-time WebSocket notifications (uses polling)
- No AI/image-based matching (rule-based only)
- No email or push notifications
- No map-based location visualization
- No mobile app

## Future Scope

- AI/ML image similarity matching
- OCR for text recognition in images
- GPS/map-based location matching
- Email and push notifications
- Mobile application
- Multi-organization support
- Fraud detection system
- Advanced analytics dashboard

---

## License

ISC
