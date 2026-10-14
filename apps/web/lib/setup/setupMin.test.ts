import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { KNOWN_LOCATION_HOSTING, SETUP_MIN, setupGapLine, setupState } from "./setupMin.ts";

describe("setupState", () => {
  const apps = (count: number, hosting?: string) =>
    Array.from({ length: count }, (_, i) => ({ id: `a${i}`, type: "application", properties: hosting ? { hosting_model: hosting } : {} }));
  const links = (count: number) => Array.from({ length: count }, (_, i) => ({ type: "runs_on", from_object_id: `a${i}` }));

  it("needs both the app count and one app with a known location", () => {
    assert.equal(setupState(apps(4), links(1)).met, false);
    assert.equal(setupState(apps(5), []).met, false);
    assert.equal(setupState(apps(SETUP_MIN.apps), links(SETUP_MIN.located)).met, true);
  });

  it("Cloud, people's computers and a server link all count; on_premise alone and Don't know don't", () => {
    for (const hosting of ["saas", "cloud", "own_cloud", "desktop"]) assert.equal(setupState(apps(5, hosting), []).located, 5, hosting);
    assert.equal(setupState(apps(5, "on_premise"), []).located, 0);
    assert.equal(setupState(apps(5), []).located, 0);
    assert.deepEqual([...KNOWN_LOCATION_HOSTING].sort(), ["cloud", "desktop", "own_cloud", "saas"]);
  });

  it("counts apps, not links: two links from one app is one located app", () => {
    const rels = [{ type: "runs_on", from_object_id: "a0" }, { type: "built_on", from_object_id: "a0" }];
    assert.equal(setupState(apps(5), rels).located, 1);
  });

  it("phrases the gap from SETUP_MIN", () => {
    const state = setupState(apps(SETUP_MIN.apps - 3), []);
    assert.equal(setupGapLine(state), "Add 3 more apps and say where one runs to see your reports.");
    assert.equal(setupGapLine(setupState(apps(SETUP_MIN.apps), []))," Say where one app runs to see your reports.".trim());
    assert.equal(setupGapLine(setupState(apps(SETUP_MIN.apps), links(SETUP_MIN.located))), "");
  });
});
