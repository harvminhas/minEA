import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAPABILITY_MAPPING_TYPES,
  groupMappedLinks,
  mappedLinksFromPeople,
  mappedLinksFromProcesses,
  mappedLinksFromProducts,
  mappedLinksFromRelationships,
  offerCreateInline,
  relationshipEnds,
  scopePhrase,
} from "./capability-mapping.ts";

test("grouped Relationships section lists every approved type with apps first", () => {
  assert.equal(CAPABILITY_MAPPING_TYPES[0]?.key, "application");
  assert.deepEqual(
    CAPABILITY_MAPPING_TYPES.map((item) => item.key),
    [
      "application",
      "process",
      "data_object",
      "people",
      "agent",
      "cloud_service",
      "external_party",
      "product",
      "location",
      "capability",
      "data_store",
      "data_domain",
      "roadmap_item",
      "model",
    ]
  );
});

test("relationship ends use the stored direction for inverse types", () => {
  const agent = CAPABILITY_MAPPING_TYPES.find((item) => item.key === "agent")!;
  assert.deepEqual(relationshipEnds(agent, "agent-1", "agent", "cap-1"), {
    type: "supports",
    from_object_id: "agent-1",
    from_type: "agent",
    to_object_id: "cap-1",
    to_type: "capability",
  });
  const app = CAPABILITY_MAPPING_TYPES.find((item) => item.key === "application")!;
  assert.equal(relationshipEnds(app, "app-1", "application", "cap-1").from_object_id, "cap-1");
  assert.equal(relationshipEnds(app, "app-1", "application", "cap-1").type, "supported_by");
});

test("links group by type and name the scope", () => {
  const scopes = [
    { id: "cap", name: "Onboarding", level: "capability" as const },
    { id: "kyc", name: "Collect KYC", level: "activity" as const },
  ];
  const rels = mappedLinksFromRelationships(
    [
      {
        id: "r1",
        type: "supported_by",
        from_object_id: "cap",
        from_type: "capability",
        to_object_id: "sf",
        to_type: "application",
        attributes: { fitness: "strong" },
      },
      {
        id: "r2",
        type: "reads",
        from_object_id: "kyc",
        from_type: "capability",
        to_object_id: "cust",
        to_type: "data_object",
      },
    ],
    scopes,
    [
      { id: "sf", name: "Salesforce", type: "application" },
      { id: "cust", name: "Customer record", type: "data_object" },
    ],
    "cap"
  );
  const processes = mappedLinksFromProcesses(
    [{ id: "p1", name: "Annual KYC review", stages: [{ capability_ids: ["cap"] }] }],
    scopes,
    "cap"
  );
  const products = mappedLinksFromProducts([{ id: "pr1", name: "Current account", capability_ids: ["kyc"] }], scopes, "cap");
  const people = mappedLinksFromPeople(
    [{ id: "a1", subject_type: "contact", subject_id: "c1", subject_name: "Priya Shah", link_kind: "owns", entity_id: "cap" }],
    scopes,
    "cap"
  );
  const groups = groupMappedLinks([...rels, ...processes, ...products, ...people]);
  assert.deepEqual(
    groups.map((group) => group.key),
    ["application", "process", "data_object", "people", "product"]
  );
  assert.equal(scopePhrase("capability", "Onboarding", "cap", "cap"), "on this capability");
  assert.equal(scopePhrase("activity", "Collect KYC", "cap", "kyc"), "on Collect KYC");
  assert.match(groups[0]!.items[0]!.relationshipLabel, /Strong/);
  assert.equal(groups[0]!.items[0]!.relationshipLabel.includes("on this capability"), true);
});

test("create-inline appears when the typed name is new", () => {
  const app = CAPABILITY_MAPPING_TYPES.find((item) => item.key === "application")!;
  assert.equal(offerCreateInline(app, "Ledger", ["Salesforce"]), true);
  assert.equal(offerCreateInline(app, "Salesforce", ["Salesforce"]), false);
  assert.equal(offerCreateInline(app, "  ", ["Salesforce"]), false);
  const cap = CAPABILITY_MAPPING_TYPES.find((item) => item.key === "capability")!;
  assert.equal(offerCreateInline(cap, "New cap", []), false);
});
