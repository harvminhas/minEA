"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import { LinkTechDebtDialog } from "@/components/risk/LinkTechDebtDialog";
import {
  buildTechDebtViewRows,
  debtAffectPills,
  filterTechDebtRows,
  productFilterOptions,
  summarizeTechDebt,
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

function KpiCard({
  label,
  value,
  subtext,
  subtextClassName,
  active,
  onClick,
}: {
  label: string;
  value: string;
  subtext: string;
  subtextClassName?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4 text-left w-full transition-colors",
        active ? "border-violet-400 ring-1 ring-violet-200" : "border-gray-200 hover:border-gray-300"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      <p className={cn("text-[11px] mt-1", subtextClassName ?? "text-gray-500")}>{subtext}</p>
    </div>
  );
  if (!onClick) return inner;
  return (
    <button type="button" onClick={onClick} className="w-full">
      {inner}
    </button>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium border transition-colors",
        active
          ? "bg-violet-600 text-white border-violet-600"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      )}
    >
      {children}
    </button>
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

  const { data, isLoading } = useQuery({
    queryKey: techDebtQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "tech_debt" }, token!);
    },
    enabled,
  });

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

  return (
    <>
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            label="All items"
            value={String(summary.allOpen)}
            subtext={`${summary.critical} critical`}
            active={!showResolved && severityFilter === "all"}
            onClick={() => {
              setShowResolved(false);
              setSeverityFilter("all");
            }}
          />
          <KpiCard
            label="High"
            value={String(summary.critical)}
            subtext="needs attention"
            subtextClassName="text-red-600"
            active={severityFilter === "high"}
            onClick={() => {
              setShowResolved(false);
              setSeverityFilter("high");
            }}
          />
          <KpiCard
            label="Unattached"
            value={String(summary.unattached)}
            subtext="no object linked"
            active={false}
          />
          <KpiCard
            label="Resolved"
            value={String(summary.resolvedThisQuarter)}
            subtext="this quarter"
            active={showResolved}
            onClick={() => setShowResolved((v) => !v)}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Severity</span>
            {(["all", "high", "medium", "low"] as SeverityFilter[]).map((s) => (
              <FilterPill
                key={s}
                active={severityFilter === s}
                onClick={() => setSeverityFilter(s)}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </FilterPill>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-medium text-gray-500">Type</span>
            <FilterPill active={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              All
            </FilterPill>
            <FilterPill
              active={typeFilter === "eol_software"}
              onClick={() => setTypeFilter("eol_software")}
            >
              EOL software
            </FilterPill>
            <FilterPill
              active={typeFilter === "security_vulnerability"}
              onClick={() => setTypeFilter("security_vulnerability")}
            >
              Security
            </FilterPill>
            <FilterPill
              active={typeFilter === "architecture_drift"}
              onClick={() => setTypeFilter("architecture_drift")}
            >
              Architecture
            </FilterPill>
          </div>
          {productOptions.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Product</span>
              <FilterPill active={productFilter === "all"} onClick={() => setProductFilter("all")}>
                All
              </FilterPill>
              {productOptions.map((p) => (
                <FilterPill
                  key={p.id}
                  active={productFilter === p.id}
                  onClick={() => setProductFilter(p.id)}
                >
                  {p.name}
                </FilterPill>
              ))}
            </div>
          )}
          </div>

          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 shrink-0">
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

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-gray-100 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm mb-3">
              {rows.length === 0
                ? "No tech debt items yet."
                : "No items match the current filters."}
            </p>
            {rows.length === 0 && (
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
              onLink={setLinkingId}
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
                      onLink={() => setLinkingId(row.item.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showCreate && (
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

      {linking && (
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
