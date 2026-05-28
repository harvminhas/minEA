"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { productsApi } from "@/lib/api-client";
import { ProductArchitectureGraph } from "@/components/views/ProductArchitectureGraph";
import type { NodeLayout } from "@/components/shared/EntityFlowCanvas";

interface Props {
  productId: string;
  productName: string;
  onClose: () => void;
}

export function ProductArchitectureView({ productId, productName, onClose }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();

  const graphQueryKey = ["product-graph", orgSlug, workspaceSlug, productId] as const;

  const { data: graph, isLoading, isError } = useQuery({
    queryKey: graphQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return productsApi.graph(orgSlug, workspaceSlug, productId, token!);
    },
  });

  const handleLayoutSave = useCallback(
    async (layout: NodeLayout) => {
      const token = await getToken();
      if (!token) return;

      await productsApi.update(orgSlug, workspaceSlug, productId, { graph_layout: layout }, token);

      queryClient.setQueryData(graphQueryKey, (old) => {
        if (!old) return old;
        return { ...old, graph_layout: layout };
      });
    },
    [getToken, orgSlug, workspaceSlug, productId, queryClient, graphQueryKey]
  );

  const handleResetLayout = useCallback(() => {
    handleLayoutSave({});
  }, [handleLayoutSave]);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />
      <div className="fixed inset-4 md:inset-8 bg-white rounded-xl shadow-2xl z-[70] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Architecture view</p>
            <h2 className="font-semibold text-gray-900">{productName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Close architecture view"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 relative min-h-0 bg-[#fafafa]">
          {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400">
              Loading architecture…
            </div>
          ) : isError || !graph ? (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-red-500">
              Could not load architecture graph.
            </div>
          ) : (
            <ProductArchitectureGraph
              productName={productName}
              graph={graph}
              className="absolute inset-0"
              onLayoutSave={handleLayoutSave}
              onResetLayout={handleResetLayout}
            />
          )}
        </div>
      </div>
    </>
  );
}
