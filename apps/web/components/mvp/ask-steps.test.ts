import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let AskSteps: typeof import("./AskSteps.tsx").AskSteps;
let answerFromModel: typeof import("../../lib/ask/deterministic.ts").answerFromModel;
before(async () => {
  ({ AskSteps } = await import("./AskSteps.tsx"));
  ({ answerFromModel } = await import("../../lib/ask/deterministic.ts"));
});

const STEPS = [
  { id: "estate", status: "done" as const, label: "Read your estate: 16 Applications and 1 On-prem server" },
  { id: "tool-1", status: "done" as const, label: "Found 14 with renewal dates; 6 Applications renew in the next 90 days, $210,000 a year", tool: "aggregate" },
  { id: "tool-2", status: "error" as const, label: "Couldn't find that item in this workspace", tool: "impact_of" },
];

test("renders each real step with its status", () => {
  const html = renderToStaticMarkup(React.createElement(AskSteps, { steps: STEPS }));
  assert.match(html, /How this was worked out · 3 steps/);
  assert.match(html, /6 Applications renew in the next 90 days, \$210,000 a year/);
  assert.match(html, /data-step="tool-2" data-status="error"/);
});

test("model payload steps reach the answer; older APIs without steps still work", () => {
  const payload = {
    source: "llm" as const,
    fallback_reason: null,
    answer_text: "6 Applications renew in the next 90 days.",
    citations: [],
    gaps: [],
    follow_ups: ["What can we cancel?"],
    tools_used: ["aggregate"],
    intent: "renewals",
  };
  const withSteps = answerFromModel({ ...payload, steps: STEPS }, [], "/b", "What renews in the next 90 days?");
  assert.equal(withSteps?.steps?.length, 3);
  const old = answerFromModel(payload, [], "/b", "What renews in the next 90 days?");
  assert.ok(old);
  assert.equal(old.steps, undefined);
});
