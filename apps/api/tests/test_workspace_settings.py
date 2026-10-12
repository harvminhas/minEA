from app.services.workspace_settings import clean_settings, merge_settings


def test_only_known_keys_with_bool_values_are_kept():
    assert clean_settings({"architectureAdvanced": True, "evil": 1}) == {"architectureAdvanced": True}
    assert clean_settings({"architectureAdvanced": "yes"}) == {}
    assert clean_settings(None) == {}
    assert clean_settings("[]") == {}


def test_merge_sets_clears_and_ignores_unknown():
    assert merge_settings({}, {"architectureAdvanced": True}) == {"architectureAdvanced": True}
    assert merge_settings({"architectureAdvanced": True}, {"architectureAdvanced": False}) == {"architectureAdvanced": False}
    assert merge_settings({"architectureAdvanced": True}, {"architectureAdvanced": None}) == {}
    assert merge_settings({"architectureAdvanced": True}, {"other": 3}) == {"architectureAdvanced": True}


def test_migration_is_additive_only():
    from pathlib import Path

    sql = (Path(__file__).resolve().parents[1] / "migrations" / "048_workspace_settings.sql").read_text().upper()
    body = "\n".join(line for line in sql.splitlines() if not line.strip().startswith("--"))
    assert "ADD COLUMN IF NOT EXISTS SETTINGS JSONB" in body
    for word in ("DROP ", "RENAME", "ALTER COLUMN", "DELETE ", "UPDATE "):
        assert word not in body
