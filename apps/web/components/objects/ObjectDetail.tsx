"use client";

import { useState } from "react";
import { OwnershipDetailRow } from "@/components/ownership/OwnershipDetailRow";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Edit2 } from "lucide-react";
import { ObjectRelationshipsTab } from "@/components/objects/ObjectRelationshipsTab";
import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { buildDetailPropertyRows } from "@/lib/object-property-display";
import { getStatusColor, getStatusLabel, getObjectInitial } from "@/lib/utils";
import { isSystemObject } from "@/lib/system-utils";
import { usePermissions } from "@/lib/use-permissions";
import { SystemObjectDetail } from "@/components/objects/SystemObjectDetail";
import { DataDomainObjectDetail } from "@/components/objects/DataDomainObjectDetail";
import { DataObjectDetail } from "@/components/data/DataObjectDetail";
import { RelationshipForm } from "./RelationshipForm";
import { ObjectForm } from "./ObjectForm";

interface Props {
  object: MinEAObject;
  layerColor: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ObjectDetail({ object, layerColor, onClose, onUpdate }: Props) {
  if (isSystemObject(object)) {
    return (
      <SystemObjectDetail
        objectId={object.id}
        accentColor={layerColor}
        onClose={onClose}
        onUpdate={onUpdate}
      />
    );
  }

  if (object.type === "data_domain") {
    return (
      <DataDomainObjectDetail
        object={object}
        layerColor={layerColor}
        onClose={onClose}
        onUpdate={onUpdate}
      />
    );
  }

  if (object.type === "data_object") {
    return (
      <DataObjectDetail
        entityId={object.id}
        onClose={onClose}
        onUpdate={onUpdate}
      />
    );
  }

  return (
    <LegacyObjectDetail object={object} onClose={onClose} onUpdate={onUpdate} />
  );
}

function LegacyObjectDetail({
  object,
  onClose,
  onUpdate,
}: {
  object: MinEAObject;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { orgSlug, workspaceSlug } = useTenancy();
  const { canEdit } = usePermissions();
  const [showRelForm, setShowRelForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const props = object.properties as Record<string, unknown>;

  const { data: outRels } = useQuery({
    queryKey: ["relationships", "from", object.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { from_object_id: object.id }, token!);
    },
  });

  const { data: inRels } = useQuery({
    queryKey: ["relationships", "to", object.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: object.id }, token!);
    },
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(orgSlug, workspaceSlug, id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
  });

  const allRels = [...(outRels ?? []), ...(inRels ?? [])];
  const detailPropertyRows = buildDetailPropertyRows(props, object.type);

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-[80]" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-[90] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              {getObjectInitial(object.name)}
            </div>
            <div>
              <h2 className="font-semibold text-gray-900">{object.name}</h2>
              <p className="text-sm text-gray-400">{OBJECT_TYPE_LABELS[object.type] ?? object.type}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {object.status && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(object.status)}`}>
                {getStatusLabel(object.status)}
              </span>
            )}
            {canEdit && (
              <button
                onClick={() => setShowEditForm(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
              >
                <Edit2 size={14} />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Description */}
          {object.description && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Description</h3>
              <p className="text-sm text-gray-700">{object.description}</p>
            </div>
          )}

          {/* Core properties */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Properties</h3>
            <div className="space-y-2 text-sm">
              <OwnershipDetailRow entity={object} />
              {object.tags.length > 0 && (
                <DetailRow
                  label="Tags"
                  value={
                    <div className="flex flex-wrap gap-1">
                      {object.tags.map((t) => (
                        <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{t}</span>
                      ))}
                    </div>
                  }
                />
              )}
              {object.source && <DetailRow label="Source" value={object.source} />}
              {object.confidence !== null && object.confidence !== undefined && (
                <DetailRow label="Confidence" value={`${Math.round(object.confidence * 100)}%`} />
              )}
            </div>
          </div>

          {/* Type-specific properties */}
          {detailPropertyRows.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {OBJECT_TYPE_LABELS[object.type]} Details
              </h3>
              <div className="space-y-2 text-sm">
                {detailPropertyRows.map((row) => (
                  <DetailRow key={row.key} label={row.label} value={row.value} />
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Relationships
            </h3>
            <ObjectRelationshipsTab
              objectId={object.id}
              objectName={object.name}
              objectType={object.type}
              relationships={allRels}
              onAdd={canEdit ? () => setShowRelForm(true) : undefined}
              onRemove={canEdit ? (id) => deleteRelMutation.mutate(id) : undefined}
              isRemoving={deleteRelMutation.isPending}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-3">
          <p className="text-xs text-gray-400">
            Updated {new Date(object.updated_at).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Relationship form */}
      {showRelForm && (
        <RelationshipForm
          fromObject={object}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            queryClient.invalidateQueries({ queryKey: ["relationships"] });
          }}
        />
      )}

      {showEditForm && (
        <ObjectForm
          objectType={object.type}
          initialValues={object}
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

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}
