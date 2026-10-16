"""Workspace graph for Ask lookups. Tools read this. They do not query ad hoc."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.people import Team
from app.models.relationships import Relationship
from app.services.cost_lines import object_annual_dollars

APP_TYPES = {"application", "solution", "technical_capability"}
HOSTING_NOT_VENDOR = {
    "on_premise",
    "on_prem",
    "self_hosted",
    "public_cloud",
    "private_cloud",
    "hybrid",
    "saas",
    "paas",
    "cloud",
    "other",
}
LIFECYCLE = {
    "planned": "Planned",
    "pilot": "Pilot",
    "active": "Active",
    "retiring": "Retiring",
    "deprecated": "Retiring",
    "end_of_life": "End of life",
    "retired": "End of life",
}
CRITICALITY = {"low": "Low", "medium": "Medium", "high": "High", "tier1": "Critical", "critical": "Critical"}
TYPE_LABELS = {
    "application": "Application",
    "solution": "Solution",
    "technical_capability": "Capability",
    "capability": "Capability",
    "infrastructure": "Infrastructure",
    "flow": "Flow",
    "integration_flow": "Flow",
    "component": "Component",
    "api": "API",
    "event": "Event",
    "data_object": "Data Entity",
    "data_store": "Data Store",
    "data_domain": "Data Domain",
    "roadmap_item": "Roadmap Item",
    "tech_debt": "Tech Debt",
    "agent": "AI Agent",
    "ai_model": "AI Model",
    "value_stream": "Value Stream",
    "business_domain": "Domain",
    "message_broker": "Message Broker",
    "tool": "Tool",
    "cloud_service": "Cloud Service",
    "model": "Model",
}


@dataclass
class Rec:
    id: str
    raw_type: str
    type: str
    name: str
    kind: str
    owner_team: str | None
    owner_person: str | None
    vendor: str | None
    vendor_names: list[str]
    annual: float | None
    cost_note: str | None
    renewal: str | None
    lifecycle: str | None
    criticality: str | None
    blank: list[str] = field(default_factory=list)
    description: str = ""
    # No vendor recorded: the tool catalogue's vendor for this name (Adobe Photoshop -> Adobe). Used for
    # matching (filter_records, aggregate filters, search_records); the vendor field and gaps don't change.
    catalog_vendor: str | None = None
    # A product named by a vendor code ("salesforce_mulesoft" -> MuleSoft), kept apart from the vendor.
    product: str | None = None

    def type_label(self) -> str:
        if self.raw_type == "technical_capability":
            return "Capability"
        if self.raw_type == "solution":
            return "Solution"
        if self.raw_type == "application":
            return "Application"
        if self.type == "infrastructure" and self.kind:
            return self.kind
        return TYPE_LABELS.get(self.raw_type) or TYPE_LABELS.get(self.type) or self.type.replace("_", " ").title()

    def summary(self) -> dict:
        return {
            "id": self.id,
            "type": self.type,
            "raw_type": self.raw_type,
            "type_label": self.type_label(),
            "name": self.name,
            "kind": self.kind or None,
            "owner_team": self.owner_team,
            "owner_person": self.owner_person,
            "vendor": self.vendor,
            **({"catalog_vendor": self.catalog_vendor} if self.catalog_vendor else {}),
            **({"product": self.product} if self.product else {}),
            "annual_cost": self.annual,
            "cost_note": self.cost_note,
            "renewal_date": self.renewal,
            "lifecycle": self.lifecycle,
            "criticality": self.criticality,
            "blank_fields": self.blank,
        }


@dataclass
class Edge:
    from_id: str
    to_id: str
    relation: str
    label: str
    attributes: dict = field(default_factory=dict)


@dataclass
class WorkspaceGraph:
    records: dict[str, Rec]
    edges: list[Edge]
    # Raw objects (id, type, name, status, owners, properties) for lookups that need properties,
    # such as ai_landscape. Same shape as the web catalog objects.
    objects: list[dict] = field(default_factory=list)

    def get(self, record_id: str) -> Rec | None:
        return self.records.get(record_id)


def fold(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _kind(obj: MinEAObject, props: dict) -> str:
    name = obj.name or ""
    hosting = str(props.get("hosting_model") or "")
    runtime = str(props.get("compute_runtime_kind") or "")
    if obj.type in {"agent", "ai_model"}:
        return TYPE_LABELS[obj.type]
    if obj.type in APP_TYPES:
        if props.get("is_custom_built"):
            return "Built in-house"
        return "Application"
    if re.search(r"network|firewall", name, re.I):
        return "Network"
    if runtime == "on_prem" or hosting in {"on_premise", "self_hosted"}:
        return "On-prem server"
    if hosting == "saas":
        return "SaaS platform"
    return "Cloud"


def _vendor_names(props: dict) -> list[str]:
    """Object vendor, then any vendor named on a cost line, each resolved to one display name
    (form codes, aliases, catalogue casing; see labels.resolve_vendor). Hosting words are not vendors."""
    return _vendors_and_product(props)[0]


def _vendors_and_product(props: dict) -> tuple[list[str], str | None]:
    from app.ai.ask.labels import resolve_vendor

    found: list[str] = []
    seen: set[str] = set()
    product: str | None = None

    def add(raw: object) -> None:
        nonlocal product
        text = str(raw or "").strip()
        if not text or text in HOSTING_NOT_VENDOR:
            return
        vendor, prod = resolve_vendor(text)
        if prod and not product:
            product = prod
        if not vendor:
            return
        key = vendor.lower()
        if key in seen:
            return
        seen.add(key)
        found.append(vendor)

    add(props.get("vendor"))
    lines = props.get("cost_lines")
    if isinstance(lines, list):
        for line in lines:
            if isinstance(line, dict) and line.get("type") != "internal_estimate":
                add(line.get("vendor"))
    return found, product


def _record(obj: MinEAObject, team_names: dict[str, str]) -> Rec | None:
    props = obj.properties or {}
    if obj.type in APP_TYPES:
        record_type = "application"
    elif obj.type in {"model", "cloud_service"}:
        record_type = "infrastructure"
    elif obj.type == "integration_flow":
        record_type = "flow"
    elif obj.type == "component":
        record_type = "component"
    elif obj.type in {"api", "event", "capability", "data_object", "data_store", "data_domain", "roadmap_item", "tech_debt", "agent", "ai_model"}:
        record_type = obj.type
    else:
        record_type = "other"

    vendor_names, product = _vendors_and_product(props)
    vendor = vendor_names[0] if vendor_names else None
    annual = object_annual_dollars(props)
    cost_model = str(props.get("cost_model") or "")
    cost_note = None
    if annual is None and cost_model == "capex":
        cost_note = "capital_asset"
    elif annual is None and props.get("is_custom_built") is True:
        cost_note = "no_license_cost"
    renewal = str(props.get("commitment_ends") or props.get("contract_renewal") or "").strip() or None
    lifecycle_raw = str(props.get("lifecycle") or obj.status or "")
    lifecycle = LIFECYCLE.get(lifecycle_raw)
    criticality = CRITICALITY.get(str(props.get("criticality") or ""))
    team = team_names.get(str(obj.owner_team_id)) if obj.owner_team_id else None
    person = (obj.point_of_contact_name or "").strip() or None
    if not team and obj.owner:
        team = obj.owner.strip() or None

    blank: list[str] = []
    if record_type in {"application", "infrastructure"}:
        if not team and not person:
            blank.append("owner")
        if not vendor:
            blank.append("vendor")
        if annual is None and cost_note is None:
            blank.append("annual_cost")
        if not renewal:
            blank.append("renewal_date")
        if not lifecycle:
            blank.append("lifecycle")
        if not criticality:
            blank.append("criticality")

    description = (obj.description or "")[:280]
    description = description.replace("<tool_result", "").replace("</tool_result", "").replace("<system", "")

    return Rec(
        id=str(obj.id),
        raw_type=obj.type,
        type=record_type,
        name=obj.name,
        kind=_kind(obj, props),
        owner_team=team,
        owner_person=person,
        vendor=vendor,
        vendor_names=vendor_names,
        annual=annual,
        cost_note=cost_note,
        renewal=renewal,
        lifecycle=lifecycle,
        criticality=criticality,
        blank=blank,
        description=description,
        product=product,
    )


async def load_graph(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> WorkspaceGraph:
    # Catalogue first: when its table is missing, load_tools rolls the session back, which would
    # expire ORM rows loaded before it (then reading obj.properties fails with MissingGreenlet).
    vendor_by_name = await catalogue_vendors(db)
    objects = (
        await db.execute(
            select(MinEAObject).where(MinEAObject.workspace_id == workspace_id, MinEAObject.org_id == org_id)
        )
    ).scalars().all()
    teams = (
        await db.execute(select(Team).where(Team.workspace_id == workspace_id, Team.org_id == org_id))
    ).scalars().all()
    relationships = (
        await db.execute(
            select(Relationship).where(Relationship.workspace_id == workspace_id, Relationship.org_id == org_id)
        )
    ).scalars().all()

    team_names = {str(team.id): team.name for team in teams}
    records: dict[str, Rec] = {}
    edges: list[Edge] = []
    raw: list[dict] = []
    for obj in objects:
        rec = _record(obj, team_names)
        if rec:
            if not rec.vendor_names:
                rec.catalog_vendor = catalog_vendor_for(vendor_by_name, rec.name, str((obj.properties or {}).get("catalog_tool") or ""))
            records[rec.id] = rec
        raw.append(_raw(obj, team_names))
    for rel in relationships:
        edges.append(Edge(str(rel.from_object_id), str(rel.to_object_id), rel.type, "", dict(getattr(rel, "attributes", None) or {})))
    return WorkspaceGraph(records=records, edges=edges, objects=raw)


def _raw(obj: MinEAObject, team_names: dict[str, str]) -> dict:
    team_id = str(obj.owner_team_id) if obj.owner_team_id else None
    return {
        "id": str(obj.id),
        "type": obj.type,
        "name": obj.name,
        "status": obj.status,
        "owner": obj.owner,
        "owner_team_id": team_id,
        "owner_team_name": team_names.get(team_id) if team_id else None,
        "point_of_contact_id": str(obj.point_of_contact_id) if obj.point_of_contact_id else None,
        "point_of_contact_name": obj.point_of_contact_name,
        "properties": obj.properties or {},
    }


async def catalogue_vendors(db: AsyncSession) -> dict[str, str]:
    """Normalized tool name/alias -> vendor from the tool catalogue (DB, else bundled tools.json).
    A name two tools share with different vendors is left out (no guessing)."""
    from app.services.tool_catalog import load_tools

    try:
        tools, _, _ = await load_tools(db)
    except Exception:
        return {}
    return vendor_index(tools)


def vendor_index(tools: list[dict]) -> dict[str, str]:
    from app.services.tool_catalog import normalize

    out: dict[str, str] = {}
    clash: set[str] = set()
    for tool in tools:
        vendor = str(tool.get("vendor") or "").strip()
        if not vendor:
            continue
        for name in [tool.get("name") or "", *(tool.get("aliases") or [])]:
            key = normalize(str(name))
            if not key:
                continue
            if key in out and out[key] != vendor:
                clash.add(key)
            out.setdefault(key, vendor)
    for key in clash:
        out.pop(key, None)
    return out


def catalog_vendor_for(index: dict[str, str], name: str, catalog_key: str = "") -> str | None:
    from app.services.tool_catalog import normalize

    return index.get(normalize(catalog_key)) or index.get(normalize(name)) or None


# --- Per-workspace cache (Ask latency) ------------------------------------------------------------
# Ask reads the whole workspace on every question. One cheap fingerprint query (counts, last
# change, relationship attributes digest) decides whether the graph (and the context text built
# from it) can be reused in this process. Entries also expire after GRAPH_TTL_S as a safety net.
GRAPH_TTL_S = 300.0
_GRAPH_CACHE: dict[tuple[str, str], tuple[str, float, WorkspaceGraph]] = {}
_FINGERPRINT_SQL = text(
    """
    SELECT
      (SELECT count(*)::text || '/' || coalesce(max(updated_at)::text, '') FROM objects WHERE workspace_id = :ws AND org_id = :org)
      || '|' || (SELECT count(*)::text || '/' || coalesce(max(updated_at)::text, '') FROM teams WHERE workspace_id = :ws AND org_id = :org)
      || '|' || (SELECT count(*)::text || '/' || coalesce(md5(string_agg(id::text || type || coalesce(attributes::text, ''), ',' ORDER BY id)), '')
                 FROM relationships WHERE workspace_id = :ws AND org_id = :org)
    """
)


async def workspace_fingerprint(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> str | None:
    try:
        return str((await db.execute(_FINGERPRINT_SQL, {"ws": workspace_id, "org": org_id})).scalar() or "")
    except Exception:  # never let the cache break Ask: load normally
        try:
            await db.rollback()
        except Exception:
            pass
        return None


async def load_graph_cached(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID, *, clock=None, loader=None) -> tuple[WorkspaceGraph, bool]:
    """(graph, hit). A hit costs one small query instead of the catalogue + three table reads."""
    import time as _time

    now = (clock or _time.monotonic)()
    key = (str(org_id), str(workspace_id))
    fingerprint = await workspace_fingerprint(db, workspace_id, org_id)
    cached = _GRAPH_CACHE.get(key)
    if fingerprint and cached and cached[0] == fingerprint and now - cached[1] < GRAPH_TTL_S:
        return cached[2], True
    graph = await (loader or load_graph)(db, workspace_id, org_id)
    if fingerprint:
        _GRAPH_CACHE[key] = (fingerprint, now, graph)
        if len(_GRAPH_CACHE) > 64:  # bounded: drop the oldest
            _GRAPH_CACHE.pop(min(_GRAPH_CACHE, key=lambda k: _GRAPH_CACHE[k][1]), None)
    return graph, False
