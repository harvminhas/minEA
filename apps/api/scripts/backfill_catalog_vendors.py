"""Report (and optionally fill) apps/platforms with no vendor property whose name matches exactly one
tool in the catalogue (bundled tools.json; the DB catalogue when tool_catalog_entries exists).

Dry run by default: prints what WOULD change and writes nothing.

    python scripts/backfill_catalog_vendors.py [--org SLUG] [--apply]

--apply only sets properties.vendor where it is blank (never overwrites). Ask already infers these
vendors at read time, so this is optional tidy-up, not required for Ask to work.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from dotenv import load_dotenv

API_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_ROOT))

from app.ai.ask.graph import catalog_vendor_for, vendor_index  # noqa: E402
from app.services.tool_catalog import bundled_tools  # noqa: E402

TYPES = ("application", "cloud_service", "model", "solution")


def _url() -> str:
    import os

    load_dotenv(API_ROOT / ".env")
    url = os.getenv("DATABASE_URL", "").strip()
    if not url:
        sys.exit("ERROR: DATABASE_URL is not set")
    return url.replace("postgresql+asyncpg://", "postgresql://")


def _tools(cur) -> list[dict]:
    try:
        cur.execute("SELECT name, aliases, vendor FROM tool_catalog_entries")
        rows = cur.fetchall()
        if rows:
            return [{"name": r[0], "aliases": list(r[1] or []), "vendor": r[2]} for r in rows]
    except Exception:
        cur.connection.rollback()
    return bundled_tools()


def plan(objects: list[tuple], tools: list[dict]) -> list[tuple[str, str, str, str]]:
    """(id, org slug, name, vendor) for each blank-vendor object the catalogue names."""
    index = vendor_index(tools)
    out = []
    for obj_id, slug, name, props in objects:
        props = props or {}
        if str(props.get("vendor") or "").strip():
            continue
        vendor = catalog_vendor_for(index, name, str(props.get("catalog_tool") or ""))
        if vendor:
            out.append((str(obj_id), slug, name, vendor))
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--org", help="only this org slug")
    parser.add_argument("--apply", action="store_true", help="write the vendors (default: dry run)")
    args = parser.parse_args()
    import psycopg2

    conn = psycopg2.connect(_url())
    cur = conn.cursor()
    sql = "SELECT o.id, g.slug, o.name, o.properties FROM objects o JOIN orgs g ON g.id = o.org_id WHERE o.type = ANY(%s)"
    params: list = [list(TYPES)]
    if args.org:
        sql += " AND g.slug = %s"
        params.append(args.org)
    cur.execute(sql, params)
    changes = plan(cur.fetchall(), _tools(cur))
    for obj_id, slug, name, vendor in changes:
        print(f"{slug:24} {name:40} -> vendor {vendor}  ({obj_id})")
    print(f"{len(changes)} item(s) {'updated' if args.apply else 'would be updated (dry run)'}")
    if args.apply and changes:
        for obj_id, _slug, _name, vendor in changes:
            cur.execute(
                "UPDATE objects SET properties = properties || %s::jsonb WHERE id = %s AND COALESCE(properties->>'vendor', '') = ''",
                (json.dumps({"vendor": vendor}), obj_id),
            )
        conn.commit()
    conn.close()


if __name__ == "__main__":
    main()
