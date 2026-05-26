"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import type { CapabilityMapDomain } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { fetchDomainDetail } from "@/lib/domain-detail";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { DomainMappingTab } from "@/components/capability-map/DomainMappingTab";
import { DomainProcessesTab } from "@/components/capability-map/DomainProcessesTab";
import { domainIcon } from "@/lib/capability-map-icons";
import { objectListPath } from "@/lib/tenancy";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

type TabId = "overview" | "mapping" | "processes" | "products";

interface Props {
  domainId: string;
}

export function DomainDetailPage({ domainId }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("mapping");
  const queryEnabled = useAuthQueryEnabled(orgSlug, workspaceSlug, domainId);

  const { data: domain, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["domain-detail", orgSlug, workspaceSlug, domainId],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return fetchDomainDetail(orgSlug, workspaceSlug, domainId, token);
    },
    retry: 1,
  });

  const pickerDomain: CapabilityMapDomain | null = useMemo(() => {
    if (!domain) return null;
    return {
      id: domain.id,
      name: domain.name,
      icon: domain.icon,
      source_template_id: domain.source_template_id,
      capabilities: domain.capabilities,
    };
  }, [domain]);

  const capabilitiesPath = objectListPath(orgSlug, workspaceSlug, "business", "capabilities");
  const DomainIcon = domainIcon(domain?.icon);

  if (isLoading || !queryEnabled) {
    return <p className="p-8 text-sm text-gray-400">Loading domain…</p>;
  }

  if (isError) {
    return (
      <div className="p-8 max-w-lg">
        <p className="text-sm text-red-600">{(error as Error).message}</p>
        <p className="text-sm text-gray-500 mt-2">
          Check the network tab for the request to{" "}
          <code className="text-xs">/api/v1/orgs/.../capability-map/domains/…</code>. A 401 usually
          means auth was not ready yet — try Retry.
        </p>
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={() => refetch()}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            Retry
          </button>
          <Link href={capabilitiesPath} className="text-sm text-gray-500 hover:text-gray-700">
            Back to capability map
          </Link>
        </div>
      </div>
    );
  }

  if (!domain || !pickerDomain) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Domain not found.</p>
        <Link href={capabilitiesPath} className="text-sm text-indigo-600 hover:text-indigo-700 mt-2 inline-block">
          Back to capability map
        </Link>
      </div>
    );
  }

  const mappedSystemsLabel =
    domain.stats.mapped_system_count === 0
      ? "No systems mapped"
      : `${domain.stats.mapped_system_count} system${domain.stats.mapped_system_count === 1 ? "" : "s"} mapped`;

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Page header */}
      <div className="px-8 pt-5 pb-0 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {/* Breadcrumb */}
            <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
              <Link href={capabilitiesPath} className="hover:text-indigo-600 transition-colors">
                Capabilities
              </Link>
              <span>›</span>
              <span className="text-gray-600">Domain</span>
            </nav>

            {/* Title row */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 flex-shrink-0">
                <DomainIcon size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{domain.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {domain.stats.capability_count}{" "}
                  {domain.stats.capability_count === 1 ? "capability" : "capabilities"} · {mappedSystemsLabel}
                  {domain.owner ? ` · Owner: ${domain.owner}` : ""}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 mt-6">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Info size={14} />
              Details
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-0">
          {(
            [
              ["overview", "Overview"],
              ["mapping", "Mapping"],
              ["processes", "Processes"],
              ["products", "Products"],
            ] as const
          ).map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
                activeTab === tab
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0">
        {activeTab === "overview" && (
          <div className="p-8 max-w-3xl">
            <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p>
                <p className="text-sm text-gray-700 mt-1">
                  {domain.description?.trim() || "No description yet."}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Capabilities</p>
                <ul className="mt-2 space-y-1">
                  {domain.capabilities.map((capability) => (
                    <li key={capability.id} className="text-sm text-gray-700">
                      {capability.name}
                    </li>
                  ))}
                  {domain.capabilities.length === 0 && (
                    <li className="text-sm text-gray-400 italic">No capabilities yet</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Mapping summary</p>
                <p className="text-sm text-gray-700 mt-1">
                  {domain.stats.strong_count} strong · {domain.stats.adequate_count} adequate ·{" "}
                  {domain.stats.weak_count} weak · {domain.stats.gap_count} gaps
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "mapping" && (
          <DomainMappingTab
            domain={domain}
            pickerDomain={pickerDomain}
            onRefresh={() => {
              refetch();
              queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
            }}
          />
        )}

        {activeTab === "processes" && <DomainProcessesTab domain={domain} />}

        {activeTab === "products" && (
          <PlaceholderTab
            title="Products"
            body="Products that rely on this domain's capabilities will appear here."
          />
        )}
      </div>
    </div>
  );
}

function PlaceholderTab({ title, body }: { title: string; body: string }) {
  return (
    <div className="p-8">
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center max-w-lg">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500 mt-2">{body}</p>
      </div>
    </div>
  );
}
