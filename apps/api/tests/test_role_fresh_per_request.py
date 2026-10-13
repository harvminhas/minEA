from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_org_role_is_read_from_the_db_on_every_request():
    src = (ROOT / "app/services/tenancy.py").read_text()
    fn = src[src.index("async def _resolve_org_membership"):src.index("async def get_org_context")]
    assert "select(Org, OrgMembership.role)" in fn
    assert "lru_cache" not in src and "@cache" not in src


def test_role_never_comes_from_token_claims():
    auth = (ROOT / "app/auth.py").read_text()
    assert "never from JWT claims" in auth
    assert "role" not in auth[auth.index("def auth_context_from_claims"):].split("\n\n\n")[0].lower().replace("provider", "")


def test_permission_cache_is_role_to_permission_only():
    authz = (ROOT / "app/services/authorization.py").read_text()
    assert "_permission_cache: dict[tuple[str, str], set[str]]" in authz
