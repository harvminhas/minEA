import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldRefreshOnEnter } from "./catalog-refresh.ts";

describe("catalog enter refresh", () => {
  it("refreshes once when the saved catalog is behind", () => {
    assert.equal(shouldRefreshOnEnter(true, false), true);
    assert.equal(shouldRefreshOnEnter(true, true), false);
    assert.equal(shouldRefreshOnEnter(false, false), false);
  });
});
