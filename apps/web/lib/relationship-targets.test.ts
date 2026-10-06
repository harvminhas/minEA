import assert from "node:assert/strict";
import { test } from "node:test";
import allowed from "../../../packages/types/src/relationship-rules.json" with { type: "json" };
import {
  fieldForDialogLink,
  linkGroupsFor,
  linkTargetsFor,
  linksForTarget,
  offeredSections,
  patchForPickedLink,
  type LinkTarget,
} from "./relationship-targets.ts";
import type { FieldEdge, FieldRecord } from "./fields/save.ts";

const EXPECTED: Record<string, string[]> = {
  application: [
    "Applications",
    "Platforms & cloud",
    "Servers & devices",
    "Locations",
    "Flows",
    "APIs",
    "Events",
    "Integration infra",
    "Vendors & contracts",
    "Capabilities",
    "Roadmaps",
    "Data stores",
    "Data entities",
    "Data domains",
  ],
  cloud_service: [
    "Applications",
    "Platforms & cloud",
    "Servers & devices",
    "Locations",
    "Vendors & contracts",
    "Data stores",
  ],
  model: ["Applications", "Platforms & cloud", "Servers & devices", "Locations", "Vendors & contracts"],
  location: ["Applications", "Platforms & cloud", "Servers & devices"],
  capability: ["Applications", "Capabilities"],
  integration_flow: ["Applications", "APIs", "Events", "Integration infra"],
  api: ["Applications", "Flows", "Integration infra"],
  event: ["Applications", "Flows", "Integration infra", "Data entities"],
  external_party: ["Applications", "Platforms & cloud", "Servers & devices", "Vendors & contracts"],
};

function directions(link: LinkTarget): Array<"outbound" | "inverse"> {
  return link.direction === "both" ? ["outbound", "inverse"] : [link.direction];
}

test("offered sections follow the sidebar for each source", () => {
  const shared = new Set(
    (allowed as [string, string, string][]).map(([type, from, to]) => `${type}:${from}:${to}`)
  );
  for (const [source, expected] of Object.entries(EXPECTED)) {
    assert.deepEqual(offeredSections(source), expected, source);
    assert.equal(
      linkGroupsFor(source).some((group) => group.label === "Owners & teams"),
      false,
      source
    );
  }

  assert.deepEqual(
    linkGroupsFor("application").map((group) => [group.label, group.options.map((option) => option.label)]),
    [
      ["Applications", ["Applications"]],
      ["Platforms & cloud", ["Platforms & cloud"]],
      ["Servers & devices", ["Servers & devices"]],
      ["Locations", ["Locations"]],
      ["Connections", ["Flows", "APIs", "Events", "Integration infra"]],
      ["Vendors & contracts", ["Vendors & contracts"]],
      ["Capabilities", ["Capabilities"]],
      ["Roadmaps", ["Roadmaps"]],
      ["Data", ["Data stores", "Data entities", "Data domains"]],
    ]
  );

  assert.deepEqual(
    linkTargetsFor("application")
      .filter((link) => link.target === "application")
      .map((link) => link.type)
      .sort(),
    ["depends_on", "part_of", "replaces", "sends_data_to"]
  );
  assert.deepEqual(
    linkTargetsFor("application")
      .filter((link) => link.target === "external_party")
      .map((link) => link.type),
    ["supplied_by"]
  );
  assert.equal(
    linksForTarget("external_party", "application").some((link) => link.type === "supplied_by" && link.direction === "inverse"),
    true
  );
  assert.equal(
    linksForTarget("external_party", "cloud_service").some((link) => link.type === "supplied_by" && link.direction === "inverse"),
    true
  );
  assert.equal(
    linksForTarget("cloud_service", "external_party").some((link) => link.type === "supplied_by" && link.direction === "outbound"),
    true
  );
  assert.equal(
    linksForTarget("model", "external_party").some((link) => link.type === "supplied_by" && link.direction === "outbound"),
    true
  );
  assert.equal(linkTargetsFor("agent").some((link) => link.type === "uses_model"), false);

  const signature = (type: string) =>
    linkTargetsFor(type).map((link) => `${link.type}:${link.target}:${link.direction}`).sort();
  assert.deepEqual(signature("solution"), signature("application"));
  assert.deepEqual(signature("technical_capability"), signature("application"));
  assert.deepEqual(offeredSections("solution"), offeredSections("application"));
  assert.deepEqual(offeredSections("technical_capability"), offeredSections("application"));

  for (const [source, links] of [
    ["application", linkTargetsFor("application")],
    ["cloud_service", linkTargetsFor("cloud_service")],
    ["model", linkTargetsFor("model")],
  ] as const) {
    for (const link of links) {
      for (const direction of directions(link)) {
        const key =
          direction === "outbound"
            ? `${link.type}:${source}:${link.target}`
            : `${link.type}:${link.target}:${source}`;
        assert.equal(shared.has(key), true, key);
      }
    }
  }
});

test("a picked field-backed link routes through toPatch", () => {
  const record = (type: string, id = "row"): FieldRecord => ({ id, type, properties: {} });
  const previous: FieldEdge = {
    id: "old",
    type: "built_on",
    from_object_id: "app",
    from_type: "application",
    to_object_id: "old-platform",
    to_type: "cloud_service",
  };
  const replaced = patchForPickedLink(
    "application",
    { type: "built_on", target: "cloud_service", direction: "outbound" },
    "new-platform",
    record("application", "app"),
    [previous]
  );
  assert.deepEqual(replaced?.removeRelIds, ["old"]);
  assert.equal(replaced?.addRel?.[0]?.type, "built_on");
  assert.equal(replaced?.addRel?.[0]?.to_object_id, "new-platform");
  assert.equal(replaced?.addRel?.length, 1);

  const located = patchForPickedLink(
    "application",
    { type: "located_at", target: "location", direction: "outbound" },
    "new-site",
    record("application", "app"),
    [{
      id: "old-loc",
      type: "located_at",
      from_object_id: "app",
      from_type: "application",
      to_object_id: "old-site",
      to_type: "location",
    }]
  );
  assert.deepEqual(located?.removeRelIds, ["old-loc"]);
  assert.equal(located?.addRel?.[0]?.to_object_id, "new-site");
  assert.equal(located?.addRel?.length, 1);

  const supplied = patchForPickedLink(
    "application",
    { type: "supplied_by", target: "external_party", direction: "outbound" },
    "microsoft",
    record("application", "m365"),
    [{
      id: "old-vendor",
      type: "supplied_by",
      from_object_id: "m365",
      from_type: "application",
      to_object_id: "old",
      to_type: "external_party",
    }],
    "Microsoft"
  );
  assert.deepEqual(supplied?.removeRelIds, ["old-vendor"]);
  assert.equal(supplied?.addRel?.[0]?.type, "supplied_by");
  assert.equal(supplied?.addRel?.[0]?.to_object_id, "microsoft");
  assert.equal(supplied?.addRel?.length, 1);
  assert.equal((supplied?.object?.properties as { vendor?: string } | undefined)?.vendor, "Microsoft");

  for (const source of Object.keys(EXPECTED)) {
    for (const link of linkTargetsFor(source)) {
      for (const direction of directions(link)) {
        const concrete = { type: link.type, target: link.target, direction };
        if (!fieldForDialogLink(source, concrete)) continue;
        const patch = patchForPickedLink(source, concrete, "picked", record(source), []);
        assert.equal(patch?.addRel?.[0]?.type, link.type, `${source} ${link.type}`);
        const endpoint = direction === "outbound" ? patch?.addRel?.[0]?.to_object_id : patch?.addRel?.[0]?.from_object_id;
        assert.equal(endpoint, "picked");
      }
    }
  }
});
