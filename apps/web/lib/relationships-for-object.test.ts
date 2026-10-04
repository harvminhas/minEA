import assert from "node:assert/strict";
import { test } from "node:test";
import { relationshipsForObject } from "./relationships-for-object.ts";

test("relationshipsForObject keeps edges that start or end on the row", () => {
  const rels = [
    { id: "out", from_object_id: "row", to_object_id: "other" },
    { id: "in", from_object_id: "peer", to_object_id: "row" },
    { id: "else", from_object_id: "a", to_object_id: "b" },
  ];
  assert.deepEqual(
    relationshipsForObject(rels, "row").map((rel) => rel.id),
    ["out", "in"]
  );
  assert.deepEqual(relationshipsForObject(rels, "missing"), []);
});
