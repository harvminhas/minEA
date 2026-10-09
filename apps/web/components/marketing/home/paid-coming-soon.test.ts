/** Home page pricing: Starter/Team/Business are disabled "Coming soon" for everyone; Free unchanged. */
import assert from "node:assert/strict";
import { afterEach, before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let HomePage: typeof import("./HomePage.tsx").HomePage;
let PricingPlans: typeof import("../PricingPlans.tsx").PricingPlans;
let AuthContext: typeof import("../../../lib/auth-context.tsx").AuthContext;
before(async () => {
  ({ HomePage } = await import("./HomePage.tsx"));
  ({ PricingPlans } = await import("../PricingPlans.tsx"));
  ({ AuthContext } = await import("../../../lib/auth-context.tsx"));
});

const saved = process.env.NEXT_PUBLIC_BILLING_UI;
afterEach(() => {
  if (saved === undefined) delete process.env.NEXT_PUBLIC_BILLING_UI;
  else process.env.NEXT_PUBLIC_BILLING_UI = saved;
});

type AuthState = { isLoaded: boolean; isSignedIn: boolean } | null;
const STATES: [string, AuthState][] = [
  ["no provider (server render)", null],
  ["loading", { isLoaded: false, isSignedIn: false }],
  ["signed out", { isLoaded: true, isSignedIn: false }],
  ["signed in", { isLoaded: true, isSignedIn: true }],
];

function render(node: React.ReactElement, auth: AuthState, flag: string): string {
  process.env.NEXT_PUBLIC_BILLING_UI = flag;
  if (!auth) return renderToStaticMarkup(node);
  const value = auth as unknown as React.ContextType<typeof AuthContext>;
  return renderToStaticMarkup(React.createElement(AuthContext.Provider, { value }, node));
}

/** The markup of one pricing card (data-plan="<id>") up to the next card. */
function card(html: string, id: string): string {
  const start = html.indexOf(`data-plan="${id}"`);
  assert.ok(start >= 0, `card ${id} rendered`);
  const next = html.indexOf("data-plan=", start + 10);
  return html.slice(start, next < 0 ? undefined : next);
}

for (const [name, auth] of STATES) {
  test(`pricing cards, billing UI on, ${name}: packs disabled "Coming soon", prices visible`, () => {
    const html = render(React.createElement(PricingPlans), auth, "1");
    for (const [id, price] of [["starter", "$99"], ["team", "$449"], ["business", "$799"]] as const) {
      const c = card(html, id);
      assert.match(c, new RegExp(`<button type="button" disabled="" data-coming-soon="${id}"[^>]*>Coming soon</button>`));
      assert.ok(c.includes(price), `${id} price ${price} still shown`);
      assert.doesNotMatch(c, /<a /, `${id} has no link`);
      assert.doesNotMatch(c, /Get started/);
    }
    assert.equal((html.match(/>Coming soon</g) ?? []).length, 3);
    const free = card(html, "free");
    assert.doesNotMatch(free, /Coming soon/);
    if (auth?.isLoaded && auth.isSignedIn) assert.match(free, /href="\/home"[^>]*>Open BuboMap</);
    else assert.match(free, /href="\/auth\/sign-up"[^>]*>Start free</);
  });
}

for (const flag of ["0", "1"]) {
  for (const [name, auth] of STATES) {
    test(`home page, billing UI ${flag}, ${name}: no paid plan can be started from the page`, () => {
      const html = render(React.createElement(HomePage), auth, flag);
      // Nothing on the page links a paid pack to sign-up / the app other than Free and the CTAs.
      if (flag === "1") {
        assert.equal((html.match(/data-coming-soon="(starter|team|business)"[^>]*>Coming soon</g) ?? []).length, 3);
      } else {
        // Legacy pricing (flag off) has no Starter/Team/Business packs: Free + "Business: Talk to us" (sales contact).
        assert.doesNotMatch(html, /Coming soon/);
        assert.match(html, />Talk to us</);
      }
    });
  }
}
