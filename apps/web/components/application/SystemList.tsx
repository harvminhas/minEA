"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Tag,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { ObjectCard } from "@/components/objects/ObjectCard";
import { ObjectDetail } from "@/components/objects/ObjectDetail";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { SystemTable } from "@/components/application/SystemTable";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import { usePermissions } from "@/lib/use-permissions";
import { mergeCategoryOptions } from "@/lib/system-category";
import {
  filterSystems,
  systemAnnualCost,
  systemCategory,
  systemFilterOptions,
  systemVendor,
} from "@/lib/system-list-utils";
import { formatUpdatedAgo, systemStatusLabel } from "@/lib/system-utils";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import type { MinEAObject } from "@minea/types";
import { cn, formatCurrency, getStatusLabel } from "@/lib/utils";

type SystemViewLayout = "cards" | "table";

const LAYOUT_OPTIONS: { id: SystemViewLayout; label: string; icon: typeof LayoutGrid }[] = [
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

export function SystemList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const { canCreate } = usePermissions();

  const [viewLayout, setViewLayout] = useState<SystemViewLayout>("table");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [selectedObject, setSelectedObject] = useState<MinEAObject | null>(null);
  const [showForm, setShowForm] = useState(false);

  const systemsQueryKey = ["objects", orgSlug, workspaceSlug, "application"] as const;

  const { data, isLoading, isPending } = useQuery({
    queryKey: systemsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
    enabled,
  });

  const listLoading = isLoading || (isPending && !data);
  const items = data?.items ?? [];

  const filterOpts = useMemo(() => systemFilterOptions(items), [items]);
  const categoryFilterOptions = useMemo(
    () => mergeCategoryOptions(filterOpts.categories),
    [filterOpts.categories]
  );

  const filtered = useMemo(
    () =>
      filterSystems(items, {
        search,
        category: categoryFilter,
        status: statusFilter,
        owner: ownerFilter,
      }),
    [items, search, categoryFilter, statusFilter, ownerFilter]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: systemsQueryKey });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  };

  const exportCsv = () => {
    const header = [
      "Name",
      "Vendor",
      "Category",
      "Cost/yr",
      "Capabilities",
      "Owner",
      "Status",
      "Updated by",
      "Updated",
    ];
    const rows = filtered.map((item) => [
      item.name,
      systemVendor(item),
      systemCategory(item),
      systemAnnualCost(item) != null ? formatCurrency(systemAnnualCost(item)!) : "",
      String(item.capability_count ?? 0),
      item.owner ?? "",
      systemStatusLabel(item.status),
      item.updated_by_name ?? "",
      formatUpdatedAgo(item.updated_at),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "systems.csv";
    a.click();
  };

  const openObject = (id: string) => {
    const obj = items.find((o) => o.id === id) ?? null;
    if (obj) setSelectedObject(obj);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Systems</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Application layer · {data?.total ?? items.length} system
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
              placeholder="Search systems..."
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <FilterDropdown
            icon={Tag}
            label="Category"
            value={categoryFilter}
            onChange={setCategoryFilter}
            options={[
              { value: "all", label: "All categories" },
              ...categoryFilterOptions.map((c) => ({ value: c, label: c })),
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
                onClick={() => setShowForm(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                Add system
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
            <Loader2 className="h-8 w-8 animate-spin text-indigo-600" aria-hidden />
            <p className="mt-3 text-sm text-gray-500">Loading systems…</p>
          </div>
        ) : viewLayout === "table" ? (
          <SystemTable
            items={filtered}
            categoryOptions={filterOpts.categories}
            onOpen={openObject}
            onCreated={() => refresh()}
            defaultQuickAddOpen={items.length === 0}
          />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm mb-3">
              {items.length === 0 ? "No systems yet." : "No systems match your filters."}
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="text-indigo-600 hover:underline text-sm font-medium"
              >
                Add your first system →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
            {filtered.map((obj) => (
              <ObjectCard
                key={obj.id}
                object={obj}
                layerColor={APPLICATION_LAYER_COLOR}
                onClick={() => setSelectedObject(obj)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedObject && (
        <ObjectDetail
          object={selectedObject}
          layerColor={APPLICATION_LAYER_COLOR}
          onClose={() => setSelectedObject(null)}
          onUpdate={refresh}
        />
      )}

      {showForm && (
        <ObjectForm
          objectType="application"
          onClose={() => setShowForm(false)}
          onSuccess={() => {
            setShowForm(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
