import type { ImpactEdge, ImpactNode } from "@/lib/impact/relationship-impact";
import type { ChainItem } from "@/lib/views/opening";

/** Example estate for an empty workspace. Rendered in the browser only. Never written. */

function item(id: string, name: string, kind: ChainItem["kind"], extra: Partial<ChainItem> = {}): ChainItem {
  return {
    id,
    name,
    kind,
    ownerTeam: extra.ownerTeam ?? "",
    criticality: extra.criticality ?? "",
    description: extra.description ?? "",
    properties: extra.properties ?? {},
  };
}

export const sampleItems: ChainItem[] = [
  item("loc-fremont", "Fremont plant", "location", { properties: { location_type: "office", address: "4100 Warren Ave, Fremont, CA" } }),
  item("as400", "AS400", "runtime", { properties: { runtime_kind: "physical_server", support_ends: "2023-09-30", annual_cost: 12000 } }),
  item("hv01", "HV01 Hyper-V host", "runtime", { properties: { runtime_kind: "physical_server", annual_cost: 4000 } }),
  item("fs01", "FS01 file & print server", "runtime", { properties: { runtime_kind: "vm", os_name: "Windows Server", os_version: "2012 R2", annual_cost: 800 } }),
  item("rds01", "RDS01 remote desktop", "runtime", { properties: { runtime_kind: "vm", os_name: "Windows Server", os_version: "2012 R2", annual_cost: 800 } }),
  item("oe", "Order Entry", "application", { ownerTeam: "Sales Ops", criticality: "Critical", properties: { annual_cost: 9000, hosting_model: "on_premise" } }),
  item("inv", "Inventory", "application", { ownerTeam: "Operations", criticality: "Critical", properties: { annual_cost: 6000, hosting_model: "on_premise" } }),
  item("edi", "EDI Gateway", "application", { criticality: "High", properties: { annual_cost: 4350, hosting_model: "on_premise" } }),
  item("bill", "Invoicing", "application", { ownerTeam: "Finance", criticality: "High", properties: { annual_cost: 2000, hosting_model: "on_premise" } }),
  item("cap-om", "Order management", "capability"),
  item("cap-ba", "Billing & accounting", "capability"),
  item("cap-im", "Inventory management", "capability"),
];

export const sampleNodes: ImpactNode[] = sampleItems.map((entry) => ({ id: entry.id, name: entry.name, typeLabel: entry.kind }));

export const sampleEdges: ImpactEdge[] = [
  { type: "located_at", fromId: "as400", toId: "loc-fremont" },
  { type: "located_at", fromId: "hv01", toId: "loc-fremont" },
  { type: "runs_on", fromId: "fs01", toId: "hv01" },
  { type: "runs_on", fromId: "rds01", toId: "hv01" },
  { type: "runs_on", fromId: "oe", toId: "as400" },
  { type: "runs_on", fromId: "inv", toId: "as400" },
  { type: "runs_on", fromId: "edi", toId: "as400" },
  { type: "depends_on", fromId: "bill", toId: "oe" },
  { type: "supports", fromId: "oe", toId: "cap-om" },
  { type: "supports", fromId: "bill", toId: "cap-ba" },
  { type: "supports", fromId: "inv", toId: "cap-im" },
];
