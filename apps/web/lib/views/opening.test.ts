import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import {
  backupGapCount,
  chainRunDollars,
  chainTodos,
  collapsedCopy,
  impactCandidates,
  laneDelayMs,
  manualFlowCount,
  openingCards,
  resolveSelection,
  showExampleEstate,
  viewBadges,
  viewsMotionCss,
  type ChainItem,
} from "./opening.ts";

function item(id: string, name: string, kind: ChainItem["kind"], extra: Partial<ChainItem> = {}): ChainItem {
  return {
    id,
    name,
    kind,
    ownerTeam: extra.ownerTeam ?? "",
    criticality: extra.criticality ?? "High",
    description: extra.description ?? "",
    properties: extra.properties ?? {},
  };
}

const items: ChainItem[] = [
  item("plant", "Fremont plant", "location"),
  item("as400", "AS400", "runtime", { properties: { annual_cost: 1000, runtime_kind: "physical_server", support_ends: "2023-09-30" } }),
  item("other", "Other box", "runtime", { properties: { annual_cost: 50, runtime_kind: "physical_server" } }),
  item("app1", "Order Entry", "application", { ownerTeam: "Sales Ops", properties: { annual_cost: 200 } }),
  item("app2", "Inventory", "application", { ownerTeam: "Operations", properties: { annual_cost: 300 } }),
  item("app3", "Labels", "application", { ownerTeam: "Operations", criticality: "", description: "Runs on Other box", properties: { hosting_model: "on_premise", annual_cost: 9999 } }),
  item("cap", "Billing", "capability", { properties: { annual_cost: 5000 } }),
  item("stray", "Far server", "runtime", { properties: { runtime_kind: "physical_server", support_ends: "2020-01-01" } }),
];

const nodes: ImpactNode[] = items.map((entry) => ({ id: entry.id, name: entry.name }));

const edges: ImpactEdge[] = [
  { type: "located_at", fromId: "as400", toId: "plant" },
  { type: "runs_on", fromId: "app1", toId: "as400" },
  { type: "runs_on", fromId: "app2", toId: "as400" },
  { type: "supports", fromId: "app1", toId: "cap" },
  { type: "runs_on", fromId: "app2", toId: "other" },
];

test("default selection prefers the record that reaches more, then more apps", () => {
  const wide: ChainItem[] = [
    item("loc", "Plant", "location"),
    item("srv", "Server", "runtime"),
    ...Array.from({ length: 13 }, (_, index) => item(`a${index}`, `App ${index}`, "application", { ownerTeam: index < 3 ? "Ops" : "" })),
    ...Array.from({ length: 7 }, (_, index) => item(`b${index}`, `Box ${index}`, "application")),
  ];
  const wideNodes = wide.map((entry) => ({ id: entry.id, name: entry.name }));
  const wideEdges: ImpactEdge[] = [
    ...Array.from({ length: 13 }, (_, index) => ({ type: "runs_on", fromId: `a${index}`, toId: "loc" })),
    ...Array.from({ length: 7 }, (_, index) => ({ type: "runs_on", fromId: `b${index}`, toId: "srv" })),
  ];
  const ranked = impactCandidates(wide, wideNodes, wideEdges);
  assert.equal(ranked[0]?.id, "loc");
  assert.equal(ranked[0]?.reached, 13);

  const tied = impactCandidates(
    [
      item("b", "Bravo", "runtime"),
      item("a", "Alpha", "platform"),
      item("app", "App", "application", { ownerTeam: "Ops" }),
      item("box", "Box", "runtime"),
    ],
    [
      { id: "b", name: "Bravo" },
      { id: "a", name: "Alpha" },
      { id: "app", name: "App" },
      { id: "box", name: "Box" },
    ],
    [
      { type: "runs_on", fromId: "app", toId: "b" },
      { type: "runs_on", fromId: "box", toId: "a" },
    ]
  );
  assert.equal(tied[0]?.id, "b");
  assert.equal(tied[0]?.reached, tied[1]?.reached);
  assert.ok((tied[0]?.apps ?? 0) > (tied[1]?.apps ?? 0));
  assert.equal(resolveSelection("a", tied, new Set(["a", "b"])), "a");
  assert.equal(resolveSelection(null, tied, new Set(["a", "b"])), "b");
});

test("cards are at most six and the severity bar sums to the count", () => {
  const many = Array.from({ length: 8 }, (_, index) => item(`h${index}`, `Host ${String.fromCharCode(65 + index)}`, "runtime"));
  const apps = many.map((host, index) => item(`p${index}`, `App ${index}`, "application"));
  const ranked = impactCandidates(
    [...many, ...apps],
    [...many, ...apps].map((entry) => ({ id: entry.id, name: entry.name })),
    apps.map((app, index) => ({ type: "runs_on", fromId: app.id, toId: many[index]!.id }))
  );
  const cards = openingCards(ranked);
  assert.equal(cards.length, 6);
  assert.ok(cards[0]!.reached >= cards[5]!.reached);
  for (const card of cards) {
    assert.equal(card.direct + card.degraded + card.losesSupport, card.reached);
  }
});

test("headline cost uses the cost module and skips capabilities", () => {
  const hits = [
    { id: "app1", name: "Order Entry", severity: "direct" as const, indirect: false, depth: 1, path: [] },
    { id: "cap", name: "Billing", severity: "loses_support" as const, indirect: false, depth: 1, path: [] },
  ];
  const dollars = chainRunDollars(items[1], hits, items);
  assert.equal(dollars, 1200);
});

test("a collapsed lane has its line only when empty", () => {
  assert.equal(collapsedCopy("capabilities", 0), "No capabilities linked yet");
  assert.equal(collapsedCopy("stop", 2), "");
  assert.equal(collapsedCopy("infra", 0), "Nothing else runs on it");
});

test("badges hide at zero and match the counts", () => {
  assert.deepEqual(viewBadges({ spof: 0, manual: 0, noHome: 0, noBackup: 0 }, false), []);
  assert.deepEqual(viewBadges({ spof: 4, manual: 1, noHome: 1, noBackup: 1 }, false).map((badge) => badge.label), [
    "4 SPOF",
    "1 manual",
    "1 with no home",
    "1 with no backup",
  ]);
  assert.equal(viewBadges({ spof: 4, manual: 1, noHome: 1, noBackup: 1 }, true).length, 0);
  assert.equal(manualFlowCount([{ type: "sends_data_to", how: "manual" }, { type: "sends_data_to", how: "api" }]), 1);
  assert.equal(backupGapCount(items, []), items.filter((entry) => entry.kind === "runtime").length);
  assert.equal(backupGapCount(items, [{ type: "backed_up_to", fromId: "as400", toId: "other" }]), 2);
});

test("the sample fixture is not a write path", () => {
  const source = readFileSync(new URL("./sample-estate.ts", import.meta.url), "utf8");
  assert.equal(source.includes("objectsApi"), false);
  assert.equal(source.includes("relationshipsApi"), false);
  assert.equal(showExampleEstate(0, false, false), true);
  assert.equal(showExampleEstate(3, true, false), false);
  assert.equal(showExampleEstate(3, true, true), true);
});

test("reduced motion has no delay and the stylesheet stops animation", () => {
  assert.equal(laneDelayMs(4, true), 0);
  assert.equal(laneDelayMs(4, false), 800);
  assert.match(viewsMotionCss, /prefers-reduced-motion:\s*reduce/);
  assert.match(viewsMotionCss, /animation:\s*none/);
});

test("the complete question is last and gaps stay on this chain", () => {
  const hits = [
    { id: "app1", name: "Order Entry", severity: "direct" as const, indirect: false, depth: 1, path: [] },
    { id: "as400", name: "AS400", severity: "direct" as const, indirect: false, depth: 1, path: [] },
  ];
  const plant = items[0]!;
  const todos = chainTodos(plant, hits, items, edges, new Date("2026-10-01T00:00:00Z"));
  assert.equal(todos[todos.length - 1]?.title, "Is this list complete?");
  assert.equal(todos.some((todo) => todo.recordId === "stray"), false);
  assert.equal(todos.some((todo) => todo.recordId === "app3"), false);
  assert.ok(todos.some((todo) => todo.title.includes("AS400 out of support since Sep 2023")));
});
