/** Marketing CTAs: signed out (and loading) unchanged; signed in = one "Open BuboMap" to /home. */
import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let HomePage: typeof import("./HomePage.tsx").HomePage;
let HomeNav: typeof import("./HomeNav.tsx").HomeNav;
let visitor: typeof import("./visitor.tsx");
let AuthContext: typeof import("../../../lib/auth-context.tsx").AuthContext;
before(async () => {
  ({ HomePage } = await import("./HomePage.tsx"));
  ({ HomeNav } = await import("./HomeNav.tsx"));
  visitor = await import("./visitor.tsx");
  ({ AuthContext } = await import("../../../lib/auth-context.tsx"));
});

const saved = process.env.NEXT_PUBLIC_BILLING_UI;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BILLING_UI;
  else process.env.NEXT_PUBLIC_BILLING_UI = saved;
});

type AuthState = { isLoaded: boolean; isSignedIn: boolean } | null;

function render(node: React.ReactElement, auth: AuthState, billingFlag = "0"): string {
  process.env.NEXT_PUBLIC_BILLING_UI = billingFlag;
  if (!auth) return renderToStaticMarkup(node);
  // Only isLoaded / isSignedIn are read by the marketing CTAs.
  const value = auth as unknown as React.ContextType<typeof AuthContext>;
  return renderToStaticMarkup(React.createElement(AuthContext.Provider, { value }, node));
}

const home = (auth: AuthState, flag = "0") => render(React.createElement(HomePage), auth, flag);
const LOADING = { isLoaded: false, isSignedIn: false };
const SIGNED_OUT = { isLoaded: true, isSignedIn: false };
const SIGNED_IN = { isLoaded: true, isSignedIn: true };
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

test("visitor state from the auth context", () => {
  assert.equal(visitor.visitorFrom(null), "unknown");
  assert.equal(visitor.visitorFrom(LOADING), "unknown");
  assert.equal(visitor.visitorFrom({ isLoaded: false, isSignedIn: true }), "unknown");
  assert.equal(visitor.visitorFrom(SIGNED_OUT), "signed_out");
  assert.equal(visitor.visitorFrom(SIGNED_IN), "signed_in");
});

for (const flag of ["0", "1"]) {
  test(`signed out and loading render exactly today's page (billing UI ${flag})`, () => {
    const noProvider = home(null, flag); // what the server sends
    assert.equal(home(LOADING, flag), noProvider, "no flash while auth loads");
    assert.equal(home(SIGNED_OUT, flag), noProvider);
    assert.doesNotMatch(noProvider, /Open BuboMap/);
    assert.doesNotMatch(noProvider, /href="\/home"/);
    // nav + hero: Sign in; nav + hero + band: Get started free
    assert.equal(count(noProvider, /href="\/auth\/sign-in"/g), 2);
    assert.equal(count(noProvider, />Get started free</g), 3);
  });

  test(`signed in: every sign-up / sign-in CTA becomes Open BuboMap to /home (billing UI ${flag})`, () => {
    const html = home(SIGNED_IN, flag);
    assert.doesNotMatch(html, /href="\/auth\/sign-in"/);
    assert.doesNotMatch(html, /href="\/auth\/sign-up"/);
    assert.doesNotMatch(html, />Get started free</);
    assert.doesNotMatch(html, />Sign in</);
    // nav, hero, band, plus the Free plan card (paid packs read "Coming soon" for now)
    const planButtons = 1;
    assert.equal(count(html, /href="\/home"[^>]*>Open BuboMap</g), 3 + planButtons);
    assert.equal(count(html, />Open BuboMap</g), 3 + planButtons);
    // Hero shows ONE primary button.
    assert.match(html, /<div class="ctas" data-visitor="signed_in"><a class="btn btn-primary btn-lg" href="\/home">Open BuboMap<\/a><\/div>/);
    // "See pricing" and the Business "Get started" request link are not sign-up CTAs; they stay.
    assert.match(html, /href="#pricing">See pricing</);
    if (flag === "0") assert.match(html, /href="\/business\/get-started\?from=pricing"[^>]*>Get started</);
    assert.doesNotMatch(html, />Talk to us</);
  });
}

test("header alone: signed out keeps Sign in + Get started free; signed in shows one button", () => {
  const out = render(React.createElement(HomeNav), SIGNED_OUT);
  assert.match(out, /<div class="navright"><a class="link" href="\/auth\/sign-in">Sign in<\/a><a class="btn btn-primary btn-sm" href="\/auth\/sign-up">Get started free<\/a><\/div>/);
  assert.equal(render(React.createElement(HomeNav), LOADING), out);
  const signedIn = render(React.createElement(HomeNav), SIGNED_IN);
  assert.match(signedIn, /<div class="navright" data-visitor="signed_in"><a class="btn btn-primary btn-sm" href="\/home">Open BuboMap<\/a><\/div>/);
});

test("destination is /home, the post-sign-in route (last org/workspace, or onboarding without an org)", () => {
  assert.equal(visitor.APP_HREF, "/home");
  assert.equal(visitor.OPEN_APP_LABEL, "Open BuboMap");
});
