import assert from "node:assert/strict";
import { test } from "node:test";
import { recordPageTabFromSearch, recordPageTabQuery } from "./record-tabs";

test("legacy panel tab=details and bare URLs open Overview", () => {
  assert.equal(recordPageTabFromSearch("details"), "overview");
  assert.equal(recordPageTabFromSearch("overview"), "overview");
  assert.equal(recordPageTabFromSearch(null), "overview");
  assert.equal(recordPageTabFromSearch(undefined, "owner"), "overview");
});

test("relationships, tech debt, and history query values are kept", () => {
  assert.equal(recordPageTabFromSearch("relationships"), "relationships");
  assert.equal(recordPageTabFromSearch("tech_debt"), "tech_debt");
  assert.equal(recordPageTabFromSearch("tech-debt"), "tech_debt");
  assert.equal(recordPageTabFromSearch("history"), "history");
  assert.equal(recordPageTabQuery("overview"), undefined);
  assert.equal(recordPageTabQuery("tech_debt"), "tech_debt");
});
