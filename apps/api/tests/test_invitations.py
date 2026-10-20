"""One invite per person (055): create (org admin and workspace admin), merge, email, accept
(new user, existing user, again, every order), links sent before 055, People list, access edits.
Runs against a migrated scratch Postgres when ERASE_TEST_DATABASE_URL is set; no real email."""
import asyncio
import os
import uuid
from contextlib import asynccontextmanager

import pytest

DB_URL = os.getenv("ERASE_TEST_DATABASE_URL")
pg = pytest.mark.skipif(not DB_URL, reason="set ERASE_TEST_DATABASE_URL to a migrated scratch Postgres")


def test_invite_email_has_org_inviter_workspaces_button_and_expiry():
    from app.services.invite_email import invite_subject, render_invite_email

    html, text = render_invite_email(
        org_name="Northwind <Ltd>",
        inviter="Sam Rivera",
        workspaces=[{"name": "Main", "role": "viewer"}, {"name": "EMEA rollout", "role": "member"}],
        org_admin=False,
        url="https://app.bubomap.com/invites/abc",
    )
    assert "Northwind &lt;Ltd&gt;" in html and "Sam Rivera" in html
    assert "EMEA rollout" in html and "Member" in html and "Viewer" in html
    assert "Accept invite" in html and 'href="https://app.bubomap.com/invites/abc"' in html
    assert "7 days" in html and "7 days" in text and "https://app.bubomap.com/invites/abc" in text
    admin_html, _ = render_invite_email(org_name="N", inviter="S", workspaces=[], org_admin=True, url="u")
    assert "All workspaces" in admin_html and "Org admin" in admin_html
    assert invite_subject("Northwind", "Sam") == "Sam invited you to Northwind"


def test_send_invite_email_reports_failure_and_missing_key(monkeypatch):
    from app.services import invite_email

    monkeypatch.setattr(invite_email.settings, "resend_api_key", "")
    assert invite_email.send_invite_email(to="a@x.com", org_name="N", inviter="S", workspaces=[], org_admin=True, url="u") is False

    monkeypatch.setattr(invite_email.settings, "resend_api_key", "re_test")
    sent = []
    monkeypatch.setattr(invite_email, "send_email", lambda **kw: sent.append(kw))
    assert invite_email.send_invite_email(to="a@x.com", org_name="N", inviter="S", workspaces=[], org_admin=True, url="u") is True
    assert sent[0]["to"] == ["a@x.com"] and sent[0]["subject"] == "S invited you to N"

    def boom(**kw):
        raise RuntimeError("resend down")

    monkeypatch.setattr(invite_email, "send_email", boom)
    assert invite_email.send_invite_email(to="a@x.com", org_name="N", inviter="S", workspaces=[], org_admin=True, url="u") is False


def test_grants_keep_the_higher_role():
    from app.services.invitations import Grants

    a, b = uuid.uuid4(), uuid.uuid4()
    g = Grants()
    g.add_workspace(a, "member")
    g.add_workspace(a, "viewer")
    g.add_workspace(b, "admin")
    assert g.workspaces == {a: "member", b: "admin"} and g.order == [a, b] and g.top_role == "admin"
    other = Grants(org_role="admin")
    g.merge(other)
    assert g.org_role == "admin" and g.grants_licence


@asynccontextmanager
async def _org(plan="team", sub="sub_t", secret="test-secret", monkeypatch=None, emails_sent=None):
    from httpx import ASGITransport, AsyncClient
    from sqlalchemy import text
    from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

    from app.auth import AuthContext, get_auth_context
    from app.database import get_db
    from app.main import app
    from app.routers import invitations as inv_router
    from app.services import invitations as inv_service

    monkeypatch.setattr(inv_service.settings, "app_secret", secret)
    monkeypatch.setattr(inv_service.settings, "web_app_url", "https://app.test")

    def fake_send(**kw):
        emails_sent.append(kw)
        return kw.get("to") != "bounce@example.com"

    monkeypatch.setattr(inv_router, "send_invite_email", fake_send)

    engine = create_async_engine(DB_URL)
    tag = uuid.uuid4().hex[:8]
    org, main, emea = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    owner, wsadmin = uuid.uuid4(), uuid.uuid4()
    users = {"owner": (owner, f"own-{tag}@example.com"), "wsadmin": (wsadmin, f"wsa-{tag}@example.com")}
    async with AsyncSession(engine) as db:
        for uid, email in users.values():
            await db.execute(text("INSERT INTO users (id, firebase_uid, email, full_name) VALUES (:u, :f, :e, :n)"), {"u": uid, "f": "fb-" + email, "e": email, "n": "Sam Rivera" if uid == owner else None})
        await db.execute(text("INSERT INTO orgs (id, name, slug, plan, stripe_subscription_id) VALUES (:o, 'Northwind', :s, :p, :sub)"), {"o": org, "s": "nw-" + tag, "p": plan, "sub": sub})
        await db.execute(text("INSERT INTO org_memberships (user_id, org_id, role) VALUES (:u, :o, 'owner'), (:w, :o, 'member')"), {"u": owner, "w": wsadmin, "o": org})
        await db.execute(text("INSERT INTO workspaces (id, org_id, name, slug, created_at) VALUES (:m, :o, 'Main', 'default', now() - interval '1 day'), (:e, :o, 'EMEA rollout', 'emea', now())"), {"m": main, "e": emea, "o": org})
        await db.execute(text("INSERT INTO workspace_memberships (user_id, workspace_id, role) VALUES (:w, :e, 'admin')"), {"w": wsadmin, "e": emea})
        await db.commit()

    async def sdb():
        async with AsyncSession(engine, expire_on_commit=False) as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    who = {"email": users["owner"][1]}
    app.dependency_overrides[get_db] = sdb
    app.dependency_overrides[get_auth_context] = lambda: AuthContext("fb-" + who["email"], email=who["email"], email_verified=True)

    async def q(sql, **params):
        async with AsyncSession(engine) as db:
            result = await db.execute(text(sql), {"o": org, **params})
            rows = result.all() if result.returns_rows else []
            await db.commit()
            return rows

    created: list[str] = []

    def as_(email):
        who["email"] = email
        if email not in [u[1] for u in users.values()]:
            created.append(email)

    ctx = {"base": f"/api/v1/orgs/nw-{tag}", "as": as_, "users": users, "q": q, "org": org, "tag": tag}
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
            ctx["c"] = client
            yield ctx
    finally:
        app.dependency_overrides.clear()
        async with AsyncSession(engine) as db:
            await db.execute(text("DELETE FROM orgs WHERE id = :o"), {"o": org})
            await db.execute(text("DELETE FROM orgs WHERE slug LIKE :s"), {"s": f"own-{tag}%"})
            await db.execute(text("DELETE FROM users WHERE email LIKE :e"), {"e": f"%{tag}%"})
            await db.commit()
        await engine.dispose()


def _token(url: str) -> str:
    return url.rsplit("/", 1)[-1]


def run(coro):
    return asyncio.run(coro)


@pg
def test_org_admin_invites_people_with_workspaces_and_roles(monkeypatch):
    sent = []

    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=sent) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            none = await c.post(f"{base}/invites", json={"emails": [f"a-{tag}@example.com"]})
            res = await c.post(f"{base}/invites", json={
                "emails": [f"dana-{tag}@example.com, bounce@example.com"],
                "workspaces": [{"slug": "emea", "role": "member"}, {"slug": "default", "role": "viewer"}],
            })
            admin = await c.post(f"{base}/invites", json={"emails": [f"boss-{tag}@example.com"], "org_admin": True})
            rows = await t["q"]("SELECT email, role, org_role, workspace_id FROM invites WHERE org_id = :o AND status = 'pending' ORDER BY email")
            iw = await t["q"]("SELECT w.slug, iw.role, iw.position FROM invite_workspaces iw JOIN invites i ON i.id = iw.invite_id JOIN workspaces w ON w.id = iw.workspace_id WHERE i.org_id = :o AND i.email = :e ORDER BY iw.position", e=f"dana-{tag}@example.com")
            await t["q"]("DELETE FROM invites WHERE email = 'bounce@example.com'")
            return none, res, admin, rows, iw

    none, res, admin, rows, iw = run(go())
    assert none.status_code == 400 and "at least one workspace" in none.json()["detail"]
    assert res.status_code == 201, res.text
    body = res.json()["invites"]
    assert len(body) == 2 and all(i["invite_url"].startswith("/invites/") for i in body)
    assert [i["email_sent"] for i in body] == [True, False]  # bounce: link still made
    assert [w["slug"] for w in body[0]["workspaces"]] == ["emea", "default"]
    assert admin.status_code == 201 and admin.json()["invites"][0]["org_admin"] is True
    assert len(rows) == 3 and all(r[3] is None for r in rows)
    assert iw == [("emea", "member", 0), ("default", "viewer", 1)]
    assert sent[0]["url"].startswith("https://app.test/invites/") and sent[0]["inviter"] == "Sam Rivera"
    assert sent[0]["org_name"] == "Northwind" and [w["name"] for w in sent[0]["workspaces"]] == ["EMEA rollout", "Main"]


@pg
def test_workspace_admin_invites_only_to_workspaces_they_admin(monkeypatch):
    sent = []

    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=sent) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            t["as"](t["users"]["wsadmin"][1])
            ok = await c.post(f"{base}/invites", json={"emails": [f"n-{tag}@example.com"], "workspaces": [{"slug": "emea", "role": "admin"}]})
            other = await c.post(f"{base}/invites", json={"emails": [f"m-{tag}@example.com"], "workspaces": [{"slug": "default", "role": "viewer"}]})
            boss = await c.post(f"{base}/invites", json={"emails": [f"b-{tag}@example.com"], "org_admin": True})
            people = await c.get(f"{base}/people")
            t["as"](t["users"]["owner"][1])
            main_inv = await c.post(f"{base}/invites", json={"emails": [f"z-{tag}@example.com"], "workspaces": [{"slug": "default", "role": "viewer"}]})
            t["as"](t["users"]["wsadmin"][1])
            revoke_main = await c.delete(f"{base}/invites/{main_inv.json()['invites'][0]['id']}")
            revoke_mine = await c.delete(f"{base}/invites/{ok.json()['invites'][0]['id']}")
            return ok, other, boss, people, revoke_main, revoke_mine

    ok, other, boss, people, revoke_main, revoke_mine = run(go())
    assert ok.status_code == 201, ok.text
    assert other.status_code == 403 and boss.status_code == 403
    p = people.json()
    assert [w["slug"] for w in p["workspaces"]] == ["emea"] and p["can_invite_org_admins"] is False
    assert revoke_main.status_code == 403 and revoke_mine.status_code == 204


@pg
def test_new_user_accepts_once_and_lands_in_the_first_workspace(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            email = f"dana-{tag}@example.com"
            res = await c.post(f"{base}/invites", json={"emails": [email], "workspaces": [{"slug": "emea", "role": "member"}, {"slug": "default", "role": "viewer"}]})
            tok = _token(res.json()["invites"][0]["invite_url"])
            preview = await c.get(f"/api/v1/invites/{tok}")
            t["as"](email)
            first = await c.post(f"/api/v1/invites/{tok}/accept")
            again = await c.post(f"/api/v1/invites/{tok}/accept")
            ws = await c.get(f"{base}/workspaces")
            preview_after = await c.get(f"/api/v1/invites/{tok}")
            roles = await t["q"]("SELECT w.slug, m.role FROM workspace_memberships m JOIN workspaces w ON w.id = m.workspace_id JOIN users u ON u.id = m.user_id WHERE u.email = :e ORDER BY w.slug", e=email)
            org_role = await t["q"]("SELECT m.role FROM org_memberships m JOIN users u ON u.id = m.user_id WHERE u.email = :e AND m.org_id = :o", e=email)
            return preview, first, again, ws, preview_after, roles, org_role

    preview, first, again, ws, preview_after, roles, org_role = run(go())
    p = preview.json()
    assert p["inviter"] == "Sam Rivera" and p["org_admin"] is False
    assert [(w["name"], w["role"]) for w in p["workspaces"]] == [("EMEA rollout", "member"), ("Main", "viewer")]
    assert first.status_code == 200 and first.json() == {"org_slug": first.json()["org_slug"], "role": "member", "already": False, "workspace_slug": "emea"}
    assert again.status_code == 200 and again.json()["already"] is True and again.json()["workspace_slug"] == "emea"
    assert sorted(w["slug"] for w in ws.json()) == ["default", "emea"]
    assert preview_after.json()["consumed"] is True
    assert roles == [("default", "viewer"), ("emea", "member")] and org_role == [("member",)]


@pg
def test_existing_user_in_another_org_accepts(monkeypatch):
    from sqlalchemy import text  # noqa: F401

    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            email = f"exist-{tag}@example.com"
            t["as"](email)
            own = await c.post("/api/v1/orgs", json={"name": "Own", "slug": f"own-{tag}"})
            t["as"](t["users"]["owner"][1])
            res = await c.post(f"{base}/invites", json={"emails": [email], "workspaces": [{"slug": "default", "role": "member"}]})
            t["as"](email)
            acc = await c.post(f"/api/v1/invites/{_token(res.json()['invites'][0]['invite_url'])}/accept")
            return own, acc

    own, acc = run(go())
    assert own.status_code in (200, 201), own.text
    assert acc.status_code == 200 and acc.json()["workspace_slug"] == "default" and acc.json()["already"] is False


@pg
def test_inviting_someone_again_updates_their_one_invite_and_keeps_the_link(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            email = f"dana-{tag}@example.com"
            one = await c.post(f"{base}/invites", json={"emails": [email], "workspaces": [{"slug": "emea", "role": "member"}]})
            two = await c.post(f"{base}/invites", json={"emails": [email.upper()], "workspaces": [{"slug": "emea", "role": "viewer"}, {"slug": "default", "role": "admin"}]})
            pending = await t["q"]("SELECT count(*) FROM invites WHERE org_id = :o AND status = 'pending'")
            people = (await c.get(f"{base}/people")).json()["people"]
            link = await c.get(f"{base}/invites/{one.json()['invites'][0]['id']}/link")
            return one, two, pending, people, link

    one, two, pending, people, link = run(go())
    a, b = one.json()["invites"][0], two.json()["invites"][0]
    assert b["merged"] is True and a["id"] == b["id"] and a["invite_url"] == b["invite_url"]
    assert {(w["slug"], w["role"]) for w in b["workspaces"]} == {("emea", "member"), ("default", "admin")}  # never lowered
    assert pending == [(1,)]
    row = [p for p in people if p["invite"]][0]
    assert row["org_role"] is None and row["invite"]["can_copy"] is True
    assert link.status_code == 200 and link.json()["invite_url"] == a["invite_url"]


@pg
def test_already_in_with_a_higher_role_is_not_an_error_and_nothing_is_lowered(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base = t["c"], t["base"]
            wsadmin = t["users"]["wsadmin"][1]
            res = await c.post(f"{base}/invites", json={"emails": [wsadmin], "workspaces": [{"slug": "emea", "role": "viewer"}]})
            people = (await c.get(f"{base}/people")).json()["people"]
            t["as"](wsadmin)
            acc = await c.post(f"/api/v1/invites/{_token(res.json()['invites'][0]['invite_url'])}/accept")
            role = await t["q"]("SELECT m.role FROM workspace_memberships m JOIN users u ON u.id = m.user_id WHERE u.email = :e", e=wsadmin)
            return people, acc, role

    people, acc, role = run(go())
    merged = [p for p in people if p["email"] == p["email"] and p["invite"] and p["user_id"]]
    assert len(merged) == 1 and merged[0]["org_role"] == "member"  # member row carries the pending badge
    assert acc.status_code == 200 and acc.json()["already"] is True and acc.json()["workspace_slug"] == "emea"
    assert role == [("admin",)]


async def _legacy_invite(t, email, *, workspace=None, role="member"):
    from app.services.authorization import generate_invite_token

    raw, digest = generate_invite_token()
    ws_id = None
    if workspace:
        ws_id = (await t["q"]("SELECT id FROM workspaces WHERE org_id = :o AND slug = :s", s=workspace))[0][0]
    await t["q"](
        "INSERT INTO invites (token_hash, org_id, workspace_id, email, role, status, expires_at) "
        "VALUES (:h, :o, :w, :e, :r, 'pending', now() + interval '7 days') RETURNING id",
        h=digest, w=ws_id, e=email, r=role,
    )
    return raw


@pg
@pytest.mark.parametrize("order", [("org", "ws"), ("ws", "org")])
def test_links_sent_before_the_change_still_work_in_either_order(monkeypatch, order):
    """Old pairs: an org invite and a workspace invite. Both open; neither returns 409."""
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, tag = t["c"], t["tag"]
            email = f"old-{tag}@example.com"
            toks = {"org": await _legacy_invite(t, email), "ws": await _legacy_invite(t, email, workspace="emea", role="member")}
            t["as"](email)
            out = [await c.post(f"/api/v1/invites/{toks[k]}/accept") for k in order]
            ws = await c.get(f"{t['base']}/workspaces")
            return out, ws

    out, ws = run(go())
    assert [r.status_code for r in out] == [200, 200], [r.text for r in out]
    assert out[0].json()["already"] is False and out[1].json()["already"] is True
    assert all(r.json()["workspace_slug"] == "emea" for r in out)
    assert [w["slug"] for w in ws.json()] == ["emea"]


@pg
def test_old_org_only_member_link_joins_with_no_workspace_and_old_admin_link_sees_all(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, tag = t["c"], t["tag"]
            m, a = f"m-{tag}@example.com", f"a-{tag}@example.com"
            tm, ta = await _legacy_invite(t, m), await _legacy_invite(t, a, role="admin")
            t["as"](m)
            member = await c.post(f"/api/v1/invites/{tm}/accept")
            t["as"](a)
            admin = await c.post(f"/api/v1/invites/{ta}/accept")
            return member, admin

    member, admin = run(go())
    assert member.status_code == 200 and "workspace_slug" not in member.json()  # web shows "No workspace yet"
    assert admin.json()["role"] == "admin" and admin.json()["workspace_slug"] == "default"


@pg
def test_wrong_account_revoked_and_expired(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            email = f"d-{tag}@example.com"
            res = (await c.post(f"{base}/invites", json={"emails": [email], "workspaces": [{"slug": "emea", "role": "viewer"}]})).json()["invites"][0]
            tok = _token(res["invite_url"])
            t["as"](f"other-{tag}@example.com")
            wrong = await c.post(f"/api/v1/invites/{tok}/accept")
            t["as"](t["users"]["owner"][1])
            await c.delete(f"{base}/invites/{res['id']}")
            t["as"](email)
            revoked = await c.post(f"/api/v1/invites/{tok}/accept")
            old = await _legacy_invite(t, email)
            await t["q"]("UPDATE invites SET expires_at = now() - interval '1 day' WHERE org_id = :o AND status = 'pending'")
            expired = await c.post(f"/api/v1/invites/{old}/accept")
            return wrong, revoked, expired

    wrong, revoked, expired = run(go())
    assert wrong.status_code == 403 and revoked.status_code == 410 and expired.status_code == 410


@pg
def test_resend_emails_a_fresh_link_and_the_old_one_stops(monkeypatch):
    sent = []

    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=sent) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            res = (await c.post(f"{base}/invites", json={"emails": [f"r-{tag}@example.com"], "workspaces": [{"slug": "emea", "role": "viewer"}]})).json()["invites"][0]
            again = await c.post(f"{base}/invites/{res['id']}/resend")
            old = await c.get(f"/api/v1/invites/{_token(res['invite_url'])}")
            new = await c.get(f"/api/v1/invites/{_token(again.json()['invite_url'])}")
            return again, old, new

    again, old, new = run(go())
    assert again.status_code == 200 and again.json()["email_sent"] is True and len(sent) == 2
    assert old.status_code == 404 and new.status_code == 200
    assert sent[1]["url"].endswith(again.json()["invite_url"])


@pg
def test_without_a_secret_copy_link_says_resend(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[], secret="") as t:
            from app.services import invitations as inv_service

            monkeypatch.setattr(inv_service.settings, "resend_api_key", "")
            c, base, tag = t["c"], t["base"], t["tag"]
            res = (await c.post(f"{base}/invites", json={"emails": [f"s-{tag}@example.com"], "workspaces": [{"slug": "emea", "role": "viewer"}]})).json()["invites"][0]
            return await c.get(f"{base}/invites/{res['id']}/link")

    link = run(go())
    assert link.status_code == 409 and "Resend" in link.json()["detail"]


@pg
def test_licences_are_checked_on_invite_and_viewers_stay_free(monkeypatch):
    async def go():
        async with _org(plan="starter", sub="sub_s", monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            editor = await c.post(f"{base}/invites", json={"emails": [f"e-{tag}@example.com"], "workspaces": [{"slug": "emea", "role": "member"}]})
            viewer = await c.post(f"{base}/invites", json={"emails": [f"v-{tag}@example.com"], "workspaces": [{"slug": "emea", "role": "viewer"}]})
            return editor, viewer

    editor, viewer = run(go())
    # Starter = 1 licence: the owner and the workspace admin already use more than that.
    assert editor.status_code == 403 and editor.json()["detail"]["code"] == "licence_limit"
    assert viewer.status_code == 201


@pg
def test_free_plan_cannot_invite(monkeypatch):
    async def go():
        async with _org(plan="free", sub=None, monkeypatch=monkeypatch, emails_sent=[]) as t:
            return await t["c"].post(f"{t['base']}/invites", json={"emails": [f"f-{t['tag']}@example.com"], "workspaces": [{"slug": "emea", "role": "viewer"}]})

    assert run(go()).status_code == 403


@pg
def test_edit_access_adds_changes_and_removes_within_what_the_actor_manages(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            email = f"m-{tag}@example.com"
            tok = await _legacy_invite(t, email)
            t["as"](email)
            await c.post(f"/api/v1/invites/{tok}/accept")  # member with no workspace
            uid = (await t["q"]("SELECT id FROM users WHERE email = :e", e=email))[0][0]
            t["as"](t["users"]["owner"][1])
            add = await c.put(f"{base}/members/{uid}/workspaces", json={"workspaces": [{"slug": "default", "role": "viewer"}, {"slug": "emea", "role": "member"}]})
            t["as"](t["users"]["wsadmin"][1])
            change = await c.put(f"{base}/members/{uid}/workspaces", json={"workspaces": [{"slug": "emea", "role": "viewer"}]})
            touch_main = await c.put(f"{base}/members/{uid}/workspaces", json={"workspaces": [{"slug": "default", "role": "admin"}]})
            t["as"](t["users"]["owner"][1])
            remove = await c.put(f"{base}/members/{uid}/workspaces", json={"workspaces": [{"slug": "emea", "role": "viewer"}]})
            return add, change, touch_main, remove

    add, change, touch_main, remove = run(go())
    assert add.status_code == 200 and {(w["slug"], w["role"]) for w in add.json()["workspaces"]} == {("default", "viewer"), ("emea", "member")}
    assert change.status_code == 200 and change.json()["workspaces"] == [{"slug": "emea", "name": "EMEA rollout", "role": "viewer"}]
    assert touch_main.status_code == 403
    assert remove.status_code == 200 and [w["slug"] for w in remove.json()["workspaces"]] == ["emea"]


@pg
def test_old_single_invite_body_still_works(monkeypatch):
    async def go():
        async with _org(monkeypatch=monkeypatch, emails_sent=[]) as t:
            c, base, tag = t["c"], t["base"], t["tag"]
            ws = await c.post(f"{base}/workspaces/emea/invites", json={"email": f"w-{tag}@example.com", "role": "viewer"})
            org_member = await c.post(f"{base}/invites", json={"email": f"o-{tag}@example.com", "role": "member"})
            org_admin = await c.post(f"{base}/invites", json={"email": f"a-{tag}@example.com", "role": "admin"})
            return ws, org_member, org_admin

    ws, org_member, org_admin = run(go())
    assert ws.status_code == 201 and ws.json()["invites"][0]["workspaces"][0]["slug"] == "emea"
    assert org_member.status_code == 400  # no more members with no workspace
    assert org_admin.status_code == 201 and org_admin.json()["invites"][0]["org_admin"] is True
