"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Link2, Plus, Trash2, X } from "lucide-react";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { formatCurrency, getObjectInitial } from "@/lib/utils";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectForm } from "@/components/objects/ObjectForm";
import { RelationshipForm } from "@/components/objects/RelationshipForm";
import { systemStatusLabel, SYSTEM_STATUS_STYLE } from "@/lib/system-utils";
import { invalidateWorkspaceSummary } from "@/lib/workspace-summary-cache";
import { cn } from "@/lib/utils";
import { type ApplicationProperties, OBJECT_TYPE_LABELS } from "@minea/types";

interface Props {
  objectId: string;
  accentColor: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function SystemObjectDetail({ objectId, accentColor, onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRelForm, setShowRelForm] = useState(false);

  const { data: object, isLoading, refetch } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, objectId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, objectId, token!);
    },
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["object-history", orgSlug, workspaceSlug, objectId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, objectId, token!);
    },
    enabled: activeTab === "history",
  });

  const { data: outRels } = useQuery({
    queryKey: ["relationships", "from", objectId],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: objectId }, token!);
    },
  });

  const { data: inRels } = useQuery({
    queryKey: ["relationships", "to", objectId],
    enabled: !!object,
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: objectId }, token!);
    },
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      refetch();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return objectsApi.delete(orgSlug, workspaceSlug, objectId, token);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug] });
      void invalidateWorkspaceSummary(queryClient, orgSlug, workspaceSlug);
      onUpdate();
      onClose();
    },
  });

  const refreshObject = () => {
    refetch();
    void queryClient.invalidateQueries({
      queryKey: ["object-history", orgSlug, workspaceSlug, objectId],
    });
    onUpdate();
  };

  const allRels = [...(outRels ?? []), ...(inRels ?? [])];

  const supportedCapabilityIds = (inRels ?? [])
    .filter(
      (r) =>
        r.type === "supported_by" &&
        r.from_type === "capability" &&
        r.to_type === "application"
    )
    .map((r) => r.from_object_id);

  const { data: capabilitiesData } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability", supportedCapabilityIds.join(",")],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
    enabled: !!object && supportedCapabilityIds.length > 0,
  });

  const linkedCapabilities =
    capabilitiesData?.items.filter((c) => supportedCapabilityIds.includes(c.id)) ?? [];

  if (isLoading || !object) {
    return (
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="h-10 w-24 bg-gray-100 rounded animate-pulse" />
            <DetailPanelCloseButton onClose={onClose} />
          </div>
        }
      >
        <p className="text-sm text-gray-400">Loading…</p>
      </DetailPanel>
    );
  }

  const props = object.properties as Record<string, unknown>;
  const appProps = object.properties as ApplicationProperties;
  const platformName = appProps.platform?.platform_name;
  const status = object.status ?? "planned";
  const layerLabel = OBJECT_TYPE_LABELS[object.type] ?? object.type;

  const platformFromRel = (outRels ?? []).find(
    (r) => r.type === "runs_on" && r.from_type === "application" && r.to_type === "cloud_service"
  );

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {getObjectInitial(object.name)}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{object.name}</h2>
                  <p className="text-sm text-gray-400">
                    {layerLabel} · {object.owner ?? "Unassigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit system"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete system"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>
            <div className="flex px-6 gap-4">
              {(["details", "history"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "pb-2.5 text-sm font-medium border-b-2 transition-colors capitalize",
                    activeTab === tab
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        }
      >
        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
        )}

        {activeTab === "details" && (
          <>
            {object.description && (
              <DetailSection title="Description">
                <p className="text-sm text-gray-700 px-6 pb-4">{object.description}</p>
              </DetailSection>
            )}

            <DetailSection title="Properties">
              <div className="px-6 pb-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Owner</span>
                  <span className="text-gray-900 font-medium">{object.owner ?? "Unassigned"}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Status</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
                      SYSTEM_STATUS_STYLE[status] ?? SYSTEM_STATUS_STYLE.planned
                    )}
                  >
                    {systemStatusLabel(status)}
                  </span>
                </div>
                {(platformName || platformFromRel) && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Built on platform</span>
                    <span className="text-gray-900 font-medium">
                      {platformName || "Linked platform"}
                    </span>
                  </div>
                )}
                {props.vendor != null && props.vendor !== "" && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Vendor</span>
                    <span className="text-gray-900">{String(props.vendor)}</span>
                  </div>
                )}
                {props.annual_cost !== undefined && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-gray-500">Annual cost</span>
                    <span className="text-gray-900">{formatCurrency(Number(props.annual_cost))}</span>
                  </div>
                )}
              </div>
            </DetailSection>

            <DetailSection title={`Capabilities (${linkedCapabilities.length})`}>
              <div className="px-6 pb-4">
                {linkedCapabilities.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No capabilities linked. Edit this system to select capabilities it supports.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {linkedCapabilities.map((cap) => (
                      <span
                        key={cap.id}
                        className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
                      >
                        {cap.name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </DetailSection>

            {Object.keys(props).length > 0 && (
              <DetailSection title={`${layerLabel} details`}>
                <div className="px-6 pb-4 space-y-2 text-sm">
                  {Object.entries(props).map(([k, v]) => {
                    if (v === null || v === undefined || v === "" || k === "vendor" || k === "annual_cost") {
                      return null;
                    }
                    const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={k} className="flex items-center justify-between gap-3">
                        <span className="text-gray-500">{label}</span>
                        <span className="text-gray-900 font-medium">{String(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </DetailSection>
            )}

            <DetailSection
              title={`Relationships (${allRels.length})`}
              action={
                <button
                  type="button"
                  onClick={() => setShowRelForm(true)}
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
                >
                  + Add
                </button>
              }
            >
              <div className="px-6 pb-4">
                {allRels.length === 0 ? (
                  <p className="text-sm text-gray-400">No relationships yet.</p>
                ) : (
                  <div className="space-y-2">
                    {allRels.map((rel) => (
                      <div
                        key={rel.id}
                        className="flex items-center justify-between py-2 px-3 bg-stone-50 rounded-md"
                      >
                        <div className="flex items-center gap-2 text-xs min-w-0">
                          <Link2 size={11} className="text-gray-400 flex-shrink-0" />
                          <span className="font-medium text-gray-600">{rel.type}</span>
                          <span className="text-gray-400">→</span>
                          <span className="text-gray-700 truncate">{rel.to_type}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteRelMutation.mutate(rel.id)}
                          className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                          aria-label="Remove relationship"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete system?"
          message={
            <>
              <span className="font-medium text-gray-700">{object.name}</span> will be permanently
              removed from this workspace, including its relationships and history.
            </>
          }
          confirmLabel="Delete system"
          isPending={deleteMutation.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}

      {showEditForm && (
        <ObjectForm
          objectType={object.type}
          initialValues={object}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshObject();
          }}
        />
      )}

      {showRelForm && (
        <RelationshipForm
          fromObject={object}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            queryClient.invalidateQueries({ queryKey: ["relationships"] });
            refreshObject();
          }}
        />
      )}
    </>
  );
}
