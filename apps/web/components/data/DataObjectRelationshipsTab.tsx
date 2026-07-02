"use client";

import { useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQueries } from "@tanstack/react-query";
import type { MinEAObject, ObjectType, Relationship } from "@minea/types";
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

export const DATA_OBJECT_ACCENT = "#8b5cf6";
export const DATA_STORE_ACCENT = "#10b981";
export const DATA_DOMAIN_ACCENT = "#8b5cf6";

interface Props {
  centerObject: MinEAObject;
  relationships: Relationship[];
  objectType: ObjectType;
  accentColor: string;
  chipClassName?: string;
  detailsTabHint?: string;
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
  onAddRepositoryRel?: () => void;
  onRemoveRepositoryRel?: (relationshipId: string) => void;
  isRemovingRepositoryRel?: boolean;
}

export function DataRepositoryRelationshipsTab({
  centerObject,
  relationships,
  objectType,
  accentColor,
  chipClassName = "text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full",
  detailsTabHint = "Placement and operational links are edited on the Details tab. Use Add or expand the map for other repository relationships.",
  diagramRefreshing = false,
  onExpandDiagram,
  onAddRepositoryRel,
  onRemoveRepositoryRel,
  isRemovingRepositoryRel,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rel of relationships) {
      ids.add(otherRelationshipObjectId(rel, centerObject.id));
    }
    return [...ids];
  }, [relationships, centerObject.id]);

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
    const map: Record<string, string> = { [centerObject.id]: centerObject.name };
    for (const query of nameQueries) {
      if (query.data) map[query.data.id] = query.data.name;
    }
    return map;
  }, [nameQueries, centerObject.id, centerObject.name]);

  const diagramLinks = useMemo(
    () => extractSystemDiagramLinks(centerObject.id, relationships, nameById),
    [centerObject.id, relationships, nameById]
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
        className: chipClassName,
      }));
  }, [diagramLinks, chipClassName]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Relationship map
        </h3>
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <SystemDiagramPreview
            system={centerObject}
            relationships={relationships}
            nameById={nameById}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
            accentColor={accentColor}
            emptyHint="No repository relationships yet. Expand to link systems, domains, stores, and other architecture objects."
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {systemRelationshipSummary(centerObject, diagramLinks)}
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
          objectId={centerObject.id}
          objectName={centerObject.name}
          objectType={objectType}
          relationships={relationships}
          onAdd={onAddRepositoryRel}
          onRemove={onRemoveRepositoryRel}
          isRemoving={isRemovingRepositoryRel}
        />
        <p className="text-xs text-gray-400 mt-3">{detailsTabHint}</p>
      </div>
    </div>
  );
}

export function DataObjectRelationshipsTab(
  props: Omit<Props, "objectType" | "accentColor" | "chipClassName" | "detailsTabHint"> &
    Partial<Pick<Props, "objectType" | "accentColor" | "chipClassName" | "detailsTabHint">>
) {
  return (
    <DataRepositoryRelationshipsTab
      objectType="data_object"
      accentColor={DATA_OBJECT_ACCENT}
      chipClassName="text-xs bg-violet-50 text-violet-700 border border-violet-100 px-2 py-0.5 rounded-full"
      detailsTabHint="Domain, owner, and store placement are edited on the Details tab. Use Add or expand the map for other repository relationships."
      {...props}
    />
  );
}

