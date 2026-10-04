"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu } from "lucide-react";
import type { MinEAObject, ModelProperties } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { CatalogDetailFields } from "@/components/catalog/CatalogDetailFields";
import {
  DetailPanel,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import {
  catalogOwnerLabel,
  formatCatalogAnnualCost,
  formatCatalogContractEnd,
} from "@/lib/catalog-fields";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { usePermissions } from "@/lib/use-permissions";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import {
  formatRuntimeSubtitle,
  PLATFORM_SLA_LABEL,
  RUNTIME_COST_MODEL_LABEL,
  RUNTIME_HOSTING_LABEL,
  RUNTIME_ICON_STYLE,
  runtimeAccessMethod,
  runtimeKindLabel,
  runtimeProviderLabel,
} from "@/lib/runtime-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

interface Props {
  runtime: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function RuntimeDetail({ runtime, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const { canEdit, canDelete } = usePermissions();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(runtime.id);
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const props = (runtime.properties ?? {}) as ModelProperties;
  const kindLabel = runtimeKindLabel(props);
  const providerLabel = runtimeProviderLabel(props.runtime_provider);

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, runtime.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, runtime.id, token!);
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

  const refreshRuntime = () => {
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
    onUpdate();
  };

  const { data: workloadsData } = useQuery({
    queryKey: ["runtime-workloads", orgSlug, workspaceSlug, runtime.id],
    queryFn: async () => {
      const token = await getToken();
      const [rels, components, flows, applications] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: runtime.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!),
      ]);

      const idsFor = (fromType: string) =>
        new Set(
          rels
            .filter((r) => r.type === "runs_on" && r.from_type === fromType)
            .map((r) => r.from_object_id)
        );
      const componentIds = idsFor("component");
      const flowIds = idsFor("integration_flow");
      const applicationIds = idsFor("application");

      return {
        components: components.items.filter((c) => componentIds.has(c.id)),
        flows: flows.items.filter((f) => flowIds.has(f.id)),
        applications: applications.items.filter((item) => applicationIds.has(item.id)),
      };
    },
    enabled: enabled && activeTab === "details",
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, runtime.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
  });

  const components = workloadsData?.components ?? [];
  const flows = workloadsData?.flows ?? [];
  const applications = workloadsData?.applications ?? [];

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
                    RUNTIME_ICON_STYLE
                  )}
                >
                  <Cpu size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{runtime.name}</h2>
                  <p className="text-sm text-gray-400">{formatRuntimeSubtitle(props)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <DetailObjectActions
                  onClose={onClose}
                  onEdit={() => setShowEditForm(true)}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  editLabel="Edit runtime"
                  deleteLabel="Delete runtime"
                />
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
              Updated{runtime.updated_by_name ? ` by ${runtime.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(runtime.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={runtime.id}
            objectName={runtime.name}
            objectKind="model"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={runtime.owner}
            onRefresh={refreshRuntime}
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
              {props.service_product && <DetailRow label="Service / product" value={props.service_product} />}
              {runtime.description && <DetailRow label="Description" value={runtime.description} />}
              {runtime.tags.length > 0 && <DetailRow label="Tags" value={runtime.tags.join(", ")} />}
            </DetailSection>

            <DetailSection title="Record">
              <CatalogDetailFields
                owner={catalogOwnerLabel(runtime)}
                vendor={props.vendor?.trim() || "—"}
                annualCost={formatCatalogAnnualCost(props.annual_cost)}
                contractEnd={formatCatalogContractEnd(props.commitment_ends)}
                lifecycle={props.lifecycle ?? runtime.status}
                criticality={props.criticality}
              />
            </DetailSection>

            <DetailSection title="More details">
              {providerLabel && <DetailRow label="Provider" value={providerLabel} />}
              {props.hosting_model && (
                <DetailRow
                  label="Hosting model"
                  value={RUNTIME_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
                />
              )}
              {props.region && <DetailRow label="Location" value={props.region} />}
              {props.environments && props.environments.length > 0 && (
                <DetailRow label="Environments" value={props.environments.join(", ")} />
              )}
              {runtimeAccessMethod(props) && (
                <DetailRow label="Access method" value={runtimeAccessMethod(props)!} />
              )}
              {props.cost_model && (
                <DetailRow
                  label="Cost model"
                  value={RUNTIME_COST_MODEL_LABEL[props.cost_model] ?? props.cost_model}
                />
              )}
              {props.sla_target && (
                <DetailRow label="SLA target" value={PLATFORM_SLA_LABEL[props.sla_target] ?? props.sla_target} />
              )}
              {!providerLabel &&
                !props.hosting_model &&
                !props.region &&
                !(props.environments && props.environments.length > 0) &&
                !runtimeAccessMethod(props) &&
                !props.cost_model &&
                !props.sla_target && (
                  <p className="text-sm text-gray-400">No additional details yet.</p>
                )}
            </DetailSection>

            <DetailSection title="Applications">
              {applications.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No applications run on this server yet.</p>
              ) : (
                <ul className="px-6 pb-4 space-y-1.5">
                  {applications.map((app) => (
                    <li key={app.id} className="text-sm text-gray-700">
                      {app.name}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Components">
              {components.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">No components run on this runtime yet.</p>
              ) : (
                <ul className="px-6 pb-4 space-y-1.5">
                  {components.map((c) => (
                    <li key={c.id} className="text-sm text-gray-700">
                      {c.name}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>

            <DetailSection title="Integrations">
              {flows.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">
                  No integrations reference this runtime yet.
                </p>
              ) : (
                <ul className="px-6 pb-4 space-y-1.5">
                  {flows.map((f) => (
                    <li key={f.id} className="text-sm text-gray-700">
                      {f.name}
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete runtime"
          message={`Are you sure you want to delete "${runtime.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {canEdit && showEditForm && (
        <CreateRuntimePanel
          initialValues={runtime}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshRuntime();
          }}
        />
      )}
    </>
  );
}
