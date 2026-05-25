# Database migrations

minEA uses **plain SQL files** run directly against PostgreSQL. You do **not** need Firebase Data Connect for this.

## Option 1 — Python script (recommended)

1. Create `apps/api/.env` from `.env.example`
2. Set `DATABASE_URL` to your Cloud SQL / Firebase Postgres connection string:
   ```
   DATABASE_URL=postgresql+asyncpg://USER:PASSWORD@HOST:5432/DATABASE
   ```
3. Run:
   ```bash
   cd apps/api
   pip install -r requirements.txt
   npm run db:migrate
   ```

## Option 2 — Google Cloud SQL Studio (browser, no CLI)

1. Open [Google Cloud Console](https://console.cloud.google.com/sql/instances)
2. Click your **Cloud SQL instance** (created via Firebase SQL Connect)
3. Open **Cloud SQL Studio** (or **Query** tab)
4. Log in with your database user
5. Run each file **in order**, paste full contents and execute:
   - `001_initial.sql`
   - `002_auth_tenancy.sql`
   - `003_firebase_auth.sql`

## Option 3 — psql

```bash
psql "postgresql://USER:PASSWORD@HOST:5432/DATABASE" -f migrations/001_initial.sql
psql "postgresql://USER:PASSWORD@HOST:5432/DATABASE" -f migrations/002_auth_tenancy.sql
psql "postgresql://USER:PASSWORD@HOST:5432/DATABASE" -f migrations/003_firebase_auth.sql
```

## Firebase SQL Connect vs minEA

| Firebase SQL Connect | minEA today |
|---------------------|-------------|
| GraphQL schema + generated SDK | FastAPI + SQLAlchemy |
| `firebase init dataconnect` | `npm run db:migrate` |
| Different data model | Uses these SQL files |

Use Firebase SQL Connect only to **provision** the Cloud SQL Postgres instance. Then run **these migrations** and point `DATABASE_URL` at that database.
