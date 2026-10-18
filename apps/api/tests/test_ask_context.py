"""The whole workspace as Ask context: one vendor identity, labels only, item ids back from the AI."""
import asyncio
import json
import re
import uuid
from pathlib import Path
from types import SimpleNamespace

from app.ai.ask import loop
from app.ai.ask.context import build_context
from app.ai.ask.graph import WorkspaceGraph, _raw, _record, catalog_vendor_for, vendor_index
from app.ai.ask.labels import resolve_vendor
from app.ai.ask.tools import ToolBag, run_tool
from tests.test_ask_engine import FakeModels, _call_response, _text_response

TOOLS = json.loads((Path(__file__).resolve().parents[1] / "app" / "data" / "tools.json").read_text())
INDEX = vendor_index(TOOLS)


class Obj(SimpleNamespace):
    def __getattr__(self, key):
        return None


def obj(kind, name, props=None, **extra):
    return Obj(id=uuid.uuid5(uuid.NAMESPACE_DNS, name), type=kind, name=name, properties=props or {}, status="active", **extra)


def graph(*objs, teams=None):
    teams = teams or {}
    recs = {}
    for o in objs:
        rec = _record(o, teams)
        if rec and not rec.vendor_names:
            rec.catalog_vendor = catalog_vendor_for(INDEX, rec.name, str(o.properties.get("catalog_tool") or ""))
        recs[rec.id] = rec
    return WorkspaceGraph(records=recs, edges=[], objects=[_raw(o, teams) for o in objs])


MULE = obj("tool", "MuleSoft Anypoint", {"integration_infra_kind": "ipaas", "vendor": "salesforce_mulesoft", "hosting_model": "saas"})
M365 = obj("application", "Microsoft 365", {"vendor": "Microsoft", "hosting_model": "saas", "licence_count": 120})
POWER = obj("tool", "Power Platform", {"vendor": "microsoft", "platform_kind": "saas_suite"})
GKE = obj("tool", "Apigee", {"vendor": "google", "integration_infra_kind": "gateway"})
OTHER = obj("tool", "Homegrown bus", {"vendor": "other", "integration_infra_kind": "broker", "hosting_model": "self_hosted"})
PS = obj("application", "Adobe Photoshop", {"hosting_model": "desktop"})
PAY = obj("application", "Payroll", {"compute_runtime_kind": "on_prem"}, owner="Finance", point_of_contact_name="Christine Wong")
SF = obj("application", "Salesforce CRM app", {"vendor": "Salesforce"}, owner="CRM")
G = graph(MULE, M365, POWER, GKE, OTHER, PS, PAY, SF)


def ids(args):
    return sorted(i["name"] for i in run_tool(ToolBag(graph=G, seen_ids=set(), numbers=set()), "filter_records", args)["items"])


def test_resolver_codes_aliases_and_products():
    assert resolve_vendor("salesforce_mulesoft") == ("Salesforce", "MuleSoft")
    assert resolve_vendor("microsoft") == ("Microsoft", None)
    assert resolve_vendor("google") == ("Google", None)
    assert resolve_vendor("other") == (None, None)
    assert resolve_vendor("sfdc") == ("Salesforce", None)


def test_context_has_every_kind_with_labels_and_no_raw_codes():
    text = build_context(G)
    assert f"{MULE.id} | MuleSoft Anypoint | Tool | vendor Salesforce | product MuleSoft" in text
    assert "Power Platform | Tool | vendor Microsoft" in text and "Apigee | Tool | vendor Google" in text
    assert "Homegrown bus | Tool | no owner" in text  # "other" is not a vendor
    assert "Adobe Photoshop | Application | vendor Adobe (from the tool catalogue)" in text
    assert "owner Finance · Christine Wong" in text and "120 licences" in text
    body = re.sub(r"\b[0-9a-f]{8}-[0-9a-f-]{27}\b", "", text)
    assert not re.findall(r"\b[a-z0-9]+_[a-z0-9_]+\b", body), re.findall(r"\b[a-z0-9]+_[a-z0-9_]+\b", body)
    for code in ("ipaas", "saas_suite", "self_hosted", "on_prem", "desktop", "salesforce_mulesoft"):
        assert code not in body.lower().split(" | "), code
    assert "On people's computers" in text and "iPaaS" in text and "Homegrown bus | Tool | no owner | runs Our server | Active | Broker" in text


def test_filter_records_covers_all_kinds_with_exact_vendor_identity():
    assert ids({"vendor": "Salesforce"}) == ["MuleSoft Anypoint", "Salesforce CRM app"]
    assert ids({"vendor": "salesforce_mulesoft"}) == ["MuleSoft Anypoint", "Salesforce CRM app"]
    assert ids({"vendor": "Microsoft"}) == ["Microsoft 365", "Power Platform"]
    assert ids({"vendor": "Google"}) == ["Apigee"]
    assert ids({"vendor": "Adobe"}) == ["Adobe Photoshop"]
    assert ids({"vendor": "Sales"}) == []  # exact, not substring
    assert ids({"owner_team": "CRM", "ops": {"owner_team": "is_not"}}) == ["Adobe Photoshop", "Apigee", "Homegrown bus", "Microsoft 365", "MuleSoft Anypoint", "Payroll", "Power Platform"]
    assert ids({"owner_person": "Christine"}) == ["Payroll"]
    assert ids({"type": "tool"}) == ["Apigee", "Homegrown bus", "MuleSoft Anypoint", "Power Platform"]


def _ask(monkeypatch, question, answer, calls=()):
    models = FakeModels([*calls, _text_response(answer)])
    seen = []
    original = models.generate_content

    async def spy(**kwargs):
        seen.append(kwargs["contents"][0].parts[0].text)
        return await original(**kwargs)

    models.generate_content = spy
    monkeypatch.setattr(loop, "is_configured", lambda: True)
    monkeypatch.setattr(loop, "model_name", lambda: "gemini-2.5-flash")
    monkeypatch.setattr(loop, "get_client", lambda: SimpleNamespace(aio=SimpleNamespace(models=models)))
    ctx = SimpleNamespace(workspace=SimpleNamespace(id=uuid.uuid4()), org_id=uuid.uuid4())

    async def collect():
        return [e async for e in loop.run_ask(None, ctx, question, graph=G)]

    return asyncio.run(collect())[-1]["data"], seen


def test_salesforce_mulesoft_answer_from_context(monkeypatch):
    answer = {"headline": "Yes — MuleSoft (Salesforce)", "answer_markdown": "Yes — you use MuleSoft Anypoint and a Salesforce CRM app.", "yes_no": "yes", "item_ids": [str(MULE.id), str(SF.id), "made-up"]}
    final, seen = _ask(monkeypatch, "What salesforce products do we own?", answer)
    assert final["source"] == "llm" and final["headline"] == "Yes — MuleSoft (Salesforce)" and final["yes_no"] == "yes"
    assert final["item_ids"] == [str(MULE.id), str(SF.id)]
    mule = final["items"][0]
    assert (mule["name"], mule["type_label"], mule["vendor"], mule["product"], mule["hosting"]) == ("MuleSoft Anypoint", "Tool", "Salesforce", "MuleSoft", "SaaS")
    assert "salesforce_mulesoft" not in seen[0] and "Workspace names matching" not in seen[0]
    assert "salesforce_mulesoft" not in json.dumps(final)


def test_counts_from_returned_ids_are_grounded(monkeypatch):
    answer = {"headline": "2 Microsoft items", "answer_markdown": "You have 2 Microsoft items.", "item_ids": [str(M365.id), str(POWER.id)]}
    final, _ = _ask(monkeypatch, "What Microsoft products do we own?", answer)
    assert final["source"] == "llm" and len(final["items"]) == 2
    answer = {"headline": "47 Microsoft items", "answer_markdown": "You have 47 Microsoft items.", "item_ids": [str(M365.id)]}
    final, _ = _ask(monkeypatch, "What Microsoft products do we own?", {**answer})
    assert final.get("headline") != "47 Microsoft items"


def test_labels_file_matches_the_web_copy():
    api = Path(__file__).resolve().parents[1] / "app" / "data" / "ask_labels.json"
    web = Path(__file__).resolve().parents[2] / "web" / "lib" / "ask" / "ask-labels.json"
    if web.exists():
        assert json.loads(api.read_text()) == json.loads(web.read_text())


def test_relationship_lines_use_registry_sentences_and_reverse_wording():
    from app.ai.ask.graph import Edge

    crm = obj("application", "CRM")
    okta = obj("application", "Okta")
    azure = obj("cloud_service", "Azure")
    billing = obj("application", "Billing")
    topic = obj("integration", "Orders topic")
    g = graph(crm, okta, azure, billing, topic)
    g.edges = [
        Edge(str(crm.id), str(okta.id), "authenticates_via", ""),
        Edge(str(crm.id), str(azure.id), "runs_on", ""),
        Edge(str(billing.id), str(topic.id), "subscribes", ""),
    ]
    text = build_context(g)
    assert f"CRM ({crm.id}) signs in with Okta ({okta.id})" in text
    assert f"CRM ({crm.id}) runs on Azure ({azure.id})" in text
    assert f"Billing ({billing.id}) subscribes to Orders topic ({topic.id})" in text
    assert "runs on = hosts" in text
    assert "signs in with = sign-in for" in text
    assert "authenticates via" not in text
    assert not re.search(r"\b[a-z]+_[a-z_]+\b", text.split("RELATIONSHIPS", 1)[1])
