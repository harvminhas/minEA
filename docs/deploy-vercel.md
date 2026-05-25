# Deploy minEA on Vercel (web + API)

Use **two Vercel projects** from the same Git repo. Vercel natively supports FastAPI — it finds `app = FastAPI()` in `apps/api/app/main.py`.

| Project | Root directory | What it runs |
|---------|----------------|--------------|
| **minea-web** | `apps/web` | Next.js frontend |
| **minea-api** | `apps/api` | FastAPI backend |

The web app proxies `/api/v1/*` to the API project via `API_URL`.

---

## Overview

```
Browser  →  your-web.vercel.app/api/v1/...  →  (Next rewrite)  →  your-api.vercel.app/api/v1/...
                ↑ same origin to browser
```

---

## Step 1 — Deploy the API

1. [vercel.com/new](https://vercel.com/new) → import your repo.
2. **Project name:** e.g. `minea-api`
3. **Root Directory:** `apps/api` — **required**. If set to repo root, Python deps won't install.
4. Framework: Vercel should detect **FastAPI** (needs `requirements.txt` + `app/main.py` in that root).

### API environment variables

| Variable | Required | Example / notes |
|----------|----------|-----------------|
| `DATABASE_URL` | Yes | `postgresql+asyncpg://user:pass@host:5432/postgres` |
| `DATABASE_SSL` | Yes (Cloud SQL) | `true` |
| `FIREBASE_PROJECT_ID` | Yes | `minea-a1d4c` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes on Vercel | Paste full service account JSON (single line). **Do not** rely on `fb_svc_acct.json` — it is not deployed. |
| `WEB_APP_URL` | Yes | `https://your-web.vercel.app` (set after step 2) |
| `DEBUG` | No | `false` |
| `CORS_ORIGINS` | Optional | JSON array, e.g. `["https://your-web.vercel.app"]` |
| `RESEND_API_KEY` | For invites | |

> **Database note:** Vercel functions use dynamic outbound IPs. Cloud SQL **authorized networks** (IP allowlists) often fail from Vercel. Options:
> - Use a Postgres host with universal access (Supabase, Neon, Railway Postgres), or
> - Allow `0.0.0.0/0` on Cloud SQL public IP (less secure), or
> - Use Google Cloud SQL Auth Proxy / connector (advanced).

Run migrations against production Postgres before going live:

```bash
cd apps/api && npm run db:migrate
```

**Paste Firebase JSON on Vercel:** Project → Settings → Environment Variables → `FIREBASE_SERVICE_ACCOUNT_JSON` → paste the entire contents of `fb_svc_acct.json` as one line (or use Vercel's multiline editor). Redeploy after saving.

### Verify API

After deploy, open:

- `https://your-api.vercel.app/health` — should show `database_connected: true`

---

## Step 2 — Deploy the web app

1. New Vercel project from the **same repo**.
2. **Project name:** e.g. `minea-web`
3. **Root Directory:** `apps/web`

### Web environment variables

| Variable | Required |
|----------|----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Yes |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Yes |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Yes |
| `API_URL` | Yes — **`https://your-api.vercel.app`** (no trailing slash) |

Redeploy the web app after setting `API_URL` (rewrites are resolved at build time).

### Update API with web URL

Go back to the **API project** → Environment Variables:

- Set `WEB_APP_URL` = `https://your-web.vercel.app`
- Redeploy API

---

## Step 3 — Firebase

Firebase Console → Authentication → **Authorized domains** → add:

- `your-web.vercel.app`
- Custom domain (if any)

---

## CLI (optional)

```bash
# API
cd apps/api
vercel login
vercel link          # link to minea-api project
vercel --prod

# Web
cd apps/web
vercel link          # link to minea-web project
vercel --prod
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `FUNCTION_INVOCATION_FAILED` / 500 on all routes | Set `FIREBASE_SERVICE_ACCOUNT_JSON`; redeploy. Check `/health` for `firebase_error`. |
| `No module named 'fastapi'` | API project **Root Directory** must be `apps/api` (not repo root). Redeploy after fix. |
| Web API calls 502 | Wrong `API_URL`, or API project not deployed |
| `/health` shows DB disconnected | `DATABASE_URL` / `DATABASE_SSL`; Cloud SQL may block Vercel IPs |
| Firebase auth fails on Vercel | Add web domain to Firebase authorized domains |
| `firebase_configured: false` on API | Set `FIREBASE_SERVICE_ACCOUNT_JSON` (not a file path) |
| Build fails (web) | Monorepo install must run from repo root (`apps/web/vercel.json`) |

---

## Why two projects?

- **Web** = Node/Next.js build (Turbo + `@minea/types`)
- **API** = Python/FastAPI serverless function

Both live on Vercel, but each project has its own root directory and env vars.
