/** Whole-workspace Ask: one vendor identity, ids from the AI -> table from real data, labels only. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { answerFromModel } from "./deterministic";
import { resolveVendor, vendorKey } from "./labels";
import { buildFacts, filterFacts, filtersFromPayload } from "./record-filter";
import { displayVendor, rowFromObject, type CatalogRow } from "../model-catalog";
import { AskRecordsBlock } from "@/components/mvp/AskRecords";
import type { AskModelPayload } from "@/lib/api-client";

const obj = (id: string, type: string, name: string, properties: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({ id, type, name, properties, tags: [], ...extra }) as never;
const OBJECTS = [
  obj("m365", "application", "Microsoft 365", { vendor: "Microsoft" }),
  obj("azure", "cloud_service", "Contoso Azure", { vendor: "microsoft", cloud_provider: "azure" }),
  obj("ps", "application", "Adobe Photoshop", { hosting_model: "desktop" }),
  obj("pay", "application", "Payroll", {}, { owner_team_name: "Finance", point_of_contact_name: "Christine Wong" }),
  obj("crm", "application", "Salesforce CRM app", { vendor: "Salesforce" }, { owner_team_name: "CRM" }),
];
const ROWS = OBJECTS.map(rowFromObject).filter(Boolean) as CatalogRow[];
const FACTS = buildFacts(ROWS, OBJECTS as never, []);
const names = (filters: Record<string, unknown>) => filterFacts(FACTS, filtersFromPayload(filters)).map((f) => f.row.name).sort();
const payload = (extra: Partial<AskModelPayload>) => ({ source: "llm", fallback_reason: null, answer_text: "", citations: [], gaps: [], follow_ups: [], tools_used: [], ...extra }) as AskModelPayload;
const render = (p: AskModelPayload) => {
  const ai = answerFromModel(p, ROWS, "/w", "q")!;
  return renderToStaticMarkup(<AskRecordsBlock answer={ai} facts={FACTS} yesNo={Boolean(ai.records?.yesNo)} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/r/${row.id}`} />);
};

test("one vendor identity: codes, aliases, products, 'other'", () => {
  assert.deepEqual(resolveVendor("salesforce_mulesoft"), { vendor: "Salesforce", product: "MuleSoft" });
  assert.equal(displayVendor("salesforce_mulesoft"), "Salesforce");
  assert.equal(displayVendor("microsoft"), "Microsoft");
  assert.equal(displayVendor("google"), "Google");
  assert.equal(displayVendor("other"), "");
  assert.equal(vendorKey("sfdc"), vendorKey("Salesforce"));
});

test("vendor filter is exact on the resolved identity", () => {
  assert.deepEqual(names({ vendor: "Microsoft" }), ["Contoso Azure", "Microsoft 365"]);
  assert.deepEqual(names({ vendor: "Adobe" }), ["Adobe Photoshop"]);
  assert.deepEqual(names({ vendor: "Sales" }), []);
  assert.deepEqual(names({ owner_team: "CRM", ops: { owner_team: "is_not" } }), ["Adobe Photoshop", "Contoso Azure", "Microsoft 365", "Payroll"]);
});

test("Salesforce/MuleSoft: AI headline + ids -> table from the server's real items (a tool isn't a catalogue row)", () => {
  const html = render(payload({
    headline: "Yes — MuleSoft (Salesforce)",
    yes_no: "yes",
    answer_text: "Yes — MuleSoft Anypoint and a Salesforce CRM app.",
    item_ids: ["mule", "crm"],
    items: [{ id: "mule", name: "MuleSoft Anypoint", type: "tool", type_label: "Tool", vendor: "Salesforce", product: "MuleSoft", owner_team: "", owner_person: "", annual_cost: 24000, hosting: "SaaS", renewal_date: "" }],
  }));
  assert.match(html, /data-testid="ask-lean-headline"[^>]*>Yes — MuleSoft \(Salesforce\)</);
  assert.match(html, />MuleSoft Anypoint</);
  assert.match(html, />Salesforce CRM app</);
  assert.match(html, /The AI read your whole workspace and named these 2 items/);
  assert.doesNotMatch(html, /salesforce_mulesoft/);
});

test("owner Christine and a 'no' answer render from ids", () => {
  assert.match(render(payload({ headline: "Christine Wong owns Payroll", answer_text: "Christine Wong owns Payroll.", item_ids: ["pay"], items: [] })), />Payroll</);
  const no = render(payload({ headline: "No — nothing from Google", answer_text: "No.", yes_no: "no", item_ids: [], items: [] }));
  assert.match(no, />No — nothing from Google</);
  assert.doesNotMatch(no, /ask-records-table/);
});

test("labels file matches the API copy", () => {
  const api = JSON.parse(readFileSync("../api/app/data/ask_labels.json", "utf8"));
  const web = JSON.parse(readFileSync("lib/ask/ask-labels.json", "utf8"));
  assert.deepEqual(web, api);
});
