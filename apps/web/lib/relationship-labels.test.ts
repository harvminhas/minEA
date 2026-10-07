import assert from "node:assert/strict";
import { test } from "node:test";
import { ALLOWED_TRIPLES, RELATIONSHIP_LABELS, type Relationship, type RelationshipType } from "@minea/types";
import { formatRelationshipTriple } from "./relationship-display.ts";

test("every allowed relationship type has one unique pair of labels", () => {
  const used = new Set<RelationshipType>();
  for (const [type] of ALLOWED_TRIPLES) used.add(type as RelationshipType);
  for (const type of used) {
    assert.ok(RELATIONSHIP_LABELS[type], type);
    assert.equal(typeof RELATIONSHIP_LABELS[type].sentence("A", "B"), "string");
  }

  const forwards = Object.values(RELATIONSHIP_LABELS).map((item) => item.forward);
  const reverses = Object.values(RELATIONSHIP_LABELS).map((item) => item.reverse);
  assert.equal(new Set(forwards).size, forwards.length);
  assert.equal(new Set(reverses).size, reverses.length);

  const words = RELATIONSHIP_LABELS.depends_on;
  const sentence = words.sentence("A", "B");
  assert.ok(sentence.indexOf("A") >= 0 && sentence.indexOf("A") < sentence.indexOf("B"));
  assert.equal(RELATIONSHIP_LABELS.supported_by.forward, "Supported by");
  assert.equal(RELATIONSHIP_LABELS.supported_by.reverse, "Supports");
  assert.equal(RELATIONSHIP_LABELS.connects.forward, "Uses");
  assert.equal(RELATIONSHIP_LABELS.connects.reverse, "Used by flow");
  assert.equal(RELATIONSHIP_LABELS.connects_to.reverse, "Connected through");
  assert.equal(RELATIONSHIP_LABELS.hosts.forward, "Gateway for");
  assert.equal(RELATIONSHIP_LABELS.runs_on.reverse, "Runs");
  assert.equal(RELATIONSHIP_LABELS.part_of.reverse, "Includes");
  assert.equal(RELATIONSHIP_LABELS.belongs_to.reverse, "Contains entity/store");
  assert.equal(RELATIONSHIP_LABELS.contains.reverse, "Stored in");
  assert.equal(RELATIONSHIP_LABELS.sends_data_to.reverse, "Gets data from");
  assert.equal(RELATIONSHIP_LABELS.uses_model.forward, "Uses model");
  assert.equal(RELATIONSHIP_LABELS.uses_model.reverse, "Used by");
  assert.equal(RELATIONSHIP_LABELS.uses_model.sentence("Sales Assistant", "GPT-4o"), "Sales Assistant uses model GPT-4o");
  assert.equal(RELATIONSHIP_LABELS.writes.reverse, "Written to by");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.forward, "Supplied by");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.reverse, "Supplies");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.sentence("Microsoft 365", "Microsoft"), "Microsoft 365 is supplied by Microsoft");
  assert.equal(RELATIONSHIP_LABELS.runs_on.sentence("Microsoft 365", "Dynamics 365"), "Microsoft 365 runs on Dynamics 365");
});

test("the stored target shows the reverse label", () => {
  const rel: Relationship = {
    id: "r",
    workspace_id: "w",
    org_id: "o",
    type: "depends_on",
    from_object_id: "m365",
    from_type: "application",
    to_object_id: "hubspot",
    to_type: "application",
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(formatRelationshipTriple(rel, "hubspot", "HubSpot", "Microsoft 365").nameLine, "Needed by Microsoft 365");
  assert.equal(formatRelationshipTriple(rel, "m365", "Microsoft 365", "HubSpot").nameLine, "Depends on HubSpot");
});

test("a vendor shows the reverse supplied-by label", () => {
  const rel: Relationship = {
    id: "r",
    workspace_id: "w",
    org_id: "o",
    type: "supplied_by",
    from_object_id: "m365",
    from_type: "application",
    to_object_id: "microsoft",
    to_type: "external_party",
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(formatRelationshipTriple(rel, "microsoft", "Microsoft", "Microsoft 365").nameLine, "Supplies Microsoft 365");
  assert.equal(formatRelationshipTriple(rel, "m365", "Microsoft 365", "Microsoft").nameLine, "Supplied by Microsoft");
});
