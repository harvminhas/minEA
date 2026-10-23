import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { before, test } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as { React?: typeof React }).React = React;
let LeadPicker: typeof import("./LeadPicker.tsx").LeadPicker;
before(async () => {
  ({ LeadPicker } = await import("./LeadPicker.tsx"));
});

const contacts = [
  { id: "c2", name: "Raj Patel", team_name: "Platform", workspace_id: "w", org_id: "o", created_at: "", updated_at: "" },
  { id: "c1", name: "Ana Ruiz", workspace_id: "w", org_id: "o", created_at: "", updated_at: "" },
];

test("lead picker lists contacts A–Z, keeps a typed-in lead until replaced", () => {
  const html = renderToStaticMarkup(
    React.createElement(LeadPicker, { contacts, value: null, legacyName: "Old Lead", onChange: () => {} }),
  );
  assert.match(html, /Old Lead \(not a contact\)/);
  assert.ok(html.indexOf("Ana Ruiz") < html.indexOf("Raj Patel · Platform"));
  const set = renderToStaticMarkup(
    React.createElement(LeadPicker, { contacts, value: "c2", legacyName: "Raj Patel", onChange: () => {} }),
  );
  assert.doesNotMatch(set, /not a contact/);
});

test("team page reads owners from Owners & Teams and edits the team inline", () => {
  const src = readFileSync(new URL("./TeamDetailPanel.tsx", import.meta.url), "utf8");
  assert.match(src, /teamOwnedRows\(data\.items, teamId\)/);
  assert.match(src, /<BulkAssignDialog/);
  assert.match(src, /action: "move"/);
  assert.match(src, /action: "remove"/);
  assert.match(src, /lead_contact_id: id/);
  assert.match(src, /doesn&apos;t own anything yet/);
  assert.match(src, /Other accountabilities/);
  assert.doesNotMatch(src, /<AccountabilitiesPanel/); // no wall of empty sections
  const create = readFileSync(new URL("./CreateTeamPanel.tsx", import.meta.url), "utf8");
  assert.match(create, /lead_contact_id: leadContactId/);
  assert.match(create, /<LeadPicker/);
});
