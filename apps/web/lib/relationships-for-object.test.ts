import assert from "node:assert/strict";
import { test } from "node:test";
import { relationshipsForIds, relationshipsForObject, sameNamePartyIds } from "./relationships-for-object.ts";

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

test("a vendor panel includes a platform supplied_by link on a same-named party", () => {
  const objects = [
    { id: "ms-a", type: "external_party", name: "Microsoft" },
    { id: "ms-b", type: "external_party", name: "microsoft" },
    { id: "ibm", type: "external_party", name: "IBM" },
  ];
  const rels = [
    {
      id: "m365",
      type: "supplied_by",
      from_object_id: "m365",
      from_type: "application",
      to_object_id: "ms-a",
      to_type: "external_party",
    },
    {
      id: "plat",
      type: "supplied_by",
      from_object_id: "plat",
      from_type: "cloud_service",
      to_object_id: "ms-b",
      to_type: "external_party",
    },
    {
      id: "as400",
      type: "supplied_by",
      from_object_id: "as400",
      from_type: "model",
      to_object_id: "ibm",
      to_type: "external_party",
    },
  ];
  const ids = sameNamePartyIds(objects, "ms-a", "external_party", "Microsoft");
  assert.deepEqual(
    relationshipsForIds(rels, ids).map((rel) => rel.id),
    ["m365", "plat"]
  );
  assert.deepEqual(sameNamePartyIds(objects, "as400-server", "model", "AS400"), ["as400-server"]);
});
