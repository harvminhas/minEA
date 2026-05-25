"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { ViewShell } from "@/components/views/ViewShell";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductDetail } from "@/components/views/ProductDetail";
import { getView } from "@/lib/views";
import type { Product } from "@minea/types";
import { cn } from "@/lib/utils";

const view = getView("products");

const CARD_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9", "#8b5cf6"];

const LIFECYCLE_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  beta: "bg-amber-50 text-amber-700",
  planned: "bg-gray-100 text-gray-600",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
};

const MATURITY_STYLE: Record<string, string> = {
  manual: "bg-red-50 text-red-700",
  partial: "bg-amber-50 text-amber-700",
  automated: "bg-emerald-50 text-emerald-700",
  outsourced: "bg-slate-100 text-slate-600",
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
      className="text-left bg-[#faf8f5] rounded-xl border border-gray-200/80 p-5 hover:border-indigo-200 transition-colors cursor-pointer w-full"
    >
      <div className="flex items-start gap-3 mb-3">
        <div
          className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
          style={{ backgroundColor: color }}
        >
          {product.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
          {product.product_line && (
            <p className="text-xs text-gray-400 mt-0.5">Product line · {product.product_line}</p>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        {product.system_count} system{product.system_count === 1 ? "" : "s"} ·{" "}
        {product.api_count} API{product.api_count === 1 ? "" : "s"} ·{" "}
        {product.data_store_count} data store{product.data_store_count === 1 ? "" : "s"}
      </p>
      <div className="flex flex-wrap gap-1.5">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
            LIFECYCLE_STYLE[product.lifecycle] ?? LIFECYCLE_STYLE.planned
          )}
        >
          {product.lifecycle}
        </span>
        {product.maturity_indicator && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
              MATURITY_STYLE[product.maturity_indicator] ?? MATURITY_STYLE.manual
            )}
          >
            {product.maturity_indicator}
          </span>
        )}
        {product.capability_count > 0 && (
          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-indigo-50 text-indigo-700">
            {product.capability_count} capabilit{product.capability_count === 1 ? "y" : "ies"}
          </span>
        )}
      </div>
    </button>
  );
}

export default function ProductPortfolioPage() {
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

  const subtitle =
    products.length > 0
      ? `${products.length} product${products.length === 1 ? "" : "s"} across ${Math.max(lines.length, 1)} line${lines.length === 1 ? "" : "s"}`
      : view.anchorQuestion;

  const openProduct = (product: Product, color: string) => {
    setSelectedColor(color);
    setSelectedProductId(product.id);
  };

  const refreshProducts = () => {
    queryClient.invalidateQueries({ queryKey: ["products", orgSlug, workspaceSlug] });
    if (selectedProductId) {
      queryClient.invalidateQueries({ queryKey: ["product", orgSlug, workspaceSlug, selectedProductId] });
    }
  };

  return (
    <>
      <ViewShell
        view={view}
        subtitle={subtitle}
        isEmpty={!isLoading && products.length === 0}
        onEmptyAction={() => setShowCreateForm(true)}
        headerAction={
          products.length > 0 ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 hidden sm:inline">
                Mapped from capabilities &amp; systems
              </span>
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              >
                <Plus size={14} />
                Add
              </button>
            </div>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading products…</p>
        ) : (
          <div className="space-y-8">
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
      </ViewShell>

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
