"use client";

import { useMemo } from "react";
import { Link2 } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import { OBJECT_TYPE_LABELS, type MinEAObject, type Relationship } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  formatRelationshipTriple,
  otherRelationshipObjectId,
} from "@/lib/relationship-display";
import { getObjectInitial } from "@/lib/utils";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  accentColor: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function DeleteSystemConfirmDialog({
  system,
  relationships,
  accentColor,
  onConfirm,
  onCancel,
  isPending = false,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relationships) {
      ids.add(otherRelationshipObjectId(rel, system.id));
    }
    return [...ids];
  }, [relationships, system.id]);

  const nameQueries = useQueries({
    queries: relatedIds.map((id) => ({
      queryKey: ["object", orgSlug, workspaceSlug, id],
      queryFn: async () => {
        const token = await getToken();
        return objectsApi.get(orgSlug, workspaceSlug, id, token!);
      },
    })),
  });

  const nameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries]);

  const namesLoading = nameQueries.some((q) => q.isLoading);
  const layerLabel = OBJECT_TYPE_LABELS[system.type] ?? system.type;

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={isPending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-labelledby="delete-system-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <h3 id="delete-system-title" className="font-semibold text-gray-900">
          Delete system?
        </h3>
        <p className="text-sm text-gray-500 mt-1">
          The following will be permanently removed from this workspace. This cannot be undone.
        </p>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">Object</p>
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className="h-8 w-8 rounded-md flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                {getObjectInitial(system.name)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{system.name}</p>
                <p className="text-xs text-gray-500">{layerLabel}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
              Connections ({relationships.length})
            </p>
            {relationships.length === 0 ? (
              <p className="text-sm text-gray-400">No connections linked to this system.</p>
            ) : (
              <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {relationships.map((rel) => {
                  const otherId = otherRelationshipObjectId(rel, system.id);
                  const otherName =
                    nameById[otherId] ?? (namesLoading ? "Loading…" : "Unknown object");
                  const { nameLine, typeLine } = formatRelationshipTriple(
                    rel,
                    system.id,
                    system.name,
                    otherName
                  );

                  return (
                    <li
                      key={rel.id}
                      className="flex items-start gap-2 py-2 px-2.5 bg-white rounded-md border border-gray-100"
                    >
                      <Link2 size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm text-gray-800 leading-snug">{nameLine}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{typeLine}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {relationships.length > 0 && (
              <p className="text-xs text-gray-400 mt-2">
                Linked objects will remain; only these connections are removed.
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending || namesLoading}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
          >
            {isPending ? "Deleting…" : "Delete system"}
          </button>
        </div>
      </div>
    </>
  );
}
