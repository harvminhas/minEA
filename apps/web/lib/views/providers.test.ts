import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { impactOf } from "@/lib/impact/relationship-impact";
import { setupState } from "@/lib/setup/setupMin";
import { impactCandidates, impactGate, showExampleEstate, type ChainItem } from "./opening";
import { DESKTOP_HOST_ID, derivedHosting, providerGroups } from "./providers";

// Harvinder's org: 6 cloud apps from the catalogue + Photoshop on desktops, no servers, no platforms.
const saas = ["Microsoft 365", "Microsoft Teams", "Google Workspace", "Salesforce", "QuickBooks Online", "Slack"];
const apps = [
  ...saas.map((name, i) => ({ id: `a${i}`, name, properties: { hosting_model: "saas" } as Record<string, unknown> })),
  { id: "ps", name: "Adobe Photoshop", properties: { hosting_model: "desktop" } as Record<string, unknown> },
];
const appItems: ChainItem[] = apps.map((app) => ({ id: app.id, name: app.name, kind: "application", ownerTeam: "", criticality: "", description: "", properties: app.properties }));

test("cloud apps group under their catalogue provider; desktop under People's computers", () => {
  const groups = providerGroups(apps, []);
  const byName = Object.fromEntries(groups.map((group) => [group.name, group.apps.map((app) => app.name)]));
  assert.deepEqual(byName["Microsoft 365"], ["Microsoft 365", "Microsoft Teams"]);
  assert.deepEqual(byName["Salesforce"], ["Salesforce", "Slack"]);
  assert.deepEqual(byName["Google Workspace"], ["Google Workspace"]);
  assert.deepEqual(byName["Intuit"], ["QuickBooks Online"]);
  assert.deepEqual(byName["People's computers"], ["Adobe Photoshop"]);
  // A saved vendor wins; a real host link removes the app from derived groups.
  assert.equal(providerGroups([{ ...apps[0]!, vendor: "Contoso" }], [])[0]!.name, "Contoso");
  assert.equal(providerGroups(apps, [{ type: "built_on", fromId: "a0", toId: "p1" }]).find((g) => g.name === "Microsoft 365")!.apps.length, 1);
});

test("Impact works for that org with no servers: 'If Microsoft 365 goes down' and app-to-app flows", () => {
  const objects = apps.map((app) => ({ id: app.id, type: "application", properties: app.properties }));
  assert.equal(setupState(objects, []).met, true);
  const flow = { type: "depends_on", fromId: "a4", toId: "a3" }; // QuickBooks needs Salesforce
  const derived = derivedHosting(apps, [flow]);
  const nodes = [...apps.map((app) => ({ id: app.id, name: app.name })), ...derived.nodes];
  const edges = [flow, ...derived.edges];
  // Not the sample estate, no "one more step" card.
  assert.equal(impactGate(false, showExampleEstate(derived.edges.length, false, false)), null);
  const items = [...appItems, ...derived.items];
  const candidates = impactCandidates(items, nodes, edges);
  assert.equal(candidates[0]!.name === "Microsoft 365" || candidates[0]!.name === "Salesforce", true);
  const ms = impactOf(nodes, edges, "provider:m365").map((hit) => hit.id).sort();
  assert.deepEqual(ms, ["a0", "a1"]);
  const sf = impactOf(nodes, edges, "provider:salesforce").map((hit) => hit.id);
  assert.ok(sf.includes("a3") && sf.includes("a5") && sf.includes("a4"), "Salesforce down also breaks QuickBooks through the flow");
  assert.deepEqual(impactOf(nodes, edges, DESKTOP_HOST_ID).map((hit) => hit.id), ["ps"]);
});

test("Hosting & location lists cloud apps by provider instead of an empty box", () => {
  const src = readFileSync(new URL("../../components/mvp/EstateViews.tsx", import.meta.url), "utf8");
  assert.match(src, /cloudGroups\.map\(\(group\) =>/);
  assert.match(src, /hostingGroups\(/);
  assert.match(src, /data-testid="cloud-provider"/);
});
