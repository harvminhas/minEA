import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { deleteConfirmLabel, deleteTitle, impactSummary } from "./structure-actions.ts";

const src = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("impact summary lists capabilities only for a domain, activities for domain and L2, and links for every kind", () => {
  const domain = impactSummary({
    id: "d1",
    kind: "domain",
    name: "Customer",
    capabilities: 4,
    activities: 9,
    application_links: 6,
  });
  assert.match(domain.intro, /domain and everything inside it/);
  assert.deepEqual(domain.rows, [
    { label: "Capabilities", value: 4 },
    { label: "Activities", value: 9 },
    { label: "Application links", value: 6 },
  ]);
  assert.match(domain.note, /applications themselves are not deleted/);

  const cap = impactSummary({
    id: "c1",
    kind: "capability",
    name: "Lead capture",
    capabilities: 0,
    activities: 4,
    application_links: 5,
  });
  assert.match(cap.intro, /activities under it/);
  assert.deepEqual(cap.rows.map((row) => row.label), ["Activities", "Application links"]);

  const activity = impactSummary({
    id: "a1",
    kind: "activity",
    name: "Qualify leads",
    capabilities: 0,
    activities: 0,
    application_links: 2,
  });
  assert.deepEqual(activity.rows, [{ label: "Application links", value: 2 }]);
});

test("delete labels and titles name the thing being removed", () => {
  assert.equal(deleteConfirmLabel("domain"), "Delete domain");
  assert.equal(deleteConfirmLabel("capability"), "Delete capability");
  assert.equal(deleteConfirmLabel("activity"), "Delete activity");
  assert.equal(deleteTitle({ id: "d", kind: "domain", name: "Customer & After-Sales" }), "Delete Customer & After-Sales?");
});

test("executive KPI cards use a label-row chevron and stay kebab-free", () => {
  const exec = src("components/capability-map/CapabilityExecutiveView.tsx");
  assert.match(exec, /hint-toggle/);
  assert.match(exec, /ChevronDown/);
  assert.match(exec, /aria-expanded=\{open\}/);
  assert.doesNotMatch(exec, /StructureKebab/);
  assert.doesNotMatch(exec, /structure-menu-/);
});

test("architect heat map and list expose structure menus; structure editor no longer uses window.confirm", () => {
  const heat = src("components/capability-map/CapabilityHeatMap.tsx");
  assert.match(heat, /StructureKebab/);
  assert.match(heat, /structure-menu-domain-/);
  assert.match(heat, /structure-menu-capability-/);
  assert.match(heat, /Move to another domain/);
  const section = src("components/mvp/CapabilitiesSection.tsx");
  assert.match(section, /useStructureActions/);
  assert.match(section, /structure=\{structure\}/);
  assert.match(section, /structure-menu-activity-/);
  const editor = src("components/capability-map/CapabilityStructureEditor.tsx");
  assert.doesNotMatch(editor, /window\.confirm/);
  assert.match(editor, /openDelete/);
  const detail = src("components/capability-map/CapabilityDetailView.tsx");
  assert.match(detail, /structure-menu-activity-/);
  assert.match(detail, /Move to another capability/);
});

test("Add activity and Add capability open an inline name field instead of creating immediately", () => {
  const actions = src("components/capability-map/StructureActions.tsx");
  const addActivity = actions.slice(actions.indexOf("const addActivity"), actions.indexOf("const cancelDraft"));
  const addCapability = actions.slice(actions.indexOf("const addCapability"), actions.indexOf("const addActivity"));
  assert.match(addActivity, /setDraft\(\{ kind: "activity"/);
  assert.doesNotMatch(addActivity, /objectsApi\.create/);
  assert.match(addCapability, /setDraft\(\{ kind: "capability"/);
  assert.doesNotMatch(addCapability, /objectsApi\.create/);
  assert.match(actions, /const commitDraft/);
  assert.match(actions, /export function InlineCreate/);
  assert.match(actions.slice(actions.indexOf("const commitDraft")), /objectsApi\.create/);

  const heat = src("components/capability-map/CapabilityHeatMap.tsx");
  assert.match(heat, /structure-create-activity/);
  assert.match(heat, /heat-activity-/);
  assert.match(heat, /node.children.map/);

  assert.match(heat, /structure-create-capability/);
  assert.match(heat, /structure\.addActivity\(node\.id, node\.domainId\)/);
  assert.match(heat, /structure\.addCapability\(domain\.id\)/);

  const section = src("components/mvp/CapabilitiesSection.tsx");
  assert.match(section, /structure-create-activity/);
  assert.match(section, /structure-create-capability/);
  assert.match(section, /structure\.addActivity\(row\.id, domainId\)/);

  const detail = src("components/capability-map/CapabilityDetailView.tsx");
  assert.match(detail, /structure-create-activity/);
  assert.match(detail, /structure\.addActivity\(node\.id, node\.domainId\)/);
});

test("deleting the open capability from its detail page returns to the Architect map", () => {
  const page = src("components/capability-map/CapabilityDetailPage.tsx");
  assert.match(page, /onDeleted/);
  assert.match(page, /workspace: "architect"/);
  assert.match(page, /router\.replace/);
  assert.match(page, /capability-detail-leaving/);
  assert.match(page, /useStructureActions\(objects, \{ onDeleted \}\)/);
});
