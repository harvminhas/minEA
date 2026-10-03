import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SETUP_MIN, setupGapLine, setupState } from "./setupMin.ts";

describe("setupState", () => {
  const apps = (count: number) => Array.from({ length: count }, () => ({ type: "application" }));
  const links = (count: number) => Array.from({ length: count }, () => ({ type: "runs_on" }));

  it("needs both the app count and a hosting link", () => {
    assert.equal(setupState(apps(4), links(1)).met, false);
    assert.equal(setupState(apps(5), []).met, false);
    assert.equal(setupState(apps(SETUP_MIN.apps), links(SETUP_MIN.hostingLinks)).met, true);
  });

  it("phrases the gap from SETUP_MIN", () => {
    const state = setupState(apps(SETUP_MIN.apps - 3), []);
    assert.equal(setupGapLine(state), "Add 3 more apps and link one to a server to see your reports.");
    assert.equal(setupGapLine(setupState(apps(SETUP_MIN.apps), links(SETUP_MIN.hostingLinks))), "");
  });
});
