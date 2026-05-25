#!/usr/bin/env python3
"""Apply minEA SQL migrations to Postgres (Cloud SQL, Supabase, local, etc.).

Usage (from apps/api):
  python scripts/migrate.py

Requires DATABASE_URL in apps/api/.env
"""
from __future__ import annotations

import sys
from pathlib import Path

from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = API_ROOT / "migrations"
MIGRATION_FILES = [
    "001_initial.sql",
    "002_auth_tenancy.sql",
    "003_firebase_auth.sql",
    "004_roles_permissions_limits.sql",
    "005_views_graph.sql",
    "006_process_builder.sql",
    "007_stage_duration.sql",
    "008_stage_transitions.sql",
    "009_process_canvas_layout.sql",
    "010_process_graph_edges.sql",
    "011_journey_builder.sql",
    "012_capability_domains.sql",
]


def _load_database_url() -> str:
    load_dotenv(API_ROOT / ".env")
    import os

    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("ERROR: DATABASE_URL is not set.")
        print("Copy apps/api/.env.example to apps/api/.env and add your Cloud SQL connection string.")
        sys.exit(1)
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _ensure_migration_table(cur) -> None:
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def _bootstrap_existing_db(cur) -> None:
    """Mark legacy migrations applied when upgrading an existing database."""
    cur.execute("SELECT version FROM schema_migrations")
    applied = {row[0] for row in cur.fetchall()}
    if applied:
        return

    cur.execute(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables WHERE table_name = 'orgs'
        )
        """
    )
    has_orgs = cur.fetchone()[0]
    if not has_orgs:
        return

    for version in ("001_initial.sql", "002_auth_tenancy.sql", "003_firebase_auth.sql"):
        cur.execute(
            "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING",
            (version,),
        )
    print("  Bootstrapped schema_migrations for existing database")


def _run_file(cur, path: Path) -> None:
    sql = path.read_text(encoding="utf-8")
    cur.execute(sql)


def main() -> None:
    try:
        import psycopg2
    except ImportError:
        print("ERROR: psycopg2 is required for migrations.")
        print("Run: pip install psycopg2-binary")
        sys.exit(1)

    dsn = _load_database_url()
    print(f"Connecting to {dsn.split('@')[-1] if '@' in dsn else dsn} ...")

    conn = psycopg2.connect(dsn)
    conn.autocommit = True

    try:
        with conn.cursor() as cur:
            _ensure_migration_table(cur)
            _bootstrap_existing_db(cur)

            cur.execute("SELECT version FROM schema_migrations")
            applied = {row[0] for row in cur.fetchall()}

        for name in MIGRATION_FILES:
            if name in applied:
                print(f"Skipping {name} (already applied)")
                continue

            path = MIGRATIONS_DIR / name
            if not path.exists():
                print(f"ERROR: missing {path}")
                sys.exit(1)

            print(f"Running {name} ...")
            with conn.cursor() as cur:
                _run_file(cur, path)
                cur.execute(
                    "INSERT INTO schema_migrations (version) VALUES (%s) ON CONFLICT DO NOTHING",
                    (name,),
                )
            print("  OK")
    except Exception as exc:
        print(f"ERROR: {exc}")
        sys.exit(1)
    finally:
        conn.close()

    print("\nAll migrations applied. You can start the API with: npm run dev")


if __name__ == "__main__":
    main()
