import assert from "node:assert/strict";
import { test } from "node:test";
import type { Relationship } from "@minea/types";
import {
  describeRelationship,
  formatRelationshipTriple,
  relationshipVerb,
  relationshipWords,
} from "./relationship-display";

function rel(type: string): Relationship {
  return {
    id: "r1",
    workspace_id: "w",
    org_id: "o",
    type: type as Relationship["type"],
    from_object_id: "a",
    from_type: "application",
    to_object_id: "b",
    to_type: "application",
    attributes: {},
    created_at: "2026-10-07T00:00:00Z",
  };
}

test("known types keep their labels", () => {
  assert.equal(relationshipVerb("built_on"), "built on");
  assert.equal(formatRelationshipTriple(rel("depends_on"), "a", "A", "B").nameLine, "Depends on B");
  assert.equal(describeRelationship(rel("depends_on"), "b", "A").label, "Needed by A");
});

test("a type this build doesn't know renders as plain words instead of throwing", () => {
  const unknown = rel("some_future_link");
  assert.equal(relationshipVerb(unknown.type), "some future link");
  assert.equal(formatRelationshipTriple(unknown, "a", "A", "B").nameLine, "Some future link B");
  assert.equal(formatRelationshipTriple(unknown, "b", "B", "A").nameLine, "Some future link (from) A");
  assert.equal(describeRelationship(unknown, "a", "B").label, "Some future link B");
  assert.equal(relationshipWords("some_future_link").sentence("A", "B"), "A some future link B");
});
