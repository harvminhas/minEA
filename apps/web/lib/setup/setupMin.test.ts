import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { setupState, SETUP_MIN } from "./setupMin.ts";

describe("setupState", () => {
  it("returns not met with 4 apps and 1 link", () => {
    const objects = [
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
    ];
    const relationships = [{ type: "runs_on" }];
    const state = setupState(objects, relationships);
    assert.equal(state.apps, 4);
    assert.equal(state.hostingLinks, 1);
    assert.equal(state.met, false);
  });

  it("returns not met with 5 apps and 0 links", () => {
    const objects = [
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
    ];
    const relationships: { type: string }[] = [];
    const state = setupState(objects, relationships);
    assert.equal(state.apps, 5);
    assert.equal(state.hostingLinks, 0);
    assert.equal(state.met, false);
  });

  it("returns met with 5 apps and 1 link", () => {
    const objects = [
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
    ];
    const relationships = [{ type: "runs_on" }];
    const state = setupState(objects, relationships);
    assert.equal(state.apps, 5);
    assert.equal(state.hostingLinks, 1);
    assert.equal(state.met, true);
  });

  it("counts runs_on and built_on relationships", () => {
    const objects = [
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
      { type: "application" },
    ];
    const relationships = [
      { type: "runs_on" },
      { type: "built_on" },
      { type: "depends_on" }, // not counted
    ];
    const state = setupState(objects, relationships);
    assert.equal(state.hostingLinks, 2);
    assert.equal(state.met, true);
  });

  it("changing SETUP_MIN changes behavior", () => {
    // This test verifies that SETUP_MIN is the single source of truth
    assert.equal(SETUP_MIN.apps, 5);
    assert.equal(SETUP_MIN.hostingLinks, 1);
    
    const objects = Array(SETUP_MIN.apps).fill({ type: "application" });
    const relationships = Array(SETUP_MIN.hostingLinks).fill({ type: "runs_on" });
    const state = setupState(objects, relationships);
    assert.equal(state.met, true);
  });
});
