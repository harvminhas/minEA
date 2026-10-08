import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANSWERS,
  ANSWER_KEYS,
  INITIAL_DEMO_STATE,
  RECORDS,
  TRY_CHIPS,
  demoReducer,
  isAnimating,
  isAnswerKey,
  parseRich,
  plainText,
  revealPlan,
  routeQuestion,
  showsThinking,
  spendLabel,
  spendPercent,
} from "./ask-demo-data.ts";

test("hero answer: M365 outage, sign-in dependency, no Entra ID", () => {
  const a = ANSWERS.m365;
  assert.equal(a.q, "What breaks if Microsoft 365 goes down?");
  const text = plainText(a, a.text);
  assert.match(text, /Salesforce and NetSuite can’t sign in \(they sign in with Microsoft 365\)/);
  for (const k of ANSWER_KEYS) {
    const ans = ANSWERS[k];
    const all = [ans.q, ans.text, ans.meta, ans.ctx ?? "", ...ans.gaps, JSON.stringify(ans.vis)].join(" ");
    assert.doesNotMatch(all, /entra/i, `${k} mentions Entra`);
  }
  for (const r of Object.values(RECORDS)) assert.doesNotMatch(JSON.stringify(r), /entra/i);
});

test("five try chips, in the mockup's order, each with its own answer", () => {
  assert.deepEqual(TRY_CHIPS, ["renewals", "spend", "owners", "ai", "salesforce"]);
  assert.deepEqual(
    TRY_CHIPS.map((k) => ANSWERS[k].q),
    [
      "What renews in the next 90 days?",
      "Where is our money going?",
      "What has no owner?",
      "Which AI can see customer data?",
      "What breaks if Salesforce goes down?",
    ],
  );
  assert.ok(!TRY_CHIPS.includes("m365"), "the hero question is not a chip");
});

test("every cited and linked record exists, and citations number in order", () => {
  for (const k of ANSWER_KEYS) {
    const a = ANSWERS[k];
    for (const id of a.cites) assert.ok(id in RECORDS, `${k}: ${id}`);
    const segs = parseRich(a, a.text);
    const refs = JSON.stringify(segs).match(/"n":\d+/g) ?? [];
    assert.ok(refs.length > 0, `${k} cites something`);
    assert.ok(!refs.includes('"n":0'), `${k} links a record it doesn't cite`);
  }
  assert.deepEqual(parseRich(ANSWERS.m365, "email{=exchange} stops"), [
    { t: "text", v: "email" },
    { t: "cite", id: "exchange", n: 2 },
    { t: "text", v: " stops" },
  ]);
  const ctx = parseRich(ANSWERS.ai, ANSWERS.ai.ctx!);
  assert.deepEqual(ctx.at(-2), { t: "link", label: "AI landscape", href: "#reports" });
});

test("free-typed questions route to sample answers or to the demo note", () => {
  assert.equal(routeQuestion("Which contracts expire soon?"), "renewals");
  assert.equal(routeQuestion("what's our SaaS spend"), "spend");
  assert.equal(routeQuestion("Which AI tools touch customer data?"), "ai");
  assert.equal(routeQuestion("What has nobody looking after it?"), "owners");
  assert.equal(routeQuestion("If the CRM dies what happens"), "salesforce");
  assert.equal(routeQuestion("What if Outlook is down"), "m365");
  assert.equal(routeQuestion("Who doesn't own anything?"), "owners");
  // "down" must not read as "own": the hero and chip questions route to themselves.
  for (const k of Object.keys(ANSWERS) as Array<keyof typeof ANSWERS>) assert.equal(routeQuestion(ANSWERS[k].q), k);
  assert.equal(routeQuestion("How tall is the CEO?"), null);
});

test("demo state: a chip switches the answer and animates it in", () => {
  let s = INITIAL_DEMO_STATE;
  assert.equal(s.key, "m365");
  assert.ok(isAnimating(s) && showsThinking(s), "first answer starts hidden behind the thinking state");

  s = demoReducer(s, { type: "start", key: "renewals" });
  assert.equal(s.key, "renewals");
  assert.equal(s.phase, "typing");
  assert.equal(s.revealed, 0);
  s = demoReducer(s, { type: "type", text: "What renews" });
  assert.equal(s.typed, "What renews");
  s = demoReducer(s, { type: "think", step: 1 });
  assert.equal(s.status, "Working on “What renews in the next 90 days?”");
  assert.ok(showsThinking(s));
  s = demoReducer(s, { type: "reveal", count: 3 });
  assert.ok(isAnimating(s) && !showsThinking(s));
  assert.equal(s.revealed, 3);
  s = demoReducer(s, { type: "finish" });
  assert.equal(s.phase, "static");
  assert.ok(!isAnimating(s));

  const shown = demoReducer(s, { type: "show", key: "spend" });
  assert.deepEqual(
    { key: shown.key, phase: shown.phase, typed: shown.typed },
    { key: "spend", phase: "static", typed: "Where is our money going?" },
  );
});

test("demo state: typing over the animation stops it; unknown questions show the note", () => {
  let s = demoReducer(INITIAL_DEMO_STATE, { type: "start", key: "owners" });
  s = demoReducer(s, { type: "edit", text: "hello" });
  assert.equal(s.phase, "static");
  assert.equal(s.key, "owners");
  s = demoReducer(s, { type: "note", question: "How tall is the CEO?" });
  assert.equal(s.key, null);
  assert.equal(s.phase, "note");
});

test("reveal plan covers every answer part", () => {
  assert.equal(revealPlan(ANSWERS.m365).length, 2 + 1 + 5 + 1 + 1 + 1); // text, meta, table+5 rows, sources, gaps, foot
  assert.equal(revealPlan(ANSWERS.owners).length, 2 + 1 + 6 + 1 + 1 + 1 + 1); // + fix, ctx; no gaps
  assert.equal(revealPlan(ANSWERS.renewals).length, 2 + 4 + 1 + 1 + 1 + 1);
});

test("spend bars", () => {
  assert.equal(spendPercent(138000, 138000), 100);
  assert.equal(spendPercent(1000, 138000), 3);
  assert.equal(spendLabel(27600), "$27.6K");
  assert.equal(spendLabel(52000), "$52K");
  assert.ok(isAnswerKey("ai") && !isAnswerKey("toString"));
});
