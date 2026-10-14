import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOL_CATALOG, normalizeTerm, setupMatch } from "@/lib/setup/match-tools";

// "edi" is shared on purpose by the three EDI providers (a Pick one in setup).
const SHARED = new Set(["edi"]);

test("the catalogue is large and each name or alias belongs to one tool", () => {
  assert.ok(TOOL_CATALOG.length >= 500, String(TOOL_CATALOG.length));
  const owner = new Map<string, string>();
  for (const tool of TOOL_CATALOG) {
    for (const name of new Set([tool.name, ...tool.aliases].map(normalizeTerm))) {
      if (SHARED.has(name)) continue;
      assert.ok(!owner.has(name), `${name}: ${owner.get(name)} and ${tool.name}`);
      owner.set(name, tool.name);
    }
  }
});

test("every entry has the schema fields and no invented cost", () => {
  for (const tool of TOOL_CATALOG) {
    assert.ok(tool.name && tool.vendor && tool.category, tool.name);
    assert.ok(["saas", "paas", "own", "either", "desktop"].includes(tool.hosting), tool.name);
    assert.ok(["app", "platform", "server"].includes(tool.kind), tool.name);
    assert.ok(tool.typicalAnnual === null || typeof tool.typicalAnnual === "number", tool.name);
  }
});

test("well-known names, abbreviations and misspellings match the right tool", () => {
  const cases: Record<string, string> = {
    arcgis: "ArcGIS Online", dayforce: "Dayforce", ceridian: "Dayforce", collibra: "Collibra", colibra: "Collibra",
    sfdc: "Salesforce", o365: "Microsoft 365", "office 365": "Microsoft 365", qgis: "QGIS", alation: "Alation",
    procore: "Procore", yardi: "Yardi Voyager", "power bi": "Power BI", servicenow: "ServiceNow", workday: "Workday HCM",
    adp: "ADP Workforce Now", bamboohr: "BambooHR", docusign: "DocuSign", "dynamics gp": "Microsoft Dynamics GP",
    "sage intacct": "Sage Intacct", "jira": "Jira", "1password": "1Password",
  };
  for (const [typed, expected] of Object.entries(cases)) {
    const row = setupMatch(typed)[0]!;
    assert.equal(row.status, "matched", `${typed} -> ${row.status} ${row.options.map((tool) => tool.name).join("|")}`);
    assert.equal(row.tool?.name, expected, typed);
  }
});

test("everyday words and made-up names stay Custom", () => {
  for (const typed of ["test", "website", "Order Entry", "app", "server", "the server in the back room", "asdfgh", "Wellen Park"]) {
    const row = setupMatch(typed)[0]!;
    assert.equal(row.status, "custom", `${typed} -> ${row.tool?.name ?? row.options.map((tool) => tool.name).join("|")}`);
  }
});
