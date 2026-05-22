# minEA

**Model-driven Enterprise Architecture for SMBs.**

Every element is a real object — capabilities, applications, data stores, APIs, agents — with properties, relationships, and identity. Views are projections of the model, not pictures.

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
cp .env.example .env
# Fill in: CLERK_*, DATABASE_URL, ANTHROPIC_API_KEY, SUPABASE_*
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

- **Frontend**: http://localhost:3000
- **API**: http://localhost:8000
- **API docs**: http://localhost:8000/docs

## Architecture

```
minea/
├── apps/
│   ├── web/          # Next.js 14 (App Router) — Vercel
│   └── api/          # FastAPI (Python) — Railway
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
| Auth | Clerk (Google SSO, org management) |
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
2. Clerk auth + org/user model ✅
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
