import assert from "node:assert/strict";
import { test } from "node:test";
import { ownerLineLabel, resolveEntityOwners } from "./entity-owner";

test("owns accountabilities are the source of truth and suppress column fallback", () => {
  const result = resolveEntityOwners({
    accountabilities: [
      { id: "a1", subject_type: "contact", subject_id: "c1", subject_name: "Priya Shah", link_kind: "owns" },
      { id: "a2", subject_type: "contact", subject_id: "c2", subject_name: "Alex Rivera", link_kind: "informed" },
    ],
    object: { owner: "Legacy Name", point_of_contact_name: "Someone Else", tags: [], name: "Cap", type: "capability", id: "x", workspace_id: "", org_id: "", properties: {}, created_at: "", updated_at: "" },
  });
  assert.equal(result.usedFallback, false);
  assert.deepEqual(result.owners.map((item) => item.name), ["Priya Shah"]);
  assert.equal(ownerLineLabel(result.owners), "Priya Shah");
});

test("with no owns row, catalog columns and business_owner are a read fallback", () => {
  const result = resolveEntityOwners({
    accountabilities: [
      { id: "a2", subject_type: "contact", subject_id: "c2", subject_name: "Alex Rivera", link_kind: "informed" },
    ],
    object: {
      id: "x",
      workspace_id: "",
      org_id: "",
      type: "capability",
      name: "Cap",
      tags: [],
      properties: {},
      created_at: "",
      updated_at: "",
      point_of_contact_id: "p1",
      point_of_contact_name: "Chris Nguyen",
    },
  });
  assert.equal(result.usedFallback, true);
  assert.equal(result.owners[0]?.name, "Chris Nguyen");
  assert.equal(result.owners[0]?.source, "legacy");
});

test("legacy owner text is used when no ids exist, and multiple owners are labelled compactly", () => {
  const none = resolveEntityOwners({
    object: {
      id: "x",
      workspace_id: "",
      org_id: "",
      type: "business_domain",
      name: "Land",
      tags: [],
      properties: {},
      created_at: "",
      updated_at: "",
      owner: "Land team",
    },
  });
  assert.equal(none.owners[0]?.name, "Land team");
  assert.equal(none.owners[0]?.subjectType, "legacy");
  const many = resolveEntityOwners({
    accountabilities: [
      { id: "a1", subject_type: "contact", subject_id: "c1", subject_name: "Priya Shah", link_kind: "owns" },
      { id: "a2", subject_type: "team", subject_id: "t1", subject_name: "Land ops", link_kind: "owns" },
    ],
  });
  assert.equal(ownerLineLabel(many.owners), "Priya Shah +1");
});

test("business_owner role rows are a fallback when no owns accountability exists", () => {
  const result = resolveEntityOwners({
    roleAccountabilities: [
      { id: "r1", subject_type: "contact", subject_id: "c9", subject_name: "Jordan Cole", link_kind: "business_owner" },
    ],
  });
  assert.equal(result.usedFallback, true);
  assert.equal(result.owners[0]?.name, "Jordan Cole");
  assert.equal(result.owners[0]?.source, "ownership_role");
});
