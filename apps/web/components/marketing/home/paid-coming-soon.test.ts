/** Home page pricing: Free is the highlighted start; Starter has a working "Get Starter"; Business opens the form. */
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
  test(`pricing cards, billing UI on, ${name}: Free highlighted, Get Starter enabled, Business Get started with no price`, () => {
    const html = render(React.createElement(PricingPlans), auth, "1");
    assert.deepEqual([...html.matchAll(/data-plan="([a-z]+)"/g)].map((m) => m[1]), ["free", "starter", "business"]);
    const starter = card(html, "starter");
    const starterHref = auth?.isLoaded && auth.isSignedIn ? "/home?plan=starter" : "/auth/sign-up?redirect_url=%2Fhome%3Fplan%3Dstarter";
    assert.ok(starter.includes(`href="${starterHref.replace(/&/g, "&amp;")}"`), `Starter goes to ${starterHref}`);
    assert.match(starter, /data-get-started="starter"[^>]*>Get Starter<\/a>/);
    assert.match(starter, /data-testid="starter-nudge"[^>]*>Most teams start on Free/);
    assert.ok(starter.includes("$149"), "Starter price shown");
    assert.match(starter, /Billed monthly/);
    // Monthly only: no yearly price, no billing-period toggle on the page.
    assert.doesNotMatch(html, /\$99|\$990|\/year|Yearly|months free|aria-label="Billing period"/);
    assert.doesNotMatch(html, /Coming soon|disabled=""/);
    const business = card(html, "business");
    assert.doesNotMatch(business, /\$/, "Business shows no price");
    assert.match(business, /Starting from 5 licences/);
    assert.match(business, /4 hours of onboarding consulting/);
    assert.match(business, /invoice or card/i);
    assert.match(business, /Annual invoicing available/);
    // Enabled, for signed-out visitors too; opens the form (no link to checkout or sign-up).
    assert.match(business, /<button type="button" data-get-started="business"[^>]*>Get started<\/button>/);
    assert.doesNotMatch(business, /<a |disabled=""/);
    assert.doesNotMatch(html, /contact sales|talk to us|sales call/i);
    const free = card(html, "free");
    assert.match(free, /Start here/);
    assert.match(free, /bg-indigo-600/, "Free has the primary button");
    assert.doesNotMatch(starter, /bg-indigo-600/);
    if (auth?.isLoaded && auth.isSignedIn) assert.match(free, /href="\/home"[^>]*>Open BuboMap</);
    else assert.match(free, /href="\/auth\/sign-up"[^>]*>Start free</);
  });
}

for (const flag of ["0", "1"]) {
  for (const [name, auth] of STATES) {
    test(`home page, billing UI ${flag}, ${name}: only Starter starts a paid plan from the page`, () => {
      const html = render(React.createElement(HomePage), auth, flag);
      // Nothing on the page links a paid pack to sign-up / the app other than Free and the CTAs.
      if (flag === "1") {
        assert.equal((html.match(/data-get-started="starter"[^>]*>Get Starter</g) ?? []).length, 1);
        assert.doesNotMatch(html, /Coming soon/);
        // Business never checks out from the page: it opens the Get started form.
        assert.equal((html.match(/data-get-started="business"/g) ?? []).length, 1);
      } else {
        // Legacy pricing (flag off): Free + Business, whose Get started goes to the request form.
        assert.doesNotMatch(html, /Coming soon/);
        assert.doesNotMatch(html, />Talk to us</);
        assert.match(html, /data-get-started="business"[^>]*>Get started</);
      }
    });
  }
}
