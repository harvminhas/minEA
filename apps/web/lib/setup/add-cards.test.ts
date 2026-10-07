import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MOTION_CSS, cardQuestion, catalogHostingLine, costShareLine, describeAddResult, firstGap, hostingChoices, noticeDeadline, savedAdded, savedKept, undoneSentence, viewFromRows } from "./add-cards.ts";
import { applicationAddHint } from "./type-guidance.ts";
import { prepareRows, todoLines, type AddRow, type EstateItem } from "./add-plan.ts";
import type { ToolRecord } from "./match-tools.ts";

const m365: EstateItem = {
  id: "m365",
  type: "cloud_service",
  name: "Microsoft 365",
  owner: "Priya Shah",
  cost: "$51,840",
  lifecycle: "Active",
  category: "Productivity",
  catalogTool: "microsoft 365",
  vendor: "Microsoft",
  renewal: "2027-01-14",
};

const hubspot: EstateItem = {
  id: "hub",
  type: "application",
  name: "HubSpot",
  owner: "Marketing",
  cost: "$9,600",
  lifecycle: "Active",
  category: "Marketing",
  catalogTool: "hubspot",
  vendor: "HubSpot",
  renewal: "",
};

function tool(partial: Partial<ToolRecord> & Pick<ToolRecord, "name" | "hosting">): ToolRecord {
  return {
    aliases: [],
    vendor: "",
    category: "",
    kind: "application",
    typicalAnnual: null,
    unit: "workspace / yr",
    ...partial,
  };
}

function row(partial: Partial<AddRow> & Pick<AddRow, "name" | "status">): AddRow {
  return {
    key: partial.name.toLowerCase(),
    input: partial.name,
    tool: null,
    options: [],
    customBuilt: false,
    kind: "app",
    choice: "unknown",
    existing: null,
    hint: null,
    ...partial,
  };
}

describe("ask add cards", () => {
  it("shows one existing card and no confirmation for add ms 365", () => {
    const view = describeAddResult({ text: "ms 365", estate: [m365], phase: "idle" });
    assert.equal(view.mode, "records");
    assert.equal(view.recordCards.length, 1);
    assert.equal(view.title, "You already have Microsoft 365");
    assert.equal(view.addCards.length, 0);
    assert.equal(view.button, null);
    assert.equal(view.showsAdded, false);
    const text = `${view.title} ${view.button ?? ""}`;
    assert.doesNotMatch(text, /Added|skipped|Read as a list/);
  });

  it("keeps the confirmation off until save resolves", () => {
    const pending = describeAddResult({ text: "Zoom, NetSuite", estate: [], phase: "saving" });
    assert.equal(pending.showsAdded, false);
    assert.equal(pending.mode, "cards");
    assert.equal(pending.button, "Adding…");
    const saved = describeAddResult({ text: "Zoom, NetSuite", estate: [], phase: "saved" });
    assert.equal(saved.mode, "saved");
    assert.equal(saved.showsAdded, true);
    assert.equal(saved.addCards.length, 0);
    const failed = describeAddResult({ text: "Zoom, NetSuite", estate: [], phase: "error" });
    assert.equal(failed.mode, "cards");
    assert.equal(failed.showsAdded, false);
    assert.equal(failed.button, "Retry");
    assert.equal(savedAdded(["Zoom Workplace", "Oracle NetSuite"]), "Added 2 apps: Zoom Workplace, Oracle NetSuite.");
    assert.equal(savedKept(["HubSpot"]), "HubSpot was already there, so nothing changed.");
  });

  it("lays out two new cards and one already-in-your-map line", () => {
    const view = describeAddResult({ text: "Zoom, HubSpot and NetSuite", estate: [hubspot], phase: "idle" });
    assert.equal(view.addCards.length, 2);
    assert.equal(view.alreadyLines.length, 1);
    assert.equal(view.alreadyLines[0]?.name, "HubSpot");
    assert.equal(view.button, "Add 2 apps");
    const zoom = view.addCards.find((card) => card.name === "Zoom Workplace");
    assert.ok(zoom);
    const removed = view.addCards.filter((card) => card.key !== zoom!.key);
    const next = viewFromRows([...removed, ...view.alreadyLines], "idle");
    assert.equal(next.button, "Add 1 app");
    assert.equal(firstGap({ owner: hubspot.owner, renewal: hubspot.renewal, criticality: "" })?.label, "No renewal date");
  });

  it("a platform guess and change use a platform card, then an app card", () => {
    for (const name of ["Snowflake", "AWS Lambda"]) {
      assert.equal(applicationAddHint(name, "platform", false), "We think this is a Platform");
      const platform = describeAddResult({ text: name, estate: [], phase: "idle", kind: "platform" });
      assert.equal(platform.button, "Add 1 platform", name);
      assert.equal(platform.title, "Add 1 platform to your map", name);
      assert.equal(platform.addCards[0]?.kind, "platform", name);
      assert.equal(catalogHostingLine(platform.addCards[0]!), "Platform hosting, nothing to ask");
      assert.equal(applicationAddHint(name, "app", true), "Adding as an Application");
      assert.equal(applicationAddHint(name, "platform", true), "Adding as a Platform");
      const app = describeAddResult({ text: name, estate: [], phase: "idle", kind: "app" });
      assert.equal(app.button, "Add 1 app", name);
      assert.equal(app.addCards[0]?.kind, "app", name);
      assert.equal(catalogHostingLine(app.addCards[0]!), null);
    }
  });

  it("an unmatched platform asks for hosting and a PaaS match does not", () => {
    assert.deepEqual(hostingChoices("platform").map((choice) => choice.label), ["SaaS", "PaaS", "Self-hosted", "Don't know"]);
    for (const name of ["AWS", "Azure"]) {
      const view = describeAddResult({ text: name, estate: [], phase: "idle", kind: "platform" });
      assert.equal(view.questions[0], "hosting", name);
      assert.equal(view.addCards[0]?.choice, "unknown", name);
    }
    const functions = describeAddResult({ text: "Azure Functions", estate: [], phase: "idle", kind: "platform" });
    assert.equal(functions.addCards[0]?.choice, "paas");
    assert.equal(functions.questions[0], "none");
    assert.equal(catalogHostingLine(functions.addCards[0]!), "Platform hosting, nothing to ask");
    assert.equal(undoneSentence(["Esc test office"]), "Undone: Esc test office removed");
    assert.equal(undoneSentence(["A", "B"]), "Undone: A, B removed");
  });

  it("asks at most one question", () => {
    const saas = row({ name: "Zoom Workplace", status: "matched", choice: "saas", tool: tool({ name: "Zoom Workplace", hosting: "saas" }) });
    const custom = row({ name: "Plant scheduling", status: "custom" });
    const fuzzy = row({ name: "BarTender", status: "weak", choice: "unknown", tool: tool({ name: "BarTender", hosting: "either" }) });
    assert.equal(cardQuestion(saas), "none");
    assert.equal(cardQuestion(custom), "hosting");
    assert.equal(cardQuestion(fuzzy), "fuzzy");
    const view = viewFromRows([saas, custom, fuzzy], "idle");
    for (const question of view.questions) {
      assert.ok(question === "none" || question === "hosting" || question === "fuzzy");
    }
    assert.deepEqual(view.questions, ["none", "hosting", "fuzzy"]);
  });

  it("drops the plumbing and the motion when reduced", () => {
    const books: EstateItem = { id: "qb", type: "application", name: "QuickBooks Online", owner: "Finance", cost: "", lifecycle: "", category: "Finance", catalogTool: "quickbooks online", vendor: "Intuit", renewal: "" };
    const rows = prepareRows("Zoom, HubSpot and NetSuite", "app", [hubspot, books]);
    const lines = todoLines(rows.map((item) => ({
      name: item.name,
      kind: item.kind,
      kept: Boolean(item.existing),
      updating: false,
      owner: "",
      renewal: "",
      choice: item.choice,
      hint: item.hint,
    })));
    assert.equal(lines.length, 3);
    const reduced = describeAddResult({ text: "Zoom", estate: [], phase: "idle", reduced: true });
    assert.equal(reduced.motion, false);
    assert.equal(reduced.motion ? MOTION_CSS : "", "");
    const moving = describeAddResult({ text: "Zoom", estate: [], phase: "idle" });
    assert.match(moving.motion ? MOTION_CSS : "", /320ms/);
    assert.equal(moving.title.includes("skipped"), false);
  });

  it("reads seats, sharing, and the notice deadline from the record", () => {
    const share = costShareLine({
      cost_lines: [{
        id: "seats",
        type: "subscription",
        frequency: "annual",
        calculation: { kind: "per_user", seats: 120, unit_price_monthly_cents: 3600 },
        vendor: "Microsoft",
        source: "estimate",
        notice_days: 30,
        created_at: "",
        created_by: "",
        updated_at: "",
        updated_by: "",
      }],
    }, 4);
    assert.equal(share.amount, "$51,840");
    assert.equal(share.detail, "120 seats · shared by 4 apps");
    assert.equal(noticeDeadline("2027-01-14", 30), "Dec 15");
    assert.equal(firstGap({ owner: "IT · Priya Shah", renewal: "2027-01-14", criticality: "high" }), null);
  });
});
