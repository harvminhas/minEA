"""filter_records: one filter over every field the Add flow collects. Mirrored in the browser by
apps/web/lib/ask/record-filter.ts (same field names, same matching), so a chip edited on an answer
re-runs locally and gives the same rows. Nothing here names a vendor: vendors, tenants, providers and
regions all come from the workspace data (and the fixed provider list in data/cloud_regions.json)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.ai.ask.graph import Rec, WorkspaceGraph, fold
from app.services.cloud_regions import CATALOG, STANDARD, tenant_provider

PROVIDERS = {p["id"]: p for p in CATALOG["providers"]}
TENANT_LINKS = {"runs_on", "built_on"}
# hosting_model values the Add cards save, with the words people use for them.
HOSTING = {
    "saas": ("saas", "cloud app", "software as a service"),
    "own_cloud": ("own_cloud", "our cloud", "own cloud", "private cloud", "public_cloud"),
    "on_premise": ("on_premise", "on prem", "on-prem", "on premises", "on-premises", "our server", "own server", "self_hosted"),
    "desktop": ("desktop", "on people's computers", "people's computers", "laptops"),
}
FILTER_KEYS = (
    "type", "vendor", "owner_team", "owner_person", "owner", "hosting", "provider", "tenant", "region",
    "server", "ai_on", "renewal_within_days", "cost_min", "cost_max", "lifecycle", "criticality", "name",
)


@dataclass
class Facts:
    rec: Rec
    vendors: list[str] = field(default_factory=list)
    hosting: str = ""
    tenants: list[str] = field(default_factory=list)
    providers: list[str] = field(default_factory=list)  # provider ids
    regions: list[str] = field(default_factory=list)  # region keys
    servers: list[str] = field(default_factory=list)
    ai_on: bool = False


def region_label(key: str) -> str:
    row = STANDARD.get(key)
    return str(row["name"]) if row else key


def provider_label(pid: str) -> str:
    return str(PROVIDERS.get(pid, {}).get("label") or pid)


def hosting_key(value: str) -> str:
    v = (value or "").strip().lower().replace("-", " ")
    for key, words in HOSTING.items():
        if v == key or v in {w.replace("-", " ") for w in words}:
            return key
    return v


def build_facts(graph: WorkspaceGraph) -> list[Facts]:
    raw = {obj["id"]: obj for obj in graph.objects}
    out: list[Facts] = []
    for rec in graph.records.values():
        if rec.type not in {"application", "infrastructure"}:
            continue
        obj = raw.get(rec.id) or {}
        props = obj.get("properties") or {}
        facts = Facts(rec=rec, vendors=list(rec.vendor_names), hosting=hosting_key(str(props.get("hosting_model") or "")))
        if obj.get("type") == "cloud_service":
            pid = tenant_provider(props, rec.name)
            facts.providers.append(pid)
            facts.tenants.append(rec.name)
            if pid != "other":
                facts.vendors += [provider_label(pid), str(PROVIDERS.get(pid, {}).get("vendor") or "")]
        for edge in graph.edges:
            if edge.from_id != rec.id or edge.relation not in TENANT_LINKS:
                continue
            target = raw.get(edge.to_id)
            if not target:
                continue
            if target["type"] == "cloud_service":
                facts.tenants.append(target["name"])
                facts.providers.append(tenant_provider(target.get("properties"), target["name"]))
                key = str((edge.attributes or {}).get("region_key") or "")
                if key:
                    facts.regions.append(key)
            elif target["type"] == "model" and edge.relation == "runs_on":
                facts.servers.append(target["name"])
        features = props.get("ai_features")
        facts.ai_on = isinstance(features, list) and any(isinstance(f, dict) and f.get("status") == "on" for f in features)
        facts.vendors = [v for v in facts.vendors if v]
        out.append(facts)
    return out


def _loose(wanted: str, values: list[str]) -> bool:
    w = fold(wanted)
    if not w:
        return True
    for value in values:
        v = fold(value)
        if v and (v == w or (len(w) >= 3 and w in v) or (len(v) >= 3 and v in w)):
            return True
    return False


def clean_filters(raw: dict | None) -> dict:
    out: dict = {}
    for key in FILTER_KEYS:
        value = (raw or {}).get(key)
        if value is None or value == "":
            continue
        if key == "ai_on":
            out[key] = value if isinstance(value, bool) else str(value).lower() in {"true", "yes", "1", "on"}
        elif key in {"renewal_within_days", "cost_min", "cost_max"}:
            try:
                out[key] = int(float(value))
            except (TypeError, ValueError):
                continue
        elif key == "hosting":
            out[key] = hosting_key(str(value))
        else:
            out[key] = str(value).strip()
    return out


def matches(f: Facts, filters: dict, today: date | None = None) -> bool:
    rec = f.rec
    if "type" in filters:
        t = filters["type"].lower()
        if t in {"application", "applications", "app", "apps"} and rec.type != "application":
            return False
        if t in {"infrastructure", "platform", "platforms", "server", "servers"} and rec.type != "infrastructure":
            return False
    if "vendor" in filters and not _loose(filters["vendor"], f.vendors):
        return False
    if "owner" in filters and filters["owner"].lower() in {"none", "no", "missing"} and (rec.owner_team or rec.owner_person):
        return False
    if "owner_team" in filters and not _loose(filters["owner_team"], [rec.owner_team or ""]):
        return False
    if "owner_person" in filters and not _loose(filters["owner_person"], [rec.owner_person or ""]):
        return False
    if "hosting" in filters and f.hosting != filters["hosting"]:
        return False
    if "provider" in filters and not _loose(filters["provider"], [*f.providers, *(provider_label(p) for p in f.providers)]):
        return False
    if "tenant" in filters and not _loose(filters["tenant"], f.tenants):
        return False
    if "region" in filters and not _loose(filters["region"], [*f.regions, *(region_label(k) for k in f.regions)]):
        return False
    if "server" in filters and not _loose(filters["server"], f.servers):
        return False
    if "ai_on" in filters and f.ai_on != bool(filters["ai_on"]):
        return False
    if "renewal_within_days" in filters:
        start = today or date.today()
        try:
            renews = date.fromisoformat((rec.renewal or "")[:10])
        except ValueError:
            return False
        if not (start <= renews <= start + timedelta(days=filters["renewal_within_days"])):
            return False
    if "cost_min" in filters and (rec.annual is None or rec.annual < filters["cost_min"]):
        return False
    if "cost_max" in filters and (rec.annual is None or rec.annual > filters["cost_max"]):
        return False
    if "lifecycle" in filters and fold(rec.lifecycle or "") != fold(filters["lifecycle"]):
        return False
    if "criticality" in filters and fold(rec.criticality or "") != fold(filters["criticality"]):
        return False
    if "name" in filters and fold(filters["name"]) not in fold(rec.name):
        return False
    return True


def row(f: Facts) -> dict:
    return {
        **f.rec.summary(),
        "vendors": f.vendors,
        "hosting": f.hosting or None,
        "tenants": sorted(set(f.tenants)),
        "providers": sorted({provider_label(p) for p in f.providers}),
        "regions": sorted({region_label(k) for k in f.regions}),
        "servers": sorted(set(f.servers)),
        "ai_on": f.ai_on,
    }


def filter_facts(graph: WorkspaceGraph, filters: dict) -> list[Facts]:
    kept = [f for f in build_facts(graph) if matches(f, filters)]
    kept.sort(key=lambda f: (-(f.rec.annual or 0), f.rec.name.lower()))
    return kept
