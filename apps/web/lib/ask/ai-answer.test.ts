import assert from "node:assert/strict";
import { test } from "node:test";
import fixture from "../../../../packages/types/src/fixtures/ai-landscape.fixture.json";
import type { MinEAObject } from "@minea/types";
import type { AskModelPayload } from "../api-client.ts";
import { classifyIntent } from "./answerStrategies.ts";
import { answerFromModel, answerFromRecords } from "./deterministic.ts";
import { rowFromObject, type CatalogRow } from "../model-catalog.ts";
import { AI_CHIP, askChips } from "../reports/home.ts";
import type { LandscapeEdge, LandscapeObject } from "../ai/landscape.ts";

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
