import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ANSWERS, TRY_CHIPS, revealPlan, type AnswerKey } from "./ask-demo-data.ts";
import { footerLinks } from "./footer-links.ts";

// Under tsx the components compile with the classic JSX runtime (tsconfig has jsx: preserve),
// so React must be global before they load.
(globalThis as { React?: typeof React }).React = React;
let AnswerView: typeof import("./AskAnswer.tsx").AnswerView;
let HeroAsk: typeof import("./HeroAsk.tsx").HeroAsk;
let HomePage: typeof import("./HomePage.tsx").HomePage;
before(async () => {
  ({ AnswerView } = await import("./AskAnswer.tsx"));
  ({ HeroAsk } = await import("./HeroAsk.tsx"));
  ({ HomePage } = await import("./HomePage.tsx"));
});

const saved = process.env.NEXT_PUBLIC_BILLING_UI;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BILLING_UI;
  else process.env.NEXT_PUBLIC_BILLING_UI = saved;
});

function renderHome(flag: string): string {
  process.env.NEXT_PUBLIC_BILLING_UI = flag;
  return renderToStaticMarkup(React.createElement(HomePage));
}

const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

const FIFTEEN_MIN = /15[\s\u00a0-]*min/i;

test("hero renders: headline, CTAs to the real auth routes, the M365 answer and five chips", () => {
  const html = renderHome("0");
  assert.match(html, /<h1 class="bm-h1">Ask your IT estate <span class="grad">anything\.<\/span><\/h1>/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1);
  assert.match(html, /href="\/auth\/sign-up"/);
  assert.match(html, /href="\/auth\/sign-in"/);
  const t = text(html);
  assert.match(t, /What breaks if Microsoft 365 goes down\?|Microsoft 365/);
  assert.match(t, /can’t sign in \(they sign in with Microsoft 365\)/);
  assert.doesNotMatch(t, /entra/i);
  const chips = html.match(/class="qchip"[^>]*>[^<]+/g) ?? [];
  assert.equal(chips.length, 5);
  assert.ok(chips.every((c) => c.includes('aria-pressed="false"')));
  for (const h of ["Your map, ", "The answers you need every month, ", "One map. Three kinds of question.", "Priced for teams without EA departments."]) {
    assert.ok(t.includes(h), h);
  }
  assert.match(t, /LeanIX and Ardoq price out most SMB teams/);
});

test("server render lays out the first answer hidden, so animating it doesn't shift the page", () => {
  const html = renderToStaticMarkup(React.createElement(HeroAsk, { copy: null }));
  assert.match(html, /class="ans-body anim" data-phase="intro"/);
  assert.match(html, /class="think"/);
  assert.doesNotMatch(html, /class="[^"]*\brv in\b/);
  assert.match(text(html), /5 things stop or slow down, 3 of them critical/);
});

test("chips switch the answer: each chip's answer renders with its chip pressed", () => {
  for (const key of TRY_CHIPS) {
    const html = renderToStaticMarkup(React.createElement(HeroAsk, { copy: null, initialKey: key }));
    const t = text(html);
    assert.ok(t.includes(ANSWERS[key].q), key);
    assert.match(html, new RegExp(`data-q="${key}" aria-pressed="true"`));
    assert.equal((html.match(/aria-pressed="true"/g) ?? []).length, 1, key);
    assert.doesNotMatch(html, /class="think"/, "no thinking overlay once shown");
    assert.doesNotMatch(t, /can’t sign in \(they sign in/, `${key} still shows the M365 answer`);
  }
  const ren = text(renderToStaticMarkup(React.createElement(HeroAsk, { copy: null, initialKey: "renewals" })));
  assert.match(ren, /4 contracts renew in the next 90 days, worth \$193,800 a year\./);
  const sf = text(renderToStaticMarkup(React.createElement(HeroAsk, { copy: null, initialKey: "salesforce" })));
  assert.match(sf, /won quotes stop reaching NetSuite/);
});

test("answer markup numbers its parts exactly as the reveal plan", () => {
  for (const key of Object.keys(ANSWERS) as AnswerKey[]) {
    const a = ANSWERS[key];
    const plan = revealPlan(a);
    const html = renderToStaticMarkup(
      React.createElement(AnswerView, { a, animating: true, revealed: plan.length, hl: null, ownerSet: false, note: "" }),
    );
    const units = html.match(/class="[^"]*\b(rv|rvr)( in)?"/g) ?? [];
    assert.equal(units.length, plan.length, key);
    assert.equal(units.filter((u) => u.includes(" in")).length, plan.length, key);
    const none = renderToStaticMarkup(
      React.createElement(AnswerView, { a, animating: true, revealed: 0, hl: null, ownerSet: false, note: "" }),
    );
    assert.doesNotMatch(none, /\b(rv|rvr) in"/, key);
  }
});

test("no '15 minute' claim anywhere on the page or in its source", () => {
  for (const flag of ["0", "1"]) assert.doesNotMatch(text(renderHome(flag)), FIFTEEN_MIN);
  for (const key of Object.keys(ANSWERS) as AnswerKey[]) {
    const html = renderToStaticMarkup(React.createElement(HeroAsk, { copy: null, initialKey: key }));
    assert.doesNotMatch(text(html), FIFTEEN_MIN);
  }
  const dir = __dirname;
  for (const f of readdirSync(dir).filter((n) => !n.endsWith(".test.ts"))) {
    assert.doesNotMatch(readFileSync(join(dir, f), "utf8"), FIFTEEN_MIN, f);
  }
});

test("pricing, flag off: live pricing copy, Business Get started instead of Talk to us", () => {
  const html = renderHome("0");
  const t = text(html);
  assert.equal((html.match(/id="pricing"/g) ?? []).length, 1);
  for (const s of [
    "Simple pricing",
    "Start free. Upgrade when your team is ready.",
    "$0 forever",
    "Everything one person needs to map an architecture.",
    "All views — heatmap, journeys, investments, tech debt",
    "Starting from 5 licences",
    "For teams that run on their architecture model.",
    "AI architecture chat",
    "4 hours of onboarding consulting included",
    "Get started",
    "Free for individuals — no credit card required.",
  ]) {
    assert.ok(t.includes(s), s);
  }
  assert.match(html, /href="\/business\/get-started\?from=pricing"[^>]*>Get started</);
  assert.doesNotMatch(t, /Talk to us|Contact us|contact sales/i);
  assert.doesNotMatch(html, /interest=business/);
  assert.doesNotMatch(t, /Taxes may apply|Starter|per month/);
});

test("pricing, flag on: the plan cards, no sales copy", () => {
  const html = renderHome("1");
  const t = text(html);
  assert.equal((html.match(/id="pricing"/g) ?? []).length, 1);
  assert.ok(t.includes("Prices in USD. Taxes may apply."));
  for (const plan of ["Free", "Starter", "Business"]) assert.ok(t.includes(plan), plan);
  assert.doesNotMatch(html, /data-plan="team"/);
  assert.doesNotMatch(t, /contact sales|sales call/i);
  assert.ok(t.includes("Start free — no credit card required."));
  assert.doesNotMatch(t, /Talk to us|Guided onboarding|Contact us/);
  assert.doesNotMatch(html, /interest=business/);
});

test("footer: Contact, Privacy and Terms link to their pages; env can override", () => {
  assert.deepEqual(footerLinks({}), [
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "/terms" },
  ]);
  assert.deepEqual(footerLinks({ privacy: " ", terms: " https://example.com/terms " }), [
    { label: "Contact", href: "/contact" },
    { label: "Privacy", href: "/privacy" },
    { label: "Terms", href: "https://example.com/terms" },
  ]);
  const html = renderHome("0");
  assert.match(
    html,
    /<nav aria-label="Footer"><a href="\/contact">Contact<\/a><a href="\/privacy">Privacy<\/a><a href="\/terms">Terms<\/a><\/nav>/
  );
});
