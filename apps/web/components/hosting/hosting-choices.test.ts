import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LOCATION_CHOICES, choiceFromApp, filterServers, findServer, hostingForChoice, planLocationChange } from "../../lib/setup/hosting-choice.ts";
import { LocationChips, ServerPicker } from "./LocationChips.tsx";
(globalThis as any).React = React;

test("four choices, in order, with their stored hosting values", () => {
  assert.deepEqual(LOCATION_CHOICES.map((c) => c.label), ["Cloud (SaaS)", "Our server", "On people's computers", "Don't know"]);
  assert.deepEqual(LOCATION_CHOICES.map((c) => hostingForChoice(c.choice)), ["saas", "on_premise", "desktop", null]);
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
  assert.equal((html.match(/role="radio"/g) ?? []).length, 4);
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
