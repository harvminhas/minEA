import assert from "node:assert/strict";
import { test } from "node:test";
import { presentImpact, type ImpactEdge, type ImpactNode, type ImpactRecord } from "./relationship-impact.ts";

function record(id: string, name: string, typeLabel: string, extra: Partial<ImpactRecord> = {}): ImpactRecord {
  return {
    id,
    name,
    typeLabel,
    owner: "",
    criticality: "",
    annualCost: null,
    renewal: null,
    missingOwner: false,
    missingCriticality: true,
    hostingModel: "",
    ...extra,
  };
}

test("Salesforce CRM lists affected rows, not the source", () => {
  const source = record("sf", "Salesforce CRM", "Application", { owner: "SF Tech Team", annualCost: "$31,500/yr" });
  const nodes: ImpactNode[] = [
    { id: "sf", name: "Salesforce CRM", typeLabel: "Application" },
    { id: "cs", name: "Customer Service", typeLabel: "Component" },
    { id: "mkt", name: "Marketing", typeLabel: "Component" },
    { id: "sm", name: "Sales Module", typeLabel: "Component" },
    { id: "m360", name: "My 360", typeLabel: "Application" },
    { id: "mc", name: "Marketing Campaigns", typeLabel: "Capability" },
  ];
  const edges: ImpactEdge[] = [
    { type: "part_of", fromId: "cs", toId: "sf" },
    { type: "part_of", fromId: "mkt", toId: "sf" },
    { type: "part_of", fromId: "sm", toId: "sf" },
    { type: "part_of", fromId: "m360", toId: "sf" },
    { type: "supported_by", fromId: "mc", toId: "sf" },
  ];
  const presented = presentImpact({
    source,
    records: [
      source,
      record("cs", "Customer Service", "Component"),
      record("mkt", "Marketing", "Component"),
      record("sm", "Sales Module", "Component"),
      record("m360", "My 360", "Application"),
      record("mc", "Marketing Campaigns", "Capability"),
    ],
    nodes,
    edges,
  });

  assert.equal(presented.rows.some((row) => row.record.id === "sf"), false);
  assert.equal(presented.rows[0]?.n, 2);
  assert.equal(presented.rows.filter((row) => row.section === "Stops working").length, 4);
  assert.equal(presented.rows.filter((row) => row.section === "Loses support").length, 1);
  assert.match(presented.sentence, /Customer Service, Marketing, My 360, and 1 more stop working/);
  assert.match(presented.sentence, /Marketing Campaigns loses support/);
  assert.match(presented.context, /Owner SF Tech Team/);
  assert.match(presented.context, /\$31,500\/yr/);
  assert.ok(presented.gaps.some((gap) => gap.startsWith("No integrations are recorded for Salesforce CRM")));
  assert.equal(presented.rows.find((row) => row.record.id === "mc")?.connection, "Supported by Salesforce CRM");
});

test("nothing depends on a record still returns the gaps line", () => {
  const source = record("alone", "Quoting Tool", "Application");
  const presented = presentImpact({
    source,
    records: [source],
    nodes: [{ id: "alone", name: "Quoting Tool" }],
    edges: [],
  });
  assert.equal(presented.rows.length, 0);
  assert.equal(presented.sentence, "Nothing in your model depends on Quoting Tool [1].");
  assert.ok(presented.gaps.some((gap) => gap.includes("No integrations are recorded for Quoting Tool")));
});

test("a depth-2 path renders from the affected item back to the source", () => {
  const source = record("b", "B", "Application");
  const presented = presentImpact({
    source,
    records: [source, record("a", "A", "Component"), record("x", "Caller", "Application")],
    nodes: [
      { id: "b", name: "B" },
      { id: "a", name: "A" },
      { id: "x", name: "Caller" },
    ],
    edges: [
      { type: "part_of", fromId: "a", toId: "b" },
      { type: "depends_on", fromId: "x", toId: "a" },
    ],
  });
  const caller = presented.rows.find((row) => row.record.id === "x");
  assert.equal(caller?.connection, "Depends on A → part of B");
});

test("Microsoft 365: can't sign in is its own section and the unrecorded apps are a gap", () => {
  const signIn = (ownLogin = false) => ({ signIn: { candidate: true, ownLogin } });
  const source = record("m365", "Microsoft 365", "Application", { owner: "IT Ops", ...signIn() });
  const records = [
    source,
    record("exo", "Exchange Online", "Application", signIn()),
    record("sf", "Salesforce", "Application", signIn()),
    record("ns", "NetSuite", "Application", signIn()),
    record("shop", "Shopify Plus", "Application", signIn()),
    record("qbo", "QuickBooks Online", "Application", signIn(true)),
    record("as400", "AS400", "Server", { signIn: { candidate: false, ownLogin: false } }),
  ];
  const edges: ImpactEdge[] = [
    { type: "part_of", fromId: "exo", toId: "m365" },
    { type: "authenticates_via", fromId: "sf", toId: "m365" },
    { type: "authenticates_via", fromId: "ns", toId: "m365" },
    { type: "authenticates_via", fromId: "exo", toId: "m365" },
  ];
  const nodes: ImpactNode[] = records.map((item) => ({ id: item.id, name: item.name, typeLabel: item.typeLabel }));
  const presented = presentImpact({ source, records, nodes, edges });
  assert.equal(presented.sentence, "If Microsoft 365 [1] goes down, Exchange Online stops working and NetSuite and Salesforce can't sign in.");
  assert.deepEqual(
    presented.rows.map((row) => [row.record.name, row.section, row.connection]),
    [
      ["Exchange Online", "Stops working", "Part of Microsoft 365"],
      ["NetSuite", "Can't sign in", "Signs in with Microsoft 365"],
      ["Salesforce", "Can't sign in", "Signs in with Microsoft 365"],
    ]
  );
  assert.ok(presented.gaps.includes("Shopify Plus has no sign-in recorded, so it may be affected too."));
  assert.equal(presented.gaps.some((gap) => gap.includes("QuickBooks") || gap.includes("AS400")), false);
});

test("no sign-in gap when nothing signs in with the failed record", () => {
  const source = record("srv", "File server", "Server");
  const presented = presentImpact({
    source,
    records: [source, record("app", "App", "Application", { signIn: { candidate: true, ownLogin: false } })],
    nodes: [{ id: "srv", name: "File server" }, { id: "app", name: "App" }],
    edges: [{ type: "runs_on", fromId: "app", toId: "srv" }],
  });
  assert.equal(presented.gaps.some((gap) => gap.includes("sign-in")), false);
});
