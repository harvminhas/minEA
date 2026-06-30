"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronDown } from "lucide-react";
import type { Product } from "@minea/types";
import { productsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";
import { EntityFlowCanvas } from "@/components/shared/EntityFlowCanvas";
import { PRODUCT_GRAPH_NODE_TYPES } from "@/components/views/ProductArchitectureGraph";
import {
  buildPortfolioArchitectureGraph,
  filterPortfolioGraphView,
  mergeProductGraphs,
  PORTFOLIO_LAYER_TOGGLE_LABELS,
} from "@/lib/portfolio-architecture-graph";

function SummaryCard({
  label,
  value,
  subtext,
  accent,
}: {
  label: string;
  value: string;
  subtext: string;
  accent?: "amber" | "violet";
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-white px-5 py-4",
        accent === "amber" && "border-amber-200",
        accent === "violet" && "border-violet-200",
        !accent && "border-gray-200"
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{subtext}</p>
    </div>
  );
}

const PRODUCT_LAYER = 0;

const DEFAULT_LAYER_VISIBILITY: Record<number, boolean> = {
  1: true,
  2: true,
  3: true,
};

function ProductFilterMenu({
  products,
  visibleProductIds,
  onToggle,
  onSelectAll,
  onClear,
}: {
  products: Product[];
  visibleProductIds: Set<string>;
  onToggle: (productId: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
}) {
  const total = products.length;
  const selected = products.filter((p) => visibleProductIds.has(p.id)).length;
  const allSelected = selected === total;
  const noneSelected = selected === 0;

  return (
    <div className="absolute top-full left-0 mt-1 min-w-[200px] max-w-[280px] rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-gray-100">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          {selected}/{total} shown
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={onSelectAll}
            disabled={allSelected}
            className="text-indigo-600 hover:text-indigo-700 disabled:text-gray-300"
          >
            All
          </button>
          <span className="text-gray-200">|</span>
          <button
            type="button"
            onClick={onClear}
            disabled={noneSelected}
            className="text-gray-500 hover:text-gray-700 disabled:text-gray-300"
          >
            None
          </button>
        </div>
      </div>
      <ul className="max-h-56 overflow-y-auto py-1">
        {products.map((product) => {
          const checked = visibleProductIds.has(product.id);
          return (
            <li key={product.id}>
              <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => onToggle(product.id)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-800 truncate">{product.name}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function PortfolioArchitectureMap({
  products,
  onProductClick,
}: {
  products: Product[];
  onProductClick?: (productId: string) => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [layerVisibility, setLayerVisibility] = useState(DEFAULT_LAYER_VISIBILITY);
  const [visibleProductIds, setVisibleProductIds] = useState<Set<string>>(new Set());
  const [productsMenuOpen, setProductsMenuOpen] = useState(false);
  const productsMenuRef = useRef<HTMLDivElement>(null);

  const productIds = useMemo(() => products.map((p) => p.id).sort().join(","), [products]);

  const sortedProducts = useMemo(
    () => [...products].sort((a, b) => a.name.localeCompare(b.name)),
    [products]
  );

  const { data: mergedGraph, isLoading, isError } = useQuery({
    queryKey: ["portfolio-architecture", orgSlug, workspaceSlug, productIds],
    queryFn: async () => {
      const token = await getToken();
      const graphs = await Promise.all(
        products.map((p) => productsApi.graph(orgSlug, workspaceSlug, p.id, token!))
      );
      return mergeProductGraphs(graphs);
    },
    enabled: products.length > 0,
  });

  const summary = useMemo(
    () => (mergedGraph ? buildPortfolioArchitectureGraph(mergedGraph).summary : null),
    [mergedGraph]
  );

  useEffect(() => {
    const allIds = sortedProducts.map((product) => product.id);
    setVisibleProductIds((prev) => {
      if (prev.size === 0) return new Set(allIds);
      const next = new Set([...prev].filter((id) => allIds.includes(id)));
      return next.size > 0 ? next : new Set(allIds);
    });
  }, [productIds, sortedProducts]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;
      if (
        productsMenuRef.current &&
        target instanceof globalThis.Node &&
        !productsMenuRef.current.contains(target)
      ) {
        setProductsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const layersPresent = useMemo(
    () => (mergedGraph ? [...new Set(mergedGraph.nodes.map((n) => n.layer))].sort() : []),
    [mergedGraph]
  );

  const toggleableLayers = useMemo(
    () => layersPresent.filter((layer) => layer !== PRODUCT_LAYER),
    [layersPresent]
  );

  const { visibleNodes, visibleEdges } = useMemo(() => {
    if (!mergedGraph) return { visibleNodes: [], visibleEdges: [] };
    return filterPortfolioGraphView(mergedGraph, visibleProductIds, layerVisibility);
  }, [mergedGraph, layerVisibility, visibleProductIds]);

  const toggleLayer = (layer: number) => {
    setLayerVisibility((prev) => ({ ...prev, [layer]: !prev[layer] }));
  };

  const toggleProduct = (productId: string) => {
    setVisibleProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const selectAllProducts = () => {
    setVisibleProductIds(new Set(sortedProducts.map((product) => product.id)));
  };

  const clearProducts = () => {
    setVisibleProductIds(new Set());
  };

  const visibleProductCount = sortedProducts.filter((product) =>
    visibleProductIds.has(product.id)
  ).length;
  const allProductsVisible =
    sortedProducts.length > 0 && visibleProductCount === sortedProducts.length;
  const someProductsVisible = visibleProductCount > 0 && !allProductsVisible;

  if (isLoading) {
    return <p className="text-sm text-gray-400">Loading portfolio map…</p>;
  }

  if (isError || !mergedGraph || !summary) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500">Could not load portfolio architecture.</p>
      </div>
    );
  }

  if (mergedGraph.nodes.length <= 1) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-10 text-center max-w-lg">
        <p className="text-sm text-gray-500 mb-2">No architecture links yet.</p>
        <p className="text-xs text-gray-400">
          Map capabilities and systems on each product to see overlap and shared dependencies
          across the portfolio.
        </p>
      </div>
    );
  }

  const overlapSubtext =
    summary.sharedCapabilityNames.length > 0
      ? summary.sharedCapabilityNames.slice(0, 2).join(" · ") +
        (summary.sharedCapabilityNames.length > 2
          ? ` · +${summary.sharedCapabilityNames.length - 2}`
          : "")
      : "No capabilities shared across products";

  const couplingSubtext =
    summary.sharedSystemNames.length > 0
      ? summary.sharedSystemNames.slice(0, 2).join(" · ") +
        (summary.sharedSystemNames.length > 2
          ? ` · +${summary.sharedSystemNames.length - 2}`
          : "")
      : "No systems coupling multiple products";

  const showToolbar = sortedProducts.length > 0 || toggleableLayers.length > 0;

  return (
    <div className="space-y-3 w-full">
      <div className="relative h-[min(680px,calc(100vh-240px))] min-h-[460px] w-full rounded-xl border border-gray-200 bg-[#fafafa] overflow-hidden">
        <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
          {showToolbar && (
            <div className="flex items-center gap-1 rounded-lg bg-white/95 border border-gray-200 p-0.5 shadow-sm pointer-events-auto">
              {sortedProducts.length > 0 && (
                <div className="relative" ref={productsMenuRef}>
                  <button
                    type="button"
                    onClick={() => setProductsMenuOpen((open) => !open)}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors",
                      visibleProductCount === 0
                        ? "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                        : allProductsVisible
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200"
                    )}
                    aria-expanded={productsMenuOpen}
                    aria-haspopup="true"
                  >
                    {PORTFOLIO_LAYER_TOGGLE_LABELS[PRODUCT_LAYER]}
                    {someProductsVisible && (
                      <span className="normal-case font-medium opacity-90">
                        ({visibleProductCount})
                      </span>
                    )}
                    <ChevronDown size={12} className="opacity-70" />
                  </button>
                  {productsMenuOpen && (
                    <ProductFilterMenu
                      products={sortedProducts}
                      visibleProductIds={visibleProductIds}
                      onToggle={toggleProduct}
                      onSelectAll={selectAllProducts}
                      onClear={clearProducts}
                    />
                  )}
                </div>
              )}
              {toggleableLayers.map((layer) => {
                const active = layerVisibility[layer] !== false;
                return (
                  <button
                    key={layer}
                    type="button"
                    onClick={() => toggleLayer(layer)}
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-semibold uppercase tracking-wide transition-colors",
                      active
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
                    )}
                    aria-pressed={active}
                  >
                    {PORTFOLIO_LAYER_TOGGLE_LABELS[layer] ?? `Layer ${layer}`}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {visibleProductCount === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
            Select at least one product to show the map.
          </div>
        ) : (
          <EntityFlowCanvas
            key={visibleNodes.map((n) => n.id).join(",")}
            nodes={visibleNodes}
            edges={visibleEdges}
            nodeTypes={PRODUCT_GRAPH_NODE_TYPES}
            mode="full"
            accentColor="#6366f1"
            fitViewPadding={0.04}
            emptyLabel="No architecture to show"
            className="h-full"
            onNodeClick={
              onProductClick
                ? (_event, node) => {
                    if (node.data.type === "product") onProductClick(node.id);
                  }
                : undefined
            }
          />
        )}

        <div className="absolute bottom-3 left-3 z-10 pointer-events-none text-[10px] text-gray-400 bg-white/90 border border-gray-200 rounded px-2 py-1">
          {visibleProductCount}/{summary.productCount} product
          {summary.productCount === 1 ? "" : "s"} · {visibleNodes.length} visible ·{" "}
          {visibleEdges.length} links
          {(summary.sharedSystemCount > 0 || summary.sharedCapabilityCount > 0) && (
            <span className="text-amber-600 ml-1">
              · {summary.sharedSystemCount + summary.sharedCapabilityCount} shared
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          label="Products"
          value={String(summary.productCount)}
          subtext="Each product fans out to its capabilities"
        />
        <SummaryCard
          label="Capability overlap"
          value={String(summary.sharedCapabilityCount)}
          subtext={overlapSubtext}
          accent="amber"
        />
        <SummaryCard
          label="System coupling"
          value={String(summary.sharedSystemCount)}
          subtext={couplingSubtext}
          accent="violet"
        />
      </div>

      {(summary.sharedSystemCount > 0 || summary.sharedCapabilityCount > 0) && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5 px-1">
          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0" />
          Shared nodes appear once — lines from multiple products show overlap and coupling at a
          glance.
        </p>
      )}
    </div>
  );
}
