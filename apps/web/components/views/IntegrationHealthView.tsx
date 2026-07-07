"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftRight,
  ChevronDown,
  Loader2,
  Search,
  Tag,
  User,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { ApiDetail } from "@/components/integration/ApiDetail";
import { EventDetail } from "@/components/integration/EventDetail";
import { FlowDetail } from "@/components/integration/FlowDetail";
import {
  buildIntegrationHealthRows,
  filterIntegrationHealthRows,
  integrationHealthMechanismOptions,
  integrationHealthOwnerOptions,
  integrationHealthTypeOptions,
  INTEGRATION_HEALTH_SEVERITY_STYLE,
  summarizeIntegrationHealth,
  type HealthFilter,
  type IntegrationHealthRow,
  type IntegrationMechanismFilter,
  type IntegrationTypeFilter,
} from "@/lib/integration-health-view-utils";
import { cn } from "@/lib/utils";

const PREVIEW_COUNT = 6;

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
              seg.active && "bg-teal-50"
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
              className="flex-1 text-left hover:bg-gray-50/80 transition-colors min-w-0"
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
  const selected = options.find((o) => o.value === value);
  const isActive = value !== "all";
  const displayText = isActive && selected ? selected.label : label;

  return (
    <label
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full border pl-2.5 pr-2 py-1.5 cursor-pointer transition-colors",
        isActive
          ? "border-teal-300 bg-teal-50/70 hover:bg-teal-50"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50/80"
      )}
    >
      <Icon size={14} className={cn("shrink-0", isActive ? "text-teal-600" : "text-gray-500")} />
      <span className={cn("text-sm font-medium", isActive ? "text-teal-800" : "text-gray-700")}>
        {displayText}
      </span>
      <ChevronDown size={14} className={cn("shrink-0", isActive ? "text-teal-400" : "text-gray-400")} />
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

function IntegrationCard({
  row,
  onClick,
}: {
  row: IntegrationHealthRow;
  onClick: () => void;
}) {
  const style = INTEGRATION_HEALTH_SEVERITY_STYLE[row.severity];

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left bg-white rounded-xl border border-gray-200 border-t-4 p-4 hover:border-teal-200 hover:shadow-sm transition-all w-full",
        style.border
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <span className="text-[10px] font-bold tracking-wider text-gray-400">{row.typeLabel}</span>
        <span
          className={cn(
            "text-[10px] font-bold tracking-wide px-2 py-0.5 rounded border shrink-0 max-w-[55%] truncate",
            style.badge
          )}
        >
          {row.badgeLabel}
        </span>
      </div>
      <h3 className="font-semibold text-gray-900 leading-snug mb-2">{row.name}</h3>
      <p className="text-xs text-gray-500 line-clamp-2">{row.detailLine}</p>
    </button>
  );
}

export function IntegrationHealthView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<IntegrationTypeFilter>("all");
  const [mechanismFilter, setMechanismFilter] = useState<IntegrationMechanismFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState<IntegrationHealthRow | null>(null);

  const listQueries = useQuery({
    queryKey: ["integration-health", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const [flows, apis, events] = await Promise.all([
        objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token),
        objectsApi.list(orgSlug, workspaceSlug, { type: "api" }, token),
        objectsApi.list(orgSlug, workspaceSlug, { type: "event" }, token),
      ]);
      return {
        flows: flows.items,
        apis: apis.items,
        events: events.items,
      };
    },
    enabled,
  });

  const rows = useMemo(() => {
    if (!listQueries.data) return [];
    return buildIntegrationHealthRows(
      listQueries.data.flows,
      listQueries.data.apis,
      listQueries.data.events
    );
  }, [listQueries.data]);

  const summary = useMemo(() => summarizeIntegrationHealth(rows), [rows]);

  const filtered = useMemo(
    () =>
      filterIntegrationHealthRows(rows, {
        search,
        type: typeFilter,
        mechanism: mechanismFilter,
        owner: ownerFilter,
        health: healthFilter,
      }),
    [rows, search, typeFilter, mechanismFilter, ownerFilter, healthFilter]
  );

  const ownerOptions = useMemo(() => integrationHealthOwnerOptions(rows), [rows]);
  const visible = showAll ? filtered : filtered.slice(0, PREVIEW_COUNT);
  const hiddenCount = Math.max(0, filtered.length - PREVIEW_COUNT);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["integration-health", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
  };

  const listLoading = listQueries.isLoading || listQueries.isPending;

  const clearHealthFilter = () => {
    setHealthFilter("all");
    setShowAll(false);
  };

  if (listLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-gray-200 bg-white">
        <Loader2 className="h-9 w-9 animate-spin text-teal-600" />
        <p className="mt-4 text-sm font-medium text-gray-700">Loading integrations…</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <MetricsSummaryBar
          segments={[
            {
              key: "apis",
              value: String(summary.apiCount),
              subtext: "APIs",
              active: typeFilter === "api" && healthFilter === "all",
              onClick: () => {
                clearHealthFilter();
                setTypeFilter("api");
              },
            },
            {
              key: "events",
              value: String(summary.eventCount),
              subtext: "events",
              active: typeFilter === "event" && healthFilter === "all",
              onClick: () => {
                clearHealthFilter();
                setTypeFilter("event");
              },
            },
            {
              key: "flows",
              value: String(summary.flowCount),
              subtext: "flows",
              active: typeFilter === "flow" && healthFilter === "all",
              onClick: () => {
                clearHealthFilter();
                setTypeFilter("flow");
              },
            },
            {
              key: "manual",
              value: String(summary.manualNoCodeCount),
              subtext: "manual / no-code",
              subtextClassName: "text-red-600",
              active: healthFilter === "manual_no_code",
              onClick: () => {
                setHealthFilter("manual_no_code");
                setTypeFilter("flow");
                setMechanismFilter("all");
                setShowAll(true);
              },
            },
            {
              key: "public",
              value: String(summary.publicNoConsumersCount),
              subtext: "public API, no consumers listed",
              subtextClassName: "text-amber-600",
              active: healthFilter === "public_no_consumers",
              onClick: () => {
                setHealthFilter("public_no_consumers");
                setTypeFilter("api");
                setMechanismFilter("all");
                setShowAll(true);
              },
            },
          ]}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setShowAll(true);
              }}
              placeholder="Search integrations…"
              className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <FilterDropdown
            icon={Tag}
            label="Type"
            value={typeFilter}
            onChange={(v) => {
              setTypeFilter(v as IntegrationTypeFilter);
              setShowAll(true);
            }}
            options={integrationHealthTypeOptions()}
          />
          <FilterDropdown
            icon={Wrench}
            label="Mechanism"
            value={mechanismFilter}
            onChange={(v) => {
              setMechanismFilter(v as IntegrationMechanismFilter);
              setHealthFilter("all");
              setShowAll(true);
            }}
            options={integrationHealthMechanismOptions()}
          />
          <FilterDropdown
            icon={User}
            label="Owner"
            value={ownerFilter}
            onChange={(v) => {
              setOwnerFilter(v);
              setShowAll(true);
            }}
            options={[
              { value: "all", label: "All owners" },
              ...ownerOptions.map((o) => ({ value: o, label: o })),
            ]}
          />
          {(healthFilter !== "all" || typeFilter !== "all" || mechanismFilter !== "all") && (
            <button
              type="button"
              onClick={() => {
                setHealthFilter("all");
                setTypeFilter("all");
                setMechanismFilter("all");
                setOwnerFilter("all");
                setShowAll(false);
              }}
              className="text-xs font-medium text-teal-700 hover:text-teal-900 px-2"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            All integrations ({filtered.length})
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <ArrowLeftRight className="mx-auto h-8 w-8 text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">
              {rows.length === 0
                ? "No APIs, events, or flows in the repository yet."
                : "No integrations match the current filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((row) => (
                <IntegrationCard key={row.id} row={row} onClick={() => setSelected(row)} />
              ))}
            </div>
            {!showAll && hiddenCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-sm font-medium text-teal-700 hover:text-teal-900"
              >
                + {hiddenCount} more
              </button>
            )}
          </>
        )}
      </div>

      {selected?.kind === "flow" && (
        <FlowDetail
          flow={selected.object}
          onClose={() => setSelected(null)}
          onDelete={refresh}
          onUpdate={refresh}
        />
      )}
      {selected?.kind === "api" && (
        <ApiDetail
          api={selected.object}
          onClose={() => setSelected(null)}
          onDelete={refresh}
          onUpdate={refresh}
        />
      )}
      {selected?.kind === "event" && (
        <EventDetail
          event={selected.object}
          onClose={() => setSelected(null)}
          onDelete={refresh}
          onUpdate={refresh}
        />
      )}
    </>
  );
}
