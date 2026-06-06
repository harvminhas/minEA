"use client";

import { useMemo } from "react";
import type { ComponentProperties, MinEAObject, Relationship } from "@minea/types";
import { ComponentDiagramPreview } from "@/components/application/ComponentDiagramPreview";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { ObjectRelationshipsTab } from "@/components/objects/ObjectRelationshipsTab";

interface Props {
  component: MinEAObject;
  relationships: Relationship[];
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
}

export function ComponentRelationshipsTab({
  component,
  relationships,
  diagramRefreshing = false,
  onExpandDiagram,
}: Props) {
  const props = (component.properties ?? {}) as ComponentProperties;
  const systems = props.systems ?? [];

  const relatedNameOverrides = useMemo(() => {
    const names: Record<string, string> = {};
    for (const sys of systems) names[sys.system_id] = sys.system_name;
    if (props.runtime) names[props.runtime.runtime_id] = props.runtime.runtime_name;
    return names;
  }, [systems, props.runtime]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Architecture
        </h3>
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <ComponentDiagramPreview
            component={component}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {systems.length} system{systems.length !== 1 ? "s" : ""}
          {props.platform ? ` · ${props.platform.platform_name}` : ""}
          {props.runtime ? ` · ${props.runtime.runtime_name}` : ""}
        </p>
        {systems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {systems.map((s) => (
              <span
                key={s.system_id}
                className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
              >
                {s.system_name}
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
          objectId={component.id}
          objectName={component.name}
          objectType="component"
          relationships={relationships}
          relatedNameOverrides={relatedNameOverrides}
          hideAdd
          hideRemove
        />
        <p className="text-xs text-gray-400 mt-3">
          Use the diagram header to add systems or runtime. Use edit for platform and other fields.
        </p>
      </div>
    </div>
  );
}
