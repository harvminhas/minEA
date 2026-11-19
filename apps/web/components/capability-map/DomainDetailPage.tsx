"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { CapabilityMapCapability, CapabilityMapDomain } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { fetchDomainDetail } from "@/lib/domain-detail";
import { capabilityMapApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { DomainMappingTab } from "@/components/capability-map/DomainMappingTab";
import { DomainProcessesTab } from "@/components/capability-map/DomainProcessesTab";
import { DomainProductsTab } from "@/components/capability-map/DomainProductsTab";
import { DomainHistoryTab } from "@/components/capability-map/DomainHistoryTab";
import { capabilityMapPath } from "@/lib/capability-map-paths";
import { DomainOverviewTab } from "@/components/capability-map/DomainOverviewTab";
import { DomainRelationshipsTab } from "@/components/capability-map/DomainRelationshipsTab";
import { EditCapabilityDialog } from "@/components/capability-map/EditCapabilityDialog";
import { domainIcon } from "@/lib/capability-map-icons";
import { useTenancy } from "@/lib/tenancy";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { RefreshingOverlay } from "@/components/ui/RefreshingOverlay";
import { useQueryRefreshing } from "@/lib/use-query-refreshing";
import { usePermissions } from "@/lib/use-permissions";
import { recordPageTabFromSearch, recordPageTabQuery, type RecordPageTab } from "@/lib/record-tabs";
import { ObjectDrawerTabs } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import { EntityOwnerLine } from "@/components/people/EntityOwnerLine";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useCapabilityMappedLinks } from "@/lib/use-capability-mapped-links";
import { isActivity } from "@/lib/capability-tree";
import type { MappedScope } from "@/lib/capability-mapping";
import type { MinEAObject } from "@minea/types";

interface Props {
  domainId: string;
}

const SECTION_TABS = new Set(["mapping", "processes", "products"]);

export function DomainDetailPage({ domainId }: Props) {
  const { canEdit } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab = recordPageTabFromSearch(rawTab, searchParams.get("focus"));
  const focusOwner = searchParams.get("focus") === "owner";
  const [editCapability, setEditCapability] = useState<CapabilityMapCapability | null>(null);
  const [addingRelationship, setAddingRelationship] = useState(false);
  const queryEnabled = useAuthQueryEnabled(orgSlug, workspaceSlug, domainId);
  const catalog = useModelCatalog();
  const domainObject = catalog.data?.objects.find((item) => item.id === domainId);

  const domainQuery = useQuery({
    queryKey: ["domain-detail", orgSlug, workspaceSlug, domainId],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return fetchDomainDetail(orgSlug, workspaceSlug, domainId, token);
    },
    retry: 1,
  });

  const { data: domain, isLoading, isError, error, refetch } = domainQuery;
  const isRefreshing = useQueryRefreshing(domainQuery);
  const debt = useObjectTechDebtSummary(domainId, queryEnabled);
  const history = useQuery({
    queryKey: ["domain-history", orgSlug, workspaceSlug, domainId],
    enabled: queryEnabled,
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return capabilityMapApi.getDomainHistory(orgSlug, workspaceSlug, domainId, token);
    },
  });

  const scopes = useMemo<MappedScope[]>(() => {
    if (!domain) return [];
    const objects = (catalog.data?.objects ?? []) as MinEAObject[];
    const inDomain = objects.filter(
      (object) =>
        object.type === "capability" &&
        (String(object.properties?.domain_id ?? "") === domain.id ||
          domain.capabilities.some((cap) => cap.id === object.id))
    );
    const out: MappedScope[] = [];
    for (const cap of inDomain.filter((object) => !isActivity(object.properties))) {
      out.push({ id: cap.id, name: cap.name, level: "capability" });
      for (const child of inDomain.filter(
        (object) => isActivity(object.properties) && String(object.properties?.parent_id ?? "") === cap.id
      )) {
        out.push({ id: child.id, name: child.name, level: "activity" });
      }
    }
    return out;
  }, [domain, catalog.data?.objects]);
  const mapped = useCapabilityMappedLinks(scopes);
  const relationshipCount = mapped.groups.reduce((sum, group) => sum + group.items.length, 0);

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

  const capabilitiesPath = capabilityMapPath(orgSlug, workspaceSlug);
  const DomainIcon = domainIcon(domain?.icon);

  const setTab = (tab: RecordPageTab) => {
    const params = new URLSearchParams(searchParams.toString());
    const query = recordPageTabQuery(tab);
    if (query) params.set("tab", query);
    else params.delete("tab");
    if (tab !== "overview") params.delete("focus");
    const suffix = params.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    if (tab === "relationships" && addingRelationship === false) {
      /* keep adding closed until the user clicks Add */
    }
  };

  useEffect(() => {
    if (!SECTION_TABS.has(rawTab ?? "")) return;
    const id = `domain-section-${rawTab}`;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start", behavior: "smooth" });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [rawTab, domain?.id]);

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

  const refreshDomain = () => {
    refetch();
    queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({
      queryKey: ["domain-history", orgSlug, workspaceSlug, domainId],
    });
    queryClient.invalidateQueries({
      queryKey: ["domain-products", orgSlug, workspaceSlug, domainId],
    });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
  };

  const onSwitchOverview = (tab: string) => {
    if (tab === "mapping" || tab === "processes" || tab === "products") {
      document.getElementById(`domain-section-${tab}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (tab === "relationships" || tab === "tech_debt" || tab === "history" || tab === "overview") {
      setTab(tab);
    }
  };

  return (
    <RefreshingOverlay active={isRefreshing} className="flex flex-col h-full min-h-0 bg-white">
      <div className="px-8 pt-5 pb-0 border-b border-gray-200 bg-white">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            <nav className="text-xs text-gray-400 mb-3 flex items-center gap-1">
              <Link href={capabilitiesPath} className="hover:text-indigo-600 transition-colors">
                Capabilities
              </Link>
              <span>›</span>
              <span className="text-gray-600">Domain</span>
            </nav>

            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600 flex-shrink-0">
                <DomainIcon size={22} />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 leading-tight">{domain.name}</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  {domain.stats.capability_count}{" "}
                  {domain.stats.capability_count === 1 ? "capability" : "capabilities"} · {mappedSystemsLabel}
                </p>
                <EntityOwnerLine
                  objectId={domain.id}
                  objectType="business_domain"
                  object={domainObject}
                  canEdit={canEdit}
                  openEditor={focusOwner}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 mt-6">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <Download size={14} />
              Export
            </button>
          </div>
        </div>

        <ObjectDrawerTabs
          activeTab={activeTab}
          onTabChange={(next) => setTab(next as RecordPageTab)}
          firstTab={{ id: "overview", label: "Overview" }}
          showRelationships
          showTechDebt
          showHistory
          relationshipCount={relationshipCount}
          openDebtCount={debt.data?.open_count ?? 0}
          historyCount={history.data?.entries?.length ?? 0}
          className="px-0"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "overview" && (
          <div data-testid="domain-overview">
            <DomainOverviewTab
              domain={domain}
              onSwitchTab={onSwitchOverview}
              onEditCapability={canEdit ? setEditCapability : undefined}
              onRefresh={refreshDomain}
            />
            <div id="domain-section-mapping" className="border-t border-gray-100">
              <DomainMappingTab
                domain={domain}
                pickerDomain={pickerDomain}
                onEditCapability={canEdit ? setEditCapability : undefined}
                onRefresh={refreshDomain}
              />
            </div>
            <div id="domain-section-processes" className="border-t border-gray-100">
              <DomainProcessesTab domain={domain} />
            </div>
            <div id="domain-section-products" className="border-t border-gray-100">
              <DomainProductsTab domain={domain} />
            </div>
          </div>
        )}

        {activeTab === "relationships" && (
          <DomainRelationshipsTab domain={domain} adding={addingRelationship} onAddingChange={setAddingRelationship} />
        )}

        {activeTab === "tech_debt" && (
          <div className="p-8 max-w-4xl" data-testid="domain-tech-debt">
            <ObjectTechDebtTab
              objectId={domain.id}
              objectName={domain.name}
              objectKind="business_domain"
              summary={debt.data}
              isLoading={debt.isLoading}
              onRefresh={() => void debt.refetch()}
            />
          </div>
        )}

        {activeTab === "history" && <DomainHistoryTab domainId={domain.id} />}
      </div>

      {canEdit && editCapability && (
        <EditCapabilityDialog
          capability={editCapability}
          domainName={domain.name}
          onClose={() => setEditCapability(null)}
          onSuccess={() => {
            setEditCapability(null);
            refreshDomain();
          }}
        />
      )}
    </RefreshingOverlay>
  );
}
