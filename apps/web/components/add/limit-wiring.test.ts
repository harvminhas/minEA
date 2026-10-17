import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("api client: the item-limit 403 becomes a friendly ObjectLimitError, with a toast unless the caller asks for quiet", () => {
  const api = src("lib/api-client.ts");
  assert.match(api, /objectLimitDetail\(err\?\.detail\)/);
  assert.match(api, /if \(!quietLimit\) announceObjectLimit\(limit\)/);
  assert.match(api, /throw new ObjectLimitError\(limit, resolvedPath\)/);
  assert.match(api, /\/objects\/limit`/);
  assert.match(src("components/providers.tsx"), /<ObjectLimitNotice \/>/);
});

test("Add cards: pre-check before saving, quiet batch, server 403 fills the same panel", () => {
  const cards = src("components/add/AddCards.tsx");
  assert.match(cards, /if \(ready && limit\?\.over\) \{/);
  assert.match(cards, /\{ quietLimit: true \}/);
  assert.match(cards, /setServerRoom\(roomFromDetail\(refused\)\)/);
  assert.match(cards, /<LimitPanel limit=\{limit\}/);
  assert.match(cards, /takeFirst\(planInputs\(rows\), firstCount\)/);
  assert.match(cards, /saveAddDraft\(orgSlug, workspaceSlug, names, back\)/);
  // AddFlow (Model, Ask) and setup step 1 all render AppAddPanel → AskAdd.
  assert.match(src("components/mvp/setup-flow.tsx"), /<AppAddPanel/);
  assert.match(src("components/add/AddFlow.tsx"), /<AskAdd /);
  assert.match(src("components/add/AppAddPanel.tsx"), /takeAddDraft\(orgSlug, workspaceSlug\)/);
});

test("upgrade links respect who can buy", () => {
  const panel = src("components/add/LimitPanel.tsx");
  assert.match(panel, /limit\.offer === "ask-admin"/);
  assert.match(panel, /Copy link for your admin/);
  assert.match(panel, /Starter: coming soon/);
  const ask = src("components/mvp/AskScreen.tsx");
  assert.match(ask, /can_manage_billing \? "upgrade" : "ask-admin"/);
  assert.match(ask, /quotaOffer === "upgrade" && \(/);
});
