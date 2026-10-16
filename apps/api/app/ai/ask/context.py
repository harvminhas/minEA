"""The whole workspace as compact, readable context for every Ask (BuboMap targets SMBs).

One line per item, every kind, labels only (vendor resolved by labels.resolve_vendor, hosting and other
stored codes as words), then relationships, then teams and people. What is sent is exactly this text.
"""

from __future__ import annotations

import logging
from collections import Counter

from app.ai.ask.graph import WorkspaceGraph
from app.ai.ask.labels import hosting_label, humanize
from app.ai.ask.record_filters import build_facts, provider_label, region_label

log = logging.getLogger(__name__)
ACTIVE_FEATURE = {"on", "piloting"}
# Kinds listed first: what people ask about most.
ORDER = {"application": 0, "infrastructure": 1}


def _money(value: float | None) -> str:
    return f"${int(round(value)):,}/yr" if value is not None else ""


def _relation(value: str) -> str:
    return humanize(value).lower() if "_" in value else value.replace("_", " ")


def build_context(graph: WorkspaceGraph) -> str:
    raw = {str(obj.get("id")): obj for obj in graph.objects}
    facts = {f.rec.id: f for f in build_facts(graph)}
    recs = sorted(graph.records.values(), key=lambda r: (ORDER.get(r.type, 2), r.type_label(), r.name.lower()))
    lines = [
        f"WORKSPACE: {len(recs)} items. One line per item: id | name | kind | then only the fields that are recorded.",
    ]
    for rec in recs:
        f = facts.get(rec.id)
        props = (raw.get(rec.id) or {}).get("properties") or {}
        parts = [rec.id, rec.name, rec.type_label()]
        if rec.vendor_names:
            parts.append("vendor " + ", ".join(rec.vendor_names))
        elif rec.catalog_vendor:
            parts.append(f"vendor {rec.catalog_vendor} (from the tool catalogue)")
        if rec.product:
            parts.append(f"product {rec.product}")
        owner = " · ".join(p for p in (rec.owner_team, rec.owner_person) if p)
        parts.append(f"owner {owner}" if owner else "no owner")
        where = []
        if f and f.hosting:
            where.append(hosting_label(f.hosting))
        runtime = str(props.get("compute_runtime_kind") or props.get("runtime_kind") or "")
        if runtime:
            where.append(humanize(runtime))
        if f:
            where += [f"tenant {t}" for t in sorted(set(f.tenants)) if t != rec.name]
            where += [f"{provider_label(p)}" for p in sorted(set(f.providers)) if p != "other"]
            where += [f"region {region_label(k)}" for k in sorted(set(f.regions))]
            where += [f"server {s}" for s in sorted(set(f.servers))]
        if where:
            parts.append("runs " + ", ".join(dict.fromkeys(where)))
        if rec.annual is not None:
            parts.append(_money(rec.annual))
        elif rec.cost_note:
            parts.append(humanize(rec.cost_note))
        licences = props.get("licence_count") or props.get("license_count")
        if isinstance(licences, (int, float)) and licences:
            parts.append(f"{int(licences)} licences")
        if rec.renewal:
            parts.append(f"renews {rec.renewal[:10]}")
        if rec.lifecycle:
            parts.append(rec.lifecycle)
        if rec.criticality:
            parts.append(f"criticality {rec.criticality}")
        features = props.get("ai_features")
        if isinstance(features, list):
            on = [str(x.get("name")) for x in features if isinstance(x, dict) and x.get("status") in ACTIVE_FEATURE and x.get("name")]
            off = [x for x in features if isinstance(x, dict) and x.get("name") and x.get("status") not in ACTIVE_FEATURE]
            if on:
                parts.append("AI on: " + ", ".join(on))
            elif off:
                parts.append("AI features off")
        kind = props.get("integration_infra_kind") or props.get("platform_kind")
        if kind:
            label = humanize(str(kind))
            parts.append(label[:1].upper() + label[1:] if label == str(kind) else label)
        lines.append(" | ".join(str(p) for p in parts if p))
    names = {r.id: r.name for r in recs}
    rels = [f"{names[e.from_id]} ({e.from_id}) {_relation(e.relation)} {names[e.to_id]} ({e.to_id})" for e in graph.edges if e.from_id in names and e.to_id in names]
    if rels:
        lines.append("")
        lines.append(f"RELATIONSHIPS ({len(rels)}):")
        lines += rels
    teams = Counter(r.owner_team for r in recs if r.owner_team)
    people = Counter(r.owner_person for r in recs if r.owner_person)
    if teams:
        lines.append("")
        lines.append("TEAMS: " + "; ".join(f"{t} ({n} item{'s' if n != 1 else ''})" for t, n in sorted(teams.items())))
    if people:
        lines.append("PEOPLE: " + "; ".join(f"{p} ({n} item{'s' if n != 1 else ''})" for p, n in sorted(people.items())))
    text = "\n".join(lines)
    return text


def log_size(text: str, items: int) -> None:
    # No threshold for now (SMB workspaces); the size is logged so it can be watched.
    log.info("ask context items=%s chars=%s approx_tokens=%s", items, len(text), len(text) // 4)
