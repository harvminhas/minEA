import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addButtonLabel,
  addedSentence,
  buildBatch,
  dedupeKey,
  homeSentence,
  prepareRows,
  resolveKind,
  saasSkipCount,
  todoLines,
  type EstateItem,
  type PlanInput,
} from "./add-plan.ts";
import { matchEntries } from "./match-tools.ts";

const hubspot: EstateItem = {
  id: "hub",
  type: "application",
  name: "HubSpot",
  owner: "Tom Becker",
  cost: "$9,600",
  lifecycle: "Retiring",
  category: "Marketing",
  catalogTool: "",
  vendor: "HubSpot",
  renewal: "2026-11-01",
};

const books: EstateItem = {
  id: "qb",
  type: "application",
  name: "QuickBooks Online",
  owner: "Finance",
  cost: "$900",
  lifecycle: "Active",
  category: "Finance",
  catalogTool: "quickbooks online",
  vendor: "Intuit",
  renewal: "",
};

function plan(text: string, estate: EstateItem[], patch?: Partial<PlanInput>): PlanInput[] {
  return prepareRows(text, "app", estate).map((row) => ({
    ...row,
    keep: Boolean(row.existing),
    serverName: "",
    where: "",
    ownerTeam: "",
    ownerName: "",
    renewal: "",
    yearly: row.tool?.typicalAnnual ? String(row.tool.typicalAnnual) : "",
    ...patch,
  }));
}

describe("dedupe and steps", () => {
  it("collapses M365 and Microsoft 365", () => {
    const rows = prepareRows("M365, Microsoft 365", "app", []);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.name, "Microsoft 365");
  });

  it("strips edition words", () => {
    assert.equal(dedupeKey("Zoom Workplace"), "zoom");
    assert.equal(dedupeKey("QuickBooks Online"), "quickbooks");
  });

  it("marks an existing HubSpot and keeps it out of the save", () => {
    const rows = plan("HubSpot", [hubspot]);
    assert.equal(rows[0]?.existing?.owner, "Tom Becker");
    const batch = buildBatch(rows, [hubspot]);
    assert.equal(batch.creates.length, 0);
    assert.equal(batch.updates.length, 0);
  });

  it("fills only empty fields on update", () => {
    const rows = plan("HubSpot", [hubspot]).map((row) => ({ ...row, keep: false, ownerTeam: "Ada", renewal: "2027-01-01" }));
    const batch = buildBatch(rows, [hubspot]);
    assert.equal(batch.creates.length, 0);
    assert.equal(batch.updates[0]?.owner, undefined);
    assert.equal(batch.updates[0]?.properties?.vendor, undefined);
    assert.equal(batch.updates[0]?.properties?.contract_renewal, undefined);
    assert.equal(batch.updates[0]?.properties?.catalog_tool, "hubspot");
  });

  it("fills a blank owner and leaves a stored owner", () => {
    const bare: EstateItem = { ...hubspot, owner: "", vendor: "", category: "", renewal: "", cost: "" };
    const rows = plan("HubSpot", [bare]).map((row) => ({ ...row, keep: false, ownerTeam: "Ada" }));
    const batch = buildBatch(rows, [bare]);
    assert.equal(batch.updates[0]?.owner, "Ada");
    assert.equal(batch.updates[0]?.properties?.vendor, "HubSpot");
  });

  it("skips hosting when every new item is SaaS", () => {
    const rows = prepareRows("Zoom, HubSpot, NetSuite", "app", [hubspot]);
    assert.equal(saasSkipCount(rows), 3);
    assert.equal(rows.find((row) => row.name === "Oracle NetSuite")?.hint?.includes("QuickBooks") ?? false, false);
  });

  it("hints when the category matches something already in the map", () => {
    const rows = prepareRows("NetSuite", "app", [books]);
    assert.match(rows[0]?.hint ?? "", /QuickBooks Online/);
  });

  it("keeps one item compact and turns AS400 into a server", () => {
    assert.equal(prepareRows("Plant scheduling", "app", []).length, 1);
    const as400 = matchEntries("AS400")[0]!;
    assert.equal(resolveKind(as400, "app"), "server");
  });

  it("puts two apps on one server", () => {
    const rows = plan("Order Entry, label printing", []).map((row, index) => ({
      ...row,
      choice: "own" as const,
      serverName: index === 0 ? "AS400" : "as400",
      where: "Main plant",
    }));
    const batch = buildBatch(rows, []);
    const servers = batch.creates.filter((item) => item.type === "model");
    const links = batch.relationships.filter((item) => item.type === "runs_on");
    assert.equal(servers.length, 1);
    assert.equal(links.length, 2);
  });

  it("phrases the confirmation and the to-do count", () => {
    const rows = prepareRows("Zoom, HubSpot, NetSuite", "app", [hubspot, books]);
    const creating = rows.filter((row) => !row.existing);
    assert.equal(addButtonLabel(creating), "Add 2 apps");
    assert.equal(
      addedSentence(
        creating.map((row) => ({ name: row.name, kind: row.kind })),
        ["HubSpot"],
      ),
      "Added 2 apps: Zoom Workplace, Oracle NetSuite. HubSpot was already in your map.",
    );
    assert.equal(homeSentence(creating.map((row) => ({ choice: row.choice, linked: true }))), "Both are SaaS, so neither needs a home.");
    const lines = todoLines(
      creating.map((row) => ({
        name: row.name,
        kind: row.kind,
        kept: false,
        updating: false,
        owner: "",
        renewal: "",
        choice: row.choice,
        hint: row.hint,
      })),
    );
    assert.equal(lines.length, 3);
  });
});
