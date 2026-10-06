import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addButtonLabel,
  addedSentence,
  buildBatch,
  dedupeKey,
  homeSentence,
  prepareRows,
  saasSkipCount,
  todoLines,
  type EstateItem,
  type PlanInput,
} from "./add-plan.ts";

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
    domainId: "",
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

  it("asks about replacing only when the catalog category matches", () => {
    const salesforce: EstateItem = {
      id: "sf",
      type: "application",
      name: "Salesforce",
      owner: "",
      cost: "$18,000",
      lifecycle: "Active",
      category: "CRM",
      catalogTool: "salesforce",
      vendor: "Salesforce",
      renewal: "",
    };
    const slack = prepareRows("Slack", "app", [salesforce])[0];
    assert.equal(slack?.tool?.name, "Slack");
    assert.equal(slack?.tool?.vendor, "Salesforce");
    assert.equal(slack?.tool?.typicalAnnual, 900);
    assert.equal(slack?.hint, null);
    const office: EstateItem = { ...salesforce, id: "m", name: "Microsoft 365", category: "Productivity", catalogTool: "microsoft 365", vendor: "Microsoft" };
    const hinted = prepareRows("Slack", "app", [office])[0];
    assert.match(hinted?.hint ?? "", /same kind of app as Microsoft 365/);
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

  it("keeps one item compact and a server name stays a server only when that type is chosen", () => {
    assert.equal(prepareRows("Plant scheduling", "app", []).length, 1);
    const as400 = prepareRows("AS400", "server", []);
    assert.equal(as400[0]?.name, "AS400");
    assert.equal(as400[0]?.kind, "server");
    assert.equal(prepareRows("AS400", "app", [])[0]?.kind, "app");
    assert.equal(prepareRows("IBM", "server", [])[0]?.name, "IBM");
    assert.equal(prepareRows("IBM", "server", [])[0]?.tool, null);
  });

  it("a location and a vendor keep the typed name", () => {
    const office = prepareRows("Toronto office", "location", []);
    assert.equal(office[0]?.name, "Toronto office");
    assert.equal(office[0]?.kind, "location");
    assert.equal(office[0]?.tool, null);
    const created = prepareRows("Oracle", "vendor", []);
    assert.equal(created[0]?.name, "Oracle");
    assert.equal(created[0]?.kind, "vendor");
    assert.equal(created[0]?.tool, null);
    assert.equal(created[0]?.existing, null);
    const oracle: EstateItem = {
      id: "oracle",
      type: "external_party",
      name: "Oracle",
      owner: "",
      cost: "",
      lifecycle: "",
      category: "",
      catalogTool: "",
      vendor: "",
      renewal: "",
    };
    const netsuite: EstateItem = { ...oracle, id: "ns", type: "application", name: "Oracle NetSuite" };
    const existing = prepareRows("Oracle", "vendor", [oracle, netsuite]);
    assert.equal(existing[0]?.existing?.id, "oracle");
    assert.equal(existing[0]?.name, "Oracle");
  });

  it("keeps the typed name until a weak match is confirmed", () => {
    const rows = prepareRows("label printing", "app", []);
    assert.equal(rows[0]?.status, "weak");
    assert.equal(rows[0]?.name, "label printing");
    const batch = buildBatch(plan("label printing", []), []);
    assert.equal(batch.creates[0]?.name, "label printing");
    assert.equal(batch.creates[0]?.properties.catalog_tool, undefined);
  });

  it("stores a new category name as itself", () => {
    const batch = buildBatch(plan("Slack", []), []);
    assert.equal(batch.creates[0]?.properties.category, "Productivity");
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

  it("a capability plan includes domain_id", () => {
    const rows = prepareRows("Order management", "capability", []).map((row) => ({
      ...row,
      keep: false,
      serverName: "",
      where: "",
      ownerTeam: "",
      ownerName: "",
      renewal: "",
      yearly: "",
      domainId: "domain-1",
    }));
    const batch = buildBatch(rows, []);
    assert.equal(batch.creates[0]?.type, "capability");
    assert.equal(batch.creates[0]?.properties.domain_id, "domain-1");
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
