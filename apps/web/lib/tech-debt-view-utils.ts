import type { MinEAObject, Product, TechDebtProperties } from "@minea/types";
import { techDebtHostKindLabel } from "@/lib/object-tech-debt";
import { techDebtTypeLabel } from "@/lib/tech-debt-utils";

export const OPEN_DEBT_STATUSES = new Set(["open", "in_progress", "deferred"]);
export const CRITICAL_SEVERITIES = new Set(["critical", "high"]);

export interface TechDebtRemediationRef {
  roadmap_id: string;
  roadmap_title: string;
}

export interface TechDebtViewRow {
  item: MinEAObject;
  props: TechDebtProperties;
  isOpen: boolean;
  isAttached: boolean;
  ageDays: number;
  typeLabel: string;
  rollupProducts: { id: string; name: string }[];
  remediation: TechDebtRemediationRef | null;
}

export function ageDaysFromCreated(iso: string): number {
  const created = new Date(iso).getTime();
  return Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
}

export function isTechDebtAttached(props: TechDebtProperties): boolean {
  const affects = props.affects;
  return Boolean(affects?.object_id?.trim() && affects?.object_name?.trim());
}

export function sortTechDebtRowsNewestFirst(rows: TechDebtViewRow[]): TechDebtViewRow[] {
  return [...rows].sort(
    (a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime()
  );
}

export function buildTechDebtViewRows(items: MinEAObject[]): TechDebtViewRow[] {
  return sortTechDebtRowsNewestFirst(
    items.map((item) => {
    const props = (item.properties ?? {}) as TechDebtProperties;
    const status = props.debt_status ?? "open";
    const rollup =
      (item as MinEAObject & { tech_debt_rollup_products?: { id: string; name: string }[] })
        .tech_debt_rollup_products ?? [];
    const remediationRaw = (
      item as MinEAObject & {
        tech_debt_remediation?: TechDebtRemediationRef | null;
      }
    ).tech_debt_remediation;

    return {
      item,
      props,
      isOpen: OPEN_DEBT_STATUSES.has(status),
      isAttached: isTechDebtAttached(props),
      ageDays: ageDaysFromCreated(item.created_at),
      typeLabel: techDebtTypeLabel(props),
      rollupProducts: rollup,
      remediation: remediationRaw ?? null,
    };
    })
  );
}

export function debtAffectPills(row: TechDebtViewRow): { label: string; kind: string }[] {
  const pills: { label: string; kind: string }[] = [];
  const affects = row.props.affects;
  if (row.isAttached && affects?.object_name) {
    pills.push({
      label: affects.object_name,
      kind: techDebtHostKindLabel(affects.object_kind ?? "application"),
    });
  }
  for (const product of row.rollupProducts) {
    if (!pills.some((p) => p.label === product.name)) {
      pills.push({ label: product.name, kind: "Product" });
    }
  }
  return pills;
}

export type SeverityFilter = "all" | "high" | "medium" | "low";
export type TypeFilter = "all" | "eol_software" | "security_vulnerability" | "architecture_drift";
export type ProductFilter = "all" | string;

export function filterTechDebtRows(
  rows: TechDebtViewRow[],
  opts: {
    severity: SeverityFilter;
    type: TypeFilter;
    productId: ProductFilter;
    showOpenOnly: boolean;
  }
): TechDebtViewRow[] {
  return rows.filter((row) => {
    if (opts.showOpenOnly && !row.isOpen) return false;
    const sev = row.props.severity ?? "medium";
    if (opts.severity === "high" && !CRITICAL_SEVERITIES.has(sev)) return false;
    if (opts.severity === "medium" && sev !== "medium") return false;
    if (opts.severity === "low" && sev !== "low") return false;

    const debtType = row.props.debt_type ?? "";
    if (opts.type === "eol_software" && debtType !== "eol_software") return false;
    if (opts.type === "security_vulnerability" && debtType !== "security_vulnerability") return false;
    if (opts.type === "architecture_drift" && debtType !== "architecture_drift") return false;

    if (opts.productId !== "all") {
      const affects = row.props.affects;
      const matchesProduct =
        (affects?.object_kind === "product" && affects.object_id === opts.productId) ||
        row.rollupProducts.some((p) => p.id === opts.productId);
      if (!matchesProduct) return false;
    }
    return true;
  });
}

export function summarizeTechDebt(rows: TechDebtViewRow[]) {
  const open = rows.filter((r) => r.isOpen);
  const critical = open.filter((r) => CRITICAL_SEVERITIES.has(r.props.severity ?? "medium"));
  const unattached = open.filter((r) => !r.isAttached);
  const resolved = rows.filter((r) => (r.props.debt_status ?? "") === "resolved");
  const now = new Date();
  const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const resolvedThisQuarter = resolved.filter(
    (r) => new Date(r.item.updated_at) >= quarterStart
  );

  return {
    allOpen: open.length,
    critical: critical.length,
    unattached: unattached.length,
    resolvedThisQuarter: resolvedThisQuarter.length,
    total: rows.length,
  };
}

export function productFilterOptions(products: Product[]) {
  return products.map((p) => ({ id: p.id, name: p.name }));
}

export function techDebtSeverityBadgeLabel(severity: string): string {
  if (severity === "critical" || severity === "high") return "HIGH";
  if (severity === "medium") return "MEDIUM";
  return "LOW";
}

export function techDebtSeverityRank(severity: string): number {
  if (severity === "critical") return 4;
  if (severity === "high") return 3;
  if (severity === "medium") return 2;
  if (severity === "low") return 1;
  return 0;
}

export function techDebtObjectName(row: TechDebtViewRow): string | null {
  const affects = row.props.affects;
  if (!row.isAttached || !affects?.object_name) return null;
  return affects.object_name;
}

export function formatTechDebtAgeShort(days: number): string {
  return `${days}d`;
}

export type TechDebtTableSortKey =
  | "severity"
  | "name"
  | "type"
  | "object"
  | "products"
  | "assignee"
  | "age";

export function sortTechDebtTableRows(
  rows: TechDebtViewRow[],
  key: TechDebtTableSortKey,
  dir: "asc" | "desc"
): TechDebtViewRow[] {
  const mult = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case "severity":
        cmp = techDebtSeverityRank(a.props.severity ?? "medium") - techDebtSeverityRank(b.props.severity ?? "medium");
        break;
      case "name":
        cmp = a.item.name.localeCompare(b.item.name);
        break;
      case "type":
        cmp = a.typeLabel.localeCompare(b.typeLabel);
        break;
      case "object": {
        const ao = techDebtObjectName(a) ?? "";
        const bo = techDebtObjectName(b) ?? "";
        cmp = ao.localeCompare(bo);
        break;
      }
      case "products": {
        const ap = a.rollupProducts.map((p) => p.name).join(", ");
        const bp = b.rollupProducts.map((p) => p.name).join(", ");
        cmp = ap.localeCompare(bp);
        break;
      }
      case "assignee": {
        const ao = a.item.owner?.trim() || "zzz";
        const bo = b.item.owner?.trim() || "zzz";
        cmp = ao.localeCompare(bo);
        break;
      }
      case "age":
        cmp = a.ageDays - b.ageDays;
        break;
    }
    if (cmp === 0) {
      return new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime();
    }
    return mult * cmp;
  });
}
