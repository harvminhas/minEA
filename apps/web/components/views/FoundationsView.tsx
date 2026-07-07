"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { SystemObjectDetail } from "@/components/objects/SystemObjectDetail";
import { APPLICATION_LAYER_COLOR } from "@/lib/component-utils";
import {
  buildPlatformFoundationGroups,
  buildRuntimeFoundationGroups,
  foundationGroupHeading,
  foundationsDataFromLists,
  summarizePlatformFoundations,
  summarizeRuntimeFoundations,
  type FoundationGroup,
  type FoundationsTab,
} from "@/lib/foundations-view-utils";
import type { MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

const TABS: { id: FoundationsTab; label: string }[] = [
  { id: "platform", label: "Platform" },
  { id: "runtime", label: "Runtime" },
];

function MetricsSummaryBar({
  segments,
}: {
  segments: {
    key: string;
    value: string;
    subtext: string;
    subtextClassName?: string;
  }[];
}) {
  return (
    <div className="flex rounded-lg border border-gray-200 bg-white overflow-hidden divide-x divide-gray-200">
      {segments.map((seg) => (
        <div key={seg.key} className="flex flex-1 items-baseline gap-2 px-4 py-2.5 min-w-0">
          <span className="text-xl font-bold text-gray-900 tabular-nums">{seg.value}</span>
          <span className={cn("text-xs truncate", seg.subtextClassName ?? "text-gray-500")}>
            {seg.subtext}
          </span>
        </div>
      ))}
    </div>
  );
}

function FoundationSystemPill({
  entry,
  variant,
  onClick,
}: {
  entry: FoundationGroup["systems"][number];
  variant: FoundationGroup["variant"];
  onClick: () => void;
}) {
  const label = entry.detailNote
    ? `${entry.system.name} · ${entry.detailNote}`
    : entry.system.name;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex max-w-full rounded-full border bg-white px-3 py-1.5 text-sm font-medium text-gray-900",
        "hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors text-left",
        variant === "custom" && "border-red-200 text-red-900 hover:border-red-300 hover:bg-red-50/50",
        variant === "muted" && "border-gray-200 text-gray-700",
        variant === "default" && "border-gray-200"
      )}
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

function FoundationGroupSection({
  group,
  onOpenSystem,
}: {
  group: FoundationGroup;
  onOpenSystem: (system: MinEAObject) => void;
}) {
  return (
    <section className="space-y-3">
      <h3
        className={cn(
          "text-[11px] font-bold tracking-wider",
          group.variant === "custom" && "text-red-700",
          group.variant === "muted" && "text-gray-400",
          group.variant === "default" && "text-gray-500"
        )}
      >
        {foundationGroupHeading(group)}
      </h3>
      <div className="flex flex-wrap gap-2">
        {group.systems.map((entry) => (
          <FoundationSystemPill
            key={entry.system.id}
            entry={entry}
            variant={group.variant}
            onClick={() => onOpenSystem(entry.system)}
          />
        ))}
      </div>
    </section>
  );
}

export function FoundationsView() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [tab, setTab] = useState<FoundationsTab>("platform");
  const [selectedSystemId, setSelectedSystemId] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["foundations", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const [applications, solutions, technicalCapabilities, platforms, runtimes, relationships] =
        await Promise.all([
          objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "solution" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "technical_capability" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "cloud_service" }, token),
          objectsApi.list(orgSlug, workspaceSlug, { type: "model" }, token),
          relationshipsApi.list(orgSlug, workspaceSlug, {}, token),
        ]);

      return foundationsDataFromLists({
        applications: applications.items,
        solutions: solutions.items,
        technicalCapabilities: technicalCapabilities.items,
        platforms: platforms.items,
        runtimes: runtimes.items,
        relationships,
      });
    },
    enabled,
  });

  const platformGroups = useMemo(
    () => (query.data ? buildPlatformFoundationGroups(query.data) : []),
    [query.data]
  );
  const runtimeGroups = useMemo(
    () => (query.data ? buildRuntimeFoundationGroups(query.data) : []),
    [query.data]
  );

  const groups = tab === "platform" ? platformGroups : runtimeGroups;
  const summary =
    tab === "platform"
      ? summarizePlatformFoundations(platformGroups)
      : summarizeRuntimeFoundations(runtimeGroups);

  const selectedSystem = useMemo(() => {
    if (!selectedSystemId || !query.data) return null;
    return query.data.systems.find((s) => s.id === selectedSystemId) ?? null;
  }, [selectedSystemId, query.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["foundations", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
  };

  if (query.isLoading || query.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-gray-200 bg-white">
        <Loader2 className="h-9 w-9 animate-spin text-indigo-600" />
        <p className="mt-4 text-sm font-medium text-gray-700">Loading tech stack…</p>
      </div>
    );
  }

  const kpiSegments =
    tab === "platform"
      ? [
          { key: "mapped", value: String(summary.systemsMapped), subtext: "systems mapped" },
          {
            key: "custom",
            value: String(summary.customDevelopment),
            subtext: "custom development",
            subtextClassName: "text-red-600",
          },
          {
            key: "types",
            value: String(summary.foundationTypesInUse),
            subtext: "platform types in use",
          },
        ]
      : [
          { key: "mapped", value: String(summary.systemsMapped), subtext: "systems mapped" },
          {
            key: "onprem",
            value: String(summary.customDevelopment),
            subtext: "on-prem / bare metal",
            subtextClassName: "text-red-600",
          },
          {
            key: "types",
            value: String(summary.foundationTypesInUse),
            subtext: "runtime types in use",
          },
        ];

  return (
    <>
      <div className="flex flex-col gap-5">
        <div className="border-b border-gray-200">
          <nav className="flex gap-6" aria-label="Tech stack tabs">
            {TABS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "pb-2.5 text-sm font-semibold border-b-2 transition-colors",
                  tab === id
                    ? "border-indigo-600 text-indigo-700"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                )}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>

        <MetricsSummaryBar segments={kpiSegments} />

        {summary.totalSystems === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm">No systems in the repository yet.</p>
          </div>
        ) : groups.length === 0 ? (
          <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-white/60">
            <p className="text-gray-500 text-sm">No tech stack mapping to show.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <FoundationGroupSection
                key={group.key}
                group={group}
                onOpenSystem={(system) => setSelectedSystemId(system.id)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedSystem && (
        <SystemObjectDetail
          objectId={selectedSystem.id}
          accentColor={APPLICATION_LAYER_COLOR}
          onClose={() => setSelectedSystemId(null)}
          onUpdate={refresh}
        />
      )}
    </>
  );
}
