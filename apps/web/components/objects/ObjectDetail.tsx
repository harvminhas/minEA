"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Trash2, Edit2, Link2, Plus } from "lucide-react";
import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { getStatusColor, getStatusLabel, getObjectInitial, formatCurrency } from "@/lib/utils";
import { RelationshipForm } from "./RelationshipForm";
import { ObjectForm } from "./ObjectForm";

interface Props {
  object: MinEAObject;
  onClose: () => void;
  onDelete: () => void;
  onUpdate: () => void;
}

export function ObjectDetail({ object, onClose, onDelete, onUpdate }: Props) {
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const { activeWorkspace } = useAppStore();
  const [showRelForm, setShowRelForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);

  const props = object.properties as Record<string, unknown>;

  const { data: outRels } = useQuery({
    queryKey: ["relationships", "from", object.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list({ workspace_id: activeWorkspace!.id, from_object_id: object.id }, token!);
    },
  });

  const { data: inRels } = useQuery({
    queryKey: ["relationships", "to", object.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list({ workspace_id: activeWorkspace!.id, to_object_id: object.id }, token!);
    },
  });

  const deleteRelMutation = useMutation({
    mutationFn: async (id: string) => {
      const token = await getToken();
      return relationshipsApi.delete(id, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
    },
  });

  const allRels = [...(outRels ?? []), ...(inRels ?? [])];

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Slide-over panel */}
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-50 flex flex-col overflow-hidden">
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
            <button
              onClick={() => setShowEditForm(true)}
              className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={onDelete}
              className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={14} />
            </button>
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
              {object.owner && <DetailRow label="Owner" value={object.owner} />}
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
          {Object.keys(props).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                {OBJECT_TYPE_LABELS[object.type]} Details
              </h3>
              <div className="space-y-2 text-sm">
                {Object.entries(props).map(([k, v]) => {
                  if (v === null || v === undefined || v === "") return null;
                  const label = k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
                  const displayValue = k === "annual_cost" ? formatCurrency(Number(v)) : String(v);
                  return <DetailRow key={k} label={label} value={displayValue} />;
                })}
              </div>
            </div>
          )}

          {/* Relationships */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Relationships ({allRels.length})
              </h3>
              <button
                onClick={() => setShowRelForm(true)}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:underline"
              >
                <Plus size={12} /> Add
              </button>
            </div>
            {allRels.length === 0 ? (
              <p className="text-sm text-gray-400">No relationships yet.</p>
            ) : (
              <div className="space-y-2">
                {allRels.map((rel) => (
                  <div key={rel.id} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md">
                    <div className="flex items-center gap-2 text-xs">
                      <Link2 size={11} className="text-gray-400" />
                      <span className="font-medium text-gray-600">{rel.type}</span>
                      <span className="text-gray-400">→</span>
                      <span className="text-gray-700">{rel.to_type}</span>
                    </div>
                    <button
                      onClick={() => deleteRelMutation.mutate(rel.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
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
      {showRelForm && activeWorkspace && (
        <RelationshipForm
          fromObject={object}
          workspaceId={activeWorkspace.id}
          onClose={() => setShowRelForm(false)}
          onSuccess={() => {
            setShowRelForm(false);
            queryClient.invalidateQueries({ queryKey: ["relationships"] });
          }}
        />
      )}

      {/* Edit form */}
      {showEditForm && activeWorkspace && (
        <ObjectForm
          objectType={object.type}
          workspaceId={activeWorkspace.id}
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
