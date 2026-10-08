"""Microsoft sign-in: token mapping and the email_verified decision (see app.services.auth_status)."""
import asyncio
from types import SimpleNamespace

import pytest
from fastapi.security import HTTPAuthorizationCredentials

import app.auth as auth_module
from app.auth import AuthContext, auth_context_from_claims
from app.services import auth_status, tenancy


def run(coro):
    return asyncio.run(coro)


def ms_claims(**overrides):
    claims = {
        "uid": "fb_ms_1",
        "sub": "fb_ms_1",
        "email": "alex@contoso.com",
        "name": "Alex Doe",
        "firebase": {"sign_in_provider": "microsoft.com", "identities": {"microsoft.com": ["oid-1"]}},
    }
    claims.update(overrides)
    return claims


def provider(pid, email):
    return SimpleNamespace(provider_id=pid, email=email)


def record(email, *providers, verified=False):
    return SimpleNamespace(email=email, email_verified=verified, provider_data=list(providers))


# ── token claims ─────────────────────────────────────────────────────────────


def test_microsoft_token_maps_uid_email_and_provider():
    ctx = auth_context_from_claims(ms_claims())  # no email_verified claim at all
    assert (ctx.firebase_uid, ctx.email, ctx.full_name) == ("fb_ms_1", "alex@contoso.com", "Alex Doe")
    assert ctx.sign_in_provider == "microsoft.com"
    assert ctx.email_verified is False


@pytest.mark.parametrize("value", [False, None, "true", 1])
def test_only_a_real_true_claim_counts_as_verified(value):
    assert auth_context_from_claims(ms_claims(email_verified=value)).email_verified is False


def test_password_and_google_tokens_unchanged():
    pw = auth_context_from_claims({"uid": "u", "email": "a@b.com", "email_verified": False, "firebase": {"sign_in_provider": "password"}})
    assert (pw.sign_in_provider, pw.email_verified) == ("password", False)
    g = auth_context_from_claims({"uid": "g", "email": "a@gmail.com", "email_verified": True, "firebase": {"sign_in_provider": "google.com"}})
    assert (g.sign_in_provider, g.email_verified) == ("google.com", True)


def test_missing_uid_is_rejected():
    with pytest.raises(Exception) as caught:
        auth_context_from_claims({"email": "a@b.com"})
    assert getattr(caught.value, "status_code", None) == 401


def test_get_auth_context_accepts_a_microsoft_token(monkeypatch):
    monkeypatch.setattr(auth_module, "_ensure_firebase", lambda: None)
    monkeypatch.setattr(auth_module.firebase_auth, "verify_id_token", lambda token: ms_claims())
    ctx = run(auth_module.get_auth_context(HTTPAuthorizationCredentials(scheme="Bearer", credentials="tok")))
    assert ctx.sign_in_provider == "microsoft.com" and ctx.email == "alex@contoso.com"


# ── the Microsoft email rule ────────────────────────────────────────────────


def test_microsoft_only_account_with_firebase_email_is_verified():
    assert auth_status.microsoft_email_verified(record("alex@contoso.com", provider("microsoft.com", "Alex@Contoso.com")))


@pytest.mark.parametrize(
    "fb_user",
    [
        record("", provider("microsoft.com", "")),  # Firebase got no email
        record(None, provider("microsoft.com", None)),
        record("alex@contoso.com", provider("google.com", "alex@contoso.com")),  # not Microsoft
        # password account for someone else's address that linked the attacker's own Microsoft login
        record("victim@contoso.com", provider("password", "victim@contoso.com"), provider("microsoft.com", "me@evil.com")),
    ],
)
def test_microsoft_rule_refuses(fb_user):
    assert not auth_status.microsoft_email_verified(fb_user)


def test_status_for_microsoft_user_is_verified_and_needs_no_email_step():
    out = auth_status.resolve_verification_status(record("alex@contoso.com", provider("microsoft.com", "alex@contoso.com")), None)
    assert out["email_verified"] is True and out["requires_email_verification"] is False


def test_status_for_unverified_password_user_is_unchanged():
    out = auth_status.resolve_verification_status(record("a@b.com", provider("password", "a@b.com")), None)
    assert out["email_verified"] is False and out["requires_email_verification"] is True
    linked_other = record("a@b.com", provider("password", "a@b.com"), provider("microsoft.com", "x@evil.com"))
    out = auth_status.resolve_verification_status(linked_other, None)
    assert out["requires_email_verification"] is True


def test_password_account_linked_to_microsoft_with_same_email_is_verified():
    """The one-time link after account-exists: same address on both identities."""
    fb_user = record("a@contoso.com", provider("password", "a@contoso.com"), provider("microsoft.com", "a@contoso.com"))
    out = auth_status.resolve_verification_status(fb_user, None)
    assert out["email_verified"] is True and out["requires_email_verification"] is False


def test_sign_in_check_uses_firebase_record_and_token_email(monkeypatch):
    monkeypatch.setattr(auth_status, "_ensure_firebase", lambda: None)
    monkeypatch.setattr(auth_status.firebase_auth, "get_user", lambda uid: record("alex@contoso.com", provider("microsoft.com", "alex@contoso.com")))
    assert run(auth_status.microsoft_sign_in_verified("fb_ms_1", "alex@contoso.com")) is True
    assert run(auth_status.microsoft_sign_in_verified("fb_ms_1", "other@contoso.com")) is False
    assert run(auth_status.microsoft_sign_in_verified("fb_ms_1", "")) is False


def test_sign_in_check_fails_closed_when_firebase_errors(monkeypatch):
    monkeypatch.setattr(auth_status, "_ensure_firebase", lambda: None)

    def boom(uid):
        raise RuntimeError("firebase down")

    monkeypatch.setattr(auth_status.firebase_auth, "get_user", boom)
    assert run(auth_status.microsoft_sign_in_verified("fb_ms_1", "alex@contoso.com")) is False


# ── user mapping (_resolve_user) ────────────────────────────────────────────


class FakeDB:
    def __init__(self, user=None):
        self.user = user
        self.added = []

    async def execute(self, stmt):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)

    def add(self, row):
        self.added.append(row)

    async def flush(self):
        return None


def ms_ctx(email="alex@contoso.com", provider_id="microsoft.com", verified=False):
    return AuthContext(firebase_uid="fb_ms_1", email=email, email_verified=verified, full_name="Alex Doe", sign_in_provider=provider_id)


def test_new_microsoft_user_is_created_verified(monkeypatch):
    calls = []

    async def check(uid, email):
        calls.append((uid, email))
        return True

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    db = FakeDB()
    user = run(tenancy._resolve_user(db, ms_ctx(), create_if_missing=True))
    assert user.firebase_uid == "fb_ms_1" and user.email == "alex@contoso.com"
    assert user.email_verified_at is not None
    assert calls == [("fb_ms_1", "alex@contoso.com")]
    assert tenancy._is_email_verified(user, ms_ctx())


def test_microsoft_user_the_rule_refuses_stays_unverified(monkeypatch):
    async def check(uid, email):
        return False

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    user = run(tenancy._resolve_user(FakeDB(), ms_ctx(), create_if_missing=True))
    assert user.email_verified_at is None
    assert not tenancy._is_email_verified(user, ms_ctx())


def test_microsoft_token_without_email_never_checks_or_trusts(monkeypatch):
    async def check(uid, email):
        raise AssertionError("must not be called")

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    user = run(tenancy._resolve_user(FakeDB(), ms_ctx(email=""), create_if_missing=True))
    assert user.email == "fb_ms_1@unknown.local" and user.email_verified_at is None


def test_password_token_is_never_upgraded(monkeypatch):
    async def check(uid, email):
        raise AssertionError("password sign-ins never use the Microsoft rule")

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    user = run(tenancy._resolve_user(FakeDB(), ms_ctx(provider_id="password"), create_if_missing=True))
    assert user.email_verified_at is None


def test_existing_verified_user_skips_the_lookup(monkeypatch):
    async def check(uid, email):
        raise AssertionError("already verified")

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    existing = SimpleNamespace(firebase_uid="fb_ms_1", email="alex@contoso.com", full_name="Alex Doe", email_verified_at="2026-10-01")
    assert run(tenancy._resolve_user(FakeDB(existing), ms_ctx())) is existing


def test_existing_microsoft_user_gets_verified_on_next_sign_in(monkeypatch):
    async def check(uid, email):
        return True

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    existing = SimpleNamespace(firebase_uid="fb_ms_1", email="alex@contoso.com", full_name="Alex Doe", email_verified_at=None)
    run(tenancy._resolve_user(FakeDB(existing), ms_ctx()))
    assert existing.email_verified_at is not None


def test_unknown_user_without_create_is_still_403(monkeypatch):
    async def check(uid, email):
        raise AssertionError("no lookup for an unknown user")

    monkeypatch.setattr(tenancy, "microsoft_sign_in_verified", check)
    with pytest.raises(Exception) as caught:
        run(tenancy._resolve_user(FakeDB(), ms_ctx()))
    assert getattr(caught.value, "status_code", None) == 403
