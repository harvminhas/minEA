"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Package,
  Tag,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { usePermissions } from "@/lib/use-permissions";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import { LinkTechDebtDialog } from "@/components/risk/LinkTechDebtDialog";
import {
  buildTechDebtViewRows,
  debtAffectPills,
  filterTechDebtRows,
  productFilterOptions,
  summarizeTechDebt,
  techDebtObjectName,
  techDebtSeverityBadgeLabel,
  type ProductFilter,
  type SeverityFilter,
  type TechDebtViewRow,
  type TypeFilter,
} from "@/lib/tech-debt-view-utils";
import { TechDebtTable } from "@/components/views/TechDebtTable";
import { SEVERITY_STYLE } from "@/lib/tech-debt-utils";
import { roadmapDetailPath } from "@/lib/roadmap-utils";
import { cn } from "@/lib/utils";

type TechDebtLayout = "grid" | "table";

const LAYOUT_OPTIONS: { id: TechDebtLayout; label: string; icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Grid", icon: LayoutGrid },
  { id: "table", label: "Table", icon: List },
];

function formatAgeDays(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function MetricsSummaryBar({
  segments,
}: {
  segments: {
    key: string;
    value: string;
    subtext: string;
    subtextClassName?: string;
    active?: boolean;
    onClick?: () => void;
  }[];
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden divide-x divide-gray-200">
      {segments.map((seg) => {
        const content = (
          <div
            className={cn(
              "flex flex-1 items-baseline gap-2 px-4 py-2.5 min-w-0 transition-colors",
              seg.active && "bg-violet-50"
            )}
          >
            <span className="text-xl font-bold text-gray-900 tabular-nums">{seg.value}</span>
            <span className={cn("text-xs truncate", seg.subtextClassName ?? "text-gray-500")}>
              {seg.subtext}
            </span>
          </div>
        );
        if (seg.onClick) {
          return (
            <button
              key={seg.key}
              type="button"
              onClick={seg.onClick}
              className="flex-1 text-left hover:bg-gray-50/80 transition-colors"
            >
              {content}
            </button>
          );
        }
        return (
          <div key={seg.key} className="flex-1 min-w-0">
            {content}
          </div>
        );
      })}
    </div>
  );
}

function MetricsSummarySkeleton() {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden divide-x divide-gray-200">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex-1 px-4 py-2.5 flex items-center gap-2">
          <div className="h-6 w-8 rounded bg-gray-100 animate-pulse" />
          <div className="h-3 flex-1 max-w-[72px] rounded bg-gray-100 animate-pulse" />
        </div>
      ))}
    </div>
  );
}

function TechDebtLoadingState({ layout }: { layout: TechDebtLayout }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-gray-200 bg-white text-center",
        layout === "table" ? "py-24" : "py-20"
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-9 w-9 animate-spin text-violet-600" aria-hidden />
      <p className="mt-4 text-sm font-medium text-gray-700">Loading tech debt</p>
      <p className="mt-1 text-xs text-gray-400">Fetching items and product roll-ups…</p>
    </div>
  );
}

function FilterDropdown({
  icon: Icon,
  label,
  value,
  onChange,
  options,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-2.5 pr-2 py-1.5 cursor-pointer hover:border-gray-300 hover:bg-gray-50/80 transition-colors">
      <Icon size={14} className="text-gray-500 shrink-0" />
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <ChevronDown size={14} className="text-gray-400 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DebtItemCard({
  row,
  orgSlug,
  workspaceSlug,
  onOpen,
  onLink,
}: {
  row: TechDebtViewRow;
  orgSlug: string;
  workspaceSlug: string;
  onOpen: () => void;
  onLink?: () => void;
}) {
  const severity = row.props.severity ?? "medium";
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.medium;
  const pills = debtAffectPills(row);
  const status = row.props.debt_status ?? "open";

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border shrink-0",
            style.border,
            style.bg,
            style.text
          )}
        >
          {techDebtSeverityBadgeLabel(severity)}
        </span>
        {onLink && (
          <button
            type="button"
            onClick={onLink}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800 shrink-0"
          >
            Link to object →
          </button>
        )}
      </div>

      <button type="button" onClick={onOpen} className="text-left group">
        <h3 className="font-semibold text-gray-900 text-sm group-hover:text-indigo-700 transition-colors">
          {row.item.name}
        </h3>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mt-1">
          {row.typeLabel} · {formatAgeDays(row.ageDays).toUpperCase()} OPEN
        </p>
      </button>

      {pills.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {pills.map((pill) => (
            <span
              key={`${pill.kind}-${pill.label}`}
              className="inline-flex items-center gap-1 text-[10px] bg-gray-50 text-gray-600 border border-gray-200 rounded-full px-2 py-0.5"
            >
              <span className="w-2.5 h-2.5 rounded-sm border border-gray-300 bg-white" />
              {pill.label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400 italic">No object linked</p>
      )}

      {row.remediation && (
        <div className="rounded-lg bg-violet-50 border border-violet-100 px-3 py-2 text-[11px] text-violet-800">
          Planned remediation:{" "}
          <Link
            href={roadmapDetailPath(orgSlug, workspaceSlug, row.remediation.roadmap_id)}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.remediation.roadmap_title}
          </Link>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-1 border-t border-gray-100">
        <span>
          {status === "resolved" ? "Resolved" : `Open ${formatAgeDays(row.ageDays)}`}
        </span>
        <span className="text-gray-600">{row.item.owner?.trim() || "Unassigned"}</span>
      </div>
    </div>
  );
}

interface TechDebtViewProps {
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
}

export function TechDebtView(props: TechDebtViewProps = {}) {
  const { createOpen, onCreateOpenChange } = props;
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const { canCreate, canEdit } = usePermissions();

  const [showCreateInternal, setShowCreateInternal] = useState(false);
  const showCreate = createOpen ?? showCreateInternal;
  const setShowCreate = onCreateOpenChange ?? setShowCreateInternal;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [showResolved, setShowResolved] = useState(false);
  const [viewLayout, setViewLayout] = useState<TechDebtLayout>("grid");

  const techDebtQueryKey = ["objects", orgSlug, workspaceSlug, "tech_debt"] as const;

  const { data, isLoading, isPending } = useQuery({
    queryKey: techDebtQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tech_debt" }, token!);
    },
    enabled,
  });

  const listLoading = isLoading || (isPending && !data);

  const { data: productsData } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const rows = useMemo(() => buildTechDebtViewRows(data?.items ?? []), [data?.items]);
  const summary = useMemo(() => summarizeTechDebt(rows), [rows]);

  const filtered = useMemo(
    () =>
      filterTechDebtRows(rows, {
        severity: severityFilter,
        type: typeFilter,
        productId: productFilter,
        showOpenOnly: !showResolved,
      }),
    [rows, severityFilter, typeFilter, productFilter, showResolved]
  );

  const attached = filtered.filter((r) => r.isAttached);
  const unattached = filtered.filter((r) => !r.isAttached);
  const productOptions = productFilterOptions(productsData?.items ?? []);

  const selected = (data?.items ?? []).find((o) => o.id === selectedId) ?? null;
  const linking = (data?.items ?? []).find((o) => o.id === linkingId) ?? null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: techDebtQueryKey });
    queryClient.invalidateQueries({ queryKey: ["object-tech-debt", orgSlug, workspaceSlug] });
  };

  const exportCsv = () => {
    const header = ["Name", "Severity", "Type", "Status", "Object", "Products", "Owner", "Age (days)"];
    const csvRows = filtered.map((row) => [
      row.item.name,
      row.props.severity ?? "",
      row.typeLabel,
      row.props.debt_status ?? "",
      techDebtObjectName(row) ?? "",
      row.rollupProducts.map((p) => p.name).join("; "),
      row.item.owner ?? "",
      String(row.ageDays),
    ]);
    const csv = [header, ...csvRows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "tech-debt.csv";
    a.click();
  };

  return (
    <>
      <div className="flex flex-col gap-4">
        {listLoading ? (
          <MetricsSummarySkeleton />
        ) : (
        <MetricsSummaryBar
          segments={[
            {
              key: "all",
              value: String(summary.allOpen),
              subtext: `${summary.critical} critical`,
              active: !showResolved && severityFilter === "all" && typeFilter === "all" && productFilter === "all",
              onClick: () => {
                setShowResolved(false);
                setSeverityFilter("all");
                setTypeFilter("all");
                setProductFilter("all");
              },
            },
            {
              key: "high",
              value: String(summary.critical),
              subtext: "needs attention",
              subtextClassName: "text-red-600",
              active: severityFilter === "high",
              onClick: () => {
                setShowResolved(false);
                setSeverityFilter("high");
              },
            },
            {
              key: "unattached",
              value: String(summary.unattached),
              subtext: "no object linked",
              subtextClassName: "text-amber-600",
            },
            {
              key: "resolved",
              value: String(summary.resolvedThisQuarter),
              subtext: "this quarter",
              active: showResolved,
              onClick: () => setShowResolved((v) => !v),
            },
          ]}
        />
        )}

        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-3",
            listLoading && "opacity-60 pointer-events-none"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <FilterDropdown
              icon={AlertCircle}
              label="Severity"
              value={severityFilter}
              onChange={(v) => {
                setShowResolved(false);
                setSeverityFilter(v as SeverityFilter);
              }}
              options={[
                { value: "all", label: "All severities" },
                { value: "high", label: "High & critical" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <FilterDropdown
              icon={Tag}
              label="Type"
              value={typeFilter}
              onChange={(v) => setTypeFilter(v as TypeFilter)}
              options={[
                { value: "all", label: "All types" },
                { value: "eol_software", label: "EOL software" },
                { value: "security_vulnerability", label: "Security" },
                { value: "architecture_drift", label: "Architecture" },
              ]}
            />
            {productOptions.length > 0 && (
              <FilterDropdown
                icon={Package}
                label="Product"
                value={productFilter}
                onChange={(v) => setProductFilter(v as ProductFilter)}
                options={[
                  { value: "all", label: "All products" },
                  ...productOptions.map((p) => ({ value: p.id, label: p.name })),
                ]}
              />
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              <Download size={14} />
              Export
            </button>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {LAYOUT_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setViewLayout(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    viewLayout === id
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {listLoading ? (
          <TechDebtLoadingState layout={viewLayout} />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm mb-3">
              {rows.length === 0
                ? "No tech debt items yet."
                : "No items match the current filters."}
            </p>
            {rows.length === 0 && canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-violet-600 hover:underline text-sm font-medium"
              >
                Add your first debt item →
              </button>
            )}
          </div>
        ) : viewLayout === "table" ? (
          <>
            {unattached.length > 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 mb-4">
                Unattached items won&apos;t roll up to any product until linked to a system,
                component, or platform.
              </div>
            )}
            <TechDebtTable
              attached={attached}
              unattached={unattached}
              onOpen={setSelectedId}
              onLink={canEdit ? setLinkingId : undefined}
            />
          </>
        ) : (
          <div className="space-y-8">
            {attached.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Attached — linked to objects ({attached.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {attached.map((row) => (
                    <DebtItemCard
                      key={row.item.id}
                      row={row}
                      orgSlug={orgSlug}
                      workspaceSlug={workspaceSlug}
                      onOpen={() => setSelectedId(row.item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {unattached.length > 0 && (
              <section>
                <h2 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Unattached — no object linked ({unattached.length})
                </h2>
                <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-xs text-gray-600 mb-4">
                  These debt items aren&apos;t linked to a system, component, or platform yet — they
                  won&apos;t roll up to any product until linked.
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {unattached.map((row) => (
                    <DebtItemCard
                      key={row.item.id}
                      row={row}
                      orgSlug={orgSlug}
                      workspaceSlug={workspaceSlug}
                      onOpen={() => setSelectedId(row.item.id)}
                      onLink={canEdit ? () => setLinkingId(row.item.id) : undefined}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {canCreate && showCreate && (
        <CreateTechDebtPanel
          allowUnattached
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <TechDebtDetail
          techDebt={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            setSelectedId(null);
            refresh();
          }}
          onUpdate={refresh}
        />
      )}

      {canEdit && linking && (
        <LinkTechDebtDialog
          techDebt={linking}
          onClose={() => setLinkingId(null)}
          onLinked={() => {
            setLinkingId(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
