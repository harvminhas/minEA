"use client";

import { useMemo } from "react";
import { Link2 } from "lucide-react";
import type { Product, ProductGraphResponse } from "@minea/types";
import { ProductArchitecturePreview } from "@/components/views/ProductArchitecturePreview";
import { DiagramSavingBar } from "@/components/shared/DiagramSavingBar";
import {
  formatProductGraphEdgeLine,
  productGraphLabelById,
  productRelationshipSummary,
} from "@/lib/product-relationship-utils";

interface Props {
  product: Product;
  graph?: ProductGraphResponse;
  graphLoading?: boolean;
  graphRefreshing?: boolean;
  onExpandDiagram: () => void;
}

export function ProductRelationshipsTab({
  product,
  graph,
  graphLoading = false,
  graphRefreshing = false,
  onExpandDiagram,
}: Props) {
  const labelById = useMemo(() => productGraphLabelById(graph), [graph]);
  const edges = graph?.edges ?? [];

  const chips = useMemo(() => {
    const seen = new Set<string>();
    return (graph?.nodes ?? [])
      .filter((node) => node.id !== product.id)
      .filter((node) => {
        if (seen.has(node.id)) return false;
        seen.add(node.id);
        return true;
      })
      .slice(0, 8)
      .map((node) => ({
        key: node.id,
        label: node.label,
        className:
          "text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full",
      }));
  }, [graph?.nodes, product.id]);

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Relationship map
        </h3>
        <div className="rounded-lg overflow-hidden border border-transparent">
          <DiagramSavingBar active={graphRefreshing} label="Updating diagram…" />
          <ProductArchitecturePreview
            productName={product.name}
            graph={graph}
            isLoading={graphLoading}
            onExpand={onExpandDiagram}
          />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {productRelationshipSummary(product.id, graph)}
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
        <p className="text-sm text-gray-500 mb-4">
          {edges.length === 0
            ? "No connections yet."
            : `${edges.length} connection${edges.length === 1 ? "" : "s"}`}
        </p>

        {edges.length === 0 ? (
          <p className="text-sm text-gray-400">
            Link capabilities and systems to this product to see how it connects across the
            architecture.
          </p>
        ) : (
          <div className="space-y-2">
            {edges.map((edge) => {
              const { nameLine, typeLine } = formatProductGraphEdgeLine(edge, labelById);
              return (
                <div
                  key={edge.id}
                  className="flex items-start gap-2 py-2.5 px-3 bg-stone-50 rounded-lg"
                >
                  <Link2 size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 leading-snug">{nameLine}</p>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{typeLine}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-3">
          Expand the map for the full architecture view. Connections are derived from capability
          mappings, system links, and integration relationships in this product&apos;s scope.
        </p>
      </div>
    </div>
  );
}
