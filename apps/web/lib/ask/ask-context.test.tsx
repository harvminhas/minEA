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

test("a fresh answer animates: headline word by word, rows fill in; without animate it renders plain", () => {
  const ai = answerFromModel(payload({ headline: "Yes — MuleSoft (Salesforce)", answer_text: "Yes.", yes_no: "yes", item_ids: ["crm"], items: [] }), ROWS, "/w", "q")!;
  const props = { answer: ai, facts: FACTS, onFilters: () => {}, onOpen: () => {}, rowHref: (row: CatalogRow) => `/w/r/${row.id}` };
  const animated = renderToStaticMarkup(<AskRecordsBlock {...props} animate />);
  assert.equal(animated.match(/class="ask-word"/g)!.length, 4);
  assert.match(animated, /ask-row-in/);
  const plain = renderToStaticMarkup(<AskRecordsBlock {...props} />);
  assert.doesNotMatch(plain, /ask-word|ask-row-in/);
});

test("animated headline keeps its spaces (inline-block words with the space outside)", () => {
  const ai = answerFromModel(payload({ headline: "We have 10 Applications from 5 vendors.", answer_text: "x", item_ids: ["crm"], items: [] }), ROWS, "/w", "q")!;
  const html = renderToStaticMarkup(<AskRecordsBlock answer={ai} facts={FACTS} onFilters={() => {}} onOpen={() => {}} rowHref={(row) => `/w/r/${row.id}`} animate />);
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)![1];
  const textContent = h2.replace(/<[^>]+>/g, "");
  assert.equal(textContent, "We have 10 Applications from 5 vendors.");
  assert.doesNotMatch(h2, /<span class="ask-word"[^>]*>[^<]*\s<\/span>/); // no trailing space inside an inline-block
});

test("compact summary: one line with kinds, cost and gaps; chips + filters only under Details", () => {
  const ai = answerFromModel(payload({ headline: "Microsoft items", answer_text: "x", filters: { vendor: "Microsoft" } }), ROWS, "/w", "q")!;
  const props = { answer: ai, facts: FACTS, onFilters: () => {}, onOpen: () => {}, rowHref: (row: CatalogRow) => `/w/r/${row.id}` };
  const collapsed = renderToStaticMarkup(<AskRecordsBlock {...props} extraSummary={["5 vendors"]} />);
  const line = collapsed.match(/data-testid="ask-summary"[^>]*>([\s\S]*?)<\/div>/)![1].replace(/<[^>]+>/g, "");
  assert.match(line, /^1 SaaS platform·1 Application·5 vendors·⚠ 2 no owner·⚠ 2 no cost·1 filterDetails ▾$/);
  assert.doesNotMatch(collapsed, /ask-lean-chips|ask-filter-chips/);
  assert.match(collapsed, /ask-records-table/);
  const open = renderToStaticMarkup(<AskRecordsBlock {...props} defaultDetails />);
  assert.match(open, /ask-lean-chips/);
  assert.match(open, /ask-filter-chips/);
  assert.match(open, /Hide details/);
});

test("item-card answers: headline, summary line, table; the AI's prose is folded under Show summary", () => {
  const ai = answerFromModel(payload({ headline: "Microsoft items", answer_text: "x", filters: { vendor: "Microsoft" } }), ROWS, "/w", "q")!;
  const props = { answer: ai, facts: FACTS, onFilters: () => {}, onOpen: () => {}, rowHref: (row: CatalogRow) => `/w/r/${row.id}`, prose: <ul><li>4 Applications from Microsoft</li></ul> };
  const closed = renderToStaticMarkup(<AskRecordsBlock {...props} />);
  const at = (html: string, id: string) => html.indexOf(`data-testid="${id}"`);
  assert.ok(at(closed, "ask-lean-headline") < at(closed, "ask-summary"));
  assert.ok(at(closed, "ask-summary") < at(closed, "ask-prose-toggle"));
  assert.ok(at(closed, "ask-prose-toggle") < at(closed, "ask-records-table"));
  assert.match(closed, /Show summary/);
  assert.doesNotMatch(closed, /4 Applications from Microsoft/);
  const open = renderToStaticMarkup(<AskRecordsBlock {...props} defaultProse />);
  assert.match(open, /Hide summary/);
  assert.ok(at(open, "ask-prose-body") < at(open, "ask-records-table"));
  assert.match(open, /4 Applications from Microsoft/);
  assert.doesNotMatch(renderToStaticMarkup(<AskRecordsBlock {...props} prose={null} />), /ask-prose/);
});

test("the server's timing summary reaches the answer", () => {
  const ai = answerFromModel(payload({ headline: "h", answer_text: "x", item_ids: ["crm"], items: [], timing: { summary: "Took 1.0s: AI 1 call 0.9s" } } as never), ROWS, "/w", "q")!;
  assert.equal(ai.timingLine, "Took 1.0s: AI 1 call 0.9s");
});

test("How this was worked out shows the server's timing line under the steps", async () => {
  const { AskSteps } = await import("../../components/mvp/AskSteps");
  const steps = [{ id: "estate", status: "done" as const, label: "Read your estate" }];
  const html = renderToStaticMarkup(<AskSteps steps={steps} timing="Took 6.2s: workspace 0.3s · AI 2 calls 5.1s · lookups 0.2s · check 0.1s" />);
  assert.match(html, /data-testid="ask-timing"[^>]*>Took 6\.2s: workspace 0\.3s · AI 2 calls 5\.1s · lookups 0\.2s · check 0\.1s</);
  assert.doesNotMatch(renderToStaticMarkup(<AskSteps steps={steps} />), /ask-timing/);
});
