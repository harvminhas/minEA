"""Working-step summaries for Ask, built only from what the server actually did.

Each lookup result becomes one short line ("6 Applications renew in the next 90 days, $182,400 a
year"). The lines use the tool's own counts, never the model's text, so they are grounded by
construction. The same lines feed the JSON response today (`steps`) and the event stream later.
"""

from __future__ import annotations

from typing import Any

from app.ai.ask.graph import WorkspaceGraph

# Plural forms for type labels that don't just take an "s".
_PLURAL = {
    "Capability": "Capabilities",
    "On-prem server": "On-prem servers",
    "AI Agent": "AI Agents",
    "AI Model": "AI Models",
    "Infrastructure": "Infrastructure items",
}


def plural(label: str, n: int) -> str:
    if n == 1:
        return label
    if label in _PLURAL:
        return _PLURAL[label]
    if label.endswith("s"):
        return label
    if label.endswith("y") and not label.endswith(("ay", "ey", "oy", "uy")):
        return label[:-1] + "ies"
    return label + "s"


def count_label(n: int, label: str) -> str:
    return f"{n:,} {plural(label, n)}"


def by_type_label(by_type: dict[str, int] | None, fallback: str = "item") -> str:
    """{"Application": 6, "Capability": 1} -> "6 Applications and 1 Capability"."""
    parts = [count_label(n, label) for label, n in sorted((by_type or {}).items(), key=lambda kv: (-kv[1], kv[0])) if n]
    if not parts:
        return f"0 {plural(fallback, 0)}"
    if len(parts) == 1:
        return parts[0]
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def money(value: float | int | None) -> str:
    return f"${int(round(value or 0)):,}"


_FIELD_PHRASE = {
    "owner": "no owner",
    "vendor": "no vendor",
    "annual_cost": "no annual cost",
    "cost": "no annual cost",
    "renewal_date": "no renewal date",
    "renewal": "no renewal date",
    "lifecycle": "no lifecycle",
    "criticality": "no criticality",
}


def step(step_id: str, label: str, *, status: str = "done", counts: dict[str, Any] | None = None, tool: str | None = None) -> dict:
    out: dict[str, Any] = {"id": step_id, "status": status, "label": label}
    if counts:
        out["counts"] = counts
    if tool:
        out["tool"] = tool
    return out


def estate_step(graph: WorkspaceGraph) -> dict:
    by_type: dict[str, int] = {}
    for rec in graph.records.values():
        if rec.type in {"application", "infrastructure"}:
            by_type[rec.type_label()] = by_type.get(rec.type_label(), 0) + 1
    total = sum(by_type.values())
    if not total:
        return step("estate", "Read your estate: no applications or infrastructure recorded yet", counts={"items": 0})
    return step("estate", f"Read your estate: {by_type_label(by_type)}", counts={"items": total})


def tool_step(index: int, name: str, args: dict, result: dict) -> dict:
    """One line per lookup. Unknown tools and errors still get an honest line."""
    sid = f"tool-{index}"
    if not isinstance(result, dict):
        return step(sid, "Ran a lookup", tool=name)
    if result.get("error"):
        if result.get("error") == "not_an_ai_question":
            return step(sid, "Skipped the AI lookup: the question isn't about AI", tool=name)
        if result.get("error") == "not_found":
            return step(sid, "Couldn't find that item in this workspace", status="error", tool=name)
        return step(sid, "A lookup failed; answering from what was found", status="error", tool=name)
    try:
        builder = _BUILDERS.get(name)
        if builder:
            label, counts = builder(args or {}, result)
            return step(sid, label, counts=counts, tool=name)
    except Exception:  # a summary must never break an answer
        pass
    return step(sid, "Ran a lookup", tool=name)


def _search(args: dict, result: dict) -> tuple[str, dict]:
    text = str(args.get("text") or "").strip()[:60]
    matches = result.get("matches") or []
    total = int(result.get("total") or len(matches))
    if not total:
        return f"No match for “{text}”", {"matches": 0}
    if total == 1 and matches:
        m = matches[0]
        return f"Matched “{text}” to {m.get('name')} ({m.get('type_label') or 'item'})", {"matches": 1}
    by_type: dict[str, int] = {}
    for m in matches:
        label = m.get("type_label") or "Item"
        by_type[label] = by_type.get(label, 0) + 1
    shown = by_type_label(by_type) if total == len(matches) else f"{total:,} items"
    return f"Found {shown} matching “{text}”", {"matches": total}


def _impact(args: dict, result: dict) -> tuple[str, dict]:
    target = (result.get("target") or {}).get("name") or "that item"
    counts = result.get("counts") or {}
    affected = len(result.get("affected") or [])
    if not affected:
        return f"Nothing recorded depends on {target}", {"affected": 0}
    critical = int(counts.get("critical_direct") or 0)
    direct = int(counts.get("direct") or 0)
    tail = []
    if direct:
        tail.append(f"{direct:,} stop working")
    if counts.get("loses_sign_in"):
        tail.append(f"{int(counts['loses_sign_in']):,} can't sign in")
    if critical:
        tail.append(f"{critical:,} critical")
    extra = f" ({', '.join(tail)})" if tail else ""
    return f"{by_type_label(result.get('by_type'))} depend on {target}{extra}", {"affected": affected, "critical_direct": critical}


def _aggregate(args: dict, result: dict) -> tuple[str, dict]:
    filters = args.get("filters") or {}
    count = int(result.get("count") or 0)
    what = by_type_label(result.get("by_type"), "item") if count else "nothing"
    counts: dict[str, Any] = {"count": count}
    within = filters.get("renewal_within_days")
    cost = result.get("annual_cost")
    if isinstance(within, int):
        with_dates = result.get("with_renewal_date")
        lead = f"Found {with_dates:,} with renewal dates; " if isinstance(with_dates, int) else ""
        verb = "renews" if count == 1 else "renew"
        label = f"{lead}{what} {verb} in the next {within} days" if count else f"{lead}nothing renews in the next {within} days"
        if with_dates is not None:
            counts["with_renewal_date"] = with_dates
    elif args.get("group_by") == "vendor":
        groups = result.get("groups") or []
        label = f"Grouped {what} by vendor: {len(groups):,} {'vendor' if len(groups) == 1 else 'vendors'}"
        counts["groups"] = len(groups)
    elif filters.get("missing_field"):
        phrase = _FIELD_PHRASE.get(str(filters.get("missing_field")).lower(), "a missing field")
        label = f"{what[0].upper() + what[1:]} with {phrase}" if count else f"Nothing has {phrase}"
    elif filters.get("criticality"):
        label = f"Found {what} marked {str(filters.get('criticality')).title()}"
    else:
        label = f"Counted {what}"
    if cost:
        label += f", {money(cost)} a year"
        counts["annual_cost"] = int(cost)
    return label, counts


def _gaps(args: dict, result: dict) -> tuple[str, dict]:
    count = int(result.get("count") or 0)
    phrase = _FIELD_PHRASE.get(str(args.get("field") or "").lower(), "missing details")
    if not count:
        return f"Nothing has {phrase}", {"count": 0}
    return f"{by_type_label(result.get('by_type'))} {'has' if count == 1 else 'have'} {phrase}", {"count": count}


def _sign_in(args: dict, result: dict) -> tuple[str, dict]:
    if "target" in result:
        name = (result.get("target") or {}).get("name") or "that item"
        users = int(result.get("sign_in_for_count") or 0)
        providers = [p.get("name") for p in result.get("signs_in_with") or [] if p.get("name")]
        if providers:
            return f"{name} signs in with {', '.join(providers[:3])}", {"sign_in_for": users}
        if users:
            return f"{users:,} {'item signs' if users == 1 else 'items sign'} in with {name}", {"sign_in_for": users}
        if result.get("own_login"):
            return f"{name} has its own login (no single sign-on)", {"sign_in_for": 0}
        return f"No sign-in recorded for {name}", {"sign_in_for": 0}
    providers = len(result.get("providers") or [])
    own = int(result.get("own_login_count") or 0)
    missing = int(result.get("not_recorded_count") or 0)
    return (
        f"{providers:,} sign-in {'provider' if providers == 1 else 'providers'}; {own:,} with their own login; {missing:,} with nothing recorded",
        {"providers": providers, "own_login": own, "not_recorded": missing},
    )


def _ai(args: dict, result: dict) -> tuple[str, dict]:
    c = result.get("counts") or {}
    features, agents, platforms = int(c.get("features") or 0), int(c.get("agents") or 0), int(c.get("platforms_and_models") or 0)
    parts = [
        count_label(features, "AI feature"),
        count_label(agents, "AI Agent"),
        f"{platforms:,} AI {'platform or model' if platforms == 1 else 'platforms and models'}",
    ]
    label = "Found " + ", ".join(parts)
    flags = int(c.get("flags") or 0)
    if flags:
        label += f"; {flags:,} risk {'flag' if flags == 1 else 'flags'}"
    total = (result.get("spend") or {}).get("total_per_year")
    if total:
        label += f"; {money(total)} a year"
    return label, {"features": features, "agents": agents, "platforms_and_models": platforms, "flags": flags}


_BUILDERS = {
    "search_records": _search,
    "impact_of": _impact,
    "aggregate": _aggregate,
    "find_gaps": _gaps,
    "sign_in": _sign_in,
    "ai_landscape": _ai,
}


def checking_step(problem: str | None, index: int = 1) -> dict:
    """index keeps ids unique when a correction round adds a second check (check-1, check-2)."""
    sid = f"check-{index}"
    if problem:
        return step(sid, "Checked the answer against the lookups: needed a correction", status="error")
    return step(sid, "Checked every name and number against the lookups")


def same_step(a: dict | None, b: dict) -> bool:
    """Two lookups that read the same to a person (same line, same counts) are shown once."""
    return bool(a) and a.get("label") == b.get("label") and a.get("counts") == b.get("counts")
