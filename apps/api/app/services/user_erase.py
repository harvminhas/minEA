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
    members: int  # distinct people in the org (org + workspace memberships), including the user
    other_admins: int
    subscription: bool
    action: str = "leave"  # delete | leave | blocked
    reason: str = ""
    workspaces: int = 0
    objects: int = 0
    relationships: int = 0

    def as_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


@dataclass
class ErasePlan:
    user: dict[str, Any]
    orgs: list[OrgPlan] = field(default_factory=list)
    blockers: list[str] = field(default_factory=list)
    needs_subscription_ack: bool = False
    personal: dict[str, int] = field(default_factory=dict)

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
            **self.personal,
        }

    def as_dict(self) -> dict[str, Any]:
        return {
            "user": self.user,
            "orgs": [org.as_dict() for org in self.orgs],
            "blockers": self.blockers,
            "needs_subscription_ack": self.needs_subscription_ack,
            "counts": self.counts(),
        }


def decide(org: OrgPlan) -> OrgPlan:
    """Pure rule for one org (unit-tested)."""
    if org.members <= 1:
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


async def plan_erase(db: AsyncSession, user_id: UUID, *, lock: bool = False) -> ErasePlan:
    user = await _user(db, user_id, lock)
    plan = ErasePlan(user={k: v for k, v in user.items() if k != "firebase_uid"})
    orgs = (await db.execute(text(
        """
        SELECT o.id, o.slug, o.name, o.plan, o.stripe_subscription_id, m.role
        FROM orgs o
        LEFT JOIN org_memberships m ON m.org_id = o.id AND m.user_id = :uid
        WHERE m.user_id IS NOT NULL
           OR o.id IN (SELECT w.org_id FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.user_id = :uid)
        ORDER BY o.name
        """ + (" FOR UPDATE OF o" if lock else "")
    ), {"uid": user_id})).mappings().all()
    for row in orgs:
        stats = (await db.execute(text(
            """
            SELECT
              (SELECT count(DISTINCT p.user_id) FROM (
                  SELECT user_id FROM org_memberships WHERE org_id = :org
                  UNION SELECT wm.user_id FROM workspace_memberships wm JOIN workspaces w ON w.id = wm.workspace_id WHERE w.org_id = :org
              ) p) AS members,
              (SELECT count(*) FROM org_memberships WHERE org_id = :org AND user_id <> :uid AND role IN ('owner', 'admin')) AS other_admins,
              (SELECT count(*) FROM workspaces WHERE org_id = :org) AS workspaces,
              (SELECT count(*) FROM objects WHERE org_id = :org) AS objects,
              (SELECT count(*) FROM relationships WHERE org_id = :org) AS relationships
            """
        ), {"org": row["id"], "uid": user_id})).mappings().one()
        org = decide(OrgPlan(
            id=str(row["id"]), slug=row["slug"], name=row["name"], plan=row["plan"] or "free", role=row["role"],
            members=int(stats["members"]), other_admins=int(stats["other_admins"]),
            subscription=bool(row["stripe_subscription_id"]),
            workspaces=int(stats["workspaces"]), objects=int(stats["objects"]), relationships=int(stats["relationships"]),
        ))
        plan.orgs.append(org)
        if org.action == "blocked":
            plan.blockers.append(f"{org.name}: {org.reason}")
        if org.action == "delete" and org.subscription:
            plan.needs_subscription_ack = True
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


def check_request(plan: ErasePlan, *, admin_email: str, confirm_email: str, acknowledge_subscriptions: bool) -> None:
    """Every safeguard, as a pure function of the plan and the request (unit-tested)."""
    target = (plan.user.get("email") or "").strip().lower()
    if target and target == (admin_email or "").strip().lower():
        raise EraseError("self", "You can't erase your own account.", 400)
    if target in tc.platform_admin_emails():
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
) -> dict[str, Any]:
    """One transaction: lock, re-plan, re-check, delete, verify, audit, commit."""
    try:
        plan = await plan_erase(db, user_id, lock=True)
        check_request(plan, admin_email=admin_email, confirm_email=confirm_email, acknowledge_subscriptions=acknowledge_subscriptions)
        org_ids = [UUID(org.id) for org in plan.delete_orgs]
        slugs = [org.slug for org in plan.delete_orgs]
        email = plan.user["email"].strip().lower()
        p = {"uid": user_id, "orgs": org_ids, "slugs": slugs, "email": email}
        done: dict[str, int] = {}
        if org_ids:
            done["change_log_deleted"] = await _exec(db, "DELETE FROM change_log WHERE org_id = ANY(:orgs)", p)
            await _exec(db, "DELETE FROM support_requests WHERE org_slug = ANY(:slugs)", p)
            await _exec(db, "DELETE FROM business_plan_requests WHERE org_slug = ANY(:slugs)", p)
            await _exec(db, "DELETE FROM billing_alerts WHERE org_slug = ANY(:slugs)", p)
            deleted = await _exec(db, "DELETE FROM orgs WHERE id = ANY(:orgs)", p)
            if deleted != len(org_ids):
                raise EraseError("verify", f"Expected to delete {len(org_ids)} org(s), deleted {deleted}. Nothing was changed.", 500)
        done["history_unlinked"] = await _exec(db, "UPDATE change_log SET performed_by = NULL WHERE performed_by = :uid", p)
        await _exec(db, "UPDATE audit_log SET actor_user_id = NULL WHERE actor_user_id = :uid", p)
        await _exec(db, "DELETE FROM invites WHERE lower(email) = :email", p)
        await _exec(db, "DELETE FROM support_requests WHERE lower(user_email) = :email", p)
        await _exec(db, "DELETE FROM business_plan_requests WHERE lower(email) = :email", p)
        await _exec(db, "DELETE FROM contact_inquiries WHERE lower(email) = :email", p)
        if await _exec(db, "DELETE FROM users WHERE id = :uid", p) != 1:
            raise EraseError("verify", "The user row was not deleted. Nothing was changed.", 500)
        counts = {**plan.counts(), **done}
        await db.execute(text(
            """
            INSERT INTO platform_erasures (erased_user_id, erased_email, erased_by_email, erased_by_uid, counts, acknowledged_subscriptions)
            VALUES (:uid, :email, :by_email, :by_uid, CAST(:counts AS JSONB), :ack)
            """
        ), {**p, "by_email": admin_email, "by_uid": admin_uid, "counts": json.dumps(counts), "ack": bool(acknowledge_subscriptions and plan.needs_subscription_ack)})
        await db.commit()
    except BaseException:
        await db.rollback()
        raise
    return {"erased": plan.user["email"], "counts": counts, "orgs": [org.as_dict() for org in plan.orgs]}


async def list_users(db: AsyncSession, *, q: str = "", sort: str = "newest", limit: int = 500) -> list[dict[str, Any]]:
    order = "u.created_at ASC" if sort == "oldest" else "u.created_at DESC"
    rows = (await db.execute(text(
        f"""
        SELECT u.id, u.email, u.full_name, u.created_at, u.email_verified_at,
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
            "last_active": r["last_active"].isoformat() if r["last_active"] else None,
            "objects_created": int(r["objects_created"]),
            "orgs": r["orgs"] if isinstance(r["orgs"], list) else json.loads(r["orgs"] or "[]"),
        }
        for r in rows
    ]
