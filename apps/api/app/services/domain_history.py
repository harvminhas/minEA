"""Change log entries scoped to a business domain (capability map L1)."""
from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import ChangeLog, MinEAObject
from app.models.tenancy import User

FITNESS_LABELS = {
    "strong": "Strong",
    "adequate": "Adequate",
    "weak": "Weak",
    "none": "None",
}


def _fitness_label(value: str | None) -> str:
    if not value:
        return "—"
    return FITNESS_LABELS.get(value, value.replace("_", " ").title())


def _append_domain_log(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    action: str,
    diff: dict[str, Any],
) -> None:
    db.add(
        ChangeLog(
            workspace_id=workspace_id,
            org_id=org_id,
            object_id=domain_id,
            object_type="business_domain",
            action=action,
            diff=diff,
            performed_by=user_id,
        )
    )


def log_capability_added(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    capability_name: str,
    capability_id: UUID,
) -> None:
    _append_domain_log(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        domain_id=domain_id,
        user_id=user_id,
        action="updated",
        diff={
            "action_type": "domain_capability_added",
            "capability_name": capability_name,
            "capability_id": str(capability_id),
        },
    )


def log_capability_removed(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    capability_name: str,
    capability_id: UUID,
) -> None:
    _append_domain_log(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        domain_id=domain_id,
        user_id=user_id,
        action="updated",
        diff={
            "action_type": "domain_capability_removed",
            "capability_name": capability_name,
            "capability_id": str(capability_id),
        },
    )


def log_capability_updated(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    capability_name: str,
    changes: dict[str, dict[str, Any]],
) -> None:
    if not changes:
        return
    _append_domain_log(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        domain_id=domain_id,
        user_id=user_id,
        action="updated",
        diff={
            "action_type": "domain_capability_updated",
            "capability_name": capability_name,
            "changes": changes,
        },
    )


def log_mapping_fitness(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    capability_name: str,
    system_name: str,
    fitness: str,
    old_fitness: str | None = None,
    cleared: bool = False,
) -> None:
    _append_domain_log(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        domain_id=domain_id,
        user_id=user_id,
        action="updated",
        diff={
            "action_type": "domain_mapping_fitness",
            "capability_name": capability_name,
            "system_name": system_name,
            "fitness": fitness,
            "old_fitness": old_fitness,
            "cleared": cleared,
        },
    )


def log_system_added_to_mapping(
    db: AsyncSession,
    *,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    user_id: UUID | None,
    system_name: str,
    created: bool = False,
) -> None:
    _append_domain_log(
        db,
        workspace_id=workspace_id,
        org_id=org_id,
        domain_id=domain_id,
        user_id=user_id,
        action="updated",
        diff={
            "action_type": "domain_system_added",
            "system_name": system_name,
            "created": created,
        },
    )


def describe_domain_history(entry: ChangeLog) -> tuple[str, str | None]:
    diff = entry.diff or {}
    action_type = diff.get("action_type")

    if entry.action == "created" or action_type == "created_object":
        return "created this domain", None

    if entry.action == "deleted" or action_type == "deleted_object":
        return "deleted this domain", None

    if action_type == "domain_capability_added":
        name = diff.get("capability_name", "capability")
        return f"added capability {name}", None

    if action_type == "domain_capability_removed":
        name = diff.get("capability_name", "capability")
        return f"removed capability {name}", None

    if action_type == "domain_capability_updated":
        cap_name = diff.get("capability_name", "capability")
        changes: dict = diff.get("changes", {})
        if list(changes.keys()) == ["name"]:
            old = changes["name"].get("old") or cap_name
            new = changes["name"].get("new") or cap_name
            return f"renamed capability {old}", new
        if list(changes.keys()) == ["owner"]:
            old = changes["owner"].get("old") or "Unassigned"
            new = changes["owner"].get("new") or "Unassigned"
            return f"updated owner on {cap_name}", f"{old} → {new}"
        if list(changes.keys()) == ["description"]:
            return f"updated description on {cap_name}", None
        labels = ", ".join(k.replace("_", " ") for k in changes)
        return f"updated {labels} on {cap_name}", None

    if action_type == "domain_mapping_fitness":
        cap = diff.get("capability_name", "capability")
        system = diff.get("system_name", "system")
        if diff.get("cleared"):
            return f"cleared mapping for {cap} → {system}", None
        new_label = _fitness_label(diff.get("fitness"))
        old = diff.get("old_fitness")
        if old and old != diff.get("fitness"):
            return f"set {cap} → {system} to {new_label}", f"{_fitness_label(old)} → {new_label}"
        return f"set {cap} → {system} to {new_label}", None

    if action_type == "domain_system_added":
        name = diff.get("system_name", "system")
        if diff.get("created"):
            return f"created and added system {name} to mapping", None
        return f"added system {name} to mapping", None

    if action_type == "updated_fields":
        changes: dict = diff.get("changes", {})
        if list(changes.keys()) == ["name"]:
            return "renamed domain", changes["name"].get("new")
        if list(changes.keys()) == ["description"]:
            return "updated domain description", None
        if list(changes.keys()) == ["owner"]:
            old = changes["owner"].get("old") or "Unassigned"
            new = changes["owner"].get("new") or "Unassigned"
            return "updated domain owner", f"{old} → {new}"
        labels = ", ".join(k.replace("_", " ") for k in changes)
        return f"updated domain {labels}", None

    return entry.action.replace("_", " "), None


async def load_domain_history(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
    *,
    limit: int = 100,
) -> list[ChangeLog]:
    result = await db.execute(
        select(ChangeLog)
        .where(
            ChangeLog.workspace_id == workspace_id,
            ChangeLog.org_id == org_id,
            ChangeLog.object_id == domain_id,
            ChangeLog.object_type == "business_domain",
        )
        .order_by(ChangeLog.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


def _first_name(user: User | None) -> str:
    if user is None:
        return "Someone"
    if user.full_name:
        return user.full_name.split()[0]
    return user.email.split("@")[0]


async def domain_history_entries_for_api(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    domain_id: UUID,
) -> list[dict]:
    entries = await load_domain_history(db, workspace_id, org_id, domain_id)
    actor_ids = list({e.performed_by for e in entries if e.performed_by})
    user_map: dict[str, User] = {}
    if actor_ids:
        users_result = await db.execute(select(User).where(User.id.in_(actor_ids)))
        user_map = {str(u.id): u for u in users_result.scalars().all()}

    rows: list[dict] = []
    for entry in entries:
        actor_user = user_map.get(str(entry.performed_by)) if entry.performed_by else None
        action, detail = describe_domain_history(entry)
        rows.append(
            {
                "id": str(entry.id),
                "actor_name": _first_name(actor_user),
                "action": action,
                "detail": detail,
                "created_at": entry.created_at,
            }
        )
    return rows


def capability_domain_id(obj: MinEAObject) -> UUID | None:
    raw = (obj.properties or {}).get("domain_id")
    if not raw:
        return None
    try:
        return UUID(str(raw))
    except (ValueError, TypeError, AttributeError):
        return None


def domain_relevant_capability_changes(
    field_changes: dict[str, dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    allowed = {"name", "owner", "description"}
    return {k: v for k, v in field_changes.items() if k in allowed}
