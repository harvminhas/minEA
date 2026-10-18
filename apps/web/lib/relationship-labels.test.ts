import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ALLOWED_TRIPLES,
  RELATIONSHIP_LABELS,
  accountabilityLabel,
  relationshipLabelFor,
  type Relationship,
  type RelationshipType,
} from "@minea/types";
import { formatRelationshipTriple } from "./relationship-display.ts";

test("every allowed relationship type has labels and sentences", () => {
  for (const [type, from, to] of ALLOWED_TRIPLES) {
    const words = relationshipLabelFor(type, from, to);
    assert.ok(RELATIONSHIP_LABELS[type as RelationshipType], type);
    const sentence = words.sentence("A", "B");
    assert.ok(sentence.indexOf("A") >= 0 && sentence.indexOf("A") < sentence.indexOf("B"), `${type}: ${sentence}`);
    // Reverse sentences lead with the stored target.
    const reverse = words.reverseSentence("A", "B");
    assert.ok(reverse.indexOf("B") >= 0 && reverse.indexOf("B") < reverse.indexOf("A"), `${type}: ${reverse}`);
    assert.doesNotMatch(words.reverse, /inbound/i);
  }
});

test("labels are unique within each source/target type pair", () => {
  // What a picker shows between two record types: forward labels from the source side,
  // reverse labels from the target side. Two types must never read the same on one side.
  const forwards = new Map<string, string>();
  const reverses = new Map<string, string>();
  for (const [type, from, to] of ALLOWED_TRIPLES) {
    if (type === "calls") continue; // legacy, superseded by can_call
    const words = relationshipLabelFor(type, from, to);
    const fKey = `${from}>${to}:${words.forward}`;
    const rKey = `${from}>${to}:${words.reverse}`;
    assert.ok(!forwards.has(fKey) || forwards.get(fKey) === type, `${fKey} used by ${forwards.get(fKey)} and ${type}`);
    assert.ok(!reverses.has(rKey) || reverses.get(rKey) === type, `${rKey} used by ${reverses.get(rKey)} and ${type}`);
    forwards.set(fKey, type);
    reverses.set(rKey, type);
  }
});

test("the open record sees each type once per direction in the picker", () => {
  // From one record type to another, both directions together (what RelationshipForm offers).
  const pairs = new Map<string, Map<string, string>>();
  for (const [type, from, to] of ALLOWED_TRIPLES) {
    if (type === "calls") continue;
    const words = relationshipLabelFor(type, from, to);
    const out = pairs.get(`${from}>${to}`) ?? new Map<string, string>();
    pairs.set(`${from}>${to}`, out);
    const back = pairs.get(`${to}>${from}`) ?? new Map<string, string>();
    pairs.set(`${to}>${from}`, back);
    const outKey = `${type}|out`;
    const inKey = `${type}|in`;
    for (const [label, map, key] of [
      [words.forward, out, outKey],
      [words.symmetric ? null : words.reverse, back, inKey],
    ] as const) {
      if (!label) continue;
      const seen = map.get(label);
      assert.ok(!seen || seen === key, `${label} offered for ${seen} and ${key}`);
      map.set(label, key);
    }
  }
});

test("reverse labels read naturally", () => {
  assert.equal(RELATIONSHIP_LABELS.runs_on.reverse, "Hosts");
  assert.equal(RELATIONSHIP_LABELS.runs_on.reverseSentence("Salesforce", "Azure"), "Azure hosts Salesforce");
  assert.equal(RELATIONSHIP_LABELS.supported_by.forward, "Supported by");
  assert.equal(RELATIONSHIP_LABELS.supported_by.reverse, "Supports");
  assert.equal(RELATIONSHIP_LABELS.supports.forward, "Supports");
  assert.equal(RELATIONSHIP_LABELS.supports.reverse, "Supported by");
  assert.equal(RELATIONSHIP_LABELS.subscribes.reverse, "Subscribed to by");
  assert.equal(RELATIONSHIP_LABELS.subscribes.sentence("Billing", "Orders topic"), "Billing subscribes to Orders topic");
  assert.equal(RELATIONSHIP_LABELS.authenticates_via.sentence("CRM", "Okta"), "CRM signs in with Okta");
  assert.equal(RELATIONSHIP_LABELS.part_of.reverse, "Includes");
  assert.equal(RELATIONSHIP_LABELS.belongs_to.reverse, "Includes");
  assert.equal(RELATIONSHIP_LABELS.contains.reverse, "Stored in");
  assert.equal(RELATIONSHIP_LABELS.sends_data_to.reverse, "Gets data from");
  assert.equal(RELATIONSHIP_LABELS.uses_model.forward, "Uses model");
  assert.equal(RELATIONSHIP_LABELS.uses_model.sentence("Sales Assistant", "GPT-4o"), "Sales Assistant uses model GPT-4o");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.reverse, "Supplies");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.sentence("Microsoft 365", "Microsoft"), "Microsoft 365 is supplied by Microsoft");
  assert.equal(RELATIONSHIP_LABELS.supplied_by.reverseSentence("Microsoft 365", "Microsoft"), "Microsoft supplies Microsoft 365");
  for (const words of Object.values(RELATIONSHIP_LABELS)) {
    assert.doesNotMatch(`${words.forward} ${words.reverse}`, /inbound|made use of|provides support|contains entity/i);
  }
});

test("type-pair overrides win over the base words", () => {
  const model = relationshipLabelFor("runs_on", "ai_model", "cloud_service");
  assert.equal(model.forward, "Accessed through");
  assert.equal(model.reverse, "Provides access to");
  assert.equal(relationshipLabelFor("runs_on", "application", "cloud_service").reverse, "Hosts");
  assert.equal(relationshipLabelFor("built_on", "agent", "cloud_service").forward, "Built with");
  // Both ends must be known, or an app hosted on a platform would read "Accessed through".
  assert.equal(relationshipLabelFor("runs_on", null, "cloud_service").forward, "Runs on");
  assert.equal(relationshipLabelFor("runs_on", "ai_model").forward, "Runs on");
});

test("mutual links read the same way from either end", () => {
  const words = relationshipLabelFor("depends_on", "application", "application");
  assert.equal(words.mutual, true);
  assert.equal(words.reverse, "Needed by");
});

test("the web and API carry the same label registry", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const shared = readFileSync(path.resolve(here, "../../../packages/types/src/relationship-labels.json"), "utf8");
  const api = readFileSync(path.resolve(here, "../../api/app/data/relationship_labels.json"), "utf8");
  assert.deepEqual(JSON.parse(api), JSON.parse(shared));
});

test("accountability verbs have reverse labels", () => {
  assert.equal(accountabilityLabel("owns").forward, "Owns");
  assert.equal(accountabilityLabel("owns").reverse, "Owned by");
  assert.equal(accountabilityLabel("stewards").reverse, "Stewarded by");
  assert.equal(accountabilityLabel("informed").reverse, "Keeps informed");
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

test("an app hosted on a tenant reads Hosts from the tenant", () => {
  const rel: Relationship = {
    id: "r",
    workspace_id: "w",
    org_id: "o",
    type: "runs_on",
    from_object_id: "sf",
    from_type: "application",
    to_object_id: "azure",
    to_type: "cloud_service",
    attributes: {},
    created_at: "2026-01-01T00:00:00Z",
  };
  assert.equal(formatRelationshipTriple(rel, "azure", "Azure", "Salesforce").nameLine, "Hosts Salesforce");
  assert.equal(formatRelationshipTriple(rel, "sf", "Salesforce", "Azure").nameLine, "Runs on Azure");
});
