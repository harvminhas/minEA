"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  LayoutGrid,
  List,
  Loader2,
  Plus,
  Search,
  Shapes,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CreateComponentPanel } from "@/components/application/CreateComponentPanel";
import { ComponentDetail } from "@/components/application/ComponentDetail";
import { ComponentTable } from "@/components/application/ComponentTable";
import {
  APPLICATION_LAYER_COLOR,
  COMPONENT_TYPE_LABEL,
} from "@/lib/component-utils";
import {
  componentFilterOptions,
  componentPlatformName,
  componentRuntimeName,
  componentSystemCount,
  componentTechStack,
  componentTypeLabel,
  filterComponents,
} from "@/lib/component-list-utils";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import type { AiRole, ComponentProperties, MinEAObject } from "@minea/types";
import { cn, getStatusLabel } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

type ComponentViewLayout = "cards" | "table";

const LAYOUT_OPTIONS: { id: ComponentViewLayout; label: string; icon: typeof LayoutGrid }[] = [
  { id: "cards", label: "Cards", icon: LayoutGrid },
  { id: "table", label: "Table", icon: List },
];

const COMPONENT_STATUS_STYLE: Record<string, string> = {
  planned: "bg-stone-100 text-gray-600",
  active: "bg-emerald-50 text-emerald-700",
  retiring: "bg-amber-50 text-amber-700",
  retired: "bg-red-50 text-red-500",
};

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

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-700 text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function getInitial(name: string): string {
  return name.trim()[0]?.toUpperCase() ?? "?";
}

function ComponentCard({
  item,
  onOpenDetail,
}: {
  item: MinEAObject;
  onOpenDetail: () => void;
}) {
  const props = (item.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];
  const tags = item.tags ?? [];
  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type ?? null;
  const status = item.status ?? "planned";
  const aiRole = aiRoleLabel(props.ai_role as AiRole | undefined);

  return (
    <div
      onClick={onOpenDetail}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: APPLICATION_LAYER_COLOR }}
          >
            {getInitial(item.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{item.name}</p>
            {typeLabel && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{typeLabel}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
            COMPONENT_STATUS_STYLE[status] ?? COMPONENT_STATUS_STYLE.planned
          )}
        >
          {getStatusLabel(status)}
        </span>
      </div>

      <div className="space-y-1.5 text-xs">
        {props.tech_stack && <PropertyRow label="Tech stack" value={props.tech_stack} />}
        {props.platform?.platform_name && (
          <PropertyRow label="Platform" value={props.platform.platform_name} />
        )}
        {item.owner && <PropertyRow label="Owner" value={item.owner} />}
        <PropertyRow label="AI role" value={aiRole} />
      </div>

      {systems.length > 0 && (
        <div className="mt-3">
          <p className="text-xs text-gray-400 mb-1.5">Part of</p>
          <div className="flex flex-wrap gap-1.5">
            {systems.slice(0, 3).map((s) => (
              <span
                key={s.system_id}
                className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
              >
                {s.system_name}
              </span>
            ))}
            {systems.length > 3 && (
              <span className="text-xs text-gray-400 self-center">+{systems.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{item.updated_by_name ? ` by ${item.updated_by_name}` : ""}{" "}
          {formatUpdatedAgo(item.updated_at)}
        </span>
      </div>
    </div>
  );
}

export function ComponentList() {
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [viewLayout, setViewLayout] = useState<ComponentViewLayout>("table");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const componentsQueryKey = ["objects", orgSlug, workspaceSlug, "component"] as const;

  const { data, isLoading, isPending } = useQuery({
    queryKey: componentsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!);
    },
    enabled,
  });

  const listLoading = isLoading || (isPending && !data);
  const items = data?.items ?? [];
  const selected = items.find((o) => o.id === selectedId) ?? null;

  const filterOpts = useMemo(() => componentFilterOptions(items), [items]);

  const filtered = useMemo(
    () =>
      filterComponents(items, {
        search,
        type: typeFilter,
        status: statusFilter,
        owner: ownerFilter,
      }),
    [items, search, typeFilter, statusFilter, ownerFilter]
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: componentsQueryKey });
  };

  const exportCsv = () => {
    const header = [
      "Name",
      "Type",
      "Tech stack",
      "Systems",
      "Platform",
      "Runtime",
      "Owner",
      "Status",
      "Updated by",
      "Updated",
    ];
    const rows = filtered.map((item) => [
      item.name,
      componentTypeLabel(item),
      componentTechStack(item),
      String(componentSystemCount(item)),
      componentPlatformName(item),
      componentRuntimeName(item),
      item.owner ?? "",
      getStatusLabel(item.status),
      item.updated_by_name ?? "",
      formatUpdatedAgo(item.updated_at),
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "components.csv";
    a.click();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-gray-200 bg-white sticky top-0 z-10">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Components</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Application layer · {data?.total ?? items.length} component
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
              placeholder="Search components..."
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <FilterDropdown
            icon={Shapes}
            label="Type"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all", label: "All types" },
              ...filterOpts.types.map((t) => ({
                value: t,
                label: COMPONENT_TYPE_LABEL[t] ?? t,
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
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                New component
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
            <p className="mt-3 text-sm text-gray-500">Loading components…</p>
          </div>
        ) : viewLayout === "table" ? (
          <ComponentTable
            items={filtered}
            onOpen={setSelectedId}
            onCreated={refresh}
            defaultQuickAddOpen={items.length === 0}
          />
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm mb-3">
              {items.length === 0 ? "No components yet." : "No components match your filters."}
            </p>
            {canCreate && (
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="text-indigo-600 hover:underline text-sm font-medium"
              >
                Create your first component →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((item) => (
              <ComponentCard key={item.id} item={item} onOpenDetail={() => setSelectedId(item.id)} />
            ))}
          </div>
        )}
      </div>

      {canCreate && showCreate && (
        <CreateComponentPanel
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false);
            refresh();
            setSelectedId(id);
          }}
        />
      )}

      {selected && (
        <ComponentDetail
          component={selected}
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
