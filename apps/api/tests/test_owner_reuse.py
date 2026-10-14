from sqlalchemy.dialects import postgresql

from app.models.people import Team
from app.services.owner_fields import _sql_key, name_key


def test_name_key_ignores_case_and_spaces():
    assert name_key("  Sales   Team ") == name_key("sales team") == "sales team"
    assert name_key(None) == ""


def test_sql_key_normalizes_the_same_way():
    sql = str(_sql_key(Team.name).compile(dialect=postgresql.dialect()))
    assert "lower(regexp_replace(trim(teams.name)" in sql
