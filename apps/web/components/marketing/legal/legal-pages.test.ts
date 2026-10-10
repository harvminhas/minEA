import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

(globalThis as { React?: typeof React }).React = React;
let Privacy: () => React.ReactElement;
let Terms: () => React.ReactElement;
let LegalNotice: () => React.ReactElement;
before(async () => {
  Privacy = (await import("../../../app/privacy/page.tsx")).default;
  Terms = (await import("../../../app/terms/page.tsx")).default;
  ({ LegalNotice } = await import("../../auth/LegalNotice.tsx"));
});

const text = (el: React.ReactElement) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

test("privacy: date, contact, PIPEDA/GDPR/CCPA, subprocessors, cookies, retention", () => {
  const t = text(React.createElement(Privacy));
  for (const s of [
    "Last updated: October 10, 2026",
    "architect@bubomap.com",
    "PIPEDA",
    "GDPR",
    "CCPA",
    "Customers own their Customer Data",
    "Vercel",
    "Google Cloud",
    "Firebase Authentication",
    "Gemini",
    "Stripe",
    "Resend",
    "never touch our servers",
    "third-party analytics",
    "Retention and deletion",
  ]) assert.ok(t.includes(s), s);
});

test("terms: plans, renewal, no refunds, disclaimers, liability cap, indemnity, Ontario law", () => {
  const t = text(React.createElement(Terms));
  for (const s of [
    "Last updated: October 10, 2026",
    "US$149 per month",
    "4 hours of onboarding consulting",
    "renew automatically",
    "partial periods",
    '"as is" and "as available"',
    "loss of profits",
    "loss, corruption or unavailability of data",
    "twelve (12) months",
    "one hundred US dollars (US$100)",
    "indemnify",
    "backups",
    "not professional advice",
    "Acceptable use",
    "Suspension and termination",
    "Changes to these Terms",
    "the laws of the Province of Ontario and the federal laws of Canada applicable therein",
  ]) assert.ok(t.includes(s), s);
});

test("both pages note they were drafted without legal review", () => {
  for (const f of ["../../../app/privacy/page.tsx", "../../../app/terms/page.tsx"]) {
    assert.match(readFileSync(new URL(f, import.meta.url), "utf8"), /drafted without legal review/);
  }
});

test("sign-in / sign-up notice links Terms and Privacy", () => {
  const html = renderToStaticMarkup(React.createElement(LegalNotice));
  assert.match(html, /href="\/terms"[^>]*>Terms of Service</);
  assert.match(html, /href="\/privacy"[^>]*>Privacy Policy</);
  for (const m of ["in", "up"]) {
    const src = readFileSync(new URL(`../../../app/auth/sign-${m}/[[...sign-${m}]]/page.tsx`, import.meta.url), "utf8");
    assert.match(src, /<LegalNotice \/>/);
  }
});

test("public marketing pages skip the app boot loader (open signed out)", () => {
  const src = readFileSync(new URL("../../ui/AppBootGate.tsx", import.meta.url), "utf8");
  const list = src.match(/PUBLIC_MARKETING_PATHS[^=]*=\s*\[([^\]]*)\]/)?.[1] ?? "";
  for (const p of ["/contact", "/privacy", "/terms", "/business/get-started"]) assert.ok(list.includes(`"${p}"`), p);
});
