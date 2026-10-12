/** Sample workspace for the Views hub tests and harness: a ~40-app SMB. Not used by the app. */
const day = 24 * 60 * 60 * 1000;
const iso = (days: number) => new Date(Date.now() + days * day).toISOString().slice(0, 10);

type O = { id: string; name: string; type: string; status?: string; owner?: string; owner_team_name?: string; properties: Record<string, unknown> };
type R = { id: string; type: string; from_object_id: string; from_type: string; to_object_id: string; to_type: string; attributes: Record<string, unknown> };

export function hubFixture(): { objects: O[]; relationships: R[] } {
  const objects: O[] = [];
  const relationships: R[] = [];
  const add = (o: O) => (objects.push({ status: "active", ...o }), o);
  const link = (type: string, from: O, to: O) =>
    relationships.push({ id: `r${relationships.length + 1}`, type, from_object_id: from.id, from_type: from.type, to_object_id: to.id, to_type: to.type, attributes: {} });

  const as400 = add({ id: "as400", name: "AS400", type: "model", owner_team_name: "IT", properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" } });
  const sql = add({ id: "sql01", name: "SQL-01", type: "model", owner_team_name: "IT", properties: { runtime_kind: "physical_server", compute_runtime_kind: "on_prem" } });
  const fw = add({ id: "fw", name: "Fortinet firewall", type: "model", properties: { runtime_kind: "network" } });
  const m365 = add({ id: "m365p", name: "Microsoft 365", type: "cloud_service", owner_team_name: "IT", properties: { hosting_model: "saas" } });
  for (let i = 0; i < 7; i += 1) add({ id: `srv${i}`, name: `VM-${i + 2}`, type: "model", owner_team_name: "IT", properties: { runtime_kind: "virtual_machine" } });

  const saas = ["Salesforce", "HubSpot", "QuickBooks Online", "Shopify", "Slack", "Zoom", "Zendesk", "DocuSign", "Gusto", "Asana", "Notion", "Dropbox", "Mailchimp", "Calendly", "Jira", "Confluence", "GitHub", "Figma", "Canva", "Okta", "Expensify", "Bill.com", "Stripe", "Xero", "Monday.com", "Intercom"];
  saas.forEach((name, i) =>
    add({ id: `saas${i}`, name, type: "application", owner_team_name: i % 6 === 5 ? undefined : "Ops", properties: { hosting_model: "saas", ...(i < 4 ? { contract_renewal: iso(20 + i * 18) } : i < 8 ? { contract_renewal: iso(200 + i * 10) } : {}), ...(i < 4 ? { cost_lines: [{ id: `c${i}`, type: "subscription", amount_cents: (4800 + i * 1200) * 100, frequency: "annual", calculation: { kind: "flat" } }] } : {}) } }),
  );
  const onPrem = ["Order Entry", "Invoicing", "Shipping", "Payroll export", "Label printing", "Inventory", "Warehouse scanner"];
  onPrem.forEach((name, i) => {
    const app = add({ id: `op${i}`, name, type: "application", owner_team_name: i === 4 ? undefined : "Ops", properties: { hosting_model: "on_premise" } });
    link("runs_on", app, i < 5 ? as400 : sql);
  });
  ["Sage 50", "AutoCAD", "Excel macros"].forEach((name, i) => add({ id: `desk${i}`, name, type: "application", owner_team_name: i === 2 ? undefined : "Finance", properties: { hosting_model: "desktop" } }));
  ["Old intranet", "Fax gateway", "Time clock", "Access DB", "Kiosk app", "Backup tool"].forEach((name, i) => add({ id: `unk${i}`, name, type: "application", owner_team_name: i < 3 ? "Ops" : undefined, properties: {} }));
  link("runs_on", objects.find((o) => o.id === "unk5")!, sql);
  for (let i = 0; i < 6; i += 1) link("built_on", objects.find((o) => o.id === `saas${i + 8}`)!, m365);

  const gpt = add({ id: "gpt", name: "GPT-4o", type: "ai_model", properties: { vendor_trains: "unknown" } });
  add({ id: "claude", name: "Claude", type: "ai_model", properties: { vendor_trains: "no" } });
  const bot = add({ id: "bot", name: "Invoice bot", type: "agent", properties: { status: "active" } });
  const triage = add({ id: "triage", name: "Ticket triage", type: "agent", owner_team_name: "Support", properties: { status: "active", autonomy: "act_autonomously" } });
  link("uses_model", bot, gpt);
  link("writes", bot, objects.find((o) => o.id === "saas2")!);
  link("reads", triage, objects.find((o) => o.id === "saas6")!);
  link("writes", triage, objects.find((o) => o.id === "saas6")!);
  return { objects, relationships };
}

export function emptyFixture(): { objects: O[]; relationships: R[] } {
  return { objects: [], relationships: [] };
}
