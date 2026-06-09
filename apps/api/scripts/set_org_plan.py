#!/usr/bin/env python3
"""Assign or inspect an org billing plan (Free / Business).

Usage (from apps/api, with DATABASE_URL in .env):

  # Show current plan and limits
  python scripts/set_org_plan.py --org edomains-inc --show

  # Upgrade to Business with 15 contributor licenses (viewers unlimited)
  python scripts/set_org_plan.py --org edomains-inc --plan business --contributors 15

  # Downgrade to Free
  python scripts/set_org_plan.py --org edomains-inc --plan free

  # Preview changes without writing
  python scripts/set_org_plan.py --org edomains-inc --plan business --contributors 15 --dry-run

See docs/how-to-manage-plans.md for the full playbook.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app.services.plan_features import PLANS, limits_for_plan, normalize_plan  # noqa: E402

LIMIT_KEYS = (
    "max_owners",
    "max_admins",
    "max_members",
    "max_viewers",
    "max_workspaces",
    "max_objects_per_workspace",
    "max_pending_invites",
    "max_active_share_links",
)


def _load_database_url() -> str:
    load_dotenv(API_ROOT / ".env")
    import os

    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        print("ERROR: DATABASE_URL is not set in apps/api/.env")
        sys.exit(1)
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _fetch_org(cur, org_slug: str) -> tuple | None:
    cur.execute(
        "SELECT id, name, slug, plan FROM orgs WHERE slug = %s",
        (org_slug,),
    )
    return cur.fetchone()


def _fetch_limits(cur, org_id) -> dict[str, int | None]:
    cur.execute(
        "SELECT limit_key, value FROM org_limits WHERE org_id = %s AND limit_key = ANY(%s)",
        (org_id, list(LIMIT_KEYS)),
    )
    return {row[0]: row[1] for row in cur.fetchall()}


def _print_org(org_row, limits: dict[str, int | None]) -> None:
    _id, name, slug, plan = org_row
    normalized = normalize_plan(plan)
    print(f"Org:     {name} ({slug})")
    print(f"Plan:    {plan} ({normalized})")
    print("Limits:")
    for key in LIMIT_KEYS:
        value = limits.get(key)
        label = "unlimited" if value is None else str(value)
        print(f"  {key}: {label}")


def _upsert_limits(cur, org_id, limits: dict[str, int | None]) -> None:
    for key, value in limits.items():
        if key not in LIMIT_KEYS:
            continue
        cur.execute(
            """
            INSERT INTO org_limits (org_id, limit_key, value)
            VALUES (%s, %s, %s)
            ON CONFLICT (org_id, limit_key)
            DO UPDATE SET value = EXCLUDED.value
            """,
            (org_id, key, value),
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="Assign Free / Business plan for an org")
    parser.add_argument("--org", required=True, help="Org slug (e.g. edomains-inc)")
    parser.add_argument("--plan", choices=PLANS, help="Target plan: free or business")
    parser.add_argument(
        "--contributors",
        type=int,
        metavar="N",
        help="Business only: number of contributor licenses (maps to max_members)",
    )
    parser.add_argument("--show", action="store_true", help="Print current plan and limits")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without committing")
    args = parser.parse_args()

    if not args.show and not args.plan:
        parser.error("Pass --show or --plan")

    if args.plan != "business" and args.contributors is not None:
        parser.error("--contributors is only valid with --plan business")

    if args.plan == "business" and args.contributors is not None and args.contributors < 1:
        parser.error("--contributors must be at least 1")

    try:
        import psycopg2
    except ImportError:
        print("ERROR: pip install psycopg2-binary")
        sys.exit(1)

    dsn = _load_database_url()
    conn = psycopg2.connect(dsn)
    conn.autocommit = False

    try:
        with conn.cursor() as cur:
            org_row = _fetch_org(cur, args.org)
            if not org_row:
                print(f"ERROR: org not found: {args.org}")
                sys.exit(1)

            org_id = org_row[0]
            limits = _fetch_limits(cur, org_id)

            if args.show:
                _print_org(org_row, limits)
                if not args.plan:
                    return

            assert args.plan
            target_limits = limits_for_plan(args.plan)
            if args.plan == "business" and args.contributors is not None:
                target_limits["max_members"] = args.contributors

            print(f"{'[dry-run] ' if args.dry_run else ''}Updating {args.org} to plan={args.plan}")
            if args.contributors is not None:
                print(f"  contributor licenses (max_members): {args.contributors}")
            print("  limits:")
            for key in LIMIT_KEYS:
                if key in target_limits:
                    val = target_limits[key]
                    print(f"    {key}: {'unlimited' if val is None else val}")

            if args.dry_run:
                conn.rollback()
                print("\nDry run — no changes written.")
                return

            cur.execute("UPDATE orgs SET plan = %s WHERE id = %s", (args.plan, org_id))
            _upsert_limits(cur, org_id, target_limits)
            conn.commit()
            print("\nDone. Ask the customer to refresh the app (or sign out/in) to see the new plan.")

            limits = _fetch_limits(cur, org_id)
            print()
            _print_org(
                (org_id, org_row[1], org_row[2], args.plan),
                limits,
            )
    except Exception as exc:
        conn.rollback()
        print(f"ERROR: {exc}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
