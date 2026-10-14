import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyFromForm, formFromEntry, formFromMiss } from "./CatalogAdmin";

test("form round-trips an entry; empty typical cost is null, never 0", () => {
  const form = formFromEntry({ id: "1", name: "Procore", aliases: ["procore", "pro core"], vendor: "Procore", category: "Construction", hosting: "saas", kind: "app", typicalAnnual: null, unit: "year", ssoUsual: true });
  assert.equal(form.aliases, "procore, pro core");
  assert.equal(form.typicalAnnual, "");
  const body = bodyFromForm(form);
  assert.deepEqual(body.aliases, ["procore", "pro core"]);
  assert.equal(body.typicalAnnual, null);
  assert.equal(bodyFromForm({ ...form, typicalAnnual: "1200" }).typicalAnnual, 1200);
});

test("Add to catalog prefills from the AI suggestion and keeps the typed name as an alias", () => {
  const form = formFromMiss({ key: "tekla", name: "Tekla", count: 4, lastSeen: "", suggestion: { name: "Tekla Structures", vendor: "Trimble", category: "Construction", hosting: "desktop", kind: "app" } });
  assert.equal(form.name, "Tekla Structures");
  assert.equal(form.aliases, "tekla");
  assert.equal(form.vendor, "Trimble");
  assert.equal(form.hosting, "desktop");
  assert.equal(formFromMiss({ key: "x", name: "Gizmo", count: 1, lastSeen: "", suggestion: null }).name, "Gizmo");
});
