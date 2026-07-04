"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateFlowPanel } from "@/components/integration/CreateFlowPanel";
import { FlowDetail } from "@/components/integration/FlowDetail";
import { FlowTable } from "@/components/integration/FlowTable";
import { API_STATUS_STYLE } from "@/lib/api-utils";
import {
  filterFlows,
  flowFilterOptions,
  flowProps,
} from "@/lib/flow-list-utils";
import {
  FLOW_MECHANISM_LABEL,
  flowFromLine,
  flowMechanismLabel,
  flowToLine,
  formatFlowSubtitle,
} from "@/lib/flow-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { IntegrationFlowProperties, MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

type FlowViewLayout = "cards" | "table";

const LAYOUT_OPTIONS: { id: FlowViewLayout; label: string; icon: typeof LayoutGrid }[] = [
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "table", label: "Table", icon: List },
];

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

function PropertyRow({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className={cn("text-right truncate max-w-[60%] font-medium text-gray-900", valueClassName)}>
        {value}
      </span>
    </div>
  );
}

function FlowCard({ item, onOpenDetail }: { item: MinEAObject; onOpenDetail: () => void }) {
  const props = (item.properties ?? {}) as IntegrationFlowProperties;
  const status = item.status ?? "planned";
  const fromLine = flowFromLine(props);
  const toLine = flowToLine(props);
  const mechanismLabel = flowMechanismLabel(props);

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-teal-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
            <ArrowLeftRight size={16} strokeWidth={2.25} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            <p className="text-xs text-gray-400 mt-0.5 truncate">
              {formatFlowSubtitle(undefined, props.mechanism)}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
            API_STATUS_STYLE[status] ?? API_STATUS_STYLE.planned
          )}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="divide-y divide-gray-100 text-xs">
        <PropertyRow label="From" value={fromLine} />
        <PropertyRow label="To" value={toLine} />
        <PropertyRow label="Mechanism" value={mechanismLabel} />
      </div>

      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{item.updated_by_name ? ` by ` : " "}
          {item.updated_by_name && (
            <span className="font-semibold text-gray-600">{item.updated_by_name}</span>
          )}
          {item.updated_by_name ? " " : ""}
          {formatUpdatedAgo(item.updated_at)}
        </span>
      </div>
    </div>
  );
}

export function FlowList() {
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [viewLayout, setViewLayout] = useState<FlowViewLayout>("table");
  const [search, setSearch] = useState("");
  const [mechanismFilter, setMechanismFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const flowsQueryKey = ["objects", orgSlug, workspaceSlug, "integration_flow"] as const;

  const { data, isLoading, isPending } = useQuery({
    queryKey: flowsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token!);
    },
    enabled,
  });

  const listLoading = isLoading || (isPending && !data);
  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;
  const filterOpts = useMemo(() => flowFilterOptions(items), [items]);

  const filtered = useMemo(
    () =>
      filterFlows(items, {
        search,
        mechanism: mechanismFilter,
        status: statusFilter,
        owner: ownerFilter,
      }),
    [items, search, mechanismFilter, statusFilter, ownerFilter]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: flowsQueryKey });
  };

  const exportCsv = () => {
    const header = ["Name", "From", "To", "Mechanism", "Owner", "Status", "Updated by", "Updated"];
    const rows = filtered.map((item) => {
      const props = flowProps(item);
      return [
        item.name,
        flowFromLine(props),
        flowToLine(props),
        flowMechanismLabel(props),
        item.owner ?? "",
        getStatusLabel(item.status),
        item.updated_by_name ?? "",
        formatUpdatedAgo(item.updated_at),
      ];
    });
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "flows.csv";
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Flows</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Integration layer · {data?.total ?? items.length} flow
              {(data?.total ?? items.length) === 1 ? "" : "s"}
            </p>
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

        <div
          className={cn(
            "flex flex-wrap items-center gap-2",
            listLoading && "opacity-60 pointer-events-none"
          )}
        >
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search flows..."
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <FilterDropdown
            icon={ArrowLeftRight}
            label="Mechanism"
            value={mechanismFilter}
            onChange={setMechanismFilter}
            options={[
              { value: "all", label: "All mechanisms" },
              ...filterOpts.mechanisms.map((m) => ({
                value: m,
                label: FLOW_MECHANISM_LABEL[m as keyof typeof FLOW_MECHANISM_LABEL] ?? m,
              })),
            ]}
          />
          <FilterDropdown
            icon={CheckCircle2}
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "all", label: "All statuses" },
              ...filterOpts.statuses.map((s) => ({
                value: s,
                label: getStatusLabel(s),
              })),
            ]}
          />
          <FilterDropdown
            icon={User}
            label="Owner"
            value={ownerFilter}
            onChange={setOwnerFilter}
            options={[
              { value: "all", label: "All owners" },
              ...filterOpts.owners.map((o) => ({ value: o, label: o })),
            ]}
          />
          <div className="ml-auto flex items-center gap-2">
            {viewLayout === "cards" && canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                New flow
              </button>
            )}
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              className="flex items-center gap-1.5 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:pointer-events-none px-3 py-1.5 rounded-lg text-sm font-medium text-gray-700 transition-colors"
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        {listLoading ? (
          <div
            className="flex flex-col items-center justify-center py-20 rounded-xl border border-gray-200 bg-white"
            role="status"
            aria-busy="true"
          >
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" aria-hidden />
            <p className="mt-3 text-sm text-gray-500">Loading flows…</p>
          </div>
        ) : viewLayout === "table" ? (
          filtered.length === 0 ? (
            <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
              <p className="text-gray-500 text-sm mb-3">
                {items.length === 0 ? "No flows yet." : "No flows match your filters."}
              </p>
              {canCreate && (
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="text-teal-600 hover:underline text-sm font-medium"
                >
                  Create your first flow →
                </button>
              )}
            </div>
          ) : (
            <FlowTable items={filtered} onOpen={setSelectedId} />
          )
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm mb-3">
              {items.length === 0 ? "No flows yet." : "No flows match your filters."}
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-teal-600 hover:underline text-sm font-medium"
              >
                Create your first flow →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <FlowCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {canCreate && showCreate && (
        <CreateFlowPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <FlowDetail
          flow={selected}
          onClose={() => setSelectedId(null)}
          onDelete={() => {
            setSelectedId(null);
            refresh();
          }}
          onUpdate={refresh}
        />
      )}
    </div>
  );
}
