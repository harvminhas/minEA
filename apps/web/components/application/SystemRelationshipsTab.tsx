"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { otherRelationshipObjectId } from "@/lib/relationship-display";
import {
  extractSystemDiagramLinks,
  systemRelationshipSummary,
} from "@/lib/system-relationship-utils";
import { SystemDiagramPreview } from "@/components/application/SystemDiagramPreview";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { ObjectRelationshipsTab } from "@/components/objects/ObjectRelationshipsTab";

interface Props {
  system: MinEAObject;
  relationships: Relationship[];
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
  onAdd?: () => void;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
}

export function SystemRelationshipsTab({
  system,
  relationships,
  diagramRefreshing = false,
  onExpandDiagram,
  onAdd,
  onRemove,
  isRemoving,
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
    const map: Record<string, string> = { [system.id]: system.name };
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries, system.id, system.name]);

  const diagramLinks = useMemo(
    () => extractSystemDiagramLinks(system.id, relationships, nameById),
    [system.id, relationships, nameById]
  );

  const chips = useMemo(() => {
    const seen = new Set<string>();
    return diagramLinks
      .filter((link) => {
        if (seen.has(link.objectId)) return false;
        seen.add(link.objectId);
        return true;
      })
      .slice(0, 8)
      .map((link) => ({
        key: link.objectId,
        label: link.name,
        className: "text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full",
      }));
  }, [diagramLinks]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Relationship map
        </h3>
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <SystemDiagramPreview
            system={system}
            relationships={relationships}
            nameById={nameById}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {systemRelationshipSummary(system, diagramLinks)}
        </p>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {chips.map((chip) => (
              <span key={chip.key} className={chip.className}>
                {chip.label}
              </span>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Connections
        </h3>
        <ObjectRelationshipsTab
          objectId={system.id}
          objectName={system.name}
          objectType={system.type}
          relationships={relationships}
          onAdd={onAdd}
          onRemove={onRemove}
          isRemoving={isRemoving}
        />
        <p className="text-xs text-gray-400 mt-3">
          Expand the map to add connections, or use Add above. Link systems, components, data objects,
          APIs, events, capabilities, and technology platforms.
        </p>
      </div>
    </div>
  );
}
