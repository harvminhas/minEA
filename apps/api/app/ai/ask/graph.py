"""Workspace graph for Ask lookups. Tools read this. They do not query ad hoc."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.objects import MinEAObject
from app.models.people import Team
from app.models.relationships import Relationship

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
            "type_label": self.type_label(),
            "name": self.name,
            "kind": self.kind or None,
            "owner_team": self.owner_team,
            "owner_person": self.owner_person,
            "vendor": self.vendor,
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


@dataclass
class WorkspaceGraph:
    records: dict[str, Rec]
    edges: list[Edge]

    def get(self, record_id: str) -> Rec | None:
        return self.records.get(record_id)


def fold(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _money(value: object) -> float | None:
    if isinstance(value, (int, float)) and value > 0:
        return float(value)
    if isinstance(value, str):
        cleaned = re.sub(r"[$,\s]", "", value)
        if not cleaned or re.search(r"[a-zA-Z]", cleaned):
            return None
        try:
            number = float(cleaned)
        except ValueError:
            return None
        return number if number > 0 else None
    return None


def _kind(obj: MinEAObject, props: dict) -> str:
    name = obj.name or ""
    hosting = str(props.get("hosting_model") or "")
    runtime = str(props.get("compute_runtime_kind") or "")
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
    """Object vendor, then any vendor named on a cost line. Hosting words are not vendors."""
    found: list[str] = []
    seen: set[str] = set()

    def add(raw: object) -> None:
        text = str(raw or "").strip()
        if not text or text in HOSTING_NOT_VENDOR:
            return
        key = text.lower()
        if key in seen:
            return
        seen.add(key)
        found.append(text)

    add(props.get("vendor"))
    lines = props.get("cost_lines")
    if isinstance(lines, list):
        for line in lines:
            if isinstance(line, dict) and line.get("type") != "internal_estimate":
                add(line.get("vendor"))
    return found


def _record(obj: MinEAObject, team_names: dict[str, str]) -> Rec | None:
    props = obj.properties or {}
    if obj.type in APP_TYPES:
        record_type = "application"
    elif obj.type == "model" and props.get("compute_runtime_kind"):
        record_type = "infrastructure"
    elif obj.type == "cloud_service" and props.get("platform_type"):
        record_type = "infrastructure"
    elif obj.type == "integration_flow":
        record_type = "flow"
    elif obj.type == "component":
        record_type = "component"
    elif obj.type in {"api", "event", "capability", "data_object", "data_store", "data_domain", "roadmap_item", "tech_debt"}:
        record_type = obj.type
    else:
        record_type = "other"

    vendor_names = _vendor_names(props)
    vendor = vendor_names[0] if vendor_names else None
    annual = _money(props.get("annual_cost"))
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
    )


async def load_graph(db: AsyncSession, workspace_id: uuid.UUID, org_id: uuid.UUID) -> WorkspaceGraph:
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
    for obj in objects:
        rec = _record(obj, team_names)
        if rec:
            records[rec.id] = rec
    for rel in relationships:
        edges.append(Edge(str(rel.from_object_id), str(rel.to_object_id), rel.type, ""))
    return WorkspaceGraph(records=records, edges=edges)
