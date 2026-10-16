"""filter_records: one filter over every field the Add flow collects. Mirrored in the browser by
apps/web/lib/ask/record-filter.ts (same field names, same matching), so a chip edited on an answer
re-runs locally and gives the same rows. Nothing here names a vendor: vendors, tenants, providers and
regions all come from the workspace data (and the fixed provider list in data/cloud_regions.json)."""

from __future__ import annotations

import re

from dataclasses import dataclass, field
from datetime import date, timedelta

from app.ai.ask.graph import Rec, WorkspaceGraph, fold
from app.ai.ask.labels import hosting_label, vendor_key
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

# Text fields that take an operator: is (default), is_not, is_empty, is_not_empty, contains, any_of.
OP_KEYS = ("vendor", "owner_team", "owner_person", "hosting", "provider", "tenant", "region", "server", "lifecycle", "criticality", "name")
OPS = ("is", "is_not", "is_empty", "is_not_empty", "contains", "any_of")
_OP_WORDS = {
    "is": "is", "eq": "is", "equals": "is", "=": "is",
    "is_not": "is_not", "not": "is_not", "isnot": "is_not", "not_equals": "is_not", "ne": "is_not", "!=": "is_not", "exclude": "is_not",
    "is_empty": "is_empty", "empty": "is_empty",
    "is_not_empty": "is_not_empty", "not_empty": "is_not_empty",
    "contains": "contains", "has": "contains", "like": "contains",
    "any_of": "any_of", "in": "any_of", "one_of": "any_of",
}


def op_of(value: object) -> str:
    return _OP_WORDS.get(str(value or "").strip().lower().replace(" ", "_"), "is")


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
    # Every owner name on the item: team, named owner, contact, free-text owner, any *_owner property.
    owners: list[str] = field(default_factory=list)


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
        # Every kind of item (apps, infrastructure, tools, flows, APIs, agents, ...): what the AI sees in
        # its context is what the lookup can return.
        obj = raw.get(rec.id) or {}
        props = obj.get("properties") or {}
        facts = Facts(rec=rec, vendors=list(rec.vendor_names) or ([rec.catalog_vendor] if rec.catalog_vendor else []), hosting=hosting_key(str(props.get("hosting_model") or "")))
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
        facts.owners = owner_names(rec, obj)
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
    """Known keys only, typed, plus "ops" for any text key whose operator isn't plain "is".
    Values are used as given: the model picks the operator."""
    raw = raw or {}
    given = raw.get("ops") if isinstance(raw.get("ops"), dict) else {}
    out: dict = {}
    ops: dict = {}
    for key in FILTER_KEYS:
        value = raw.get(key)
        op = op_of(given.get(key)) if key in OP_KEYS and key in given else "is"
        if key in OP_KEYS and op in {"is_empty", "is_not_empty"}:
            out[key] = ""
            ops[key] = op
            continue
        if value is None or value == "" or value == []:
            continue
        if key == "ai_on":
            out[key] = value if isinstance(value, bool) else str(value).lower() in {"true", "yes", "1", "on"}
        elif key in {"renewal_within_days", "cost_min", "cost_max"}:
            try:
                out[key] = int(float(value))
            except (TypeError, ValueError):
                continue
        elif key in OP_KEYS:
            text = ", ".join(str(v).strip() for v in value if str(v).strip()) if isinstance(value, list) else str(value).strip()
            if isinstance(value, list) and len(value) > 1 and op == "is":
                op = "any_of"
            if key == "hosting" and text:
                text = hosting_key(text) if op != "any_of" else ", ".join(hosting_key(t) for t in text.split(","))
            out[key] = text
            if op != "is":
                ops[key] = op
        else:
            out[key] = str(value).strip()
    if ops:
        out["ops"] = ops
    return out


def _values(f: Facts, key: str) -> list[str]:
    rec = f.rec
    if key == "vendor":
        return f.vendors
    if key == "owner_team":
        return [rec.owner_team or ""]
    if key == "owner_person":
        return f.owners or [rec.owner_person or ""]
    if key == "hosting":
        return [f.hosting]
    if key == "provider":
        return [*f.providers, *(provider_label(p) for p in f.providers)]
    if key == "tenant":
        return f.tenants
    if key == "region":
        return [*f.regions, *(region_label(k) for k in f.regions)]
    if key == "server":
        return f.servers
    if key == "lifecycle":
        return [rec.lifecycle or ""]
    if key == "criticality":
        return [rec.criticality or ""]
    if key == "name":
        return [rec.name]
    return []


def _is(key: str, wanted: str, values: list[str]) -> bool:
    if key == "vendor":
        # One vendor identity: "sfdc", "SALESFORCE", "salesforce" all resolve to Salesforce; exact, not substring.
        want = vendor_key(wanted)
        return bool(want) and any(vendor_key(v) == want for v in values if v)
    if key == "hosting":
        return bool(values and values[0]) and values[0] == hosting_key(wanted)
    if key in {"lifecycle", "criticality"}:
        return any(fold(v) == fold(wanted) for v in values if v)
    if key == "name":
        return fold(wanted) in fold(values[0])
    return _loose(wanted, [v for v in values if v]) if fold(wanted) else True


def text_match(key: str, op: str, wanted: str, values: list[str]) -> bool:
    present = [v for v in values if fold(v)]
    if op == "is_empty":
        return not present
    if op == "is_not_empty":
        return bool(present)
    if op == "contains":
        w = fold(wanted)
        return any(w in fold(v) for v in present)
    if op == "any_of":
        return any(_is(key, part.strip(), values) for part in re.split(r"[,|]", wanted) if part.strip())
    hit = bool(present) and _is(key, wanted, values)
    return not hit if op == "is_not" else hit


def matches(f: Facts, filters: dict, today: date | None = None) -> bool:
    rec = f.rec
    if "type" in filters:
        t = filters["type"].lower()
        if t in {"application", "applications", "app", "apps"}:
            if rec.type != "application":
                return False
        elif t in {"infrastructure", "platform", "platforms", "server", "servers"}:
            if rec.type != "infrastructure":
                return False
        elif fold(t).rstrip("s") not in {fold(rec.raw_type).rstrip("s"), fold(rec.type).rstrip("s"), fold(rec.type_label()).rstrip("s"), fold(rec.kind or "").rstrip("s")}:
            return False
    if "owner" in filters and filters["owner"].lower() in {"none", "no", "missing"} and (rec.owner_team or rec.owner_person):
        return False
    ops = filters.get("ops") or {}
    for key in OP_KEYS:
        if key in filters and not text_match(key, ops.get(key, "is"), str(filters[key]), _values(f, key)):
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
    return True


def row(f: Facts) -> dict:
    return {
        **f.rec.summary(),
        "vendors": f.vendors,
        "hosting": hosting_label(f.hosting) if f.hosting else None,
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


def owner_names(rec: Rec, obj: dict) -> list[str]:
    props = obj.get("properties") or {}
    names = [rec.owner_team, rec.owner_person, obj.get("owner"), obj.get("point_of_contact_name")]
    names += [v for k, v in props.items() if isinstance(v, str) and re.search(r"(^|_)owner(_name)?$", k)]
    out: list[str] = []
    for name in names:
        name = (name or "").strip() if isinstance(name, str) else ""
        if name and fold(name) not in {fold(n) for n in out}:
            out.append(name)
    return out
