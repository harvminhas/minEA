"use client";

import { Maximize2 } from "lucide-react";
import type { MinEAObject, Relationship } from "@minea/types";
import { IntegrationInfraArchitectureGraph } from "@/components/integration/IntegrationInfraDiagram";
import { extractInfraDiagramLinks } from "@/lib/integration-infra-relationship-utils";
import { cn } from "@/lib/utils";

interface Props {
  infra: MinEAObject;
  relationships: Relationship[];
  nameById: Record<string, string>;
  onExpand: () => void;
  disabled?: boolean;
}

export function IntegrationInfraDiagramPreview({
  infra,
  relationships,
  nameById,
  onExpand,
  disabled,
}: Props) {
  const hasLinks = extractInfraDiagramLinks(infra.id, relationships, nameById).length > 0;

  return (
    <button
      type="button"
      onClick={onExpand}
      disabled={disabled}
      className={cn(
        "group relative w-full text-left rounded-lg border border-gray-200 overflow-hidden",
        "hover:border-teal-300 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal-500",
        disabled && "pointer-events-none opacity-80"
      )}
      aria-label="Expand integration infrastructure relationship chart"
    >
      {hasLinks ? (
        <div className="bg-gray-50/60">
          <IntegrationInfraArchitectureGraph
            infra={infra}
            relationships={relationships}
            nameById={nameById}
            compact
          />
        </div>
      ) : (
        <div className="h-[160px] bg-gray-50 flex items-center justify-center px-4">
          <p className="text-xs text-gray-400 text-center">
            No linked APIs, events, or flows yet. Assign this infrastructure as a gateway, broker, or
            carrier from those objects.
          </p>
        </div>
      )}

      <div className="absolute inset-0 bg-teal-600/0 group-hover:bg-teal-600/5 transition-colors pointer-events-none" />
      {hasLinks && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-white/90 border border-gray-200 px-2 py-1 text-[10px] font-medium text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <Maximize2 size={10} />
          Expand
        </div>
      )}
    </button>
  );
}
