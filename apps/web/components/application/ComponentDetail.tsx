"use client";

import { useCallback, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Box, Edit2, Trash2 } from "lucide-react";
import type { ComponentProperties, MinEAObject, ObjectListResponse } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { CreateComponentPanel } from "@/components/application/CreateComponentPanel";
import { ComponentDiagramModal, type NodeLayout } from "@/components/application/ComponentDiagram";
import { ComponentDiagramPreview } from "@/components/application/ComponentDiagramPreview";
import {
  APPLICATION_LAYER_COLOR,
  COMPONENT_TYPE_LABEL,
} from "@/lib/component-utils";
import { cn, getStatusColor, getStatusLabel } from "@/lib/utils";

interface Props {
  component: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function ComponentDetail({ component, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showChart, setShowChart] = useState(false);

  const props = (component.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];
  const typeLabel = COMPONENT_TYPE_LABEL[props.component_type ?? ""] ?? props.component_type;

  const componentsQueryKey = ["objects", orgSlug, workspaceSlug, "component"] as const;

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, component.id, token!);
    },
    onSuccess: onDelete,
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      const cached = queryClient.getQueryData<ObjectListResponse>(componentsQueryKey);
      const current = cached?.items.find((o) => o.id === component.id) ?? component;
      const currentProps = (current.properties ?? {}) as ComponentProperties;

      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        component.id,
        {
          properties: { ...currentProps, node_layout: layout } as Record<string, unknown>,
        },
        token
      );

      queryClient.setQueryData<ObjectListResponse>(componentsQueryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((o) =>
            o.id === component.id
              ? { ...o, properties: { ...currentProps, node_layout: layout } }
              : o
          ),
        };
      });
    },
    [getToken, orgSlug, workspaceSlug, component, queryClient, componentsQueryKey]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white flex-shrink-0"
                style={{ backgroundColor: APPLICATION_LAYER_COLOR }}
              >
                <Box size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{component.name}</h2>
                <p className="text-sm text-gray-400">Component</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {component.status && (
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                    getStatusColor(component.status)
                  )}
                >
                  {getStatusLabel(component.status)}
                </span>
              )}
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Edit component"
              >
                <Edit2 size={14} />
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Delete component"
              >
                <Trash2 size={14} />
              </button>
              <DetailPanelCloseButton onClose={onClose} />
            </div>
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated {new Date(component.updated_at).toLocaleDateString()}
            </p>
          </div>
        }
      >
        <DetailSection title="Properties">
          <div className="space-y-2 text-sm">
            {typeLabel && <DetailRow label="Type" value={typeLabel} />}
            {props.tech_stack && <DetailRow label="Tech stack" value={props.tech_stack} />}
            {component.owner && <DetailRow label="Owner" value={component.owner} />}
            {props.runtime && (
              <DetailRow label="Runs on" value={props.runtime.runtime_name} />
            )}
            {component.tags.length > 0 && (
              <DetailRow label="Tags" value={component.tags.join(", ")} />
            )}
          </div>
        </DetailSection>

        <DetailSection title="Architecture">
          <ComponentDiagramPreview component={component} onExpand={() => setShowChart(true)} />
          <p className="text-xs text-gray-400 mt-2">
            {systems.length} system{systems.length !== 1 ? "s" : ""}
            {props.runtime ? ` · ${props.runtime.runtime_name}` : ""}
            {typeLabel ? ` · ${typeLabel}` : ""}
          </p>
        </DetailSection>

        {systems.length > 0 && (
          <DetailSection title="Systems">
            <div className="flex flex-wrap gap-1.5">
              {systems.map((s) => (
                <span
                  key={s.system_id}
                  className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
                >
                  {s.system_name}
                </span>
              ))}
            </div>
          </DetailSection>
        )}
      </DetailPanel>

      {showChart && (
        <ComponentDiagramModal
          component={component}
          onClose={() => setShowChart(false)}
          onLayoutSave={handleLayoutSave}
          onResetLayout={handleResetLayout}
        />
      )}

      {showEditForm && (
        <CreateComponentPanel
          initialValues={component}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
