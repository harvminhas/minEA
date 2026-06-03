"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, Users } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import type { Product } from "@minea/types";
import { formatProductCoverageLine } from "@/lib/portfolio-utils";
import { formatUpdatedAgo } from "@/lib/system-utils";
import { cn } from "@/lib/utils";

const STRATEGY_LAYER_COLOR = "#8b5cf6";
const CARD_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

const LIFECYCLE_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  beta: "bg-amber-50 text-amber-700",
  planned: "bg-stone-100 text-gray-600",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
};

function ProductCard({
  product,
  color,
  onClick,
}: {
  product: Product;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-200 hover:shadow-sm transition-all cursor-pointer w-full flex flex-col"
    >
      <div className="flex items-start gap-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {product.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 text-base leading-tight truncate">{product.name}</h3>
          <p className="flex items-center gap-1.5 text-xs text-gray-500 mt-1">
            <Users size={13} className="flex-shrink-0 text-gray-400" />
            <span className="truncate">{product.owner ?? "Unassigned"}</span>
          </p>
        </div>
      </div>

      <p className="text-sm text-gray-600 mt-4">{formatProductCoverageLine(product)}</p>

      <div className="flex flex-wrap gap-2 mt-3">
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize",
            LIFECYCLE_STYLE[product.lifecycle] ?? LIFECYCLE_STYLE.planned
          )}
        >
          {product.lifecycle}
        </span>
        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-blue-50 text-blue-700">
          {product.capability_count} capabilit{product.capability_count === 1 ? "y" : "ies"}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{product.updated_by_name ? ` by ${product.updated_by_name}` : ""}{" "}
          {formatUpdatedAgo(product.updated_at)}
        </span>
      </div>
    </button>
  );
}

/** Repository list — edit and manage individual products. */
export function ProductRepositoryList() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState(CARD_COLORS[0]!);

  const { data, isLoading } = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
  });

  const products = data?.items ?? [];
  const lines = [...new Set(products.map((p) => p.product_line).filter(Boolean))] as string[];
  const ungrouped = products.filter((p) => !p.product_line);
  const grouped = lines.map((line) => ({
    line,
    items: products.filter((p) => p.product_line === line),
  }));

  const openProduct = (product: Product, color: string) => {
    setSelectedColor(color);
    setSelectedProductId(product.id);
  };

  const refreshProducts = () => {
    invalidateProductQueries(queryClient, orgSlug, workspaceSlug, selectedProductId ?? undefined);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-200 bg-white sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <span
              className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ backgroundColor: `${STRATEGY_LAYER_COLOR}20`, color: STRATEGY_LAYER_COLOR }}
            >
              Strategy Layer
            </span>
            <h1 className="text-lg font-semibold text-gray-900">Products</h1>
            {data && (
              <span className="text-sm text-gray-400">
                {data.total} {data.total === 1 ? "product" : "products"}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
          >
            <Plus size={14} />
            Add
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8">
          {isLoading ? (
            <p className="text-sm text-gray-400">Loading products…</p>
          ) : products.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm mb-3">No products yet.</p>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="text-indigo-600 hover:underline text-sm"
              >
                Add your first product →
              </button>
            </div>
          ) : (
            <div className="space-y-8 max-w-5xl">
              {grouped.map(({ line, items }) => (
                <section key={line}>
                  <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                    {line}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {items.map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        color={CARD_COLORS[i % CARD_COLORS.length]!}
                        onClick={() => openProduct(product, CARD_COLORS[i % CARD_COLORS.length]!)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              {ungrouped.length > 0 && (
                <section>
                  {lines.length > 0 && (
                    <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                      Other
                    </h2>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {ungrouped.map((product, i) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        color={CARD_COLORS[i % CARD_COLORS.length]!}
                        onClick={() => openProduct(product, CARD_COLORS[i % CARD_COLORS.length]!)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>
      </div>

      {showCreateForm && (
        <ProductForm
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            refreshProducts();
          }}
        />
      )}

      {selectedProductId && (
        <ProductDetail
          productId={selectedProductId}
          accentColor={selectedColor}
          onClose={() => setSelectedProductId(null)}
          onUpdate={refreshProducts}
        />
      )}
    </>
  );
}
