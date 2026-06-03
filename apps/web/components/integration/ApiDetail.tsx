"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Braces, Edit2, Trash2 } from "lucide-react";
import type { ApiProperties, MinEAObject, ObjectListResponse } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreateApiPanel } from "@/components/integration/CreateApiPanel";
import { ApiDiagramModal, type NodeLayout } from "@/components/integration/ApiDiagram";
import { ApiDiagramPreview } from "@/components/integration/ApiDiagramPreview";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import {
  API_AUDIENCES,
  API_AUTH_LABEL,
  API_CRITICALITY,
  API_STYLE_LABEL,
  formatApiSubtitle,
  formatProviderLabel,
} from "@/lib/api-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

const AUDIENCE_LABEL = Object.fromEntries(API_AUDIENCES.map((a) => [a.value, a.label]));
const CRITICALITY_LABEL = Object.fromEntries(API_CRITICALITY.map((c) => [c.value, c.label]));

interface Props {
  api: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function ApiDetail({ api, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const props = (api.properties ?? {}) as ApiProperties;
  const styleLabel = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol;
  const consumers = props.consumers ?? [];

  const apisQueryKey = ["objects", orgSlug, workspaceSlug, "api"] as const;
  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, api.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, api.id, token!);
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

  const refreshApi = () => {
    queryClient.invalidateQueries({ queryKey: apisQueryKey });
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, api.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const cached = queryClient.getQueryData<ObjectListResponse>(apisQueryKey);
      const current = cached?.items.find((o) => o.id === api.id) ?? api;
      const currentProps = (current.properties ?? {}) as ApiProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        api.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      queryClient.setQueryData<ObjectListResponse>(apisQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) =>
            o.id === api.id
              ? { ...o, properties: { ...currentProps, node_layout: layout } }
              : o
          ),
        };
      });
    },
    [getToken, orgSlug, workspaceSlug, api, queryClient, apisQueryKey]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex flex-col border-b border-gray-100">
            <div className="flex items-start justify-between p-6 pb-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-teal-50 text-teal-700">
                  <Braces size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{api.name}</h2>
                  <p className="text-sm text-gray-400">{formatApiSubtitle(props.protocol)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {api.status && (
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                      getStatusColor(api.status)
                    )}
                  >
                    {getStatusLabel(api.status)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit API"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete API"
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
                      ? "border-teal-600 text-teal-600"
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
              Updated{api.updated_by_name ? ` by ${api.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(api.updated_at)}
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
            {api.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700">{api.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Architecture">
              <ApiDiagramPreview api={api} onExpand={() => setShowChart(true)} />
              <p className="text-xs text-gray-400 mt-2">
                {props.provider ? formatProviderLabel(props.provider) : "No provider"}
                {consumers.length > 0 && ` · ${consumers.length} consumer${consumers.length !== 1 ? "s" : ""}`}
                {styleLabel && ` · ${styleLabel}`}
              </p>
            </DetailSection>

            <DetailSection title="Provider & consumers">
              <div className="space-y-2 text-sm">
                {props.provider && (
                  <DetailRow label="Provider" value={formatProviderLabel(props.provider)} />
                )}
                {consumers.length > 0 ? (
                  <div>
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
                      Consumers
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {consumers.map((c) => (
                        <span
                          key={c.consumer_id ?? c.consumer_name}
                          className={cn(
                            "text-xs px-2 py-0.5 rounded-full border",
                            c.consumer_kind === "custom"
                              ? "bg-amber-50 text-amber-800 border-amber-200"
                              : "bg-teal-50 text-teal-700 border-teal-100"
                          )}
                        >
                          {c.consumer_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-400 italic">No consumers — public or unknown callers</p>
                )}
              </div>
            </DetailSection>

            <DetailSection title="Contract">
              <div className="space-y-2 text-sm">
                {styleLabel && (
                  <DetailRow
                    label="Style"
                    value={[styleLabel, props.version].filter(Boolean).join(" ")}
                  />
                )}
                {props.base_url && <DetailRow label="Base URL" value={props.base_url} />}
                {props.auth && (
                  <DetailRow label="Auth" value={API_AUTH_LABEL[props.auth] ?? props.auth} />
                )}
              </div>
            </DetailSection>

            <DetailSection title="Governance">
              <div className="space-y-2 text-sm">
                {api.owner && <DetailRow label="Owner" value={api.owner} />}
                {props.audience && (
                  <DetailRow label="Audience" value={AUDIENCE_LABEL[props.audience] ?? props.audience} />
                )}
                {props.criticality && (
                  <DetailRow
                    label="Criticality"
                    value={CRITICALITY_LABEL[props.criticality] ?? props.criticality}
                  />
                )}
                {props.gateway && <DetailRow label="Gateway" value={props.gateway.gateway_name} />}
                {api.tags.length > 0 && <DetailRow label="Tags" value={api.tags.join(", ")} />}
              </div>
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete API"
          message={`Are you sure you want to delete "${api.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showChart && (
        <ApiDiagramModal
          api={api}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
        />
      )}

      {showEditForm && (
        <CreateApiPanel
          initialValues={api}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshApi();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
