import test from "node:test";
import assert from "node:assert/strict";
import { orgShellFor } from "./app-shell.ts";

const ws = "/orgs/hmin/workspaces/default";

test("org-level pages never get the legacy Views sidebar, whatever viewMode was persisted", () => {
  for (const mode of ["views", "repository", "split"] as const) {
    assert.equal(orgShellFor("/orgs/hmin/settings", mode), "org");
    assert.equal(orgShellFor("/orgs/hmin/workspaces/new", mode), "org");
    assert.equal(orgShellFor("/orgs/hmin", mode), "org");
  }
});

test("workspace pages use the current shell even after visiting Views", () => {
  for (const path of [`${ws}/ask`, `${ws}/model`, `${ws}/reports`, `${ws}/views`, `${ws}/settings`]) {
    assert.equal(orgShellFor(path, "views"), "mvp", path);
  }
});

test("the old view pages keep the Views sidebar on purpose", () => {
  assert.equal(orgShellFor(`${ws}/views/tech-stack`, "views"), "legacy");
  assert.equal(orgShellFor(`${ws}/embed/x`, "views"), "embed");
});

test("Processes, Investments and the Capability heatmap use the Model layout and sidebar", () => {
  for (const page of ["processes", "investments", "capability-heatmap"]) {
    assert.equal(orgShellFor(`${ws}/views/${page}`, "views"), "mvp", page);
  }
  assert.equal(orgShellFor(`${ws}/views/journeys`, "views"), "legacy");
});
