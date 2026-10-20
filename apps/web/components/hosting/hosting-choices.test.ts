import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCATION_CHOICES, choiceFromApp, filterServers, findServer, hostingForChoice, planLocationChange } from "../../lib/setup/hosting-choice.ts";
import { LocationChips, ServerPicker } from "./LocationChips.tsx";
import { CloudPicker } from "./CloudPicker.tsx";
(globalThis as any).React = React;

test("five choices, in order, with their stored hosting values; old 'cloud' reads as SaaS", () => {
  assert.deepEqual(LOCATION_CHOICES.map((c) => c.label), ["SaaS", "Our cloud", "Our server", "On people's computers", "Don't know"]);
  assert.deepEqual(LOCATION_CHOICES.map((c) => hostingForChoice(c.choice)), ["saas", "own_cloud", "on_premise", "desktop", null]);
  assert.equal(choiceFromApp("cloud"), "saas");
  assert.equal(choiceFromApp("own_cloud"), "own_cloud");
  assert.equal(choiceFromApp("desktop"), "desktop");
  assert.equal(choiceFromApp("saas"), "saas");
  assert.equal(choiceFromApp("on_premise"), "own");
  assert.equal(choiceFromApp(undefined), "unknown");
});

test("servers are reused by name, case- and punctuation-insensitively", () => {
  const servers = [{ id: "s1", name: "AS400" }, { id: "s2", name: "HV01 Hyper-V host" }];
  assert.equal(findServer(servers, "as400")?.id, "s1");
  assert.equal(findServer(servers, "  hv01 hyper v HOST ")?.id, "s2");
  assert.equal(findServer(servers, "FS01"), undefined);
  assert.deepEqual(filterServers(servers, "hyper").map((s) => s.id), ["s2"]);
});

test("chips render as a radio group; Our server shows the picked server", () => {
  const html = renderToStaticMarkup(React.createElement(LocationChips, { value: "own", serverName: "AS400", servers: [], onChoose() {}, onPickServer() {} }));
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) ?? []).length, 5);
  assert.match(html, /aria-checked="true"[^>]*data-choice="own"[\s\S]*Our server · AS400/);
});

test("server picker: list + New server; search only past 6 servers", () => {
  const two = renderToStaticMarkup(React.createElement(ServerPicker, { servers: [{ name: "AS400" }, { name: "HV01" }], onPick() {} }));
  assert.match(two, /AS400[\s\S]*HV01[\s\S]*New server/);
  assert.doesNotMatch(two, /Search servers/);
  const many = renderToStaticMarkup(React.createElement(ServerPicker, { servers: Array.from({ length: 7 }, (_, i) => ({ name: `S${i}` })), onPick() {} }));
  assert.match(many, /Search servers/);
});

test("wizard, Hosting & location and the app record all use the same four choices", () => {
  const flow = readFileSync(new URL("../mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(flow, /<LocationChips/);
  const batch = readFileSync(new URL("../../lib/setup/where-batch.ts", import.meta.url), "utf8");
  assert.match(batch, /choice === "desktop" \? "desktop"/);
  assert.match(flow, /const existing = \{ \.\.\.catalogServers, \.\.\.serverIds \}/);
  const views = readFileSync(new URL("../mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(views, /<AppLocationEditor app=\{row\.object\} compact \/>/);
  const panel = readFileSync(new URL("../mvp/ModelDetailPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /row\.object\.type === "application" && <AppLocationEditor app=\{row\.object\} \/>/);
  const editor = readFileSync(new URL("./AppLocationEditor.tsx", import.meta.url), "utf8");
  assert.match(editor, /findServer\(servers, name\)/);
  assert.match(editor, /choiceFromApp\(props\.hosting_model\)/);
  assert.match(editor, /queryKey: \["workspace-setup", orgSlug, workspaceSlug\]/);
});

test("Hosting report: desktop apps have a home (same rule as the setup card)", async () => {
  const { hostingMap } = await import("../../lib/reports/home.ts");
  const row = (id: string, hosting: string) => ({ id, kind: "application", object: { type: "application", properties: { hosting_model: hosting } } });
  const out = hostingMap([row("a", "desktop"), row("b", "saas"), row("c", "")] as never, []);
  assert.equal(out.unlinked, 1);
});

test("hosting_model alone decides the chip; a stray runs-on link never overrides it", () => {
  // QA's stuck QuickBooks Online: hosting_model saas plus a runs-on link to AS400.
  assert.equal(choiceFromApp("saas"), "saas");
});

const asOurServer = { hosting: "on_premise", serverLinks: [{ id: "r1", serverId: "as400" }] };

for (const [choice, hosting] of [["saas", "saas"], ["desktop", "desktop"], ["unknown", null]] as const) {
  test(`Our server -> ${choice} sets hosting_model and removes the runs-on link`, () => {
    const plan = planLocationChange(asOurServer, { choice });
    assert.equal(plan.hosting, hosting);
    assert.deepEqual(plan.removeLinkIds, ["r1"]);
    assert.equal(plan.addServerId, null);
    assert.equal(plan.needsConfirm, false);
  });
}

test("leaving Our server with several runs-on links asks first and removes them all", () => {
  const plan = planLocationChange(
    { hosting: "on_premise", serverLinks: [{ id: "r1", serverId: "as400" }, { id: "r2", serverId: "vm2" }] },
    { choice: "saas" },
  );
  assert.equal(plan.needsConfirm, true);
  assert.deepEqual(plan.removeLinkIds, ["r1", "r2"]);
});

test("re-clicking Cloud on a stuck app clears the stray link", () => {
  const plan = planLocationChange({ hosting: "saas", serverLinks: [{ id: "r1", serverId: "as400" }] }, { choice: "saas" });
  assert.deepEqual(plan.removeLinkIds, ["r1"]);
  assert.equal(plan.hosting, "saas");
});

test("picking another server replaces the single chip link; picking the same one adds nothing", () => {
  const other = planLocationChange(asOurServer, { choice: "own", serverId: "vm2" });
  assert.deepEqual([other.hosting, other.addServerId, other.removeLinkIds], ["on_premise", "vm2", ["r1"]]);
  const same = planLocationChange(asOurServer, { choice: "own", serverId: "as400" });
  assert.deepEqual([same.addServerId, same.removeLinkIds], [null, []]);
  const many = planLocationChange({ hosting: "on_premise", serverLinks: [{ id: "r1", serverId: "a" }, { id: "r2", serverId: "b" }] }, { choice: "own", serverId: "c" });
  assert.deepEqual(many.removeLinkIds, []);
});

test("Our cloud: provider -> tenant (pick or + new) -> region (pick; tenant's regions first, + custom)", () => {
  const tenants = [
    { id: "prod", name: "Contoso Azure prod", provider: "azure" as const, regionKeys: ["azure:canadacentral"] },
    { id: "dev", name: "Contoso Azure dev", provider: "azure" as const, regionKeys: [] },
    { id: "m", name: "Contoso M365", provider: "m365" as const, regionKeys: [] },
  ];
  const html = renderToStaticMarkup(React.createElement(LocationChips, {
    value: "own_cloud", servers: [], onChoose() {}, onPickServer() {},
    detail: { provider: "azure", tenantName: "Contoso Azure prod", tenantId: "prod", regionKey: "azure:canadacentral" }, tenants, onDetail() {},
    custom: [{ id: "c1", key: "custom:c1", provider: "azure", name: "Lab DC" }], onAddRegion: async () => "",
  }));
  assert.match(html, /data-testid="cloud-picker"/);
  // Our cloud lists the cloud providers only (Microsoft 365 is a SaaS provider).
  assert.match(html, /data-provider="azure"[\s\S]*data-provider="aws"[\s\S]*data-provider="gcp"[\s\S]*data-provider="other"/);
  assert.doesNotMatch(html, /data-provider="m365"/);
  // Tenants of that provider only, plus "+ New tenant…".
  assert.match(html, /Contoso Azure prod[\s\S]*Contoso Azure dev[\s\S]*\+ New tenant/);
  assert.doesNotMatch(html, /Contoso M365/);
  // Region: picked, never typed. This tenant's regions first, then Azure's, then custom, then + custom.
  assert.match(html, /<optgroup label="Used by Contoso Azure prod"><option value="azure:canadacentral" selected="">Canada Central<\/option><\/optgroup><optgroup label="Azure regions">/);
  assert.match(html, /<optgroup label="Custom"><option value="custom:c1">Lab DC/);
  assert.match(html, /\+ Custom region…/);
  assert.doesNotMatch(html, /<input[^>]*aria-label="Region"/);
  const suggested = renderToStaticMarkup(React.createElement(LocationChips, { value: "unknown", servers: [], onChoose() {}, onPickServer() {}, suggest: "own_cloud" }));
  assert.match(suggested, /Suggested/);
});

test("SaaS tenant picker offers the SaaS providers and the M365 geos", () => {
  const html = renderToStaticMarkup(React.createElement(CloudPicker, {
    mode: "saas", value: { provider: "m365", tenantName: "", regionKey: null }, tenants: [], onChange() {},
  }));
  assert.match(html, /data-provider="m365"[\s\S]*data-provider="google_workspace"[\s\S]*data-provider="salesforce"/);
  assert.doesNotMatch(html, /data-provider="azure"/);
  assert.match(html, /<option value="m365:canada">Canada<\/option>/);
  assert.doesNotMatch(html, /Custom region/, "no + custom without onAddRegion");
});

test("+ New account works again and again: a fresh, unused name every time (never blank)", async () => {
  const { newTenantName, startNewTenant } = await import("./CloudPicker.tsx");
  const { pendingTenantId } = await import("../../lib/hosting/pending-tenants.ts");
  assert.equal(newTenantName("azure", []), "Azure tenant");
  assert.equal(newTenantName("other", ["Cloud account", "cloud account 2"]), "Cloud account 3");
  // Another card already typed "Cloud account" (pending): this card used to get "" and snap back to "Pick one".
  const next = startNewTenant({ provider: "other", tenantId: "t1", tenantName: "Existing", regionKey: null }, ["Existing", "Cloud account"]);
  assert.equal(next.tenantId, undefined);
  assert.equal(next.tenantName, "Cloud account 2");
  const html = renderToStaticMarkup(React.createElement(CloudPicker, {
    mode: "own_cloud", value: next, tenants: [{ id: "t1", name: "Existing", provider: "other", regionKeys: [] }], onChange() {},
    pending: [{ id: pendingTenantId("other", "Cloud account"), provider: "other", name: "Cloud account", originKey: "card-1", count: 1 }],
  }));
  assert.match(html, /data-testid="tenant-new"[^>]*value="Cloud account 2"/);
  assert.match(html, /<option value="__new" selected="">\+ New account…<\/option>/);
  const source = readFileSync(new URL("./CloudPicker.tsx", import.meta.url), "utf8");
  assert.match(source, /const \[creating, setCreating\] = useState\(false\)/, "clearing the name keeps the new-name box");
  assert.match(source, /min-w-0 flex-1[^"]*border-dashed/, "custom region box can't overflow the card");
});
