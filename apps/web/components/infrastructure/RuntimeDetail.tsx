"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cpu, Edit2, Trash2 } from "lucide-react";
import type { MinEAObject, ModelProperties } from "@minea/types";
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
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import { CreateRuntimePanel } from "@/components/infrastructure/CreateRuntimePanel";
import {
  formatRuntimeSubtitle,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA_LABEL,
  RUNTIME_COST_MODEL_LABEL,
  RUNTIME_HOSTING_LABEL,
  RUNTIME_ICON_STYLE,
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

  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
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
      const [rels, components, flows] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: runtime.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "integration_flow" }, token!),
      ]);

      const componentIds = new Set(
        rels
          .filter((r) => r.type === "runs_on" && r.from_type === "component")
          .map((r) => r.from_object_id)
      );
      const flowIds = new Set(
        rels
          .filter((r) => r.type === "runs_on" && r.from_type === "integration_flow")
          .map((r) => r.from_object_id)
      );

      return {
        components: components.items.filter((c) => componentIds.has(c.id)),
        flows: flows.items.filter((f) => flowIds.has(f.id)),
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
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit runtime"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete runtime"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>

            <div className="flex gap-6 px-6 mt-4">
              {(["details", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "pb-2 text-sm font-medium border-b-2 capitalize transition-colors",
                    activeTab === tab
                      ? "border-slate-600 text-slate-600"
                      : "border-transparent text-gray-400 hover:text-gray-600"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
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
        {activeTab === "history" ? (
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
              {providerLabel && <DetailRow label="Provider" value={providerLabel} />}
              {props.service_product && <DetailRow label="Service / product" value={props.service_product} />}
              {runtime.description && <DetailRow label="Description" value={runtime.description} />}
              {runtime.tags.length > 0 && <DetailRow label="Tags" value={runtime.tags.join(", ")} />}
            </DetailSection>

            <DetailSection title="Deployment">
              {props.hosting_model && (
                <DetailRow
                  label="Hosting model"
                  value={RUNTIME_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
                />
              )}
              {props.region && <DetailRow label="Region" value={props.region} />}
              {props.environments && props.environments.length > 0 && (
                <DetailRow label="Environments" value={props.environments.join(", ")} />
              )}
              {props.console_url && <DetailRow label="Console URL" value={props.console_url} />}
            </DetailSection>

            <DetailSection title="Contract">
              {props.cost_model && (
                <DetailRow
                  label="Cost model"
                  value={RUNTIME_COST_MODEL_LABEL[props.cost_model] ?? props.cost_model}
                />
              )}
              {props.commitment_ends && <DetailRow label="Commitment ends" value={props.commitment_ends} />}
              {props.annual_cost && <DetailRow label="Annual cost (est.)" value={props.annual_cost} />}
            </DetailSection>

            <DetailSection title="Governance">
              {runtime.owner && <DetailRow label="Owner" value={runtime.owner} />}
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

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete runtime"
          message={`Are you sure you want to delete "${runtime.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showEditForm && (
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
