import assert from "node:assert/strict";
import test from "node:test";
import { mapComputeKind } from "./infraConfig.ts";
import { readRuntimeInfra, noHostLinked } from "./read.ts";
import { infraStatus } from "./status.ts";

const TODAY = new Date("2026-09-25T00:00:00Z");

test("support that already ended wins over an unsupported OS", () => {
  const status = infraStatus(
    { runtimeKind: "physical_server", supportEnds: "2023-09-30", osName: "IBM i", osVersion: "7.3" },
    TODAY,
  );
  assert.equal(status.status, "out_of_support");
  assert.equal(status.label, "Out of support");
});

test("an ended OS with no support date is unsupported", () => {
  const status = infraStatus({ runtimeKind: "vm", osName: "Windows Server", osVersion: "2012 R2" }, TODAY);
  assert.equal(status.status, "unsupported_os");
  assert.equal(status.effectiveDate, "2023-10-10");
});

test("ends soon is inside 90 days, and 90 days is still OK", () => {
  const soon = infraStatus({ supportEnds: "2026-12-23" }, TODAY);
  assert.equal(soon.status, "ends_soon");
  assert.equal(soon.label, "Ends in 89 days");
  const ok = infraStatus({ supportEnds: "2026-12-24" }, TODAY);
  assert.equal(ok.status, "ok");
  const today = infraStatus({ supportEnds: "2026-09-25" }, TODAY);
  assert.equal(today.status, "ends_soon");
  assert.equal(today.label, "Ends in 0 days");
  const past = infraStatus({ supportEnds: "2026-09-24" }, TODAY);
  assert.equal(past.status, "out_of_support");
});

test("the earlier of support and OS dates drives ends soon", () => {
  const status = infraStatus(
    { supportEnds: "2027-10-30", osName: "Windows 11", osVersion: "23H2" },
    TODAY,
  );
  assert.equal(status.status, "ends_soon");
  assert.equal(status.dateSource, "os");
});

test("OS matching is case-insensitive and does not treat 2012 as 2012 R2", () => {
  assert.equal(infraStatus({ osName: "windows server", osVersion: "2012 r2" }, TODAY).status, "unsupported_os");
  assert.equal(infraStatus({ osName: "Windows  Server", osVersion: "2012 R2" }, TODAY).status, "unsupported_os");
  assert.equal(infraStatus({ osName: "Windows Server", osVersion: "2012 R2 Datacenter" }, TODAY).status, "unknown");
  assert.equal(infraStatus({ osName: "Windows Server", osVersion: "2012" }, TODAY).status, "unsupported_os");
  assert.equal(infraStatus({ osName: "Ubuntu", osVersion: "22.04 LTS" }, TODAY).status, "ok");
});

test("a managed cloud service with no dates is OK, a VM is not set", () => {
  assert.equal(infraStatus({ runtimeKind: "cloud_service" }, TODAY).status, "ok");
  assert.equal(infraStatus({ runtimeKind: "vm" }, TODAY).label, "Not set");
});

test("runtime_kind wins over compute_runtime_kind", () => {
  assert.equal(mapComputeKind("on_prem"), "physical_server");
  assert.equal(mapComputeKind("kubernetes"), "cloud_service");
  assert.equal(mapComputeKind("not-a-kind"), null);
  const view = readRuntimeInfra({
    id: "1",
    name: "AS400",
    properties: { runtime_kind: "database", compute_runtime_kind: "on_prem" },
  } as never);
  assert.equal(view.runtimeKind, "database");
});

test("no host linked is only on-prem or hybrid with no runs-on or built-on edge", () => {
  const app = { type: "application", properties: { hosting_model: "on_premise" } };
  assert.equal(noHostLinked(app, [], "app"), true);
  assert.equal(noHostLinked(app, [{ type: "runs_on", fromId: "app", toId: "host" }], "app"), false);
  assert.equal(noHostLinked({ type: "application", properties: { hosting_model: "cloud" } }, [], "app"), false);
  assert.equal(noHostLinked({ type: "application", properties: { hosting_model: "saas" } }, [], "app"), false);
});
