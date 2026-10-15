"""Platform admin: permanently erase one user (superuser only).

plan_erase() works out exactly what would go; execute_erase() re-computes that plan inside the
same transaction, re-checks every safeguard, deletes, verifies the row counts and writes the
audit row. Nothing here touches Stripe or Firebase.

Rules:
  - Orgs where the user is the ONLY member (org or workspace membership): the org is deleted with
    everything in it (workspaces, objects, links, people, views… cascade from orgs/workspaces;
    change_log has no foreign key, so it is deleted explicitly).
  - Orgs with other members: only the user's memberships go (cascade from users); their name on
    history is cleared (change_log.performed_by, created_by/updated_by are ON DELETE SET NULL).
    Other people's records are never deleted.
  - Sole owner/admin of an org that has other members: BLOCKED (make someone else admin first).
  - An org to be deleted with a Stripe subscription: BLOCKED unless acknowledged. Never cancelled.
  - Never yourself, never another platform admin, and the typed email must match exactly.

Several accounts can share one email (one users row per Firebase sign-in method/uid). By default
all of them are erased together: one plan over every account with that email (an org whose only
members are these accounts is deleted; "other admins" means admins outside these accounts), one
transaction, and one audit row per account. Platform admins are matched by email, so every
account of a platform admin is protected.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.services import tool_catalog as tc

ADMIN_ROLES = {"owner", "admin"}


class EraseError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


@dataclass
class OrgPlan:
    id: str
    slug: str
    name: str
    plan: str
    role: str | None  # org role, None when only a workspace member
    members: int  # distinct accounts in the org (org + workspace memberships), including the user's
    other_admins: int  # owners/admins outside the accounts being erased
    subscription: bool
    action: str = "leave"  # delete | leave | blocked
    reason: str = ""
    workspaces: int = 0
    objects: int = 0
    relationships: int = 0
    outside_members: int | None = None  # members not among the accounts being erased (None: members - 1)
    accounts: list[str] = field(default_factory=list)  # which of the erased accounts belong to it

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ErasePlan:
    user: dict[str, Any]
    orgs: list[OrgPlan] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)
    needs_subscription_ack: bool = False
    personal: dict[str, int] = field(default_factory=dict)
    accounts: list[dict[str, Any]] = field(default_factory=list)  # every account being erased
    firebase_uids: list[str] = field(default_factory=list)  # never sent to the browser

    @property
    def delete_orgs(self) -> list[OrgPlan]:
        return [org for org in self.orgs if org.action == "delete"]

    def counts(self) -> dict[str, Any]:
        gone = self.delete_orgs
        return {
            "orgs_deleted": len(gone),
            "orgs_left": len([org for org in self.orgs if org.action == "leave"]),
            "workspaces_deleted": sum(org.workspaces for org in gone),
            "objects_deleted": sum(org.objects for org in gone),
            "relationships_deleted": sum(org.relationships for org in gone),
            "accounts": len(self.accounts) or 1,
            **self.personal,
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "user": self.user,
            "orgs": [org.as_dict() for org in self.orgs],
            "blockers": self.blockers,
            "needs_subscription_ack": self.needs_subscription_ack,
            "counts": self.counts(),
            "accounts": self.accounts,
        }


def decide(org: OrgPlan) -> OrgPlan:
    """Pure rule for one org (unit-tested)."""
    outside = org.outside_members if org.outside_members is not None else org.members - 1
    if outside <= 0:
        org.action = "delete"
        org.reason = "Only member: the org and everything in it is deleted."
    elif org.role in ADMIN_ROLES and org.other_admins == 0:
        org.action = "blocked"
        org.reason = "Only owner/admin of an org with other members. Make someone else an admin first."
    else:
        org.action = "leave"
        org.reason = "Other members: only this person's membership is removed."
    return org


async def _user(db: AsyncSession, user_id: UUID, lock: bool) -> dict[str, Any]:
    row = (await db.execute(
        text("SELECT id, email, full_name, firebase_uid, created_at FROM users WHERE id = :id" + (" FOR UPDATE" if lock else "")),
        {"id": user_id},
    )).mappings().first()
    if not row:
        raise EraseError("not_found", "User not found.", 404)
    return {"id": str(row["id"]), "email": row["email"], "name": row["full_name"] or "", "firebase_uid": row["firebase_uid"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None}


ROLE_RANK = {"owner": 3, "admin": 2, "member": 1}


async def _sibling_accounts(db: AsyncSession, email: str, lock: bool) -> list[dict[str, Any]]:
    rows = (await db.execute(
        text("SELECT id, email, full_name, firebase_uid, created_at FROM users WHERE lower(email) = :email ORDER BY created_at, id"
             + (" FOR UPDATE" if lock else "")),
        {"email": email.strip().lower()},
    )).mappings().all()
    return [{"id": str(r["id"]), "email": r["email"], "name": r["full_name"] or "", "firebase_uid": r["firebase_uid"],
             "created_at": r["created_at"].isoformat() if r["created_at"] else None} for r in rows]


async def plan_erase(db: AsyncSession, user_id: UUID, *, lock: bool = False, all_accounts: bool = False) -> ErasePlan:
    user = await _user(db, user_id, lock)
    plan = ErasePlan(user={k: v for k, v in user.items() if k != "firebase_uid"})
    accounts = await _sibling_accounts(db, user["email"], lock) if all_accounts else []
    if not any(a["id"] == user["id"] for a in accounts):
        accounts = [user, *accounts]
    uids = [UUID(a["id"]) for a in accounts]
    orgs = (await db.execute(text(
        """
        SELECT o.id, o.slug, o.name, o.plan, o.stripe_subscription_id,
          (SELECT array_agg(m.user_id::text || ':' || m.role) FROM org_memberships m WHERE m.org_id = o.id AND m.user_id = ANY(:uids)) AS roles,
          (SELECT array_agg(DISTINCT wm.user_id::text) FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id
             WHERE w.org_id = o.id AND wm.user_id = ANY(:uids)) AS ws_members
        FROM orgs o
        WHERE o.id IN (SELECT org_id FROM org_memberships WHERE user_id = ANY(:uids))
           OR o.id IN (SELECT w.org_id FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id = ANY(:uids))
        ORDER BY o.name
        """ + (" FOR UPDATE OF o" if lock else "")
    ), {"uids": uids})).mappings().all()
    account_orgs: dict[str, list[dict[str, Any]]] = {a["id"]: [] for a in accounts}
    for row in orgs:
        stats = (await db.execute(text(
            """
            SELECT
              (SELECT count(DISTINCT p.user_id) FROM (
                  SELECT user_id FROM org_memberships WHERE org_id = :org
                  UNION SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id WHERE w.org_id = :org
              ) p) AS members,
              (SELECT count(DISTINCT p.user_id) FROM (
                  SELECT user_id FROM org_memberships WHERE org_id = :org
                  UNION SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id WHERE w.org_id = :org
              ) p WHERE p.user_id <> ALL(:uids)) AS outside_members,
              (SELECT count(*) FROM org_memberships WHERE org_id = :org AND user_id <> ALL(:uids) AND role IN ('owner', 'admin')) AS other_admins,
              (SELECT count(*) FROM workspaces WHERE org_id = :org) AS workspaces,
              (SELECT count(*) FROM objects WHERE org_id = :org) AS objects,
              (SELECT count(*) FROM relationships WHERE org_id = :org) AS relationships
            """
        ), {"org": row["id"], "uids": uids})).mappings().one()
        roles: dict[str, str] = {}
        for item in row["roles"] or []:
            uid, _, role = item.partition(":")
            roles[uid] = role
        in_org = sorted(set(roles) | set(row["ws_members"] or []))
        best = max(roles.values(), key=lambda r: ROLE_RANK.get(r, 0)) if roles else None
        for uid in in_org:
            account_orgs.setdefault(uid, []).append({"slug": row["slug"], "name": row["name"], "role": roles.get(uid)})
        org = decide(OrgPlan(
            id=str(row["id"]), slug=row["slug"], name=row["name"], plan=row["plan"] or "free", role=best,
            members=int(stats["members"]), other_admins=int(stats["other_admins"]),
            outside_members=int(stats["outside_members"]), accounts=in_org,
            subscription=bool(row["stripe_subscription_id"]),
            workspaces=int(stats["workspaces"]), objects=int(stats["objects"]), relationships=int(stats["relationships"]),
        ))
        plan.orgs.append(org)
        if org.action == "blocked":
            plan.blockers.append(f"{org.name}: {org.reason}")
        if org.action == "delete" and org.subscription:
            plan.needs_subscription_ack = True
    plan.accounts = [{**{k: v for k, v in a.items() if k != "firebase_uid"}, "firebase_uid_hint": (a["firebase_uid"] or "")[-6:], "orgs": account_orgs.get(a["id"], [])} for a in accounts]
    plan.firebase_uids = [a["firebase_uid"] for a in accounts if a.get("firebase_uid")]
    email = user["email"].strip().lower()
    personal = (await db.execute(text(
        """
        SELECT
          (SELECT count(*) FROM invites WHERE lower(email) = :email) AS invites,
          (SELECT count(*) FROM support_requests WHERE lower(user_email) = :email) AS support_requests,
          (SELECT count(*) FROM business_plan_requests WHERE lower(email) = :email) AS business_requests,
          (SELECT count(*) FROM contact_inquiries WHERE lower(email) = :email) AS contact_inquiries
        """
    ), {"email": email})).mappings().one()
    plan.personal = {key: int(value) for key, value in personal.items()}
    return plan


def check_request(plan: ErasePlan, *, admin_email: str, confirm_email: str, acknowledge_subscriptions: bool, admin_uid: str = "") -> None:
    """Every safeguard, as a pure function of the plan and the request (unit-tested). Covers every account in the plan."""
    target = (plan.user.get("email") or "").strip().lower()
    emails = {target} | {(a.get("email") or "").strip().lower() for a in plan.accounts}
    if (target and target == (admin_email or "").strip().lower()) or (admin_uid and admin_uid in plan.firebase_uids):
        raise EraseError("self", "You can't erase your own account.", 400)
    if emails & set(tc.platform_admin_emails()):
        raise EraseError("platform_admin", "Platform admins can't be erased here.", 400)
    if (confirm_email or "").strip().lower() != target or not target:
        raise EraseError("confirm_mismatch", "Type the user's full email exactly to confirm.", 400)
    if plan.blockers:
        raise EraseError("blocked", " ".join(plan.blockers))
    if plan.needs_subscription_ack and not acknowledge_subscriptions:
        raise EraseError(
            "subscription",
            "An org that would be deleted has a Stripe subscription. It is NOT cancelled automatically: cancel it in Stripe, or acknowledge to erase anyway.",
        )


async def _exec(db: AsyncSession, sql: str, params: dict) -> int:
    return (await db.execute(text(sql), params)).rowcount or 0


async def execute_erase(
    db: AsyncSession,
    user_id: UUID,
    *,
    admin_email: str,
    admin_uid: str,
    confirm_email: str,
    acknowledge_subscriptions: bool,
    all_accounts: bool = False,
) -> dict[str, Any]:
    """One transaction: lock, re-plan, re-check, delete, verify, audit (one row per account), commit."""
    try:
        plan = await plan_erase(db, user_id, lock=True, all_accounts=all_accounts)
        check_request(plan, admin_email=admin_email, admin_uid=admin_uid, confirm_email=confirm_email, acknowledge_subscriptions=acknowledge_subscriptions)
        uids = [UUID(a["id"]) for a in plan.accounts] or [user_id]
        org_ids = [UUID(org.id) for org in plan.delete_orgs]
        slugs = [org.slug for org in plan.delete_orgs]
        email = plan.user["email"].strip().lower()
        p = {"uids": uids, "orgs": org_ids, "slugs": slugs, "email": email}
        done: dict[str, int] = {}
        if org_ids:
            done["change_log_deleted"] = await _exec(db, "DELETE FROM change_log WHERE org_id = ANY(:orgs)", p)
            await _exec(db, "DELETE FROM support_requests WHERE org_slug = ANY(:slugs)", p)
            await _exec(db, "DELETE FROM business_plan_requests WHERE org_slug = ANY(:slugs)", p)
            await _exec(db, "DELETE FROM billing_alerts WHERE org_slug = ANY(:slugs)", p)
            deleted = await _exec(db, "DELETE FROM orgs WHERE id = ANY(:orgs)", p)
            if deleted != len(org_ids):
                raise EraseError("verify", f"Expected to delete {len(org_ids)} org(s), deleted {deleted}. Nothing was changed.", 500)
        done["history_unlinked"] = await _exec(db, "UPDATE change_log SET performed_by = NULL WHERE performed_by = ANY(:uids)", p)
        await _exec(db, "UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = ANY(:uids)", p)
        await _exec(db, "DELETE FROM invites WHERE lower(email) = :email", p)
        await _exec(db, "DELETE FROM support_requests WHERE lower(user_email) = :email", p)
        await _exec(db, "DELETE FROM business_plan_requests WHERE lower(email) = :email", p)
        await _exec(db, "DELETE FROM contact_inquiries WHERE lower(email) = :email", p)
        if await _exec(db, "DELETE FROM users WHERE id = ANY(:uids)", p) != len(uids):
            raise EraseError("verify", f"Expected to delete {len(uids)} account(s). Nothing was changed.", 500)
        counts = {**plan.counts(), **done}
        ack = bool(acknowledge_subscriptions and plan.needs_subscription_ack)
        for account in plan.accounts or [{"id": str(user_id), "orgs": []}]:
            row_counts = {**counts, "account_orgs": account.get("orgs", []), "batch_user_ids": [str(u) for u in uids]}
            await db.execute(text(
                """
                INSERT INTO platform_erasures (erased_user_id, erased_email, erased_by_email, erased_by_uid, counts, acknowledged_subscriptions)
                VALUES (:uid, :email, :by_email, :by_uid, CAST(:counts AS JSONB), :ack)
                """
            ), {"uid": UUID(account["id"]), "email": email, "by_email": admin_email, "by_uid": admin_uid, "counts": json.dumps(row_counts), "ack": ack})
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return {"erased": plan.user["email"], "accounts": len(uids), "counts": counts, "orgs": [org.as_dict() for org in plan.orgs]}


async def list_users(db: AsyncSession, *, q: str = "", sort: str = "newest", limit: int = 500) -> list[dict[str, Any]]:
    order = "u.created_at ASC" if sort == "oldest" else "u.created_at DESC"
    rows = (await db.execute(text(
        f"""
        SELECT u.id, u.email, u.full_name, u.created_at, u.email_verified_at, u.firebase_uid,
          (SELECT count(*) FROM users u2 WHERE lower(u2.email) = lower(u.email)) AS accounts_with_email,
          (SELECT max(c.created_at) FROM change_log c WHERE c.performed_by = u.id) AS last_active,
          (SELECT count(*) FROM objects ob WHERE ob.created_by = u.id) AS objects_created,
          COALESCE((
            SELECT json_agg(json_build_object(
              'slug', o.slug, 'name', o.name, 'plan', o.plan, 'role', m.role,
              'members', (SELECT count(*) FROM org_memberships mm WHERE mm.org_id = o.id),
              'objects', (SELECT count(*) FROM objects ob WHERE ob.org_id = o.id),
              'subscription', o.stripe_subscription_id IS NOT NULL
            ) ORDER BY o.name)
            FROM org_memberships m JOIN orgs o ON o.id = m.org_id WHERE m.user_id = u.id
          ), '[]'::json) AS orgs
        FROM users u
        WHERE (:q = '' OR u.email ILIKE :like OR coalesce(u.full_name, '') ILIKE :like)
        ORDER BY {order}
        LIMIT :limit
        """
    ), {"q": q.strip(), "like": f"%{q.strip()}%", "limit": limit})).mappings().all()
    return [
        {
            "id": str(r["id"]), "email": r["email"], "name": r["full_name"] or "",
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "verified": r["email_verified_at"] is not None,
            "accounts_with_email": int(r["accounts_with_email"]),
            "firebase_uid_hint": (r["firebase_uid"] or "")[-6:],
            "last_active": r["last_active"].isoformat() if r["last_active"] else None,
            "objects_created": int(r["objects_created"]),
            "orgs": r["orgs"] if isinstance(r["orgs"], list) else json.loads(r["orgs"] or "[]"),
        }
        for r in rows
    ]
