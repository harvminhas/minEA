import assert from "node:assert/strict";
import test from "node:test";
import { annualCostWriteBack, type CostLine } from "./math.ts";
import { annualCost, vendorAmounts } from "./service.ts";

function line(overrides: Partial<CostLine> = {}): CostLine {
  return {
    id: "1",
    type: "subscription",
    amount_cents: 1_800_000,
    frequency: "annual",
    calculation: { kind: "flat" },
    vendor: "IBM",
    source: "invoice",
    created_at: "2026-09-28T00:00:00Z",
    created_by: "user",
    updated_at: "2026-09-28T00:00:00Z",
    updated_by: "user",
    ...overrides,
  };
}

test("legacy annual cost counts a number or a plain digit string above zero", () => {
  assert.equal(annualCost({ annual_cost: 9800 }).run, 9800);
  assert.equal(annualCost({ annual_cost: "18600" }).run, 18600);
  assert.equal(annualCost({ annual_cost: "$18,600" }).run, 18600);
  assert.equal(annualCost({ annual_cost: 0 }).run, null);
  assert.equal(annualCost({ annual_cost: "18.6k" }).run, null);
  assert.equal(annualCost({}).missing, true);
});

test("capex and custom-built are filled with no amount", () => {
  const capex = annualCost({ cost_model: "capex" });
  assert.equal(capex.run, null);
  assert.equal(capex.missing, false);
  assert.equal(capex.label, "Capital asset");
  const built = annualCost({ is_custom_built: true });
  assert.equal(built.label, "No license cost");
  assert.equal(built.missing, false);
});

test("lines exclude internal and one-time from the run total", () => {
  const cost = annualCost({
    annual_cost: 1,
    cost_lines: [
      line(),
      line({ type: "internal_estimate", amount_cents: 4_500_000, vendor: null, source: "estimate" }),
      line({ type: "services_one_time", frequency: "one_time", amount_cents: 1_500_000, one_time_date: "2026-01-01" }),
    ],
  });
  assert.equal(cost.mode, "lines");
  assert.equal(cost.run, 18000);
  assert.equal(cost.label, "~$63,000 + $15,000 one-time");
});

test("write-back is a number on an application and a digit string otherwise", () => {
  const lines = [line({ amount_cents: 2_640_000 })];
  assert.equal(annualCostWriteBack("application", lines), 26400);
  assert.equal(annualCostWriteBack("cloud_service", lines), "26400");
  assert.equal(annualCostWriteBack("model", [line({ type: "internal_estimate", amount_cents: 100, vendor: null, source: "estimate" })]), null);
});

test("vendor amounts follow the line vendor and skip internal time", () => {
  const amounts = vendorAmounts(
    {
      vendor: "HubSpot",
      cost_lines: [
        line({ vendor: "HubSpot", amount_cents: 960_000 }),
        line({ type: "internal_estimate", vendor: null, source: "estimate", amount_cents: 100 }),
      ],
    },
    "HubSpot",
  );
  assert.deepEqual(amounts, [{ vendor: "HubSpot", dollars: 9600 }]);
});

test("without lines the object vendor gets the legacy amount", () => {
  assert.deepEqual(vendorAmounts({ annual_cost: "8400", vendor: "Keystone" }, "Keystone"), [
    { vendor: "Keystone", dollars: 8400 },
  ]);
});
