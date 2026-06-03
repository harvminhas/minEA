"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Layers, Plus, Trash2 } from "lucide-react";
import type { CloudServiceProperties, MinEAObject } from "@minea/types";
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
import { CreatePlatformPanel } from "@/components/infrastructure/CreatePlatformPanel";
import { PlatformLinkDialog } from "@/components/infrastructure/PlatformLinkDialog";
import { COMPONENT_PLATFORM_REL, SYSTEM_PLATFORM_REL } from "@/lib/platform-relationship-utils";
import {
  formatPlatformSubtitle,
  PLATFORM_CRITICALITY_LABEL,
  PLATFORM_HOSTING_LABEL,
  PLATFORM_ICON_STYLE,
  PLATFORM_LICENSE_LABEL,
  PLATFORM_LIFECYCLE_LABEL,
  PLATFORM_SLA_LABEL,
  PLATFORM_VENDOR_LABEL,
  platformTypeLabel,
} from "@/lib/platform-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

interface Props {
  platform: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function PlatformDetail({ platform, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [activeTab, setActiveTab] = useState<"details" | "history">("details");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const props = (platform.properties ?? {}) as CloudServiceProperties;
  const typeLabel = platformTypeLabel(props);
  const vendorLabel = PLATFORM_VENDOR_LABEL[props.vendor ?? ""] ?? props.vendor;

  const historyQueryKey = ["object-history", orgSlug, workspaceSlug, platform.id] as const;

  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.history(orgSlug, workspaceSlug, platform.id, token!);
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

  const refreshPlatform = () => {
    queryClient.invalidateQueries({ queryKey: historyQueryKey });
    onUpdate();
  };

  const { data: linkedData, refetch: refetchLinked } = useQuery({
    queryKey: ["platform-linked", orgSlug, workspaceSlug, platform.id],
    queryFn: async () => {
      const token = await getToken();
      const [rels, apps, components] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: platform.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!),
      ]);
      const systemIds = new Set(
        rels
          .filter((r) => r.type === SYSTEM_PLATFORM_REL && r.from_type === "application")
          .map((r) => r.from_object_id)
      );
      const componentIds = new Set(
        rels
          .filter((r) => r.type === COMPONENT_PLATFORM_REL && r.from_type === "component")
          .map((r) => r.from_object_id)
      );
      return {
        systems: apps.items.filter((item) => systemIds.has(item.id)),
        components: components.items.filter((item) => componentIds.has(item.id)),
      };
    },
    enabled: enabled && activeTab === "details",
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, platform.id, token!);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onDelete();
    },
  });

  const systems = linkedData?.systems ?? [];
  const components = linkedData?.components ?? [];

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
                    PLATFORM_ICON_STYLE
                  )}
                >
                  <Layers size={16} strokeWidth={2.25} />
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{platform.name}</h2>
                  <p className="text-sm text-gray-400">{formatPlatformSubtitle(props)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit platform"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete platform"
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
              Updated{platform.updated_by_name ? ` by ${platform.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(platform.updated_at)}
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
            <DetailSection title="Identity">
              {typeLabel && <DetailRow label="Type" value={typeLabel} />}
              {vendorLabel && <DetailRow label="Vendor" value={vendorLabel} />}
              {props.vendor_product && <DetailRow label="Vendor product" value={props.vendor_product} />}
              {platform.description && <DetailRow label="Description" value={platform.description} />}
              {platform.tags.length > 0 && <DetailRow label="Tags" value={platform.tags.join(", ")} />}
            </DetailSection>

            <DetailSection title="Hosting">
              {props.hosting_model && (
                <DetailRow
                  label="Hosting model"
                  value={PLATFORM_HOSTING_LABEL[props.hosting_model] ?? props.hosting_model}
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
                  value={PLATFORM_LICENSE_LABEL[props.license_model] ?? props.license_model}
                />
              )}
              {props.contract_renewal && <DetailRow label="Contract renewal" value={props.contract_renewal} />}
              {props.annual_cost && <DetailRow label="Annual cost" value={props.annual_cost} />}
            </DetailSection>

            <DetailSection title="Governance">
              {platform.owner && <DetailRow label="Owner" value={platform.owner} />}
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

            <DetailSection
              title={`Built on this platform (${systems.length + components.length})`}
              action={
                <button
                  type="button"
                  onClick={() => setShowLinkDialog(true)}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
                >
                  <Plus size={12} />
                  Link
                </button>
              }
            >
              {systems.length === 0 && components.length === 0 ? (
                <p className="text-sm text-gray-400 px-6 pb-4">
                  No systems or components linked yet. Link from here or pick a platform when editing a system or component.
                </p>
              ) : (
                <div className="px-6 pb-4 space-y-3">
                  {systems.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                        Systems
                      </p>
                      <ul className="space-y-1.5">
                        {systems.map((system) => (
                          <li key={system.id} className="text-sm text-gray-700">
                            {system.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {components.length > 0 && (
                    <div>
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
                        Components
                      </p>
                      <ul className="space-y-1.5">
                        {components.map((component) => (
                          <li key={component.id} className="text-sm text-gray-700">
                            {component.name}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete platform"
          message={`Are you sure you want to delete "${platform.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {showEditForm && (
        <CreatePlatformPanel
          initialValues={platform}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshPlatform();
          }}
        />
      )}

      {showLinkDialog && (
        <PlatformLinkDialog
          platform={platform}
          onClose={() => setShowLinkDialog(false)}
          onLinked={() => {
            void refetchLinked();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
