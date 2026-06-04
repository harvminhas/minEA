"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DomainDetail } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { capabilityMapApi } from "@/lib/api-client";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductDetail } from "@/components/views/ProductDetail";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

const PRODUCT_COLORS = ["#6366f1", "#8b5cf6", "#22c55e", "#f59e0b", "#ec4899", "#0ea5e9"];

const LIFECYCLE_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  beta: "bg-amber-50 text-amber-700",
  planned: "bg-stone-100 text-gray-600",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
};

function productColor(productId: string): string {
  let hash = 0;
  for (let i = 0; i < productId.length; i++) {
    hash = productId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PRODUCT_COLORS[Math.abs(hash) % PRODUCT_COLORS.length]!;
}

interface Props {
  domain: DomainDetail;
}

export function DomainProductsTab({ domain }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  const productsQueryKey = ["domain-products", orgSlug, workspaceSlug, domain.id] as const;

  const { data, isLoading, refetch } = useQuery({
    queryKey: productsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.getDomainProducts(orgSlug, workspaceSlug, domain.id, token!);
    },
  });

  const linkedProducts = data?.items ?? [];
  const selectedColor = selectedProductId ? productColor(selectedProductId) : PRODUCT_COLORS[0]!;

  if (isLoading) {
    return <p className="p-8 text-sm text-gray-400">Loading products…</p>;
  }

  if (linkedProducts.length === 0) {
    return (
      <div className="p-8">
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center max-w-lg mx-auto">
          <h2 className="text-lg font-semibold text-gray-900">No linked products</h2>
          <p className="text-sm text-gray-500 mt-2">
            Products appear here when they include at least one L2 capability from {domain.name}.
            Edit a product under Strategy → Products and select capabilities from this domain.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="p-8">
        <p className="text-sm text-gray-500 mb-4">
          {linkedProducts.length} product{linkedProducts.length === 1 ? "" : "s"} realise capabilities
          from {domain.name}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
          {linkedProducts.map((product) => (
            <button
              key={product.id}
              type="button"
              onClick={() => setSelectedProductId(product.id)}
              className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-violet-200 hover:shadow-sm transition-all w-full"
            >
              <div className="flex items-start gap-3">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                  style={{ backgroundColor: productColor(product.id) }}
                >
                  {product.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-gray-900 truncate">{product.name}</h3>
                  {product.owner && (
                    <p className="text-xs text-gray-400 mt-0.5">Owner · {product.owner}</p>
                  )}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0",
                    LIFECYCLE_STYLE[product.lifecycle] ?? LIFECYCLE_STYLE.planned
                  )}
                >
                  {product.lifecycle}
                </span>
              </div>

              <p className="text-xs text-gray-500 mt-3">
                {product.linked_capabilities.length} of {domain.capabilities.length} domain{" "}
                {product.linked_capabilities.length === 1 ? "capability" : "capabilities"}
                {product.system_count > 0
                  ? ` · ${product.system_count} system${product.system_count === 1 ? "" : "s"}`
                  : ""}
              </p>

              <div className="flex flex-wrap gap-1.5 mt-3">
                {product.linked_capabilities.map((cap) => (
                  <span
                    key={cap.id}
                    className="inline-block rounded-full bg-violet-50 border border-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-800"
                  >
                    {cap.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedProductId && (
        <ProductDetail
          productId={selectedProductId}
          accentColor={selectedColor}
          onClose={() => setSelectedProductId(null)}
          onUpdate={() => {
            invalidateProductQueries(queryClient, orgSlug, workspaceSlug, selectedProductId);
            void refetch();
          }}
        />
      )}
    </>
  );
}
