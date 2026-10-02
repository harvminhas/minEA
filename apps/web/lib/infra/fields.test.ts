import assert from "node:assert/strict";
import { test } from "node:test";
import { fieldHasEditor, platformFields, runtimeFields, sortBlanksLast } from "./fields.ts";

test("every shown infra field has an editor", () => {
  for (const field of [...runtimeFields, ...platformFields]) {
    assert.equal(fieldHasEditor(field), true, field.key);
  }
  assert.ok(runtimeFields.some((field) => field.key === "support_ends" && field.table && field.inline));
});

test("a blank kind sorts last", () => {
  const rows = [
    { name: "Zed", kind: "vm" },
    { name: "Ada", kind: "" },
    { name: "Mia", kind: "database" },
  ];
  const sorted = sortBlanksLast(rows, (row) => row.kind, (row) => row.name);
  assert.deepEqual(sorted.map((row) => row.name), ["Mia", "Zed", "Ada"]);
});
