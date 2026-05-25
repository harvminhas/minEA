# Cloud SQL setup (minea-a1d4c)

Your instance:

| Setting | Value |
|---------|--------|
| Connection name | `minea-a1d4c:us-central1:minea-a1d4c-2-instance` |
| Public IP | `34.41.177.66` |
| Database | `postgres` (default — **not** the instance name) |
| User | `hminhas` |

## 1. Allow your IP (public IP mode)

Google Cloud Console → **SQL** → **minea-a1d4c-2-instance** → **Connections** → **Networking**:

1. Enable **Public IP** (if not already)
2. **Authorized networks** → **Add network**
3. Add your current IP (or `0.0.0.0/0` for testing only — not for production)

## 2. Configure `apps/api/.env`

Already set for public IP. **Replace `password`** with your real Cloud SQL postgres password if different:

```env
DATABASE_URL=postgresql+asyncpg://hminhas:YOUR_PASSWORD@34.41.177.66:5432/postgres
FIREBASE_PROJECT_ID=minea-a1d4c
FIREBASE_CREDENTIALS_PATH=./fb_svc_acct.json
DEBUG=true
```

## 3. Test connection

```bash
cd apps/api
pip install -r requirements.txt
npm run db:migrate
```

## 4. Start the app

```bash
npm run dev
```

- API health: http://localhost:8000/health
- App: http://localhost:3000

## Alternative: Cloud SQL Auth Proxy (no public IP whitelist)

Terminal 1:

```bash
npm run db:proxy
```

Terminal 2 — use localhost in `.env`:

```env
  DATABASE_URL=postgresql+asyncpg://hminhas:YOUR_PASSWORD@127.0.0.1:5432/postgres
```

Requires: `gcloud auth login` and `gcloud config set project minea-a1d4c`
