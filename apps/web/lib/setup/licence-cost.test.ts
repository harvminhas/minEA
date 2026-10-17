import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lineAnnualCents } from "@/lib/cost/math";
import { TOOL_CATALOG } from "@/lib/setup/match-tools";
import { licenceCount, perSeatLine, yearlyFor } from "./licence-cost";

test("per-licence price × licences while the cell is typical", () => {
  const tool = { typicalAnnual: 900, typicalPerSeatMonthly: 8.75 };
  assert.deepEqual(yearlyFor(tool, "10", { yearly: "900", typical: true }), { yearly: "1050", typical: true });
  assert.deepEqual(yearlyFor(tool, "", { yearly: "1050", typical: true }), { yearly: "900", typical: true });
});

test("a total the person typed is kept; annual-only catalogue keeps today's behaviour", () => {
  assert.deepEqual(yearlyFor({ typicalAnnual: 900, typicalPerSeatMonthly: 8 }, "50", { yearly: "1234", typical: false }), { yearly: "1234", typical: false });
  assert.deepEqual(yearlyFor({ typicalAnnual: 900 }, "50", { yearly: "900", typical: true }), { yearly: "900", typical: true });
  assert.deepEqual(yearlyFor(null, "50", { yearly: "", typical: false }), { yearly: "", typical: false });
});

test("licence counts and the saved per-user line", () => {
  assert.equal(licenceCount(" 1,200 "), 1200);
  assert.equal(licenceCount("0"), null);
  assert.equal(licenceCount("abc"), null);
  assert.equal(lineAnnualCents(perSeatLine(10, 8.75, "Slack")), 105000);
});

test("the catalogue invents no per-seat prices; step 4 and the app record have Licences", () => {
  assert.ok(TOOL_CATALOG.every((tool) => tool.typicalPerSeatMonthly == null));
  const setup = readFileSync(new URL("../../components/mvp/setup-flow.tsx", import.meta.url), "utf8");
  assert.match(setup, /label="Licences"[\s\S]*label="Yearly cost"/);
  assert.match(setup, /properties\.licence_count = seats/);
  const registry = readFileSync(new URL("../fields/registry.ts", import.meta.url), "utf8");
  assert.match(registry, /key: "licence_count", label: "Licences"/);
});
