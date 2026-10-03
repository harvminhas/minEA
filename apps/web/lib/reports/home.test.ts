import assert from "node:assert/strict";
import test from "node:test";
import type { CatalogRow } from "../model-catalog.ts";
import { askChips, hostingMap, infraCost, popularCards, singlePoints, withArticle } from "./home.ts";

function row(input: Partial<CatalogRow> & { id: string; name: string; kind: CatalogRow["kind"] }): CatalogRow {
  return {
    object: { id: input.id, name: input.name, type: input.kind === "runtime" ? "model" : input.kind === "platform" ? "cloud_service" : "application", properties: {} },
    typeLabel: input.kind,
    subtitle: "",
    ownerTeam: "",
    ownerPerson: "",
    vendor: "",
    vendorKey: "",
    annualCostLabel: "—",
    annualCostNumber: null,
    renewalLabel: "",
    renewalDate: null,
    renewalSoon: false,
    lifecycle: "",
    lifecycleLabel: "",
    criticality: "",
    criticalityLabel: "",
    costModelLabel: "",
    hostingLabel: "",
    slaLabel: "",
    suggestion: null,
    missing: { owner: true, vendor: true, cost: true, renewal: true, lifecycle: true, criticality: true },
    missingCount: 6,
    ...input,
  } as CatalogRow;
}

test("the article is used for a runtime and not for an application", () => {
  assert.equal(withArticle("AS400", true), "the AS400");
  assert.equal(withArticle("The firewall", true), "The firewall");
  assert.equal(withArticle("Salesforce", false), "Salesforce");
});

test("chips stay in order and skip questions that do not apply", () => {
  const as400 = row({
    id: "as400",
    name: "AS400",
    kind: "runtime",
    object: { id: "as400", name: "AS400", type: "model", properties: { support_ends: "2020-01-01", runtime_kind: "physical_server" } } as CatalogRow["object"],
  });
  const salesforce = row({ id: "sf", name: "Salesforce", kind: "application", missing: { owner: false, vendor: true, cost: true, renewal: true, lifecycle: true, criticality: true }, missingCount: 5, annualCostNumber: 100, vendor: "Salesforce", vendorKey: "salesforce" });
  const marketing = row({ id: "mkt", name: "Marketing", kind: "application" });
  const chips = askChips(
    [as400, salesforce, marketing],
    [
      { type: "runs_on", fromId: "sf", toId: "as400" },
      { type: "part_of", fromId: "mkt", toId: "sf" },
    ],
    new Date("2026-09-28T00:00:00Z"),
  );
  assert.ok(chips.length <= 6);
  assert.equal(chips[0], "What's out of support?");
  assert.equal(chips[1], "What breaks if the AS400 goes down?");
  assert.ok(chips.includes("What happens if Salesforce goes down?"));
  assert.equal(chips.filter((chip) => chip.startsWith("What happens if the Salesforce")).length, 0);
});

test("empty cards do not use zero or a dash", () => {
  const cards = popularCards([], [], new Date("2026-09-28T00:00:00Z"));
  const text = JSON.stringify(cards);
  assert.equal(cards.renewals.value, "No renewal dates yet");
  assert.equal(cards.ownership.value, "Every record has an owner");
  assert.equal(cards.aging.value, "Nothing out of support");
  assert.equal(cards.spend.value, "No costs tracked yet");
  assert.equal(text.includes('"0"'), false);
  assert.equal(text.includes("—"), false);
});

test("a host needs 3 distinct dependents, and a duplicate edge does not count twice", () => {
  const host = row({ id: "host", name: "AS400", kind: "runtime" });
  const apps = ["a", "b", "c"].map((id) => row({ id, name: id, kind: "application", criticalityLabel: "High" }));
  const edges = [
    { type: "runs_on", fromId: "a", toId: "host" },
    { type: "runs_on", fromId: "a", toId: "host" },
    { type: "runs_on", fromId: "b", toId: "host" },
  ];
  assert.equal(singlePoints([host, ...apps], edges).length, 0);
  edges.push({ type: "built_on", fromId: "c", toId: "host" });
  const found = singlePoints([host, ...apps], edges);
  assert.equal(found.length, 1);
  assert.equal(found[0].count, 3);
  assert.equal(found[0].dependents.length, 3);
});

test("an application with no hosting model and no edge is unlinked", () => {
  const app = row({
    id: "unknown",
    name: "Unknown",
    kind: "application",
    object: { id: "unknown", name: "Unknown", type: "application", properties: {} } as CatalogRow["object"],
  });
  assert.equal(hostingMap([app], []).unlinked, 1);
});

test("an on-prem application with no edge is only in the unlinked count", () => {
  const app = row({
    id: "labels",
    name: "Labels",
    kind: "application",
    object: { id: "labels", name: "Labels", type: "application", properties: { hosting_model: "on_premise" } } as CatalogRow["object"],
  });
  const cloud = row({
    id: "crm",
    name: "CRM",
    kind: "application",
    object: { id: "crm", name: "CRM", type: "application", properties: { hosting_model: "saas" } } as CatalogRow["object"],
  });
  const host = row({ id: "box", name: "Box", kind: "runtime" });
  const linked = row({ id: "order", name: "Order", kind: "application" });
  const map = hostingMap([app, cloud, host, linked], [{ type: "runs_on", fromId: "order", toId: "box" }]);
  assert.equal(map.unlinked, 1);
  assert.equal(map.hosts, 1);
});

test("infrastructure cost is the platform run total plus the server run total", () => {
  const platform = row({
    id: "aws",
    name: "AWS",
    kind: "platform",
    object: { id: "aws", name: "AWS", type: "cloud_service", properties: { annual_cost: "18600" } } as CatalogRow["object"],
  });
  const server = row({
    id: "as400",
    name: "AS400",
    kind: "runtime",
    object: { id: "as400", name: "AS400", type: "model", properties: { annual_cost: 71000 } } as CatalogRow["object"],
  });
  const app = row({
    id: "app",
    name: "App",
    kind: "application",
    object: { id: "app", name: "App", type: "application", properties: { annual_cost: 5000 } } as CatalogRow["object"],
  });
  assert.deepEqual(infraCost([platform, server, app]), { platforms: 18600, servers: 71000, total: 89600 });
});
