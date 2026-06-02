"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import type { CapabilityMap, CapabilityMapDomain } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import { AddCapabilityPickerDialog } from "@/components/capability-map/AddCapabilityPickerDialog";
import { AddDomainPickerDialog } from "@/components/capability-map/AddDomainPickerDialog";
import { domainIcon } from "@/lib/capability-map-icons";
import { objectListPath } from "@/lib/tenancy";
import { useTenancy } from "@/lib/tenancy";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { cn } from "@/lib/utils";

interface Props {
  map: CapabilityMap;
  onRefresh: () => void;
}

export function CapabilityMapView({ map, onRefresh }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [showDomainPicker, setShowDomainPicker] = useState(false);
  const [capPickerDomain, setCapPickerDomain] = useState<CapabilityMapDomain | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
    queryClient.invalidateQueries({ queryKey: ["capability-library-domains", orgSlug, workspaceSlug] });
    void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
    if (capPickerDomain) {
      queryClient.invalidateQueries({
        queryKey: ["capability-library-caps", orgSlug, workspaceSlug, capPickerDomain.id],
      });
    }
  };

  const createDomainMutation = useMutation({
    mutationFn: async ({
      name,
      icon,
      sourceTemplateId,
    }: {
      name: string;
      icon?: string;
      sourceTemplateId?: string;
    }) => {
      const token = await getToken();
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "business_domain",
          name,
          status: "active",
          properties: {
            order_index: map.domains.length,
            ...(icon ? { icon } : {}),
            ...(sourceTemplateId ? { source_template_id: sourceTemplateId } : {}),
          },
        },
        token!
      );
    },
    onSuccess: () => {
      setShowDomainPicker(false);
      invalidate();
      onRefresh();
    },
  });

  const createCapabilityMutation = useMutation({
    mutationFn: async ({ domainId, name }: { domainId: string; name: string }) => {
      const token = await getToken();
      const domain = map.domains.find((d) => d.id === domainId);
      return objectsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: "capability",
          name,
          status: "active",
          properties: {
            domain_id: domainId,
            order_index: domain?.capabilities.length ?? 0,
          },
        },
        token!
      );
    },
    onSuccess: () => {
      setCapPickerDomain(null);
      invalidate();
      onRefresh();
    },
  });

  const totalCapabilities = map.domains.reduce((sum, d) => sum + d.capabilities.length, 0);
  const existingDomainNames = map.domains.map((d) => d.name);

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="px-8 py-5 border-b border-gray-100 bg-white flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Capability map</h1>
            <p className="text-sm text-gray-500 mt-1">
              Level 1 domains and level 2 capabilities. Duplicate names across domains when needed.
            </p>
            {map.domains.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">
                {map.domains.length} domain{map.domains.length === 1 ? "" : "s"} · {totalCapabilities} capabilit
                {totalCapabilities === 1 ? "y" : "ies"}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowDomainPicker(true)}
            className="inline-flex items-center gap-1.5 border border-gray-200 rounded-md px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Plus size={14} />
            Add domain
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {map.domains.length === 0 ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <p className="text-gray-500 text-sm mb-4">
                Start building your map by adding a level-1 domain — pick from industry suggestions or create your own.
              </p>
              <button
                type="button"
                onClick={() => setShowDomainPicker(true)}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md px-4 py-2 text-sm font-medium"
              >
                <Plus size={14} />
                Add domain
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
              {map.domains.map((domain) => (
                <DomainCard
                  key={domain.id}
                  domain={domain}
                  onAddCapability={() => setCapPickerDomain(domain)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {showDomainPicker && (
        <AddDomainPickerDialog
          existingDomainNames={existingDomainNames}
          isSubmitting={createDomainMutation.isPending}
          onClose={() => setShowDomainPicker(false)}
          onSelectLibrary={(name, icon, templateId) =>
            createDomainMutation.mutate({ name, icon, sourceTemplateId: templateId })
          }
          onCreateNew={(name) => createDomainMutation.mutate({ name })}
        />
      )}

      {capPickerDomain && (
        <AddCapabilityPickerDialog
          domain={capPickerDomain}
          isSubmitting={createCapabilityMutation.isPending}
          onClose={() => setCapPickerDomain(null)}
          onAdd={(name) =>
            createCapabilityMutation.mutate({ domainId: capPickerDomain.id, name })
          }
        />
      )}

      {(createDomainMutation.isError || createCapabilityMutation.isError) && (
        <p className="fixed bottom-4 right-4 z-[100] text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2 shadow-sm">
          {(createDomainMutation.error ?? createCapabilityMutation.error)?.message}
        </p>
      )}
    </>
  );
}

function DomainCard({
  domain,
  onAddCapability,
}: {
  domain: CapabilityMapDomain;
  onAddCapability: () => void;
}) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const Icon = domainIcon(domain.icon);
  const detailPath = `${objectListPath(orgSlug, workspaceSlug, "business", "capabilities")}/domains/${domain.id}`;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 hover:border-indigo-200 transition-colors">
      <Link href={detailPath} className="block group">
        <div className="flex items-center gap-2 mb-4">
          <div className="rounded-md bg-gray-100 p-1.5 text-gray-600 group-hover:bg-indigo-50 group-hover:text-indigo-700">
            <Icon size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 group-hover:text-indigo-700">{domain.name}</h3>
            <p className="text-xs text-gray-400">Domain · Level 1</p>
          </div>
        </div>

        <ul className="space-y-1.5 mb-3">
          {domain.capabilities.slice(0, 5).map((cap) => (
            <li key={cap.id} className="text-sm text-gray-700 pl-3 border-l-2 border-indigo-100">
              {cap.name}
            </li>
          ))}
          {domain.capabilities.length === 0 && (
            <li className="text-sm text-gray-400 italic">No capabilities yet</li>
          )}
          {domain.capabilities.length > 5 && (
            <li className="text-xs text-gray-400 pl-3">+{domain.capabilities.length - 5} more</li>
          )}
        </ul>
      </Link>

      <button
        type="button"
        onClick={onAddCapability}
        className={cn(
          "inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-indigo-600"
        )}
      >
        <Plus size={12} />
        Add capability
      </button>
    </div>
  );
}
