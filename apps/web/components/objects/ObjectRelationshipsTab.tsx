"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import { Link2, Plus, X } from "lucide-react";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import {
  describeRelationship,
  otherRelationshipObjectId,
  relationshipFitnessLabel,
} from "@/lib/relationship-display";
import { cn } from "@/lib/utils";

interface Props {
  objectId: string;
  relationships: Relationship[];
  onAdd: () => void;
  onRemove: (relationshipId: string) => void;
  isRemoving?: boolean;
}

export function ObjectRelationshipsTab({
  objectId,
  relationships,
  onAdd,
  onRemove,
  isRemoving,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relationships) {
      ids.add(otherRelationshipObjectId(rel, objectId));
    }
    return [...ids];
  }, [relationships, objectId]);

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
    const map = new Map<string, MinEAObject>();
    for (const query of nameQueries) {
      if (query.data) map.set(query.data.id, query.data);
    }
    return map;
  }, [nameQueries]);

  const namesLoading = nameQueries.some((q) => q.isLoading);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {relationships.length === 0
            ? "No connections yet."
            : `${relationships.length} connection${relationships.length === 1 ? "" : "s"}`}
        </p>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {relationships.length === 0 ? (
        <p className="text-sm text-gray-400">
          Link this object to platforms, capabilities, tech debt, and other architecture elements.
        </p>
      ) : (
        <div className="space-y-2">
          {relationships.map((rel) => {
            const otherId = otherRelationshipObjectId(rel, objectId);
            const other = nameById.get(otherId);
            const otherName = other?.name ?? (namesLoading ? "Loading…" : "Unknown object");
            const { label, typeLabel } = describeRelationship(rel, objectId, otherName);
            const fitness = relationshipFitnessLabel(rel);

            return (
              <div
                key={rel.id}
                className="flex items-center justify-between gap-3 py-2.5 px-3 bg-stone-50 rounded-lg"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Link2 size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 leading-snug">
                      {label}
                      {fitness && (
                        <span className="text-gray-500 font-normal"> · {fitness}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{typeLabel}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(rel.id)}
                  disabled={isRemoving}
                  className={cn(
                    "text-gray-300 hover:text-red-400 transition-colors flex-shrink-0",
                    isRemoving && "opacity-50 cursor-not-allowed"
                  )}
                  aria-label="Remove relationship"
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
