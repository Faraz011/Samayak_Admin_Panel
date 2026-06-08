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
┌──────────────────────────────────────────────────────┐
│                    Frontend                          │
│    Next.js 14 (App Router) + Tailwind + shadcn/ui    │
│    Figtree Font + Samayak Design System Tokens       │
├──────────────────────────────────────────────────────┤
│                    API Layer                         │
│    Next.js API Routes + Supabase Client              │
│    /api/health  /api/pdf-ingestions  /api/bulk-imports│
├──────────┬───────────────────────────┬───────────────┤
│ Supabase │  PostgreSQL + RLS         │  BullMQ       │
│          │  Auth + Storage           │  Worker       │
│          │  Realtime Subscriptions   │  Redis 7      │
└──────────┴───────────────────────────┴───────────────┘
```

### Trade-off Defense

Used **Supabase** (managed Postgres + Auth + Storage + Realtime) to eliminate boilerplate and gain RLS-level security and live subscriptions out of the box, while keeping the assignment's **BullMQ + Redis** worker pattern for heavy async PDF parsing — preserving the non-blocking API thread principle.

---

## Features

| Feature | Description |
|---------|-------------|
| **Dashboard** | 4 real-time KPIs: Room Utilization %, Empty Room Probability, Under-Running Courses, Avg Empty Room-Hours. Heatmap + bar charts. |
| **Departments** | Full CRUD with search, short code validation, soft delete with dependency warnings |
| **Rooms** | CRUD with type badges (classroom/lab), department filter, capacity validation |
| **Courses** | Mandatory branch+semester filter (URL-persisted), zero-credit flagging, type badges |
| **Faculty** | Role-colored badges (admin=blue, dean=indigo, hod=purple, coordinator=teal, professor=slate), soft delete with restore |
| **PDF Ingestion** | Drag-drop upload → BullMQ queue → Parse PDF → Fuzzy match faculty → Integrate timetable entries → Realtime status |
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
git clone https://github.com/YOUR_REPO/Samayak_Admin_Panel.git
cd Samayak_Admin_Panel
pnpm install
```

### 2. Environment Variables

```bash
cp .env.example apps/web/.env.local
cp .env.example apps/worker/.env
# Edit with your Supabase credentials
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
│   │   ├── lib/supabase/      # Client helpers
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

## License

MIT — Built for the Anugat AI hiring assignment.
