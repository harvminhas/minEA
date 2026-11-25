import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationsPath, connectionsPath, legacyListRedirect, platformsPath } from "./model-legacy-paths.ts";

const B = "/orgs/o/workspaces/w";

test("old list URLs redirect to the new tab or filter page", () => {
  assert.equal(legacyListRedirect(B, `${B}/model/agents`), applicationsPath(B, { tab: "ai", aiType: "agents" }));
  assert.equal(legacyListRedirect(B, `${B}/model/ai-models`), applicationsPath(B, { tab: "ai", aiType: "models" }));
  assert.equal(legacyListRedirect(B, `${B}/model/locations`), platformsPath(B, "locations"));
  assert.equal(legacyListRedirect(B, `${B}/integration/flows`), connectionsPath(B, "flows"));
  assert.equal(legacyListRedirect(B, `${B}/integration/apis`), connectionsPath(B, "apis"));
  assert.equal(legacyListRedirect(B, `${B}/integration/events`), connectionsPath(B, "events"));
  assert.equal(legacyListRedirect(B, `${B}/integration/tools`), connectionsPath(B, "tools"));
  assert.equal(legacyListRedirect(B, `${B}/integration/flows`, "?open=abc"), connectionsPath(B, "flows", "abc"));
});

test("record URLs are left in place so Ask links keep working", () => {
  assert.equal(legacyListRedirect(B, `${B}/model/agents/id`), null);
  assert.equal(legacyListRedirect(B, `${B}/model/locations/id`), null);
  assert.equal(legacyListRedirect(B, `${B}/model/applications`), null);
});
