"""scripts/migrate.py applies only the files it lists, so a new migration left off the list never
reaches a deployed database (056 shipped that way: teams.lead_contact_id was missing and Create team failed)."""
import re
from pathlib import Path

API = Path(__file__).resolve().parents[1]
# One-off data rewrites, deliberately not run by migrate.py.
NOT_LISTED = {"040_system_category_split.sql", "041_system_platform_built_on.sql"}


def test_every_schema_migration_is_listed_in_order():
    block = (API / "scripts" / "migrate.py").read_text().split("MIGRATION_FILES = [", 1)[1].split("]", 1)[0]
    listed = re.findall(r'"(\d{3}_[^"]+\.sql)"', block)
    files = sorted(p.name for p in (API / "migrations").glob("[0-9][0-9][0-9]_*.sql"))
    assert sorted(set(files) - set(listed) - NOT_LISTED) == []
    assert listed == sorted(listed)
    assert "056_ownership_roles.sql" in listed
