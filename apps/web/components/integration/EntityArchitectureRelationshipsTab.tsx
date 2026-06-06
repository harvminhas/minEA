"use client";

import type { ReactNode } from "react";
import { ObjectRelationshipsTab } from "@/components/objects/ObjectRelationshipsTab";
import type { ObjectType, Relationship } from "@minea/types";

interface Props {
  objectId: string;
  objectName: string;
  objectType: ObjectType;
  relationships: Relationship[];
  relatedNameOverrides?: Record<string, string>;
  diagramPreview: ReactNode;
  architectureSummary: string;
  chips?: { key: string; label: string; className?: string }[];
  helpText?: string;
}

export function EntityArchitectureRelationshipsTab({
  objectId,
  objectName,
  objectType,
  relationships,
  relatedNameOverrides,
  diagramPreview,
  architectureSummary,
  chips,
  helpText,
}: Props) {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Architecture
        </h3>
        {diagramPreview}
        <p className="text-xs text-gray-400 mt-2">{architectureSummary}</p>
        {chips && chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {chips.map((chip) => (
              <span
                key={chip.key}
                className={
                  chip.className ??
                  "text-xs bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full"
                }
              >
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
          objectId={objectId}
          objectName={objectName}
          objectType={objectType}
          relationships={relationships}
          relatedNameOverrides={relatedNameOverrides}
          hideAdd
          hideRemove
        />
        {helpText && <p className="text-xs text-gray-400 mt-3">{helpText}</p>}
      </div>
    </div>
  );
}
