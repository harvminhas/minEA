"use client";

import type { ApiProperties, MinEAObject, Relationship } from "@minea/types";
import { ApiDiagramPreview } from "@/components/integration/ApiDiagramPreview";
import { EntityArchitectureRelationshipsTab } from "@/components/integration/EntityArchitectureRelationshipsTab";
import { apiRelatedNameOverrides } from "@/lib/api-relationship-utils";
import { API_STYLE_LABEL, formatProviderLabel } from "@/lib/api-utils";

interface Props {
  api: MinEAObject;
  relationships: Relationship[];
  onExpandDiagram: () => void;
}

export function ApiRelationshipsTab({ api, relationships, onExpandDiagram }: Props) {
  const props = (api.properties ?? {}) as ApiProperties;
  const consumers = props.consumers ?? [];
  const styleLabel = API_STYLE_LABEL[props.protocol ?? ""] ?? props.protocol;

  const summary = [
    props.provider ? formatProviderLabel(props.provider) : "No provider",
    consumers.length > 0 ? `${consumers.length} consumer${consumers.length !== 1 ? "s" : ""}` : null,
    styleLabel,
  ]
    .filter(Boolean)
    .join(" · ");

  const chips = consumers.map((c) => ({
    key: c.consumer_id ?? c.consumer_name,
    label: c.consumer_name,
    className:
      c.consumer_kind === "custom"
        ? "text-xs bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full"
        : undefined,
  }));

  return (
    <EntityArchitectureRelationshipsTab
      objectId={api.id}
      objectName={api.name}
      objectType="api"
      relationships={relationships}
      relatedNameOverrides={apiRelatedNameOverrides(api)}
      diagramPreview={<ApiDiagramPreview api={api} onExpand={onExpandDiagram} />}
      architectureSummary={summary}
      chips={chips}
      helpText="Use the diagram header to set provider and consumers. Use edit for gateway, auth, and other fields."
    />
  );
}
