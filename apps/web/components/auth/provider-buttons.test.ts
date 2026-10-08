import assert from "node:assert/strict";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let mod: typeof import("./ProviderButtons.tsx");
before(async () => {
  mod = await import("./ProviderButtons.tsx");
});

test("Google and Microsoft buttons side by side with the same wording", () => {
  const html = renderToStaticMarkup(React.createElement(mod.ProviderButtons, { busy: null, onSelect: () => {} }));
  assert.match(html, /data-provider="google"[\s\S]*Continue with Google/);
  assert.match(html, /data-provider="microsoft"[\s\S]*Continue with Microsoft/);
  // Microsoft's four-square logo colours
  for (const colour of ["#F25022", "#7FBA00", "#00A4EF", "#FFB900"]) assert.ok(html.includes(colour), colour);
});

test("buttons lock while a sign-in runs", () => {
  const html = renderToStaticMarkup(React.createElement(mod.ProviderButtons, { busy: "microsoft", onSelect: () => {} }));
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
  assert.match(html, /animate-spin/);
});

test("account-exists highlights the way in and explains it", () => {
  const html = renderToStaticMarkup(
    React.createElement(React.Fragment, null,
      React.createElement(mod.ProviderButtons, { busy: null, highlight: ["google"], onSelect: () => {} }),
      React.createElement(mod.ExistingAccountPanel, {
        advice: { message: "pat@contoso.com already has a BuboMap account that signs in with Google.", options: ["google"] },
      })
    )
  );
  assert.match(html, /data-provider="google"[^>]*ring-2/);
  assert.doesNotMatch(html, /data-provider="microsoft"[^>]*ring-2/);
  assert.match(html, /data-testid="existing-account"/);
});

test("password users note", () => {
  const html = renderToStaticMarkup(React.createElement(mod.PasswordUsersNote));
  assert.match(html, /Used an email and password before\?/);
});
