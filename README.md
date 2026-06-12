# Samayak Admin Panel

> Academic Operations Platform for BIT Mesra CSE Spring 2026  
> Built for the Anugat AI hiring assignment

![Stack](https://img.shields.io/badge/Next.js%2014-000?logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)
![BullMQ](https://img.shields.io/badge/BullMQ-Redis-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Frontend                              │
│      Next.js 14 (App Router) + Tailwind + shadcn/ui          │
│      Figtree Font + Samayak Design System Tokens             │
├──────────────────────────────────────────────────────────────┤
│                        API Layer                             │
│      Next.js API Routes + Supabase Client                    │
│      /api/health  /api/pdf-ingestions  /api/bulk-imports     │
├──────────┬───────────────────────────────┬───────────────────┤
│ Supabase │  PostgreSQL + RLS             │   Local OCR       │
│          │  Auth + Storage               │   Tesseract.js    │
│          │  Realtime Subscriptions       │   pdf-to-png-conv │
└──────────┴───────────────────────────────┴───────────────────┘
```

### Trade-off Defense

Used **Supabase** (managed Postgres + Auth + Storage + Realtime) to eliminate boilerplate and gain RLS-level security and live subscriptions out of the box. Leveraged **Tesseract.js** paired with **pdf-to-png-converter** inside the API thread to perform zero-dependency, local OCR rendering. This entirely removes dependencies on external third-party OCR keys (e.g., OCR.space) and prevents rate-limit failures on large scanned PDFs.

---

## Advanced Ingestion Pipeline

The platform features a highly advanced, self-healing **PDF Timetable Ingestion Pipeline** optimized for BIT Mesra's layout formats:

```
[ Upload PDF ] ──► [ Check Text Layer ] 
                       │
                       ├─► select-text ──► [ standard pdf-parse ] ────────┐
                       │                                                  ▼
                       └─► empty/scan  ──► [ pdf-to-png-converter ] ──► [ Tesseract.js ]
                                                                          │
  ┌───────────────────────────────────────────────────────────────────────┘
  ▼
[ Groq LLM Pass 1 ] ──► Extract raw grid blocks (e.g., "CD", "AIML", room "219")
  │
  ▼
[ Groq LLM Pass 2 ] ──► Resolve abbreviations using course-faculty mapping tables
  │
  ▼
[ Fuzzy Matching ] ──► Match courses, rooms & faculty (Levenshtein + Token Overlap)
  │
  ▼
[ DB Integration ] ──► Insert / Update timetable entries (allows null rooms/faculty, 3-period lab slots)
```

1. **Local OCR fallback**: If `pdf-parse` extracts insufficient text (<50 chars), the PDF pages are rasterized into high-resolution PNGs at `viewportScale: 2.0` and fed page-by-page to a local **Tesseract.js** worker running on Node.js threads.
2. **Two-Pass Groq LLM Strategy**: 
   * **Pass 1 (Grid Extraction)**: Isolates the raw timetable grid day, period, room, section, and abbreviation.
   * **Pass 2 (Course Resolution)**: Parses the course-to-abbreviation mapping table from the bottom of the document and maps grid labels (e.g., `CD` -> `CS333`, `CNS` -> `IT349`).
3. **Robust Fuzzy Matching**: Uses combined **Levenshtein distance (0.55 threshold)**, **token overlap**, and **substring matching** to match OCR-garbled names (e.g., `Dr. Itu Snigh` matches `Dr. Itu Singh`).
4. **Self-Healing Inserts**: Auto-creates missing courses, sections, and rooms. If room numbers or faculty names cannot be resolved, entries are created with `null` references instead of discarding the row.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | 4 real-time KPIs: Room Utilization %, Empty Room Probability, Under-Running Courses, Avg Empty Room-Hours. Heatmap + bar charts. |
| **Departments** | Full CRUD with search, short code validation, soft delete with dependency warnings |
| **Rooms** | CRUD with type badges (classroom/lab), department filter, capacity validation |
| **Courses** | Mandatory branch+semester filter (URL-persisted), zero-credit flagging, type badges |
| **Faculty** | Role-colored badges (admin=blue, dean=indigo, hod=purple, coordinator=teal, professor=slate), soft delete with restore |
| **PDF Ingestion** | Local page-by-page OCR + Groq LLM abbreviation resolution + database auto-matching |
| **Bulk Import** | CSV/XLSX upload with entity type selector, per-row validation, duplicate handling |
| **Health Check** | `/api/health` — DB, Redis, Queue status with latency metrics |
| **Auth + RLS** | Supabase Auth with row-level security policies. Role-based access control. |
| **Correlation IDs** | Request tracing via middleware-injected `x-correlation-id` headers |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- Docker (for Redis, or provide `REDIS_URL`)

### 1. Clone & Install

```bash
git clone https://github.com/Faraz011/Samayak_Admin_Panel.git
cd Samayak_Admin_Panel
pnpm install
```

### 2. Environment Variables

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/worker/.env
# Edit with your Supabase credentials and GROQ_API_KEY
```

### 3. Database Setup

Run the migration SQL in your Supabase SQL Editor:
```bash
# Copy contents of supabase/migrations/001_initial.sql
# Paste and run in Supabase Dashboard → SQL Editor
```

Then run the seed:
```bash
# Copy contents of supabase/seed.sql
# Paste and run in Supabase Dashboard → SQL Editor

# Then create auth users:
pnpm --filter @samayak/web seed
```

### 4. Run Development

```bash
# Start Redis (if using Docker)
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Start web app
pnpm dev:web

# Start worker (in another terminal)
pnpm dev:worker
```

### 5. Docker Compose (One Command)

```bash
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000)

---

## Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@samayak.demo | admin123 |
| **Dean** | dean@samayak.demo | dean123 |
| **HoD** | hod@samayak.demo | hod123 |
| **Coordinator** | coordinator@samayak.demo | coord123 |
| **Professor** | professor@samayak.demo | professor123 |

---

## Project Structure

```
samayak-admin/
├── apps/
│   ├── web/                    # Next.js 14 App Router
│   │   ├── app/
│   │   │   ├── (app)/         # Authenticated routes
│   │   │   │   ├── dashboard/ # Analytics dashboard
│   │   │   │   ├── departments/ # CRUD
│   │   │   │   ├── rooms/     # CRUD
│   │   │   │   ├── courses/   # CRUD + filters
│   │   │   │   ├── faculty/   # CRUD + soft delete
│   │   │   │   ├── pdf-ingestion/ # Upload + status
│   │   │   │   └── bulk-imports/  # CSV/XLSX import
│   │   │   ├── (auth)/login/  # Login page
│   │   │   └── api/           # Health, PDF, Bulk APIs
│   │   ├── components/ui/     # Samayak-themed components
│   │   ├── lib/               # fuzzy-match, pdf-processor
│   │   └── scripts/seed.ts    # Demo data seeder
│   └── worker/                # BullMQ + Redis worker
│       └── src/
│           ├── processors/    # PDF & bulk import
│           └── lib/           # Parser, fuzzy match
├── packages/
│   ├── shared/                # Zod schemas, types, constants
│   └── db/                    # Supabase client factory
├── supabase/
│   ├── migrations/            # SQL schema
│   └── seed.sql               # Demo data
├── docker-compose.yml
└── README.md
```

---

## Design System

Built on the [Samayak Design System](https://serveranugatai-sudo.github.io/Samayak-Design-System/):

- **Font**: Figtree (300–900 weights)
- **Gradient**: `linear-gradient(105deg, #256199, #3DA1FF)`
- **Border Radius**: Cards 22px, Buttons/Inputs 999px (pill)
- **Shadows**: 3-tier elevation system
- **Colors**: Brand blue (#3DA1FF), deep (#256199), success (#27ae8a), warning (#f5a524), error (#ef4655)

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check (DB, Redis, Queue) |
| `/api/pdf-ingestions` | POST | Upload PDF → queue job |
| `/api/pdf-ingestions` | GET | List all ingestions |
| `/api/bulk-imports` | POST | Upload CSV/XLSX → queue job |
| `/api/bulk-imports` | GET | List all imports |

---

## Deployment

This platform is optimized for modern cloud deployments. Follow these instructions to deploy the complete stack:

### 1. Database & Storage (Supabase)
- Create a project on [Supabase](https://supabase.com).
- Run the SQL scripts in [001_initial.sql](file:///c:/Users/Faraz/Samayak_Admin_Panel/supabase/migrations/001_initial.sql) and [seed.sql](file:///c:/Users/Faraz/Samayak_Admin_Panel/supabase/seed.sql) in the Supabase SQL editor.
- Create a **Public** storage bucket named `pdf-ingestions`.

### 2. Message Broker (Upstash Redis)
- Create a Serverless Redis instance on [Upstash](https://upstash.com) (free tier).
- Copy the **Redis URL** starting with `rediss://` (enables TLS).

### 3. Frontend Web App (Vercel)
- Deploy the repository to [Vercel](https://vercel.com).
- Add the following environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_GROQ_API_KEY`
  - `REDIS_URL` (your Upstash URL starting with `rediss://`)

### 4. Background Queue Worker (Render - Free Tier)
- Create a new **Web Service** on [Render](https://render.com) (free tier).
- Link your repository and set the following configurations:
  - **Root Directory**: *Leave completely empty*
  - **Dockerfile Path**: `apps/worker/Dockerfile`
  - **Docker Build Context Directory**: `.`
- Add the environment variables:
  - `REDIS_URL` (your Upstash URL starting with `rediss://`)
  - `SUPABASE_URL` (corresponds to `NEXT_PUBLIC_SUPABASE_URL`)
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `NEXT_PUBLIC_GROQ_API_KEY` (or `GROQ_API_KEY`)
  - `PORT`: `3000` (Render will automatically bind to this)
- Render will compile the Docker container and start the worker along with its built-in HTTP health check server.

---

## License

MIT — Built for the Anugat AI hiring assignment.


