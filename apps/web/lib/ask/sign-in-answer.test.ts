import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyIntent } from "./answerStrategies.ts";
import { answerFromRecords, type AskAnswer } from "./deterministic.ts";
import type { CatalogRow } from "../model-catalog.ts";
import type { ImpactEdge } from "../impact/relationship-impact.ts";

function row(id: string, name: string, extra: { type?: string; typeLabel?: string; status?: string; properties?: Record<string, unknown> } = {}): CatalogRow {
  const missing = { owner: true, vendor: true, cost: true, renewal: true, lifecycle: true, criticality: true };
  const type = extra.type ?? "application";
  return {
    id,
    object: { id, name, type, status: extra.status ?? "active", properties: extra.properties ?? {} } as unknown as CatalogRow["object"],
    kind: type === "cloud_service" ? "platform" : type === "model" ? "runtime" : "application",
    name,
    typeLabel: extra.typeLabel ?? (type === "cloud_service" ? "SaaS platform" : type === "model" ? "Server" : "Application"),
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
    missing,
    missingCount: 6,
  };
}

const rows = [
  row("m365", "Microsoft 365", { type: "cloud_service" }),
  row("exo", "Exchange Online"),
  row("sf", "Salesforce"),
  row("ns", "NetSuite"),
  row("shop", "Shopify Plus"),
  row("qbo", "QuickBooks Online", { properties: { sign_in: "own_login" } }),
  row("okta", "Okta", { type: "cloud_service" }),
  row("old", "Old CRM", { status: "retired" }),
  row("srv", "File server", { type: "model" }),
];
const signIn: ImpactEdge[] = [
  { type: "authenticates_via", fromId: "sf", toId: "m365" },
  { type: "authenticates_via", fromId: "ns", toId: "m365" },
  { type: "part_of", fromId: "exo", toId: "m365" },
];

function ask(question: string, edges: ImpactEdge[] = signIn, list: CatalogRow[] = rows): AskAnswer {
  return answerFromRecords({
    question,
    rows: list,
    graph: { nodes: list.map((item) => ({ id: item.id, name: item.name, typeLabel: item.typeLabel })), edges },
    basePath: "/o/w",
  });
}

test("sign-in questions get their own intent; outages stay impact", () => {
  for (const question of [
    "What signs in with Microsoft 365?",
    "What doesn't use SSO?",
    "Which apps use single sign-on?",
    "What does Salesforce sign in with?",
    "How do people sign in to Shopify Plus?",
    "Which apps have their own login?",
    "What uses Okta for sign-in?",
  ]) {
    assert.equal(classifyIntent(question), "sign_in", question);
  }
  assert.equal(classifyIntent("What breaks if Microsoft 365 goes down?"), "impact");
  assert.equal(classifyIntent("Who can't sign in if Okta goes down?"), "impact");
  assert.equal(classifyIntent("How important is Okta for sign-in?"), "importance");
  assert.equal(classifyIntent("Who owns Okta?"), "ownership");
  assert.equal(classifyIntent("Which AI agents sign in with Okta?"), "ai");
});

test("What signs in with Microsoft 365?", () => {
  const answer = ask("What signs in with Microsoft 365?");
  assert.equal(answer.handler, "sign_in");
  assert.equal(answer.answerText, "**2 Applications sign in with Microsoft 365**: NetSuite and Salesforce.");
  assert.deepEqual(answer.citations.map((item) => [item.row.name, item.relationship]), [
    ["NetSuite", "Signs in with Microsoft 365"],
    ["Salesforce", "Signs in with Microsoft 365"],
  ]);
  assert.equal(answer.gaps[0]?.text, "2 apps have no sign-in recorded, so this list may be short.", "Shopify Plus and Okta; Exchange Online is part of Microsoft 365");
  assert.equal(answer.followUps[0], "What breaks if Microsoft 365 goes down?");
});

test("a provider nobody signs in with yet says so", () => {
  const answer = ask("What signs in with Okta?");
  assert.equal(answer.answerText, "Nothing in your model signs in with Okta [1] yet.");
});

test("What doesn't use SSO? lists not recorded, and own login apart", () => {
  const answer = ask("What doesn't use SSO?");
  assert.equal(answer.handler, "sign_in");
  assert.equal(
    answer.answerText,
    "**1 Application and 1 SaaS platform have no sign-in recorded**: Okta and Shopify Plus. QuickBooks Online has its own login (no SSO)."
  );
  assert.deepEqual(answer.citations.map((item) => [item.row.name, item.section]), [
    ["Okta", "No sign-in recorded"],
    ["Shopify Plus", "No sign-in recorded"],
    ["QuickBooks Online", "Own login (no SSO)"],
  ]);
  // The provider, a part of it, retired apps and servers are not gaps; Okta is a platform in use with nothing recorded.
  assert.equal(answer.citations.some((item) => ["Microsoft 365", "Exchange Online", "Old CRM", "File server"].includes(item.row.name)), false);
  assert.equal(answer.gaps[1]?.fillHref, "/o/w/model/applications/shop");
});

test("one app: what it signs in with, its own login, or nothing recorded", () => {
  assert.equal(ask("What does Salesforce sign in with?").answerText, "Salesforce [1] signs in with **Microsoft 365**.");
  assert.equal(ask("How do people sign in to QuickBooks Online?").answerText, "QuickBooks Online [1] has its own login (no SSO).");
  const shopify = ask("How do people sign in to Shopify Plus?");
  assert.equal(shopify.answerText, "No sign-in is recorded for Shopify Plus [1].");
  assert.equal(shopify.gaps[0]?.text, "Shopify Plus: set Signs in with, or Own login (no SSO).");
});

test("the overview groups by provider", () => {
  const answer = ask("Which apps use single sign-on?");
  assert.match(answer.answerText, /^\*\*2 apps and platforms sign in through single sign-on\*\*: 2 with Microsoft 365\. 1 has its own login \(no SSO\)\. \d have no sign-in recorded\.$/);
  assert.deepEqual([...new Set(answer.citations.map((item) => item.section))], ["Signs in with Microsoft 365", "Own login (no SSO)"]);
});

test("nothing recorded yet is an empty state, not a list of every app", () => {
  const plain = rows.map((item) => row(item.id, item.name, { type: String(item.object.type) }));
  const gaps = ask("What doesn't use SSO?", [], plain);
  assert.equal(gaps.answerText, "No sign-in is recorded yet, so I can't tell which apps use single sign-on.");
  assert.equal(gaps.citations.length, 0);
  const overview = ask("Which apps use SSO?", [], plain);
  assert.equal(overview.answerText, "No sign-in is recorded yet.");
  assert.match(overview.gaps[0]?.text ?? "", /set Signs in with in Details/);
});

test("Google Workspace questions are answered, not refused", () => {
  const list = [...rows, row("gw", "Google Workspace", { type: "cloud_service" })];
  const answer = ask("What signs in with Google Workspace?", [...signIn, { type: "authenticates_via", fromId: "shop", toId: "gw" }], list);
  assert.equal(answer.answerText, "**1 Application signs in with Google Workspace**: Shopify Plus.");
});

test("importance counts sign-in dependents as direct", () => {
  const edges: ImpactEdge[] = [...signIn, { type: "authenticates_via", fromId: "shop", toId: "m365" }];
  const answer = ask("How important is Microsoft 365?", edges);
  assert.equal(answer.handler, "importance");
  assert.equal(answer.verdict?.text, "Likely high");
  assert.ok(answer.evidence?.some((item) => item.text === "NetSuite, Salesforce, and Shopify Plus can't sign in if Microsoft 365 goes down."), JSON.stringify(answer.evidence));
});
