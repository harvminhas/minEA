import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aiStepPatch,
  aiStepRows,
  replaceTypicalLine,
  setupCreate,
  setupScreenFromStored,
  storedSetupStep,
  SETUP_SCREENS,
  addButtonLabel,
  catalogLists,
  addedSentence,
  buildBatch,
  dedupeKey,
  homeSentence,
  platformTypeFromCategory,
  prepareRows,
  saasSkipCount,
  todoLines,
  type EstateItem,
  type PlanInput,
} from "./add-plan.ts";
import { SAMPLE_COMPANY, TOOL_CATALOG, setupMatch } from "./match-tools.ts";
import { lineAnnualCents } from "../cost/math.ts";
import { catalogEntry } from "../ai/catalog.ts";
import { unreviewed } from "../ai/landscape.ts";

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

  it("the app flow never matches a platform tool", () => {
    for (const tool of TOOL_CATALOG.filter((item) => item.kind === "platform")) {
      const row = prepareRows(tool.name, "app", [])[0];
      assert.equal(row?.tool, null, tool.name);
      assert.equal(row?.kind, "app", tool.name);
      assert.equal(row?.name, tool.name, tool.name);
    }
  });

  it("Microsoft 365 in the platform flow keeps its name", () => {
    const row = prepareRows("Microsoft 365", "platform", [])[0];
    assert.equal(row?.name, "Microsoft 365");
    assert.equal(row?.kind, "platform");
    assert.equal(row?.tool, null);
  });

  it("Dynamics 365 does not match Microsoft 365", () => {
    const row = prepareRows("Dynamics 365", "app", [])[0];
    assert.equal(row?.name, "Dynamics 365");
    assert.equal(row?.tool?.name, undefined);
    assert.notEqual(row?.tool?.name, "Microsoft 365");
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

  it("saves platform hosting and fills platform type only when the category is known", () => {
    const fields = {
      keep: false,
      serverName: "",
      where: "",
      ownerTeam: "",
      ownerName: "",
      renewal: "",
      yearly: "",
      domainId: "",
    };
    const aws = prepareRows("AWS", "platform", []).map((row) => ({ ...row, ...fields, choice: "paas" as const }));
    const paas = buildBatch(aws, []).creates[0];
    assert.equal(paas?.type, "cloud_service");
    assert.equal(paas?.properties.hosting_model, "paas");
    assert.equal(paas?.properties.platform_type, undefined);
    const hosted = prepareRows("Azure", "platform", []).map((row) => ({ ...row, ...fields, choice: "self_hosted" as const }));
    assert.equal(buildBatch(hosted, []).creates[0]?.properties.hosting_model, "self_hosted");
    const open = prepareRows("AWS", "platform", []).map((row) => ({ ...row, ...fields, choice: "unknown" as const }));
    assert.equal(buildBatch(open, []).creates[0]?.properties.hosting_model, undefined);
    const functions = prepareRows("Azure Functions", "platform", []).map((row) => ({ ...row, ...fields }));
    const saved = buildBatch(functions, []).creates[0];
    assert.equal(saved?.properties.hosting_model, "paas");
    assert.equal(saved?.properties.vendor, "Microsoft");
    assert.equal(saved?.properties.category, "Infrastructure");
    assert.equal(saved?.properties.platform_type, undefined);
    const typed = functions.map((row) => ({ ...row, tool: row.tool ? { ...row.tool, category: "CRM" } : null }));
    assert.equal(buildBatch(typed, []).creates[0]?.properties.platform_type, "crm");
    assert.equal(platformTypeFromCategory("Low-code"), "low_code");
    assert.equal(platformTypeFromCategory("Analytics"), null);
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

describe("catalogLists", () => {
  it("returns the same empty arrays while the catalog loads, so AskAdd's effect deps stay put", () => {
    const first = catalogLists(undefined);
    const second = catalogLists(undefined);
    assert.equal(first.objects, second.objects);
    assert.equal(first.relationships, second.relationships);
    assert.deepEqual(first.objects, []);
  });

  it("passes the loaded lists through unchanged", () => {
    const data = { objects: [{ id: "a" }], relationships: [{ id: "r" }] };
    assert.equal(catalogLists(data).objects, data.objects);
    assert.equal(catalogLists(data).relationships, data.relationships);
  });
});

describe("first-run AI step", () => {
  const NOW = "2026-10-07T12:00:00.000Z";
  const hostsFor = (text: string) =>
    setupMatch(text).flatMap((item, index) => {
      const spec = setupCreate(item);
      return spec ? [{ key: String(index), objectId: `id-${index}`, type: spec.type, name: spec.name, properties: spec.properties }] : [];
    });

  it("the sample company gives four apps, default-on features ticked and paid add-ons not", () => {
    const { rows, others } = aiStepRows(hostsFor(SAMPLE_COMPANY));
    assert.deepEqual(rows.map((row) => row.name), ["Salesforce", "QuickBooks Online", "Microsoft 365", "Shopify"]);
    const m365 = rows.find((row) => row.name === "Microsoft 365")!;
    assert.deepEqual(
      m365.features.map((feature) => [feature.entry.key, feature.ticked, feature.paidLabel]),
      [
        ["m365-copilot-chat", true, ""],
        ["m365-copilot", false, "paid add-on · $21 /user/mo"],
        ["teams-premium-recap", false, "paid add-on · $10 /user/mo"],
      ],
    );
    assert.equal(m365.audience, "everyone");
    assert.deepEqual(rows.find((row) => row.name === "Salesforce")!.features.map((feature) => feature.ticked), [false]);
    assert.deepEqual(others, ["Order Entry", "EDI", "label printing"]);
  });

  it("Copilot Chat ticked + M365 Copilot ticked with 25 seats → 2 features on, 1 off, 1 cost line of $6,300 / yr", () => {
    const host = { id: "m365", type: "application", name: "Microsoft 365", properties: { catalog_tool: "microsoft 365", cost_lines: [] } };
    const [patch] = aiStepPatch(
      [{
        host,
        audience: "some_groups",
        features: [
          { entry: catalogEntry("m365-copilot-chat")!, ticked: true },
          { entry: catalogEntry("m365-copilot")!, ticked: true, seats: 25 },
          { entry: catalogEntry("teams-premium-recap")!, ticked: false, seats: 10 },
        ],
      }],
      "Ana",
      NOW,
    );
    assert.equal(patch.objectId, "m365");
    assert.deepEqual(
      patch.properties.ai_features.map((feature) => [feature.key, feature.status, feature.source, feature.audience, feature.confirmed_by, feature.cost_line_id ?? null]),
      [
        ["m365-copilot-chat", "on", "onboarding", "some_groups", "Ana", null],
        ["m365-copilot", "on", "onboarding", "some_groups", "Ana", "ai-m365-copilot"],
        ["teams-premium-recap", "off", "onboarding", "some_groups", "Ana", null],
      ],
    );
    const lines = patch.properties.cost_lines!;
    assert.equal(lines.length, 1);
    assert.equal(lines[0].ai_feature, "m365-copilot");
    assert.equal(lines[0].source, "estimate");
    assert.equal(lineAnnualCents(lines[0]), 630000);
  });

  it("keeps the app's typical cost line and sends no cost_lines when nothing has seats", () => {
    const typical = { id: "typical-microsoft", type: "subscription", amount_cents: 100, frequency: "annual", calculation: { kind: "flat" }, vendor: null, source: "estimate", created_at: NOW, created_by: "setup", updated_at: NOW, updated_by: "setup" };
    const host = { id: "m365", type: "application", name: "Microsoft 365", properties: { cost_lines: [typical] } };
    const [plain] = aiStepPatch([{ host, audience: "everyone", features: [{ entry: catalogEntry("m365-copilot-chat")!, ticked: true }] }], "Ana", NOW);
    assert.equal("cost_lines" in plain.properties, false);
    const [seated] = aiStepPatch([{ host, audience: "everyone", features: [{ entry: catalogEntry("m365-copilot")!, ticked: true, seats: 2 }] }], "Ana", NOW);
    assert.deepEqual(seated.properties.cost_lines!.map((line) => line.id), ["typical-microsoft", "ai-m365-copilot"]);
  });

  it("Next with the default ticks leaves nothing unreviewed on those apps; Skip leaves them all unreviewed", () => {
    const hosts = hostsFor(SAMPLE_COMPANY);
    const { rows } = aiStepRows(hosts);
    const objects = hosts.map((host) => ({ id: host.objectId, type: host.type, name: host.name, properties: { ...host.properties } }));
    const patches = aiStepPatch(
      rows.map((row) => ({
        host: objects.find((object) => object.id === row.objectId)!,
        audience: row.audience,
        features: row.features.map((feature) => ({ entry: feature.entry, ticked: feature.ticked })),
      })),
      "Ana",
      NOW,
    );
    assert.equal(unreviewed(objects).length, 6);
    const saved = objects.map((object) => {
      const patch = patches.find((item) => item.objectId === object.id);
      return patch ? { ...object, properties: { ...object.properties, ...patch.properties } } : object;
    });
    assert.deepEqual(unreviewed(saved), []);
    const on = saved.flatMap((object) => ((object.properties as { ai_features?: { key: string; status: string }[] }).ai_features ?? []).filter((feature) => feature.status === "on").map((feature) => feature.key));
    assert.deepEqual(on, ["quickbooks-intuit-assist", "m365-copilot-chat", "shopify-sidekick"]);
  });

  it("a yearly cost typed on the owners step replaces the typical line but keeps the AI seat line", () => {
    const host = { id: "m365", type: "application", name: "Microsoft 365", properties: { cost_lines: [] } };
    const [patch] = aiStepPatch([{ host, audience: "everyone", features: [{ entry: catalogEntry("m365-copilot")!, ticked: true, seats: 25 }] }], "Ana", NOW);
    const typical = { id: "typical-microsoft", type: "subscription", amount_cents: 1500000, frequency: "annual", calculation: { kind: "flat" }, vendor: "Microsoft", source: "estimate", notes: "typical", created_at: NOW, created_by: "setup", updated_at: NOW, updated_by: "setup" } as const;
    const typed = { ...typical, id: "typed", amount_cents: 2000000 };
    const lines = replaceTypicalLine({ cost_lines: [typical, ...patch.properties.cost_lines!] }, typed);
    assert.deepEqual(lines.map((line) => line.id), ["ai-m365-copilot", "typed"]);
  });

  it("skip writes nothing, and a list with no known AI skips the step", () => {
    assert.deepEqual(aiStepPatch([], "Ana", NOW), []);
    const { rows, others } = aiStepRows(hostsFor("AS400, Order Entry, EDI, label printing"));
    assert.deepEqual(rows, []);
    assert.deepEqual(others, ["Order Entry", "EDI", "label printing"]);
  });

  it("features already stored on a kept app aren't asked again", () => {
    const kept = { key: "m", type: "application", name: "Microsoft 365", properties: { ai_features: [{ key: "m365-copilot-chat", name: "Copilot Chat", status: "on", sees_company_data: "no", vendor_trains: "no", source: "catalog" }] } };
    assert.deepEqual(aiStepRows([kept]).rows[0].features.map((feature) => feature.entry.key), ["m365-copilot", "teams-premium-recap"]);
  });

  it("stored setupStep values keep their old meaning; the AI step gets a new number", () => {
    assert.deepEqual(SETUP_SCREENS, ["paste", "matched", "ai", "where", "owners"]);
    // Values written before this step existed: 1 matched, 2 where, 3 owners.
    assert.equal(setupScreenFromStored(1), "matched");
    assert.equal(setupScreenFromStored(2), "where");
    assert.equal(setupScreenFromStored(3), "owners");
    assert.equal(setupScreenFromStored(4), "ai");
    assert.equal(setupScreenFromStored(null), "paste");
    assert.equal(setupScreenFromStored(9), "paste");
    for (const screen of SETUP_SCREENS) assert.equal(setupScreenFromStored(storedSetupStep(screen)), screen);
    assert.equal(storedSetupStep("where"), 2);
    assert.equal(storedSetupStep("owners"), 3);
  });

  it("a new app with known AI features gets a 'Confirm AI features' to-do", () => {
    const m365 = TOOL_CATALOG.find((tool) => tool.name === "Microsoft 365")!;
    const row = { name: "Microsoft 365", kind: "app" as const, kept: false, updating: false, owner: "Ana", renewal: "2027-01-01", choice: "saas" as const, hint: null };
    assert.deepEqual(todoLines([{ ...row, tool: m365 }]), ["Confirm AI features on Microsoft 365"]);
    assert.deepEqual(todoLines([{ ...row, tool: null }]), []);
    assert.deepEqual(todoLines([{ ...row, tool: m365, kept: true }]), []);
  });
});
