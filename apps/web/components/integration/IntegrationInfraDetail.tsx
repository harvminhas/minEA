"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Edit2, Trash2 } from "lucide-react";
import type { MinEAObject, ToolProperties } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import { CreateIntegrationInfraPanel } from "@/components/integration/CreateIntegrationInfraPanel";
import {
  formatInfraSubtitle,
  infraKindLabel,
  infraVendorLabel,
  INFRA_HOSTING_LABEL,
  INFRA_ICON_STYLE,
  INFRA_LICENSE_LABEL,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA_LABEL,
} from "@/lib/integration-infra-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

interface Props {
  infra: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function IntegrationInfraDetail({ infra, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(infra.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const props = (infra.properties ?? {}) as ToolProperties;
  const kindLabel = infraKindLabel(props);
  const vendorLabel = infraVendorLabel(props.vendor);

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, infra.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, infra.id, token!);
    },
    enabled: activeTab === "history",
  });

  const historyEntries: HistoryEntry[] = (historyQuery.data?.entries ?? []).map((e) => ({
    id: e.id,
    actor_name: e.actor_name,
    action: e.action,
    detail: e.detail ?? null,
    created_at: e.created_at,
  }));

  const refreshInfra = () => {
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
    onUpdate();
  };

  const { data: flowsData } = useQuery({
    queryKey: ["infra-flows", orgSlug, workspaceSlug, infra.id],
    queryFn: async () => {
      const token = await getToken();
      const [rels, flows] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: infra.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token!),
      ]);
      const relIds = new Set(
        rels
          .filter((r) => r.type === "connects_to" && r.to_type === "integration_flow")
          .map((r) => r.to_object_id)
      );
      return flows.items.filter((item) => relIds.has(item.id));
    },
    enabled: enabled && activeTab === "details",
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, infra.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
  });

  const flows = flowsData ?? [];

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex flex-col border-b border-gray-100">
            <div className="flex items-start justify-between p-6 pb-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                    INFRA_ICON_STYLE
                  )}
                >
                  <ArrowLeftRight size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{infra.name}</h2>
                  <p className="text-sm text-gray-400">{formatInfraSubtitle(props)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit infrastructure"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete infrastructure"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>

            <ObjectDrawerTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              openDebtCount={techDebtSummary?.open_count ?? 0}
              className="mt-4"
            />
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated{infra.updated_by_name ? ` by ${infra.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(infra.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={infra.id}
            objectName={infra.name}
            objectKind="tool"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={infra.owner}
            onRefresh={refreshInfra}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            <DetailSection title="Kind">
              {kindLabel && <DetailRow label="Type" value={kindLabel} />}
            </DetailSection>

            <DetailSection title="Identity">
              {vendorLabel && <DetailRow label="Vendor" value={vendorLabel} />}
              {props.vendor_product && <DetailRow label="Vendor product" value={props.vendor_product} />}
              {infra.description && <DetailRow label="Description" value={infra.description} />}
              {infra.tags.length > 0 && <DetailRow label="Tags" value={infra.tags.join(", ")} />}
            </DetailSection>

            <DetailSection title="Deployment">
              {props.hosting_model && (
                <DetailRow
                  label="Hosting model"
                  value={INFRA_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
                />
              )}
              {props.region && <DetailRow label="Region" value={props.region} />}
              {props.environments && props.environments.length > 0 && (
                <DetailRow label="Environments" value={props.environments.join(", ")} />
              )}
              {props.admin_url && <DetailRow label="Admin URL" value={props.admin_url} />}
            </DetailSection>

            <DetailSection title="Contract">
              {props.license_model && (
                <DetailRow
                  label="License model"
                  value={INFRA_LICENSE_LABEL[props.license_model] ?? props.license_model}
                />
              )}
              {props.contract_renewal && <DetailRow label="Contract renewal" value={props.contract_renewal} />}
              {props.annual_cost && <DetailRow label="Annual cost" value={props.annual_cost} />}
            </DetailSection>

            <DetailSection title="Governance">
              {infra.owner && <DetailRow label="Owner" value={infra.owner} />}
              {props.sla_target && (
                <DetailRow label="SLA target" value={PLATFORM_SLA_LABEL[props.sla_target] ?? props.sla_target} />
              )}
              {props.lifecycle && (
                <DetailRow
                  label="Lifecycle"
                  value={PLATFORM_LIFECYCLE_LABEL[props.lifecycle] ?? props.lifecycle}
                />
              )}
              {props.criticality && (
                <DetailRow
                  label="Criticality"
                  value={PLATFORM_CRITICALITY_LABEL[props.criticality] ?? props.criticality}
                />
              )}
            </DetailSection>

            <DetailSection title="Integrations">
              {flows.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">
                  No integrations reference this infrastructure yet.
                </p>
              ) : (
                <ul className="px-6 pb-4 space-y-1.5">
                  {flows.map((flow) => (
                    <li key={flow.id} className="text-sm text-gray-700">
                      {flow.name}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete integration infrastructure"
          message={`Are you sure you want to delete "${infra.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showEditForm && (
        <CreateIntegrationInfraPanel
          initialValues={infra}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshInfra();
          }}
        />
      )}
    </>
  );
}
