import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLATFORM_HOSTING_FILTERS, PLATFORM_KIND_FILTERS, platformKindView, presentOptions } from "./platform-kind";

const view = (name: string, properties: Record<string, unknown>, regions: string[] = []) => platformKindView({ name, properties }, regions);

test("tenants read as tenants on their provider, with provider and region as hosting", () => {
  const azure = view("Azure tenant", { platform_kind: "cloud_account", vendor: "microsoft" }, ["azure:canadacentral", "azure:canadaeast"]);
  assert.equal(azure.group, "tenant");
  assert.equal(azure.chip, "Tenant · Azure");
  assert.equal(azure.hostingKey, "cloud");
  assert.match(azure.hosting, /^Azure · Canada Central \+1$/);
  // Saved cloud_account, vendor Microsoft, no provider: Azure (screenshot "MAM").
  assert.equal(view("MAM", { platform_kind: "cloud_account", vendor: "microsoft" }).chip, "Tenant · Azure");
  assert.equal(view("MAM", { platform_kind: "cloud_account", vendor: "microsoft" }).hosting, "Azure");
  assert.equal(view("Prod", { cloud_provider: "aws" }).chip, "Account · AWS");
  assert.equal(view("Prod", { cloud_provider: "aws" }).inferred, true);
  assert.equal(view("Ops", { platform_kind: "cloud_account", vendor: "other" }).chip, "Cloud account");
  assert.equal(view("Ops", { platform_kind: "cloud_account", vendor: "other" }).hosting, "Public cloud");
});

test("SaaS suites, PaaS, self-hosted and not set", () => {
  const m365 = view("Microsoft 365", { vendor: "microsoft" });
  assert.deepEqual([m365.group, m365.chip, m365.hosting, m365.inferred], ["saas_suite", "SaaS suite · Microsoft 365", "SaaS", true]);
  // Dynamics 365 is Microsoft but not Microsoft 365: a plain SaaS suite from its hosting model.
  const d365 = view("Dynamics 365", { vendor: "microsoft", hosting_model: "saas" });
  assert.deepEqual([d365.group, d365.chip, d365.hostingKey], ["saas_suite", "SaaS suite", "saas"]);
  assert.deepEqual([view("Hyland", { hosting_model: "paas" }).chip, view("Hyland", { hosting_model: "paas" }).hosting], ["PaaS", "PaaS"]);
  const jde = view("JD Enterprise One", { hosting_model: "self_hosted" });
  assert.deepEqual([jde.group, jde.chip, jde.hosting], ["self_hosted", "Self-hosted platform", "Self-hosted"]);
  const saved = view("Thing", { platform_kind: "paas", hosting_model: "saas" });
  assert.deepEqual([saved.group, saved.inferred, saved.hostingKey], ["paas", false, "saas"]);
  const blank = view("Mystery", {});
  assert.deepEqual([blank.group, blank.chip, blank.hostingKey, blank.hosting], ["unset", "", "unset", ""]);
  assert.equal(view("Old", { hosting_model: "hybrid" }).hostingKey, "hybrid");
});

test("filter options list only the kinds and hosting present, in fixed order", () => {
  const rows = [view("Azure tenant", { platform_kind: "cloud_account" }), view("Hyland", { hosting_model: "paas" }), view("X", {})];
  assert.deepEqual(presentOptions(PLATFORM_KIND_FILTERS, rows.map((r) => r.group)).map((o) => o.label), ["Cloud tenants & accounts", "PaaS", "Kind not set"]);
  assert.deepEqual(presentOptions(PLATFORM_HOSTING_FILTERS, rows.map((r) => r.hostingKey)).map((o) => o.label), ["Public cloud", "PaaS", "Hosting not set"]);
});

test("the table filters on the derived kind / hosting keys and shows a chip, not the old inline select", () => {
  const src = readFileSync(new URL("../../components/mvp/InfraTables.tsx", import.meta.url), "utf8");
  assert.match(src, /kind !== "all" && kindView\.group !== kind/);
  assert.match(src, /hosting !== "all" && kindView\.hostingKey !== hosting/);
  assert.match(src, /<KindChip view=\{kindView\}/);
  assert.doesNotMatch(src, /field=\{platformKind\}/);
});
