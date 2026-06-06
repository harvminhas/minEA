"use client";

import { useMemo } from "react";
import type { MinEAObject, Relationship, ToolProperties } from "@minea/types";
import { EntityArchitectureRelationshipsTab } from "@/components/integration/EntityArchitectureRelationshipsTab";
import { IntegrationInfraDiagramPreview } from "@/components/integration/IntegrationInfraDiagramPreview";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { extractInfraDiagramLinks } from "@/lib/integration-infra-relationship-utils";
import { formatInfraHandles, formatInfraSubtitle, resolvedInfraHandles } from "@/lib/integration-infra-utils";

interface Props {
  infra: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
}

export function IntegrationInfraRelationshipsTab({
  infra,
  relationships,
  nameById,
  diagramRefreshing = false,
  onExpandDiagram,
}: Props) {
  const props = (infra.properties ?? {}) as ToolProperties;

  const links = useMemo(
    () => extractInfraDiagramLinks(infra.id, relationships, nameById),
    [infra.id, relationships, nameById]
  );

  const apiCount = links.filter((l) => l.relationshipType === "hosts").length;
  const eventCount = links.filter((l) => l.relationshipType === "routes").length;
  const flowCount = links.filter((l) => l.relationshipType === "carries").length;
  const otherCount = links.length - apiCount - eventCount - flowCount;

  const summaryParts = [
    apiCount > 0 ? `${apiCount} API${apiCount !== 1 ? "s" : ""}` : null,
    eventCount > 0 ? `${eventCount} event${eventCount !== 1 ? "s" : ""}` : null,
    flowCount > 0 ? `${flowCount} flow${flowCount !== 1 ? "s" : ""}` : null,
    otherCount > 0 ? `${otherCount} other` : null,
  ].filter(Boolean);

  const summary =
    summaryParts.length > 0
      ? summaryParts.join(" · ")
      : formatInfraSubtitle(props) || "No connections yet";

  const handles = resolvedInfraHandles(props);
  const chips = handles.map((handle) => ({
    key: handle,
    label: formatInfraHandles([handle]),
    className: "text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full",
  }));

  return (
    <EntityArchitectureRelationshipsTab
      objectId={infra.id}
      objectName={infra.name}
      objectType="tool"
      relationships={relationships}
      relatedNameOverrides={nameById}
      diagramPreview={
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <IntegrationInfraDiagramPreview
            infra={infra}
            relationships={relationships}
            nameById={nameById}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
          />
        </div>
      }
      architectureSummary={summary}
      chips={chips.length > 0 ? chips : undefined}
      helpText="Drag nodes in the expanded diagram to rearrange — positions save automatically. Link objects from API, Event, or Flow edit forms."
    />
  );
}
