"use client";

import type { IntegrationFlowProperties, MinEAObject, Relationship } from "@minea/types";
import { FlowDiagramPreview } from "@/components/integration/FlowDiagramPreview";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { EntityArchitectureRelationshipsTab } from "@/components/integration/EntityArchitectureRelationshipsTab";
import {
  flowDestinationCount,
  flowProtocolLabel,
  flowSourceCount,
} from "@/lib/flow-list-utils";
import { flowEndpointChipLabels } from "@/lib/flow-utils";
import { flowRelatedNameOverrides } from "@/lib/flow-relationship-utils";

interface Props {
  flow: MinEAObject;
  relationships: Relationship[];
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
}

export function FlowRelationshipsTab({
  flow,
  relationships,
  diagramRefreshing = false,
  onExpandDiagram,
}: Props) {
  const props = (flow.properties ?? {}) as IntegrationFlowProperties;
  const srcCount = flowSourceCount(flow);
  const dstCount = flowDestinationCount(flow);

  const summary = [
    srcCount > 0 ? `${srcCount} source${srcCount !== 1 ? "s" : ""}` : "No sources",
    dstCount > 0 ? `${dstCount} destination${dstCount !== 1 ? "s" : ""}` : "No destinations",
    flowProtocolLabel(flow) || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const chips = flowEndpointChipLabels(props);

  return (
    <EntityArchitectureRelationshipsTab
      objectId={flow.id}
      objectName={flow.name}
      objectType="integration_flow"
      relationships={relationships}
      relatedNameOverrides={flowRelatedNameOverrides(flow)}
      diagramPreview={
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <FlowDiagramPreview
            flow={flow}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
          />
        </div>
      }
      architectureSummary={summary}
      chips={chips}
      helpText="Use the diagram header to edit sources and destinations. Use edit for protocol, auth, and other fields."
    />
  );
}
