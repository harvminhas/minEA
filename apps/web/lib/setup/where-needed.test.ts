import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { needsWhere, whereStepKeys } from "./where-needed";

const objects = [
  { id: "saas", properties: { hosting_model: "saas" } },
  { id: "desk", properties: { hosting_model: "desktop" } },
  { id: "cloudLinked", properties: { hosting_model: "own_cloud" } },
  { id: "cloudBare", properties: { hosting_model: "own_cloud" } },
  { id: "serverLinked", properties: { hosting_model: "on_premise" } },
  { id: "serverBare", properties: { hosting_model: "on_premise" } },
  { id: "dunno", properties: {} },
];
const rels = [
  { type: "runs_on", from_object_id: "cloudLinked" },
  { type: "runs_on", from_object_id: "serverLinked" },
];

test("answered on the card: SaaS, people's computers, or linked to a tenant/server", () => {
  for (const id of ["saas", "desk", "cloudLinked", "serverLinked"]) assert.equal(needsWhere({ objectId: id }, objects, rels), false, id);
});

test("still open: unset/Don't know, Our cloud without a tenant, Our server without a server, unsaved", () => {
  for (const id of ["dunno", "cloudBare", "serverBare", "missing"]) assert.equal(needsWhere({ objectId: id }, objects, rels), true, id);
  assert.equal(needsWhere({}, objects, rels), true);
});

test("all answered -> no keys (step skipped); otherwise only the open ones, in order", () => {
  assert.deepEqual(whereStepKeys([{ key: "a", objectId: "saas" }, { key: "b", objectId: "cloudLinked" }], objects, rels), []);
  assert.deepEqual(whereStepKeys([{ key: "a", objectId: "saas" }, { key: "b", objectId: "dunno" }, { key: "c", objectId: "serverBare" }], objects, rels), ["b", "c"]);
});

test("wizard: every way into step 3 goes through goWhere; the stepper marks a skipped step", () => {
  const src = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.equal((src.match(/goWhere\(/g) ?? []).length >= 4, true);
  assert.match(src, /setStep\(keys\.length === 0 \? 4 : 3\)/);
  assert.doesNotMatch(src, /setStep\(rows\.length > 0 \? 2 : 3\)/);
  assert.match(src, /whereBatch\(planned\.servers, planned\.links, whereApps/);
  assert.match(src, /answered on the cards/);
});
