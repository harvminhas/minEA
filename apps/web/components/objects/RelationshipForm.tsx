"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { ALLOWED_TRIPLES_FRONTEND } from "@/lib/allowed-triples";

interface Props {
  fromObject: MinEAObject;
  workspaceId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function RelationshipForm({ fromObject, workspaceId, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const [relType, setRelType] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<MinEAObject | null>(null);

  // Get allowed relationship types for this from_type
  const allowedTypes = [...new Set(
    ALLOWED_TRIPLES_FRONTEND
      .filter(([, from]) => from === fromObject.type)
      .map(([type]) => type)
  )];

  // Get allowed to_types for the selected rel type
  const allowedToTypes = relType
    ? ALLOWED_TRIPLES_FRONTEND
        .filter(([type, from]) => type === relType && from === fromObject.type)
        .map(([, , to]) => to)
    : [];

  const { data: candidates } = useQuery({
    queryKey: ["objects-candidates", workspaceId, allowedToTypes, targetSearch],
    enabled: allowedToTypes.length > 0,
    queryFn: async () => {
      const token = await getToken();
      // Fetch all candidates across allowed to_types
      const results = await Promise.all(
        allowedToTypes.map((type) =>
          objectsApi.list({ workspace_id: workspaceId, type, search: targetSearch || undefined }, token!)
        )
      );
      return results.flatMap((r) => r.items);
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedTarget || !relType) return;
      const token = await getToken();
      return relationshipsApi.create({
        workspace_id: workspaceId,
        type: relType as any,
        from_object_id: fromObject.id,
        from_type: fromObject.type,
        to_object_id: selectedTarget.id,
        to_type: selectedTarget.type,
      }, token!);
    },
    onSuccess,
  });

  const isValidTriple = selectedTarget
    ? ALLOWED_TRIPLES_FRONTEND.some(
        ([type, from, to]) => type === relType && from === fromObject.type && to === selectedTarget.type
      )
    : false;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-white rounded-xl shadow-2xl z-[70]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add Relationship</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* From object (read-only) */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-md text-sm text-gray-700">
              <span className="font-medium">{fromObject.name}</span>
              <span className="text-gray-400">({OBJECT_TYPE_LABELS[fromObject.type]})</span>
            </div>
          </div>

          {/* Relationship type */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Relationship type *</label>
            {allowedTypes.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No relationships allowed from this object type.</p>
            ) : (
              <select
                value={relType}
                onChange={(e) => { setRelType(e.target.value); setSelectedTarget(null); }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select relationship type...</option>
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          </div>

          {/* Target object search */}
          {relType && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                To (allowed types: {allowedToTypes.join(", ")}) *
              </label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={targetSearch}
                  onChange={(e) => { setTargetSearch(e.target.value); setSelectedTarget(null); }}
                  placeholder="Search objects..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-50">
                {(candidates ?? []).map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() => setSelectedTarget(obj)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                      selectedTarget?.id === obj.id ? "bg-indigo-50 text-indigo-700" : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">{obj.name}</span>
                    <span className="text-xs text-gray-400 ml-2">({OBJECT_TYPE_LABELS[obj.type]})</span>
                  </button>
                ))}
                {(candidates ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">No matching objects found.</p>
                )}
              </div>
            </div>
          )}

          {/* Validation warning */}
          {selectedTarget && !isValidTriple && (
            <p className="text-xs text-red-500">
              This combination is not allowed by the relationship rules.
            </p>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!selectedTarget || !relType || !isValidTriple || mutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            {mutation.isPending ? "Adding..." : "Add relationship"}
          </button>
        </div>
      </div>
    </>
  );
}
