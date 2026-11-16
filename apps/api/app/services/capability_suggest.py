"""AI-suggested 3-level capability maps and app-to-capability links. Nothing is saved here."""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from uuid import UUID

from fastapi import HTTPException, status
from google.genai import types
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini_client import format_api_error, get_client, is_configured, model_name, not_configured_message
from app.ai.json_parse import parse_json_object
from app.models.objects import ChangeLog, MinEAObject
from app.models.relationships import Relationship
from app.services.capability_map import is_l3, load_capability_map
from app.services.safe_fetch import fetch_public_page
from app.services.snapshot_hooks import notify_workspace_data_changed

log = logging.getLogger(__name__)

FULL_SYSTEM = """You suggest a 3-level business capability map for a company.
Return JSON only, no markdown or commentary:
{"domains":[{"name":"...","capabilities":[{"name":"...","activities":["..."]}]}]}
Rules:
- Level 1 is a business domain (e.g. Financial Management).
- Level 2 is a capability (e.g. Accounts Payable).
- Level 3 is an activity (e.g. Invoice capture).
- Aim for about 8 domains, 20-25 capabilities, and about 50 activities in total.
- Use clear, commonly used business names. Do not invent software product names as capabilities.
- Every capability has at least one activity. Keep names short (2-5 words).
"""

ACTIVITIES_SYSTEM = """The company already has a 2-level capability map (domains and capabilities).
Suggest only Level 3 activities under each existing capability. Do not add, drop or rename domains or capabilities.
Return JSON only:
{"domains":[{"name":"<existing domain>","capabilities":[{"name":"<existing capability>","activities":["..."]}]}]}
Use only the domain and capability names you were given. 2-4 activities per capability, short names (2-5 words).
"""

LINKS_SYSTEM = """You map applications to the most specific activity (Level 3) on a capability map.
If no activity fits, pick the capability (Level 2) or domain (Level 1). Skip an app if nothing is a reasonable fit.
Return JSON only:
{"links":[{"app":"<exact app name>","capability":"<exact activity or capability name>","confidence":"high"|"medium"}]}
Use only names from the lists. Prefer Level 3. An app may appear more than once only when it clearly supports two activities.
"""


def _norm(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip()).lower()


def _as_tree(raw: object) -> list[dict]:
    if not isinstance(raw, dict):
        return []
    domains = raw.get("domains")
    if not isinstance(domains, list):
        return []
    out = []
    for domain in domains:
        if not isinstance(domain, dict):
            continue
        name = str(domain.get("name") or "").strip()
        if not name:
            continue
        caps = []
        for cap in domain.get("capabilities") or []:
            if not isinstance(cap, dict):
                continue
            cname = str(cap.get("name") or "").strip()
            if not cname:
                continue
            acts = []
            for act in cap.get("activities") or []:
                if isinstance(act, str) and act.strip():
                    acts.append(act.strip())
                elif isinstance(act, dict) and str(act.get("name") or "").strip():
                    acts.append(str(act["name"]).strip())
            caps.append({"name": cname, "id": cap.get("id"), "activities": acts})
        out.append({"name": name, "id": domain.get("id"), "capabilities": caps})
    return out


async def _generate(system: str, user: str) -> tuple[dict | None, str | None]:
    if not is_configured():
        return None, not_configured_message()
    try:
        response = await get_client().aio.models.generate_content(
            model=model_name(),
            contents=[types.Content(role="user", parts=[types.Part.from_text(text=user)])],
            config=types.GenerateContentConfig(
                system_instruction=system,
                temperature=0,
                max_output_tokens=4096,
                response_mime_type="application/json",
            ),
        )
        text = response.text or ""
    except Exception as exc:
        log.exception("capability suggest model call failed")
        return None, format_api_error(exc)
    parsed = parse_json_object(text)
    if not parsed:
        return None, "The AI's reply wasn't usable. Try again, or add capabilities yourself."
    return parsed, None


def existing_tree(domains: list[MinEAObject], capabilities: list[MinEAObject]) -> list[dict]:
    known = {str(d.id): d for d in domains}
    l2: dict[str, list[MinEAObject]] = defaultdict(list)
    l3: dict[str, list[MinEAObject]] = defaultdict(list)
    for cap in capabilities:
        props = cap.properties or {}
        if is_l3(props):
            l3[str(props.get("parent_id") or "")].append(cap)
        else:
            did = str(props.get("domain_id") or "")
            l2[did if did in known else ""].append(cap)
    tree = []
    for domain in domains:
        caps = []
        for cap in l2.get(str(domain.id), []):
            caps.append({
                "name": cap.name,
                "id": str(cap.id),
                "activities": [a.name for a in l3.get(str(cap.id), [])],
            })
        tree.append({"name": domain.name, "id": str(domain.id), "capabilities": caps})
    orphans = l2.get("", [])
    if orphans:
        tree.append({
            "name": "No domain",
            "id": None,
            "capabilities": [
                {"name": c.name, "id": str(c.id), "activities": [a.name for a in l3.get(str(c.id), [])]}
                for c in orphans
            ],
        })
    return tree


def _map_exists(tree: list[dict]) -> bool:
    return any(d.get("capabilities") for d in tree)


def _merge_activities(existing: list[dict], suggested: list[dict]) -> list[dict]:
    """Keep existing L1/L2 names and ids; attach only new activity names under matching caps."""
    sug_by_dom = {_norm(d["name"]): d for d in suggested}
    out = []
    for domain in existing:
        match = sug_by_dom.get(_norm(domain["name"]), {})
        sug_caps = {_norm(c["name"]): c for c in match.get("capabilities") or []}
        caps = []
        for cap in domain["capabilities"]:
            already = {_norm(a) for a in cap.get("activities") or []}
            extra = [
                a for a in (sug_caps.get(_norm(cap["name"]), {}).get("activities") or [])
                if _norm(a) not in already
            ]
            caps.append({**cap, "activities": list(cap.get("activities") or []) + extra})
        out.append({**domain, "capabilities": caps})
    return out


def _brief(about: str, industry: str | None, size: str | None, services: str | None, website_text: str | None) -> str:
    lines = []
    if about.strip():
        lines.append(f"What the company does: {about.strip()}")
    if industry:
        lines.append(f"Industry: {industry.strip()}")
    if size:
        lines.append(f"Size: {size.strip()}")
    if services:
        lines.append(f"Key products or services: {services.strip()}")
    if website_text:
        lines.append("Public website (excerpt):\n" + website_text)
    return "\n".join(lines) or "No extra description was given."


async def suggest_map(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    *,
    about: str = "",
    industry: str | None = None,
    size: str | None = None,
    services: str | None = None,
    website: str | None = None,
) -> dict:
    domains, capabilities = await load_capability_map(db, workspace_id, org_id)
    tree = existing_tree(domains, capabilities)
    website_text = await fetch_public_page(website) if website else None
    website_used = bool(website_text)
    brief = _brief(about, industry, size, services, website_text)

    if _map_exists(tree):
        listing = []
        for domain in tree:
            listing.append(f"Domain: {domain['name']}")
            for cap in domain["capabilities"]:
                have = f" (already has: {', '.join(cap['activities'])})" if cap.get("activities") else ""
                listing.append(f"  - {cap['name']}{have}")
        parsed, warning = await _generate(ACTIVITIES_SYSTEM, brief + "\n\nExisting map:\n" + "\n".join(listing))
        suggested = _as_tree(parsed) if parsed else []
        return {
            "mode": "activities",
            "domains": _merge_activities(tree, suggested),
            "warning": warning,
            "website_used": website_used,
        }

    parsed, warning = await _generate(FULL_SYSTEM, brief)
    return {
        "mode": "full",
        "domains": _as_tree(parsed) if parsed else [],
        "warning": warning,
        "website_used": website_used,
    }


async def accept_map(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
    user_id: UUID | None,
    domains_in: list[dict],
) -> dict:
    """Write the accepted tree. Existing ids are left alone; new names are created. Idempotent on name."""
    domains, capabilities = await load_capability_map(db, workspace_id, org_id)
    domain_by_name = {_norm(d.name): d for d in domains}
    cap_by_key: dict[tuple[str, str], MinEAObject] = {}
    for cap in capabilities:
        if is_l3(cap.properties):
            continue
        did = str((cap.properties or {}).get("domain_id") or "")
        cap_by_key[(_norm(cap.name), did)] = cap

    created_domains = 0
    created_caps = 0
    created_acts = 0

    for d_index, raw in enumerate(domains_in):
        dname = str(raw.get("name") or "").strip()
        if not dname:
            continue
        domain = domain_by_name.get(_norm(dname))
        if not domain:
            domain = MinEAObject(
                workspace_id=workspace_id,
                org_id=org_id,
                type="business_domain",
                name=dname,
                properties={"order_index": d_index},
                source="user",
                created_by=user_id,
            )
            db.add(domain)
            await db.flush()
            domain_by_name[_norm(dname)] = domain
            created_domains += 1
        did = str(domain.id)

        for c_index, craw in enumerate(raw.get("capabilities") or []):
            cname = str(craw.get("name") or "").strip()
            if not cname:
                continue
            cap = cap_by_key.get((_norm(cname), did))
            if not cap:
                cap = MinEAObject(
                    workspace_id=workspace_id,
                    org_id=org_id,
                    type="capability",
                    name=cname,
                    properties={"domain_id": did, "order_index": c_index},
                    source="user",
                    created_by=user_id,
                )
                db.add(cap)
                await db.flush()
                cap_by_key[(_norm(cname), did)] = cap
                created_caps += 1
            existing_acts = {
                _norm(a.name): a
                for a in capabilities
                if is_l3(a.properties) and str((a.properties or {}).get("parent_id") or "") == str(cap.id)
            }
            # Also include acts just created in this loop
            for a_index, aname in enumerate(craw.get("activities") or []):
                name = str(aname).strip()
                if not name or _norm(name) in existing_acts:
                    continue
                act = MinEAObject(
                    workspace_id=workspace_id,
                    org_id=org_id,
                    type="capability",
                    name=name,
                    properties={"domain_id": did, "parent_id": str(cap.id), "order_index": a_index},
                    source="user",
                    created_by=user_id,
                )
                db.add(act)
                existing_acts[_norm(name)] = act
                created_acts += 1

    if created_domains or created_caps or created_acts:
        db.add(
            ChangeLog(
                workspace_id=workspace_id,
                org_id=org_id,
                object_type="capability",
                action="created",
                diff={
                    "action_type": "accepted_capability_map",
                    "domains": created_domains,
                    "capabilities": created_caps,
                    "activities": created_acts,
                },
                performed_by=user_id,
            )
        )
        await notify_workspace_data_changed(db, workspace_id, org_id)

    await db.flush()
    return {
        "domain_count": created_domains,
        "capability_count": created_caps,
        "activity_count": created_acts,
    }


def _leaf_index(tree: list[dict]) -> list[tuple[str, str, str]]:
    """(capability_or_activity name, path, preferred id if any)."""
    rows = []
    for domain in tree:
        for cap in domain["capabilities"]:
            path_l2 = f"{domain['name']} · {cap['name']}"
            if cap.get("activities"):
                for act in cap["activities"]:
                    rows.append((act, f"{path_l2} · {act}", cap.get("id") or ""))
            rows.append((cap["name"], path_l2, cap.get("id") or ""))
        rows.append((domain["name"], domain["name"], domain.get("id") or ""))
    return rows


def _deterministic_links(apps: list[MinEAObject], tree: list[dict], id_by_name: dict[str, str]) -> list[dict]:
    leaves = _leaf_index(tree)
    # Prefer L3 (longer path) by searching activities first — leaves lists activities before their parent.
    out = []
    used = set()
    for app in apps:
        name = app.name
        category = str((app.properties or {}).get("category") or "")
        hay = f"{name} {category}".lower()
        picked = None
        for label, path, _cid in leaves:
            token = _norm(label)
            if len(token) < 4:
                continue
            if token in hay or any(w in hay for w in token.split() if len(w) > 4):
                # skip domain-level if we can
                if " · " not in path and picked:
                    continue
                picked = (label, path)
                if path.count("·") >= 2:
                    break
        if not picked:
            continue
        cid = id_by_name.get(_norm(picked[0]))
        if not cid:
            continue
        used.add(str(app.id))
        out.append({
            "app_id": str(app.id),
            "app_name": app.name,
            "capability_id": cid,
            "capability_name": picked[0],
            "path": picked[1],
            "confidence": "medium",
        })
    return out



def _path_for(cap: MinEAObject, tree: list[dict]) -> str:
    """Domain · Capability, or Domain · Capability · Activity when the row is L3."""
    cid = str(cap.id)
    name = cap.name
    parent = str((cap.properties or {}).get("parent_id") or "")
    for domain in tree:
        for item in domain.get("capabilities") or []:
            if item.get("id") == cid:
                return f"{domain['name']} · {item['name']}"
            if item.get("id") == parent or (
                is_l3(cap.properties) and _norm(name) in {_norm(a) for a in (item.get("activities") or [])}
                and (not parent or item.get("id") == parent)
            ):
                return f"{domain['name']} · {item['name']} · {name}"
    return name


async def suggest_links(
    db: AsyncSession,
    workspace_id: UUID,
    org_id: UUID,
) -> dict:
    domains, capabilities = await load_capability_map(db, workspace_id, org_id)
    tree = existing_tree(domains, capabilities)
    apps = list(
        (
            await db.execute(
                select(MinEAObject).where(
                    MinEAObject.workspace_id == workspace_id,
                    MinEAObject.org_id == org_id,
                    MinEAObject.type.in_(("application", "cloud_service")),
                    MinEAObject.status.is_distinct_from("retired"),
                )
            )
        ).scalars().all()
    )
    linked = set()
    cap_ids = {str(c.id) for c in capabilities}
    rels = (
        await db.execute(
            select(Relationship).where(
                Relationship.workspace_id == workspace_id,
                Relationship.org_id == org_id,
                Relationship.type == "supported_by",
                Relationship.from_object_id.in_([c.id for c in capabilities]) if capabilities else False,
            )
        )
    ).scalars().all() if capabilities else []
    for rel in rels:
        if str(rel.from_object_id) in cap_ids:
            linked.add(str(rel.to_object_id))

    unlinked = [a for a in apps if str(a.id) not in linked]
    id_by_name = {_norm(c.name): str(c.id) for c in capabilities}
    id_by_name.update({_norm(d.name): str(d.id) for d in domains})

    warning = None
    suggestions: list[dict] = []
    if unlinked and _map_exists(tree):
        listing = []
        for domain in tree:
            listing.append(f"Domain: {domain['name']}")
            for cap in domain["capabilities"]:
                acts = ", ".join(cap.get("activities") or []) or "(no activities)"
                listing.append(f"  - {cap['name']}: {acts}")
        app_lines = "\n".join(f"- {a.name}" for a in unlinked)
        parsed, warning = await _generate(LINKS_SYSTEM, f"Apps:\n{app_lines}\n\nMap:\n" + "\n".join(listing))
        if parsed and isinstance(parsed.get("links"), list):
            app_by_name = {_norm(a.name): a for a in unlinked}
            for item in parsed["links"]:
                if not isinstance(item, dict):
                    continue
                app = app_by_name.get(_norm(str(item.get("app") or "")))
                cid = id_by_name.get(_norm(str(item.get("capability") or "")))
                cap = next((c for c in capabilities if str(c.id) == cid), None) if cid else None
                if not app or not cap:
                    continue
                path = _path_for(cap, tree)
                conf = str(item.get("confidence") or "medium").lower()
                if conf not in {"high", "medium"}:
                    conf = "medium"
                suggestions.append({
                    "app_id": str(app.id),
                    "app_name": app.name,
                    "capability_id": str(cap.id),
                    "capability_name": cap.name,
                    "path": path,
                    "confidence": conf,
                })
        if not suggestions:
            suggestions = _deterministic_links(unlinked, tree, id_by_name)
            if warning is None and not is_configured():
                warning = not_configured_message()

    suggested_apps = {s["app_id"] for s in suggestions}
    unmapped = [
        {"id": str(a.id), "name": a.name}
        for a in unlinked
        if str(a.id) not in suggested_apps
    ]
    return {"suggestions": suggestions, "unmapped": unmapped, "warning": warning}
