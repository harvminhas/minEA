"use client";

import type { MinEAObject, Relationship, SystemProductLink } from "@minea/types";
import { SystemDiagramPreview } from "@/components/application/SystemDiagramPreview";
import { SystemDrawerSection } from "@/components/application/SystemDrawerSection";
import { RecordFields, toFieldEdges } from "@/components/mvp/InfraEditors";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import { INTERNAL_KEYS, REGISTRY, recordTypeOf } from "@/lib/fields/registry";
import { rowFromObject } from "@/lib/model-catalog";
import { buildDetailPropertyRows } from "@/lib/object-property-display";
import { useModelCatalog } from "@/lib/use-model-catalog";

interface Props {
  object: MinEAObject;
  layerLabel: string;
  linkedCapabilities: MinEAObject[];
  productLinks: SystemProductLink[];
  productLinksLoading?: boolean;
  relationships: Relationship[];
  nameById: Record<string, string>;
  flows?: MinEAObject[];
  diagramRefreshing?: boolean;
  onExpandDiagram: () => void;
  onEdit?: () => void;
}

export function SystemDetailsTab({
  object,
  linkedCapabilities,
  productLinks,
  productLinksLoading = false,
  relationships,
  nameById,
  flows = [],
  diagramRefreshing = false,
  onExpandDiagram,
}: Props) {
  const catalog = useModelCatalog();
  const live = catalog.data?.objects.find((item) => item.id === object.id) ?? object;
  const recordType = recordTypeOf(live.type);
  const edges = toFieldEdges(catalog.data?.relationships ?? relationships);
  const knownPropertyKeys = new Set<string>(INTERNAL_KEYS);
  if (recordType) {
    for (const field of REGISTRY[recordType]) {
      if (field.source.kind === "prop") knownPropertyKeys.add(field.source.key);
    }
  }
  const extraRows = buildDetailPropertyRows((live.properties ?? {}) as Record<string, unknown>, live.type).filter(
    (row) => !knownPropertyKeys.has(row.key)
  );

  return (
    <>
      {recordType && (
        <RecordFields type={recordType} object={live} edges={edges} row={rowFromObject(live) ?? undefined} />
      )}

      {extraRows.length > 0 && (
        <SystemDrawerSection title="More details" count={extraRows.length}>
          <div className="space-y-2 text-sm">
            {extraRows.map((row) => (
              <div key={row.key} className="flex items-start justify-between gap-3">
                <span className="text-gray-500">{row.label}</span>
                <span className="text-right font-medium text-gray-900">{row.value}</span>
              </div>
            ))}
          </div>
        </SystemDrawerSection>
      )}

      <SystemDrawerSection title="Capabilities" count={linkedCapabilities.length}>
        {linkedCapabilities.length === 0 ? (
          <p className="text-sm text-gray-400">
            No capabilities linked.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {linkedCapabilities.map((cap) => (
              <span
                key={cap.id}
                className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full"
              >
                {cap.name}
              </span>
            ))}
          </div>
        )}
      </SystemDrawerSection>

      <SystemDrawerSection title="Products" count={productLinks.length}>
        {productLinksLoading ? (
          <p className="text-sm text-gray-400">Loading products…</p>
        ) : productLinks.length === 0 ? (
          <p className="text-sm text-gray-400">
            Not included in any product. Products assign systems from the Products tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {productLinks.map((link) => (
              <li
                key={link.id}
                className="py-2.5 px-3 bg-stone-50 rounded-lg text-sm text-gray-900"
              >
                {link.name}
              </li>
            ))}
          </ul>
        )}
      </SystemDrawerSection>

      <SystemDrawerSection
        title="Relationship map"
        count={
          relationships.filter(
            (r) => r.from_object_id === object.id || r.to_object_id === object.id
          ).length
        }
      >
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={diagramRefreshing} label="Updating diagram…" />
          <SystemDiagramPreview
            system={object}
            relationships={relationships}
            nameById={nameById}
            flows={flows}
            onExpand={onExpandDiagram}
            disabled={diagramRefreshing}
            emptyHint="No linked objects yet. Add connections from the Data and Object links tabs."
          />
        </div>
      </SystemDrawerSection>
    </>
  );
}
