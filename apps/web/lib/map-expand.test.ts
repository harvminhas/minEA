import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MinEAObject, Relationship } from "@minea/types";
import type { Edge, Node } from "reactflow";
import { expandSystemGraph, mapNeighbors, nodeObjectId, objectOpenHref, PER_NODE_CAP, savableLayout, TOTAL_CAP } from "./map-expand.ts";

const obj = (id: string, type: string, name: string) =>
  ({ id, type, name, properties: {}, workspace_id: "w", org_id: "o", updated_at: "2026-10-21T00:00:00Z" }) as unknown as MinEAObject;
let n = 0;
const rel = (type: string, from: MinEAObject, to: MinEAObject) =>
  ({ id: `r${++n}`, type, from_object_id: from.id, from_type: from.type, to_object_id: to.id, to_type: to.type, attributes: {} }) as unknown as Relationship;

const dyna = obj("D", "application", "DynaMX");
const api = obj("X", "api", "Orders API");
const crm = obj("C", "application", "CRM");
const portal = obj("P", "solution", "Customer Portal");
const kong = obj("K", "tool", "Kong");
const debt = obj("T", "tech_debt", "Old auth");
const base = [rel("exposes", dyna, api), rel("consumes", crm, api), rel("consumes", portal, api), rel("hosts", kong, api), rel("affects", debt, api)];
const objects = [dyna, api, crm, portal, kong, debt];
// The map as buildSystemGraph lays it out: the center and its direct links (same node ids and data).
function baseMap(rels: Relationship[], objs: MinEAObject[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [{ id: "system-center", type: "systemCenterNode", position: { x: 300, y: 0 }, data: { system: dyna } }];
  const edges: Edge[] = [];
  rels.filter((r) => r.from_object_id === dyna.id && r.to_type !== "tech_debt").forEach((r, i) => {
    const o = objs.find((x) => x.id === r.to_object_id)!;
    const id = `link-${o.id}-outbound`;
    if (nodes.some((node) => node.id === id)) return;
    nodes.push({ id, type: "systemLinkedNode", position: { x: 560, y: i * 90 }, data: { link: { objectId: o.id, name: o.name, objectType: o.type, direction: "outbound", relationshipTypes: [r.type] } } });
    edges.push({ id: `e-${id}-out`, source: "system-center", target: id });
  });
  return { nodes, edges };
}
const graph = (rels: Relationship[], objs: MinEAObject[], expanded: string[] = []) =>
  expandSystemGraph(baseMap(rels, objs), { expanded, relationships: rels, objects: objs });
const byObject = (g: ReturnType<typeof graph>, id: string) => g.nodes.find((node) => nodeObjectId(node) === id && node.type !== "systemMoreNode");

describe("map expand", () => {
  it("neighbors use the shared words, skip tech debt, A–Z", () => {
    const list = mapNeighbors("X", base, new Map(objects.map((o) => [o.id, o])));
    assert.deepEqual(list.map((i) => `${i.name}:${i.phrase}:${i.edgeLabel}`), [
      "CRM:Consumes:Consumed by",
      "Customer Portal:Consumes:Consumed by",
      "DynaMX:Exposes:Exposed by",
      "Kong:Gateway for:Behind gateway",
    ]);
  });

  it("collapsed: +N badge counts links still off the map (tech debt excluded), none on the center", () => {
    const g = graph(base, objects);
    assert.equal((byObject(g, "X")!.data as { badge?: number }).badge, 3);
    assert.equal((byObject(g, "D")!.data as { badge?: number }).badge, undefined);
    assert.equal(g.nodes.length, 2);
  });

  it("expanding reveals one hop to the right, dashed, and the badge flips to collapse", () => {
    const g = graph(base, objects, ["X"]);
    const revealed = g.nodes.filter((node) => (node.data as { revealed?: boolean }).revealed);
    assert.deepEqual(revealed.map((node) => nodeObjectId(node)).sort(), ["C", "K", "P"]);
    const parent = byObject(g, "X")!;
    assert.ok(revealed.every((node) => node.position.x > parent.position.x));
    assert.equal((parent.data as { expanded?: boolean; badge?: number }).expanded, true);
    assert.equal((parent.data as { badge?: number }).badge, 0);
    const edge = g.edges.find((e) => e.target === byObject(g, "C")!.id)!;
    assert.equal(edge.label, "Consumed by");
    assert.equal((edge.style as { strokeDasharray?: string }).strokeDasharray, "5 4");
  });

  it("caps 5 per node with a +N more node, and 25 across the map", () => {
    const hub = obj("H", "api", "Hub API");
    const apps = Array.from({ length: 40 }, (_, i) => obj(`a${String(i).padStart(2, "0")}`, "application", `App ${String(i).padStart(2, "0")}`));
    const rels = [rel("exposes", dyna, hub), ...apps.map((a) => rel("consumes", a, hub))];
    const one = graph(rels, [dyna, hub, ...apps], ["H"]);
    assert.equal(one.nodes.filter((node) => (node.data as { revealed?: boolean }).revealed).length, PER_NODE_CAP);
    assert.equal((one.nodes.find((node) => node.type === "systemMoreNode")!.data as { count: number }).count, 40 - PER_NODE_CAP);

    // Expanding the revealed apps too stops at the total cap.
    const extra = apps.slice(0, 5).flatMap((a, i) => Array.from({ length: 6 }, (_, j) => { const o = obj(`z${i}${j}`, "application", `Z ${i}${j}`); return o; }));
    const extraRels = extra.map((o, k) => rel("sends_data_to", apps[Math.floor(k / 6)], o));
    const many = graph([...rels, ...extraRels], [dyna, hub, ...apps, ...extra], ["H", ...apps.slice(0, 5).map((a) => a.id)]);
    assert.equal(many.nodes.filter((node) => (node.data as { revealed?: boolean }).revealed).length, TOTAL_CAP);
  });

  it("already-shown neighbors get a dashed link instead of a second node", () => {
    const rels = [rel("exposes", dyna, api), rel("consumes", crm, api), rel("sends_data_to", dyna, crm)];
    const g = graph(rels, [dyna, api, crm], ["X"]);
    assert.equal(g.nodes.filter((node) => nodeObjectId(node) === "C").length, 1);
    assert.ok(g.edges.some((e) => e.id === "xe-X-C"));
  });

  it("only direct links keep saved positions", () => {
    assert.deepEqual(Object.keys(savableLayout({ "system-center": 1, "link-X-outbound": 2, "x-C": 3, "more-X": 4 })), ["system-center", "link-X-outbound"]);
  });

  it("Open goes to the app's model page or the connector's list", () => {
    assert.equal(objectOpenHref("/b", crm), "/b/model/applications/C");
    assert.equal(objectOpenHref("/b", api), "/b/integration/apis?open=X");
    assert.equal(objectOpenHref("/b", obj("V", "external_party", "Acme")), "/b/model/vendors/V");
    assert.equal(objectOpenHref("/b", debt), null);
  });
});

describe("map expand placement", () => {
  it("steps the revealed column right of nodes already in the way", () => {
    const rels = [rel("exposes", dyna, api), rel("consumes", crm, api)];
    const map = baseMap(rels, [dyna, api, crm]);
    map.nodes.push({ id: "peer-Q", type: "systemLinkedNode", position: { x: 860, y: 0 }, data: { link: { objectId: "Q", name: "Q", objectType: "application", direction: "outbound", relationshipTypes: [] } } });
    const g = expandSystemGraph(map, { expanded: ["X"], relationships: rels, objects: [dyna, api, crm] });
    assert.equal(g.nodes.find((node) => node.id === "x-C")!.position.x, 560 + 280 * 2);
  });
});
