import assert from "node:assert/strict";
import { test } from "node:test";
import type { Relationship } from "@minea/types";
import { extractSystemDiagramLinks } from "./system-relationship-utils.ts";

test("extractSystemDiagramLinks includes a supplied_by vendor", () => {
  const rel: Relationship = {
    id: "r1",
    workspace_id: "w",
    org_id: "o",
    type: "supplied_by",
    from_object_id: "edi",
    from_type: "application",
    to_object_id: "ms",
    to_type: "external_party",
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  const links = extractSystemDiagramLinks("edi", [rel], { ms: "Microsoft" });
  assert.equal(links.length, 1);
  assert.equal(links[0]?.objectType, "external_party");
  assert.equal(links[0]?.relationshipType, "supplied_by");
  assert.equal(links[0]?.name, "Microsoft");
  assert.equal(links[0]?.direction, "outbound");
});
