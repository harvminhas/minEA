# minEA

**Model-driven Enterprise Architecture for SMBs.**

Every element is a real object — capabilities, applications, data stores, APIs, agents — with properties, relationships, and identity. Views are projections of the model, not pictures.

## Auth & Tenancy (v1)

- **Org = tenant.** Users belong to orgs via `org_memberships`. Workspaces belong to orgs.
- **Roles:** Org (`owner`, `admin`, `member`); Workspace (`admin`, `editor`, `viewer`). Org owners/admins implicitly get workspace admin.
- **URLs:** Path-based — `/orgs/{org_slug}/workspaces/{workspace_slug}/...`
- **Auth:** Firebase Authentication. Passwords/sessions handled by Firebase; our DB stores users, memberships, invites.
- **Tenant isolation:** API derives org + workspace from URL slugs + JWT identity. All queries scoped via `TenancyContext`. Postgres RLS via `app.org_id` session variable.
- **Invites:** Org admins create single-use tokens (7-day expiry). Recipient signs in/up and accepts at `/invites/{token}`.
- **Audit log:** Append-only `audit_log` table — member invited/joined/removed, role changed, workspace created/deleted.

Run migrations in order:
```bash
psql $DATABASE_URL < apps/api/migrations/001_initial.sql
psql $DATABASE_URL < apps/api/migrations/003_firebase_auth.sql
```

## Quick Start

### Prerequisites
- Node.js 20+
- Python 3.12+
- Docker Desktop

### 1. Clone and install

```bash
npm install
```

### 2. Set up environment variables

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
# Fill in Firebase keys (web) and service account JSON (api)
```

### 3. Start local services

```bash
docker compose -f infra/docker-compose.yml up -d
```

### 4. Run the database migration

```bash
# Option A: Run the SQL file directly on Supabase dashboard or psql
psql $DATABASE_URL < apps/api/migrations/001_initial.sql

# Option B: Use Alembic (after creating first revision)
cd apps/api && alembic upgrade head
```

### 5. Start the development servers

```bash
npm run dev
```

This starts **both** the Next.js frontend and the FastAPI backend (port 8000).

If you only see the web app, start the API separately:

```bash
cd apps/api && npm run dev
```

Start Postgres first:

```bash
docker compose -f infra/docker-compose.yml up -d
```

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API docs**: http://localhost:8000/docs

## Deployment

Both apps deploy to **Vercel** as two projects from this repo. See **[docs/deploy-vercel.md](docs/deploy-vercel.md)**.

| Project | Root | URL example |
|---------|------|-------------|
| Web | `apps/web` | `https://minea-web.vercel.app` |
| API | `apps/api` | `https://minea-api.vercel.app` |

Set `API_URL` on the web project to the API URL. Set `FIREBASE_SERVICE_ACCOUNT_JSON` on the API project (paste JSON, not a file).

## Architecture

```
minea/
├── apps/
│   ├── web/          # Next.js — Vercel project (root: apps/web)
│   └── api/          # FastAPI — Vercel project (root: apps/api)
├── packages/
│   └── types/        # Shared TypeScript types
├── infra/
│   └── docker-compose.yml
└── apps/api/migrations/001_initial.sql
```

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js 14, shadcn/ui, Tailwind CSS |
| State | Zustand + TanStack Query v5 |
| Auth | Firebase Authentication |
| Backend | FastAPI (Python 3.12) |
| Database | PostgreSQL 16 via Supabase |
| Cache | Upstash Redis |
| AI | Anthropic Claude API |
| Diagrams | React Flow |

## Data Model

Three core tables:
- **`objects`** — all 15 object types (capability, application, agent, etc.) in one table
- **`relationships`** — typed edges validated against a strict allowed-triples list
- **`organisations` / `workspaces` / supporting** — tenancy and metadata

## Build Sequence

1. Monorepo scaffold + Docker Compose ✅
2. Firebase auth + org/user model ✅
3. Supabase schema + RLS ✅
4. FastAPI: objects CRUD + relationships CRUD ✅
5. Next.js shell: sidebar, dashboard, object list views ✅
6. Object detail panel + forms ✅
7. Relationship creation UI ✅
8. AI chat (streaming, prompt-cached) ✅
9. AI ingestion pipeline ✅
10. All views (all 15 object types) ✅
11. AI Infrastructure cross-layer module ✅
12. AI Insights background job ✅
