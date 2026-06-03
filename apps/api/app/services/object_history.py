"""Human-readable labels for object change_log entries."""
from __future__ import annotations

from app.models.objects import ChangeLog


def describe_object_history(entry: ChangeLog) -> tuple[str, str | None]:
    diff = entry.diff or {}
    action_type = diff.get("action_type")

    if entry.action == "created" or action_type == "created_object":
        return "created this system", None

    if entry.action == "deleted" or action_type == "deleted_object":
        return "deleted this system", None

    if action_type == "updated_fields":
        changes: dict = diff.get("changes", {})
        if list(changes.keys()) == ["status"]:
            old = changes["status"].get("old") or "—"
            new = changes["status"].get("new") or "—"
            return "updated status", f"{old} → {new}"
        if list(changes.keys()) == ["owner"]:
            old = changes["owner"].get("old") or "Unassigned"
            new = changes["owner"].get("new") or "Unassigned"
            return "updated owner", f"{old} → {new}"
        if list(changes.keys()) == ["name"]:
            return "renamed system", changes["name"].get("new")
        labels = ", ".join(k.replace("_", " ") for k in changes)
        return f"updated {labels}", None

    # Legacy flat diffs from before structured logging
    if entry.action == "updated":
        parts: list[str] = []
        for key, val in diff.items():
            if key in ("action_type", "changes"):
                continue
            if key == "status":
                return "updated status", str(val)
            if key == "owner":
                return "updated owner", str(val)
            if key == "name":
                return "renamed system", str(val)
            parts.append(key.replace("_", " "))
        if parts:
            return f"updated {', '.join(parts)}", None

    return entry.action.replace("_", " "), None
