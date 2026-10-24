import { test } from "node:test";
import assert from "node:assert/strict";
import type { MinEAObject, Relationship } from "@minea/types";
import { contractShares, effectiveObjects, nextRenewal, renewalInfo, type VendorContract } from "./contracts";
import { catalogStats, vendorRollup } from "./model-catalog";
import { idleLicences, overlaps } from "./reports/cio-views";
import { shapeCatalog } from "./use-model-catalog";

const obj = (id: string, name: string, properties: Record<string, unknown> = {}, type = "application") =>
  ({ id, type, name, status: "active", properties }) as unknown as MinEAObject;
const k = (over: Partial<VendorContract> = {}): VendorContract => ({
  id: "k1", vendor_id: "ms", vendor_name: "Microsoft", name: "Enterprise Agreement", annual_cost_cents: 48_000_000,
  start_date: "2024-03-01", end_date: "2027-03-01", notice_days: 30, auto_renew: true, owner_contact_id: null, document_url: null,
  items: [{ object_id: "m365", seats: 1200, in_use: 1020 }, { object_id: "teams", seats: 400, in_use: 400 }], ...over,
});

test("cost splits by seats when every app has seats, otherwise evenly (cents add up)", () => {
  assert.deepEqual([...contractShares(k()).entries()], [["m365", 36_000_000], ["teams", 12_000_000]]);
  const even = contractShares(k({ annual_cost_cents: 100_000, items: [{ object_id: "a", seats: 5, in_use: null }, { object_id: "b", seats: null, in_use: null }, { object_id: "c", seats: null, in_use: null }] }));
  assert.deepEqual([...even.values()], [33_333, 33_333, 33_334]);
});

test("a contract counts once in vendor spend, stats and idle licences; own fields stay the fallback", () => {
  const objects = [
    obj("m365", "Microsoft 365", { vendor: "Microsoft", annual_cost: 999_999, licence_count: 10, licences_in_use: 2 }),
    obj("teams", "Teams", { vendor: "Microsoft" }),
    obj("slack", "Slack", { vendor: "Salesforce", annual_cost: 12_000, licence_count: 100, licences_in_use: 60 }),
  ];
  const shaped = shapeCatalog({ objects, relationships: [], contracts: [k()] });
  const ms = vendorRollup(shaped.rows).find((v) => v.vendor === "Microsoft")!;
  assert.equal(ms.annual, 480_000);
  assert.equal(catalogStats(shaped.rows).spend, 492_000);
  const row = shaped.rows.find((r) => r.id === "m365")!;
  assert.equal(row.object.properties?.annual_cost, 999_999, "edit forms keep the stored record");
  assert.equal(row.effective?.properties?.annual_cost, 360_000);
  assert.equal(row.renewalLabel.length > 0, true);
  const idle = idleLicences(shaped.effective);
  assert.deepEqual(idle.rows.map((r) => [r.name, r.idle]), [["Microsoft 365", 180], ["Slack", 40], ["Teams", 0]]);
  assert.equal(idle.rows[0].wastedCents, 180 * 30_000);
  assert.equal(effectiveObjects(objects, []), objects);
});

test("overlaps read the split cost", () => {
  const objects = [obj("cap", "Chat", {}, "capability"), obj("teams", "Teams"), obj("slack", "Slack", { annual_cost: 5000 })];
  const rels = [
    { id: "r1", type: "supported_by", from_object_id: "cap", to_object_id: "teams" },
    { id: "r2", type: "supported_by", from_object_id: "cap", to_object_id: "slack" },
  ] as unknown as Relationship[];
  const effective = effectiveObjects(objects, [k({ items: [{ object_id: "teams", seats: null, in_use: null }], annual_cost_cents: 1_000_000 })]);
  const group = overlaps(effective, rels).groups[0];
  assert.deepEqual(group.tools.map((t) => [t.name, t.annualCents]).sort(), [["Slack", 500_000], ["Teams", 1_000_000]]);
});

test("renewal banner: Renews in N days · notice by DATE", () => {
  const now = new Date(2026, 9, 24);
  const info = renewalInfo(k({ end_date: "2026-11-30", notice_days: 30 }), now)!;
  assert.equal(info.text, "Renews in 37 days · notice by 31 Oct 2026");
  assert.equal(info.urgent, true);
  assert.equal(renewalInfo(k({ end_date: "2027-06-01", notice_days: null, auto_renew: false }), now)!.text, "Ends in 220 days");
  assert.equal(renewalInfo(k({ end_date: null }), now), null);
  assert.equal(nextRenewal([k({ id: "a", end_date: "2027-01-01" }), k({ id: "b", end_date: "2026-12-01" }), k({ id: "c", end_date: "2025-01-01" })], now)!.contract.id, "b");
});
