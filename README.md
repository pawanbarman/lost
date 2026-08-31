# LeftBehind — Lost & Found Platform

> **Lost something? Found something? LeftBehind helps connect the right person with the right item while protecting ownership information.**

LeftBehind is a full-stack Lost & Found web platform featuring smart matching, ownership verification, admin moderation, event management, and a polished dark-themed UI.

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

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@leftbehind.com | admin123 |
| User | john@example.com | user123 |
| User | jane@example.com | user123 |

---

## API Overview

| Group | Endpoints |
|-------|-----------|
| Auth | `POST /register`, `POST /login`, `GET /me` |
| Reports | CRUD + `GET /my` + image upload |
| Search | Full-text with type/category/status/location/date filters |
| Matches | List, detail, update status (with auth) |
| Claims | Create (with reportId), list, detail, admin status update |
| Notifications | List, unread-count, mark-read, mark-all-read |
| Admin | Dashboard stats, report moderation, user management, audit logs |
| Events | CRUD (admin), public list |
| Categories | CRUD (admin), public list |

---

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
