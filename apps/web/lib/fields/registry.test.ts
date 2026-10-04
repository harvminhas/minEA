import assert from "node:assert/strict";
import { test } from "node:test";
import { CREATE_FORM_KEYS, INTERNAL_KEYS, REGISTRY, createFormFields, createFormSeed, fieldIsRequired, recordTypeOf, type FieldDef, type RecordType } from "./registry.ts";
import { emptyOwnership, type OwnershipValue } from "../owner-fields.ts";
import { buildPlatformProperties, lifecycleToStatus } from "../platform-utils.ts";
import { buildRuntimeProperties } from "../runtime-utils.ts";
import { buildIntegrationInfraProperties } from "../integration-infra-utils.ts";
import { applyPatch, readField, sameFieldValue, toPatch, type FieldEdge, type FieldRecord } from "./save.ts";

const OBJECT_TYPE: Record<RecordType, string> = {
  application: "application",
  server: "model",
  platform: "cloud_service",
  location: "location",
  component: "component",
  flow: "integration_flow",
  api: "api",
  event: "event",
  integration_infra: "tool",
  team: "team",
  role: "role",
  contact: "contact",
  capability: "capability",
};

const BODY_KEYS: Partial<Record<RecordType, readonly string[]>> = {
  flow: [
    "from",
    "to",
    "mechanism",
    "manual_owner",
    "manual_trigger",
    "schedule",
    "platform",
    "carrier",
    "direction",
    "protocol",
    "format",
    "frequency",
    "auth",
    "criticality",
    "data_classification",
    "sources",
    "destinations",
  ],
  api: [
    "protocol",
    "version",
    "base_url",
    "auth",
    "provider",
    "consumers",
    "gateway",
    "audience",
    "criticality",
    "node_layout",
  ],
  event: [
    "topic",
    "version",
    "schema_ref",
    "delivery",
    "producer",
    "subscribers",
    "broker",
    "audience",
    "criticality",
    "node_layout",
  ],
  component: ["component_type", "tech_stack", "ai_role", "systems", "runtime", "platform", "node_layout"],
};

function blankRecord(type: RecordType): FieldRecord {
  return { id: "rec", type: OBJECT_TYPE[type], properties: {}, tags: [] };
}

function sample(def: FieldDef): unknown {
  if (def.editor === "select") return def.options?.[0]?.value ?? "x";
  if (def.editor === "date") return "2026-12-31";
  if (def.editor === "tags") return ["x"];
  if (def.editor === "owner") {
    return {
      ownerTeamId: "team-1",
      ownerTeamName: "Ops",
      pointOfContactId: "poc-1",
      pointOfContactName: "Ana",
    } satisfies OwnershipValue;
  }
  if (def.editor === "relation" && def.source.kind === "rel") {
    return def.source.single ? "target-1" : ["target-1"];
  }
  if (def.editor === "costLines") return [{ label: "License", cents: 100 }];
  if (def.editor === "number") return 1;
  return "x";
}

function emptyValue(def: FieldDef): unknown {
  if (def.editor === "tags" || def.editor === "costLines") return [];
  if (def.editor === "relation" && def.source.kind === "rel" && !def.source.single) return [];
  if (def.editor === "owner") return emptyOwnership();
  return "";
}

function sourceKey(def: FieldDef): string {
  const source = def.source;
  if (source.kind === "derived") return `derived:${def.key}`;
  if (source.kind === "column") return `column:${source.column}`;
  if (source.kind === "prop") return `prop:${source.key}`;
  if (source.kind === "owner") return "owner";
  if (source.kind === "people") return `people:${source.field}`;
  return `rel:${source.edge}:${source.dir}:${source.target.join(",")}:${source.single}`;
}

test("every editable field round-trips and clears", () => {
  for (const type of Object.keys(REGISTRY) as RecordType[]) {
    const record = blankRecord(type);
    for (const def of REGISTRY[type]) {
      if (def.editor === "none" || def.editor === "custom") continue;
      const value = sample(def);
      const saved = applyPatch(record, toPatch(def, value, record, []), []);
      assert.deepEqual(readField(def, saved), value, `${type}.${def.key}`);
      for (const cleared of [null, ""]) {
        const next = applyPatch(saved, toPatch(def, cleared, saved, saved.edges ?? []), saved.edges ?? []);
        assert.deepEqual(readField(def, next), emptyValue(def), `${type}.${def.key} clear`);
        if (def.source.kind === "prop") {
          assert.equal(Object.hasOwn(next.properties, def.source.key), false, `${type}.${def.key} key`);
        }
        if (def.key === "access_method") {
          assert.equal(Object.hasOwn(next.properties, "console_url"), false, `${type}.${def.key} console_url`);
        }
        if (def.key === "built_on") {
          assert.equal(Object.hasOwn(next.properties, "platform"), false, `${type}.${def.key} platform`);
        }
      }
    }
  }
});

test("changing the team keeps the point of contact", () => {
  const record = blankRecord("server");
  record.owner = "Ops";
  record.owner_team_id = "ops";
  record.owner_team_name = "Ops";
  record.point_of_contact_id = "ana";
  record.point_of_contact_name = "Ana";
  const def = REGISTRY.server.find((field) => field.key === "owner")!;
  const saved = applyPatch(
    record,
    toPatch(def, { ownerTeamId: "fin", ownerTeamName: "Finance" }, record, []),
    []
  );
  const owner = readField(def, saved) as OwnershipValue;
  assert.equal(owner.ownerTeamName, "Finance");
  assert.equal(owner.pointOfContactName, "Ana");
  assert.equal(owner.pointOfContactId, "ana");
});

test("lifecycle, access method, and built-on write their paired values", () => {
  const server = blankRecord("server");
  const lifecycle = REGISTRY.server.find((field) => field.key === "lifecycle")!;
  const savedLifecycle = applyPatch(server, toPatch(lifecycle, "active", server, []), []);
  assert.equal(savedLifecycle.properties.lifecycle, "active");
  assert.equal(savedLifecycle.status, lifecycleToStatus("active"));

  const access = REGISTRY.server.find((field) => field.key === "access_method")!;
  const savedAccess = applyPatch(server, toPatch(access, "ssh", server, []), []);
  assert.equal(savedAccess.properties.access_method, "ssh");
  assert.equal(savedAccess.properties.console_url, "ssh");

  const app = blankRecord("application");
  const builtOn = REGISTRY.application.find((field) => field.key === "built_on")!;
  const savedPlatform = applyPatch(app, toPatch(builtOn, "plat-1", app, []), []);
  assert.deepEqual(savedPlatform.properties.platform, { platform_id: "plat-1", platform_name: "" });
});

function allowedKeys(type: RecordType): Set<string> {
  const keys = new Set<string>(INTERNAL_KEYS);
  for (const def of REGISTRY[type]) {
    if (def.source.kind === "prop") keys.add(def.source.key);
  }
  return keys;
}

function assertKeys(type: RecordType, keys: readonly string[]) {
  const allowed = allowedKeys(type);
  for (const key of keys) assert.ok(allowed.has(key), `${type} writes ${key}`);
}

function outgoing(record: FieldRecord, edgeType: string, targetType: string, targetId: string): FieldEdge {
  return {
    id: `edge-${targetId}`,
    type: edgeType,
    from_object_id: record.id,
    from_type: record.type,
    to_object_id: targetId,
    to_type: targetType,
  };
}

test("a single relation replaces the previous edge", () => {
  const cases: { type: RecordType; key: string; edge: string; target: string }[] = [
    { type: "server", key: "located_at", edge: "located_at", target: "location" },
    { type: "server", key: "runs_on", edge: "runs_on", target: "model" },
    { type: "application", key: "built_on", edge: "built_on", target: "cloud_service" },
    { type: "platform", key: "located_at", edge: "located_at", target: "location" },
  ];
  for (const item of cases) {
    const record = blankRecord(item.type);
    const def = REGISTRY[item.type].find((field) => field.key === item.key)!;
    const edges = [outgoing(record, item.edge, item.target, "old-1")];
    const saved = applyPatch(record, toPatch(def, "new-1", record, edges), edges);
    assert.equal(saved.edges?.length, 1, item.key);
    assert.equal(saved.edges?.[0]?.to_object_id, "new-1", item.key);
    assert.equal(saved.edges?.[0]?.type, item.edge, item.key);
  }
});

test("capabilities replace the previous set", () => {
  const record = blankRecord("application");
  const def = REGISTRY.application.find((field) => field.key === "capabilities")!;
  const edges: FieldEdge[] = ["a", "b"].map((id) => ({
    id: `edge-${id}`,
    type: "supported_by",
    from_object_id: id,
    from_type: "capability",
    to_object_id: record.id,
    to_type: record.type,
  }));
  const saved = applyPatch(record, toPatch(def, ["c"], record, edges), edges);
  assert.equal(saved.edges?.length, 1);
  assert.equal(saved.edges?.[0]?.from_object_id, "c");
  assert.equal(saved.edges?.[0]?.type, "supported_by");
});

test("written property keys belong to that type", () => {
  assertKeys("server", Object.keys(buildRuntimeProperties({
    kind: "vm",
    vendor: "Dell",
    provider: "aws",
    serviceProduct: "EC2",
    hostingModel: "cloud",
    region: "us-east-1",
    environments: ["prod"],
    accessMethod: "ssh",
    costModel: "reserved",
    commitmentEnds: "2026-12-31",
    annualCost: "1000",
    slaTarget: "99_9",
    lifecycle: "active",
    criticality: "high",
  })));
  assertKeys("platform", Object.keys(buildPlatformProperties({
    vendor: "microsoft",
    vendorProduct: "365",
    platformType: "other",
    platformTypeOther: "suite",
    hostingModel: "saas",
    region: "us",
    environments: ["prod"],
    adminUrl: "https://admin.example",
    licenseModel: "per_user",
    contractRenewal: "2026-12-31",
    annualCost: "1000",
    slaTarget: "99_9",
    lifecycle: "active",
    criticality: "high",
  })));
  assertKeys("integration_infra", Object.keys(buildIntegrationInfraProperties({
    kind: "custom",
    kindOther: "bridge",
    handles: ["apis"],
    vendor: "mulesoft",
    vendorProduct: "Anypoint",
    hostingModel: "saas",
    region: "us",
    environments: ["prod"],
    adminUrl: "https://admin.example",
    licenseModel: "per_user",
    contractRenewal: "2026-12-31",
    annualCost: "1000",
    slaTarget: "99_9",
    lifecycle: "active",
    criticality: "high",
  })));
  for (const [type, keys] of Object.entries(BODY_KEYS) as [RecordType, readonly string[]][]) {
    assertKeys(type, keys);
  }
});

test("labels and sources are unique within a type", () => {
  for (const [type, fields] of Object.entries(REGISTRY)) {
    const labels = fields.map((field) => field.label);
    assert.equal(new Set(labels).size, labels.length, type);
    const sources = fields.map(sourceKey);
    assert.equal(new Set(sources).size, sources.length, type);
  }
});

test("built_on drops a legacy runs_on edge to a platform", () => {
  const record = blankRecord("application");
  const def = REGISTRY.application.find((field) => field.key === "built_on")!;
  const edges = [
    {
      id: "legacy",
      type: "runs_on",
      from_object_id: "rec",
      from_type: "application",
      to_object_id: "old-platform",
      to_type: "cloud_service",
    },
    {
      id: "server",
      type: "runs_on",
      from_object_id: "rec",
      from_type: "application",
      to_object_id: "as400",
      to_type: "model",
    },
  ];
  const saved = applyPatch(record, toPatch(def, "new-1", record, edges), edges);
  assert.deepEqual(
    (saved.edges ?? []).map((edge) => `${edge.type}:${edge.to_type}:${edge.to_object_id}`).sort(),
    ["built_on:cloud_service:new-1", "runs_on:model:as400"]
  );
});

test("name is required for every type", () => {
  for (const [type, fields] of Object.entries(REGISTRY)) {
    const name = fields.find((field) => field.key === "name");
    assert.ok(name, type);
    assert.equal(fieldIsRequired(name, { properties: {} }), true, type);
  }
});

test("an unchanged draft matches the stored value", () => {
  assert.equal(sameFieldValue("2026-12-31", "2026-12-31"), true);
  assert.equal(sameFieldValue("2026-12-31", "2026-01-01"), false);
  assert.equal(sameFieldValue("x", "x"), true);
  assert.equal(sameFieldValue("", ""), true);
  assert.equal(sameFieldValue("", null), true);
  assert.equal(sameFieldValue(5, "5"), true);
  assert.equal(sameFieldValue(["a", "b"], ["a", "b"]), true);
  assert.equal(sameFieldValue(["a"], ["b"]), false);
  assert.equal(sameFieldValue("target-1", "target-1"), true);
  assert.equal(
    sameFieldValue(
      { ownerTeamId: "ops", ownerTeamName: "Ops", pointOfContactId: "ana", pointOfContactName: "Ana" },
      { ownerTeamId: "ops", ownerTeamName: "Ops", pointOfContactId: "ana", pointOfContactName: "Ana" }
    ),
    true
  );
  assert.equal(
    sameFieldValue(
      { ownerTeamId: "ops", ownerTeamName: "Ops", pointOfContactId: "ana", pointOfContactName: "Ana" },
      { ownerTeamId: "fin", ownerTeamName: "Finance", pointOfContactId: "ana", pointOfContactName: "Ana" }
    ),
    false
  );
  assert.equal(
    sameFieldValue(
      { ownerTeamId: "ops", ownerTeamName: "Ops", pointOfContactId: "ana", pointOfContactName: "Ana" },
      { ownerTeamId: "fin", ownerTeamName: "Ops", pointOfContactId: "ana", pointOfContactName: "Ana" }
    ),
    false
  );
});

test("owner is optional when governance status is shadow", () => {
  const owner = REGISTRY.application.find((field) => field.key === "owner")!;
  assert.equal(fieldIsRequired(owner, { properties: { governance_status: "shadow" } }), false);
  assert.equal(fieldIsRequired(owner, { properties: { governance_status: "sanctioned" } }), true);
});

test("recordTypeOf maps stored object types", () => {
  assert.equal(recordTypeOf("application"), "application");
  assert.equal(recordTypeOf("solution"), "application");
  assert.equal(recordTypeOf("technical_capability"), "application");
  assert.equal(recordTypeOf("model"), "server");
  assert.equal(recordTypeOf("cloud_service"), "platform");
  assert.equal(recordTypeOf("tool"), "integration_infra");
  assert.equal(recordTypeOf("integration_flow"), "flow");
  assert.equal(recordTypeOf("domain"), null);
});

test("create forms follow registry order and leave optional fields blank", () => {
  for (const type of ["application", "server", "platform"] as const) {
    assert.deepEqual(createFormFields(type).map((field) => field.key), [...CREATE_FORM_KEYS[type]]);
    const indexes = CREATE_FORM_KEYS[type].map((key) => REGISTRY[type].findIndex((field) => field.key === key));
    assert.ok(indexes.every((index) => index >= 0), type);
    for (let i = 1; i < indexes.length; i += 1) {
      assert.ok(indexes[i]! > indexes[i - 1]!, `${type} ${CREATE_FORM_KEYS[type][i]}`);
    }
    const seed = createFormSeed(type);
    assert.equal(seed.criticality, "");
    assert.equal(seed.sla_target, "");
    assert.equal(seed.vendor, "");
    assert.equal(seed.hosting_model, "");
    assert.equal(seed.license_model, "");
    assert.equal(seed.cost_model, "");
    assert.equal(seed.lifecycle, "");
  }
  assert.equal(createFormSeed("application").kind, "");
  assert.equal(createFormSeed("application").provider, "");
  assert.equal(createFormSeed("platform").kind, "");
  assert.equal(createFormSeed("platform").provider, "");
  assert.equal(createFormSeed("server").kind, "kubernetes");
  assert.equal(createFormSeed("server").provider, "aws");
  assert.equal(REGISTRY.server.find((field) => field.key === "compute_runtime_kind")?.label, "Compute type");
  assert.equal(REGISTRY.application.find((field) => field.key === "contract_renewal")?.label, "Renewal");
  assert.equal(REGISTRY.platform.find((field) => field.key === "vendor_product")?.label, "Product");
});

test("a blank platform create omits vendor, license model, and lifecycle", () => {
  const props = buildPlatformProperties({
    vendor: "",
    vendorProduct: "",
    platformType: "low_code",
    platformTypeOther: "",
    hostingModel: "",
    region: "",
    environments: [],
    adminUrl: "",
    licenseModel: "",
    contractRenewal: "",
    annualCost: "",
    slaTarget: "",
    lifecycle: "",
    criticality: "",
  });
  assert.equal("vendor" in props, false);
  assert.equal("license_model" in props, false);
  assert.equal("lifecycle" in props, false);
  assert.equal(props.platform_type, "low_code");
});
