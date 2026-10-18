import assert from "node:assert/strict";
import { test } from "node:test";
import { formatProductGraphEdgeLine, productEdgeLabel } from "./product-relationship-utils.ts";

test("product graph rows read as one plain sentence", () => {
  const labelById = {
    p: { id: "p", label: "Payments", type: "product", layer: 0 },
    c: { id: "c", label: "Billing", type: "capability", layer: 1 },
  } as never;
  assert.deepEqual(formatProductGraphEdgeLine({ id: "e", source: "p", target: "c", label: "Delivers" } as never, labelById), {
    nameLine: "Payments delivers Billing",
    typeLine: "",
  });
  assert.equal(productEdgeLabel("supported_by"), "Supported by");
  assert.equal(productEdgeLabel("runs on"), "Runs on");
});
