"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Plus } from "lucide-react";
import type { CloudServiceProperties, MinEAObject } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  DetailPanel,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { DetailObjectActions } from "@/components/ui/DetailObjectActions";
import { usePermissions } from "@/lib/use-permissions";
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { ObjectDrawerTabs, type ObjectDrawerTabId } from "@/components/risk/ObjectDrawerTabs";
import { ObjectTechDebtTab } from "@/components/risk/ObjectTechDebtTab";
import { useObjectTechDebtSummary } from "@/lib/use-object-tech-debt";
import type { HistoryEntry } from "@/components/shared/EntityHistory";
import { PlatformLinkDialog } from "@/components/infrastructure/PlatformLinkDialog";
import { RecordFields, toFieldEdges } from "@/components/mvp/InfraEditors";
import { recordTypeOf } from "@/lib/fields/registry";
import { rowFromObject } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";
import {
  COMPONENT_PLATFORM_REL,
  isSystemObjectType,
  SYSTEM_PLATFORM_REL,
} from "@/lib/platform-relationship-utils";
import {
  formatPlatformSubtitle,
  PLATFORM_ICON_STYLE,
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
  const { canEdit, canDelete } = usePermissions();

  const [activeTab, setActiveTab] = useState<ObjectDrawerTabId>("details");
  const { data: techDebtSummary, isLoading: techDebtLoading } = useObjectTechDebtSummary(platform.id);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const catalog = useModelCatalog();
  const live = catalog.data?.objects.find((item) => item.id === platform.id) ?? platform;
  const recordType = recordTypeOf(live.type);

  const props = (live.properties ?? {}) as CloudServiceProperties;

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
      const [incoming, outgoing, apps, solutions, techCaps, components] = await Promise.all([
        relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: platform.id }, token!),
        relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: platform.id }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "solution" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "technical_capability" }, token!),
        objectsApi.list(orgSlug, workspaceSlug, { type: "component" }, token!),
      ]);
      const rels = [...incoming, ...outgoing.filter((rel) => !incoming.some((item) => item.id === rel.id))];
      const systemIds = new Set(
        rels
          .filter(
            (r) =>
              (r.type === SYSTEM_PLATFORM_REL || r.type === "runs_on") &&
              (isSystemObjectType(r.from_type) || r.from_type === "application")
          )
          .map((r) => r.from_object_id)
      );
      const componentIds = new Set(
        rels
          .filter((r) => r.type === COMPONENT_PLATFORM_REL && r.from_type === "component")
          .map((r) => r.from_object_id)
      );
      const allSystems = [...apps.items, ...solutions.items, ...techCaps.items];
      return {
        relationships: rels,
        systems: allSystems.filter((item) => systemIds.has(item.id)),
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
                  <h2 className="font-semibold text-gray-900 truncate">{live.name}</h2>
                  <p className="text-sm text-gray-400">{formatPlatformSubtitle(props)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <DetailObjectActions
                  onClose={onClose}
                  onDelete={() => setShowDeleteConfirm(true)}
                  deletePending={deleteMutation.isPending}
                  deleteLabel="Delete platform"
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
              Updated{platform.updated_by_name ? ` by ${platform.updated_by_name}` : ""}{" "}
              {formatUpdatedAgo(platform.updated_at)}
            </p>
          </div>
        }
      >
        {activeTab === "tech_debt" ? (
          <ObjectTechDebtTab
            objectId={platform.id}
            objectName={live.name}
            objectKind="cloud_service"
            summary={techDebtSummary}
            isLoading={techDebtLoading}
            defaultOwner={live.owner}
            onRefresh={refreshPlatform}
          />
        ) : activeTab === "history" ? (
          <EntityHistoryPanel
            entries={historyEntries}
            isLoading={historyQuery.isLoading}
            emptyMessage="No history recorded yet."
          />
        ) : (
          <>
            {recordType && (catalog.data?.relationships ?? linkedData?.relationships) && (
              <RecordFields
                type={recordType}
                object={live}
                edges={toFieldEdges(catalog.data?.relationships ?? linkedData?.relationships ?? [])}
                row={rowFromObject(live) ?? undefined}
              />
            )}

            <DetailSection
              title={`Built on this platform (${systems.length + components.length})`}
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => setShowLinkDialog(true)}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-800"
                  >
                    <Plus size={12} />
                    Link
                  </button>
                ) : undefined
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

      {canDelete && showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete platform"
          message={`Are you sure you want to delete "${platform.name}"? This cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          onCancel={() => setShowDeleteConfirm(false)}
          isPending={deleteMutation.isPending}
        />
      )}

      {canEdit && showLinkDialog && (
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
