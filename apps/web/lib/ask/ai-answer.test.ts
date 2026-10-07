import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "../../../../packages/types/src/fixtures/ai-landscape.fixture.json";
import type { MinEAObject } from "@minea/types";
import type { AskModelPayload } from "../api-client.ts";
import { classifyIntent, isAiDataQuestion, isAiQuestion } from "./answerStrategies.ts";
import { answerFromModel, answerFromRecords } from "./deterministic.ts";
import { rowFromObject, type CatalogRow } from "../model-catalog.ts";
import { AI_CHIP, askChips } from "../reports/home.ts";
import { aiLandscape, dataAccess, type LandscapeEdge, type LandscapeObject } from "../ai/landscape.ts";

const BASE = "/orgs/acme/workspaces/default";
const sample = fixture as unknown as { objects: LandscapeObject[]; relationships: LandscapeEdge[] };
const rows = sample.objects.map((object) => rowFromObject(object as unknown as MinEAObject)).filter((row): row is CatalogRow => Boolean(row));

const ask = (question: string, landscape = sample) =>
  answerFromRecords({ question, rows, graph: { nodes: [], edges: [] }, basePath: BASE, landscape });

test("classifyIntent: AI questions are ai; bare model and outages are not", () => {
  assert.equal(classifyIntent(AI_CHIP), "ai");
  assert.equal(classifyIntent("Which agents have no owner?"), "ai");
  assert.equal(classifyIntent("Which AI can see customer data?"), "ai");
  assert.equal(classifyIntent("What do we spend on Copilot?"), "ai");
  assert.notEqual(classifyIntent("show me the model"), "ai");
  assert.notEqual(classifyIntent("what's in the model?"), "ai");
  assert.equal(classifyIntent("what breaks if copilot studio goes down"), "impact");
  assert.equal(classifyIntent("how important is the Sales Assistant agent?"), "importance");
  assert.equal(classifyIntent("What renews in the next 90 days?"), "renewals");
});

test("the chip question answers from aiLandscape with the §8 numbers, citations and the report link", () => {
  const answer = ask(AI_CHIP);
  assert.equal(answer.handler, "ai");
  assert.equal(
    answer.answerText,
    "You use AI in **14 places**: 6 features in your tools, 4 agents, and 4 AI platforms and models. **14 flags** (9 high), 4 unreviewed, $16,980 / yr on AI.",
  );
  assert.deepEqual(answer.link, { href: `${BASE}/reports/ai-landscape`, label: "Open Reports › AI landscape" });
  assert.equal(answer.evidence?.length, 3);
  assert.deepEqual(answer.evidence?.[0], {
    text: "Microsoft 365 Copilot (Microsoft 365): Microsoft 365 holds customer and financial data and this feature can see it.",
    citationIds: ["app-m365"],
  });
  const ids = answer.citations.map((item) => item.recordId);
  for (const id of answer.evidence!.flatMap((item) => item.citationIds)) assert.ok(ids.includes(id));
  const invoice = answer.citations.find((item) => item.recordId === "agent-invoice");
  assert.ok(invoice, "flagged agents are cited");
  assert.equal(invoice!.row.typeLabel, "AI Agent");
  assert.equal(invoice!.row.object.type, "agent");
  assert.match(invoice!.relationship, /F3 Agent has no owner/);
  assert.equal(answer.citations.find((item) => item.recordId === "app-m365")!.row.typeLabel, "Application");
  assert.ok(answer.gaps.some((gap) => gap.text === "4 AI features on 4 apps nobody has confirmed yet." && gap.fillHref === `${BASE}/reports/ai-landscape`));
  assert.ok(answer.followUps.length >= 2);
});

test("customer-data AI questions aren't swallowed by the unsupported guard", () => {
  assert.equal(ask("Which AI can see customer data?").handler, "ai");
});

test("no AI on the map: the §9 empty answer, with a gap that opens the report", () => {
  const answer = ask(AI_CHIP, { objects: [{ id: "x", type: "application", name: "Order Entry", status: "active", properties: {} }], relationships: [] });
  assert.equal(answer.handler, "ai");
  assert.equal(answer.answerText, "I don't see any AI in your map yet.");
  assert.equal(answer.gaps[0].fillHref, `${BASE}/reports/ai-landscape`);
});

test("without catalog objects the old fallback stands (no AI answer from rows alone)", () => {
  const answer = answerFromRecords({ question: AI_CHIP, rows, graph: { nodes: [], edges: [] }, basePath: BASE });
  assert.notEqual(answer.handler, "ai");
});

test("an LLM answer that used ai_landscape keeps the ai handler and links the report", () => {
  const payload: AskModelPayload = {
    source: "llm",
    fallback_reason: null,
    answer_text: "You use AI in 14 places.",
    intent: "ai",
    citations: [{ n: 1, record_id: "agent-invoice", name: "Invoice Reader", type_label: "AI Agent", kind: "AI Agent", owner: "", criticality: "", relationship: "F3" }],
    gaps: [],
    follow_ups: ["Which agents have no owner?"],
    tools_used: ["ai_landscape"],
  } as unknown as AskModelPayload;
  const answer = answerFromModel(payload, rows, BASE)!;
  assert.equal(answer.handler, "ai");
  assert.equal(answer.link?.href, `${BASE}/reports/ai-landscape`);
  assert.equal(answer.citations[0].row.object.type, "agent");
});

test("askChips adds the AI chip only when there is AI to ask about", () => {
  assert.ok(askChips(rows, [], new Date("2026-10-07T00:00:00Z"), sample.objects).includes(AI_CHIP));
  assert.ok(!askChips(rows, [], new Date("2026-10-07T00:00:00Z")).includes(AI_CHIP));
  assert.ok(!askChips(rows, [], new Date("2026-10-07T00:00:00Z"), [{ id: "x", type: "application", name: "Order Entry" }]).includes(AI_CHIP));
});

// --- Step G fix: intent routing and customer data ---

test("routing: only AI wording is the ai intent; a bare model is the architecture model", () => {
  // Unchanged routes.
  assert.equal(classifyIntent("What AI do we use and what can it touch?"), "ai");
  assert.equal(classifyIntent("Which agents have no owner?"), "ai");
  assert.equal(classifyIntent("What breaks if Microsoft 365 goes down?"), "impact");
  // "Model" on its own means the architecture model, BuboMap's main section, never AI.
  assert.notEqual(classifyIntent("Show me the model"), "ai");
  assert.notEqual(classifyIntent("open the model"), "ai");
  // Decision: "which models do we use" has no AI wording, so it is not AI either (consistent with the
  // bare-model rule). Asking about AI models needs the word: "which AI models do we use" is AI.
  assert.notEqual(classifyIntent("which models do we use"), "ai");
  assert.equal(classifyIntent("which AI models do we use"), "ai");
  assert.equal(classifyIntent("Which language models do we use?"), "ai");
  assert.equal(classifyIntent("Who uses GPT-4o?"), "ai");
  assert.equal(classifyIntent("Which LLMs do we pay for?"), "ai");
  assert.equal(classifyIntent("Where do we use Claude?"), "ai");
  assert.equal(isAiQuestion("Show me the model"), false);
  assert.equal(isAiQuestion("which models do we use"), false);
});

test("bare-model questions never get the AI answer or AI follow-ups", () => {
  for (const question of ["Show me the model", "open the model", "which models do we use"]) {
    const answer = ask(question);
    assert.notEqual(answer.handler, "ai", question);
    assert.equal(answer.link, undefined, question);
    assert.ok(!answer.followUps.some((item) => /\bAI\b|agent/i.test(item)), question);
  }
});

test("an LLM answer routed to ai_landscape for a question with no AI wording is dropped (local answer stands)", () => {
  const payload = {
    source: "llm",
    fallback_reason: null,
    answer_text: "I could not find any AI models or platforms.",
    intent: "ai",
    citations: [],
    gaps: [],
    follow_ups: ["What AI do we use and what can it touch?"],
    tools_used: ["ai_landscape"],
  } as unknown as AskModelPayload;
  assert.equal(answerFromModel(payload, rows, BASE, "Show me the model"), null);
  assert.equal(answerFromModel(payload, rows, BASE, "which models do we use"), null);
  assert.equal(answerFromModel(payload, rows, BASE, "which AI models do we use")?.handler, "ai");
});

/** The live case: Microsoft 365 has no Holds data, Copilot can see company data, QA Agent reads Microsoft 365. */
const noCustomerData = {
  objects: [
    {
      id: "app-m365",
      type: "application",
      name: "Microsoft 365",
      status: "active",
      properties: {
        category: "Productivity",
        ai_features: [{ key: "m365-copilot", name: "Microsoft 365 Copilot", status: "on", audience: "everyone", sees_company_data: "yes", vendor_trains: "no" }],
      },
    },
    { id: "agent-qa", type: "agent", name: "QA Agent", status: "active", owner: "IT", properties: {} },
  ] as LandscapeObject[],
  relationships: [{ id: "r1", type: "reads", from_object_id: "agent-qa", to_object_id: "app-m365" }] as LandscapeEdge[],
};

test("customer data: company data and an agent reading an app are not customer data (F1 rule only)", () => {
  const liveRows = noCustomerData.objects.map((object) => rowFromObject(object as unknown as MinEAObject)).filter((row): row is CatalogRow => Boolean(row));
  const answer = answerFromRecords({ question: "Which AI can see customer data?", rows: liveRows, graph: { nodes: [], edges: [] }, basePath: BASE, landscape: noCustomerData });
  assert.equal(answer.handler, "ai");
  assert.equal(answer.answerText, "**Nothing recorded holds customer or financial data**, so no AI is flagged as seeing it.");
  assert.deepEqual(
    answer.evidence?.map((item) => item.text),
    [
      "Separately, Microsoft 365 Copilot (Microsoft 365) and QA Agent can see company data. That is not the same as customer data.",
      "Microsoft 365 has no Holds data recorded, so we can't tell if it holds customer data.",
    ]
  );
  assert.ok(!answer.evidence!.some((item) => /can see customer/i.test(item.text)));
  assert.deepEqual(answer.gaps, [{ text: "Add what Microsoft 365 holds (Holds data).", fillHref: `${BASE}/model/applications/app-m365` }]);
  const ids = answer.citations.map((item) => item.recordId);
  for (const id of answer.evidence!.flatMap((item) => item.citationIds)) assert.ok(ids.includes(id));
  // Financial and personal data questions use the same rule.
  assert.equal(answerFromRecords({ question: "Which AI can see financial data?", rows: liveRows, graph: { nodes: [], edges: [] }, basePath: BASE, landscape: noCustomerData }).answerText, answer.answerText);
  assert.equal(answerFromRecords({ question: "Does any AI touch personal data?", rows: liveRows, graph: { nodes: [], edges: [] }, basePath: BASE, landscape: noCustomerData }).answerText, answer.answerText);
  // Once Microsoft 365's Holds data says customer, both are flagged.
  const holds = structuredClone(noCustomerData);
  holds.objects[0].properties = { ...holds.objects[0].properties, holds_data: ["customer"] };
  const flagged = answerFromRecords({ question: "Which AI can see customer data?", rows: liveRows, graph: { nodes: [], edges: [] }, basePath: BASE, landscape: holds });
  assert.equal(flagged.answerText, "**AI can see customer or financial data in 2 places**, going by what each app's Holds data says.");
  assert.equal(flagged.gaps.length, 0);
});

test("customer data on the fixture: the F1 items, then company-only AI and stores with no Holds data", () => {
  const access = dataAccess(aiLandscape(sample), sample.objects, sample.relationships);
  // Same values as test_data_access_on_the_fixture_matches_typescript in apps/api/tests/test_ai_landscape.py.
  assert.deepEqual(access, {
    customer: ["app-m365:m365-copilot", "app-salesforce:salesforce-agentforce", "app-zendesk:zendesk-copilot", "agent-ap", "agent-invoice", "agent-sales"],
    check: [],
    companyOnly: ["app-notion:notion-ai", "app-zoom:zoom-ai-companion", "agent-quote"],
    noHoldsData: ["app-notion", "ds-pricebook", "app-zoom"],
  });
  const answer = ask("Which AI can see customer data?");
  assert.equal(answer.answerText, "**AI can see customer or financial data in 6 places**, going by what each app's Holds data says.");
  assert.equal(answer.evidence?.[0].text, "Microsoft 365 Copilot (Microsoft 365): Microsoft 365 holds customer and financial data and this feature can see it.");
  assert.equal(answer.evidence?.at(-2)?.text, "Separately, Notion AI (Notion), Zoom AI Companion (Zoom), and Quote Builder can see company data. That is not the same as customer data.");
  assert.equal(answer.evidence?.at(-1)?.text, "Notion, Price book, and Zoom have no Holds data recorded, so we can't tell if they hold customer data.");
});

test("isAiDataQuestion: customer, financial and personal data questions about AI", () => {
  assert.ok(isAiDataQuestion("Which AI can see customer data?"));
  assert.ok(isAiDataQuestion("Can Copilot read customer or financial data?"));
  assert.ok(isAiDataQuestion("Which agents touch personal data?"));
  assert.ok(!isAiDataQuestion(AI_CHIP));
  assert.ok(!isAiDataQuestion("Which apps hold customer data?"));
});
