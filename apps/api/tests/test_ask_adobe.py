"""Ask: vendor inferred from the tool catalogue when the item has no vendor property."""
from app.ai.ask.graph import Rec, WorkspaceGraph, catalog_vendor_for, vendor_index
from app.ai.ask.tools import ToolBag, run_tool
from app.services.tool_catalog import bundled_tools


def _bag():
    index = vendor_index(bundled_tools())
    ps = Rec(id="ps", raw_type="application", type="application", name="Adobe Photoshop", kind="", owner_team=None,
             owner_person=None, vendor=None, vendor_names=[], annual=None, cost_note=None, renewal=None, lifecycle=None,
             criticality=None, catalog_vendor=catalog_vendor_for(index, "Adobe Photoshop"))
    props = {"hosting_model": "desktop", "is_custom_built": False, "governance_status": "sanctioned"}
    graph = WorkspaceGraph(records={"ps": ps}, edges=[], objects=[{"id": "ps", "type": "application", "name": ps.name, "properties": props}])
    return ToolBag(graph=graph, seen_ids=set(), numbers=set())


def test_catalogue_vendor_is_inferred_from_name_or_alias():
    index = vendor_index(bundled_tools())
    assert catalog_vendor_for(index, "Adobe Photoshop") == "Adobe"
    assert catalog_vendor_for(index, "photoshop") == "Adobe"
    assert catalog_vendor_for(index, "Something Homegrown") is None


def test_vendor_index_drops_names_with_conflicting_vendors():
    index = vendor_index([{"name": "Dup", "vendor": "A"}, {"name": "dup", "vendor": "B"}, {"name": "Ok", "vendor": "C"}])
    assert index == {"ok": "C"}


def test_filter_aggregate_and_search_use_catalogue_vendor():
    out = run_tool(_bag(), "filter_records", {"vendor": "Adobe"})
    assert [i["name"] for i in out["items"]] == ["Adobe Photoshop"]
    assert run_tool(_bag(), "aggregate", {"type": "estate", "metric": "count", "filters": {"vendor": "adobe"}})["count"] == 1
    assert [m["name"] for m in run_tool(_bag(), "search_records", {"text": "adobe"})["matches"]] == ["Adobe Photoshop"]
    # The stored vendor stays blank: inference is for matching only.
    assert _bag().graph.records["ps"].vendor is None
