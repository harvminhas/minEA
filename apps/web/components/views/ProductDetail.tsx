"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Edit2 } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailRow,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductArchitectureView } from "@/components/views/ProductArchitectureView";
import { ProductArchitecturePreview } from "@/components/views/ProductArchitecturePreview";
import { cn } from "@/lib/utils";

const LIFECYCLE_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  beta: "bg-amber-50 text-amber-700",
  planned: "bg-gray-100 text-gray-600",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  productId: string;
  accentColor?: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ProductDetail({ productId, accentColor = "#6366f1", onClose, onUpdate }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [showEditForm, setShowEditForm] = useState(false);
  const [showArchitecture, setShowArchitecture] = useState(false);

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", orgSlug, workspaceSlug, productId],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.get(orgSlug, workspaceSlug, productId, token!);
    },
  });

  const { data: graph, isLoading: graphLoading } = useQuery({
    queryKey: ["product-graph", orgSlug, workspaceSlug, productId],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.graph(orgSlug, workspaceSlug, productId, token!);
    },
    enabled: !!product,
  });

  const { data: capabilities } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "capability"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "capability" }, token!);
    },
    enabled: !!product?.capability_ids.length,
  });

  const linkedCapabilities =
    capabilities?.items.filter((cap) => product?.capability_ids.includes(cap.id)) ?? [];

  if (isLoading || !product) {
    return (
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-center justify-between p-6 border-b border-gray-100">
            <div className="h-10 w-24 bg-gray-100 rounded animate-pulse" />
            <DetailPanelCloseButton onClose={onClose} />
          </div>
        }
      >
        <p className="text-sm text-gray-400">Loading product…</p>
      </DetailPanel>
    );
  }

  return (
    <>
      <DetailPanel
        onClose={onClose}
        header={
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                style={{ backgroundColor: accentColor }}
              >
                {product.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="font-semibold text-gray-900 truncate">{product.name}</h2>
                <p className="text-sm text-gray-400">Product</p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
                  LIFECYCLE_STYLE[product.lifecycle] ?? LIFECYCLE_STYLE.planned
                )}
              >
                {product.lifecycle}
              </span>
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                aria-label="Edit product"
              >
                <Edit2 size={14} />
              </button>
              <DetailPanelCloseButton onClose={onClose} />
            </div>
          </div>
        }
        footer={
          <div className="border-t border-gray-100 px-6 py-3">
            <p className="text-xs text-gray-400">
              Updated {new Date(product.updated_at).toLocaleDateString()}
            </p>
          </div>
        }
      >
        {product.description && (
          <DetailSection title="Description">
            <p className="text-sm text-gray-700">{product.description}</p>
          </DetailSection>
        )}

        <DetailSection title="Properties">
          <div className="space-y-2 text-sm">
            {product.owner && <DetailRow label="Owner" value={product.owner} />}
            {product.product_line && <DetailRow label="Product line" value={product.product_line} />}
            <DetailRow label="Lifecycle" value={formatLabel(product.lifecycle)} />
          </div>
        </DetailSection>

        <DetailSection title="Architecture">
          <ProductArchitecturePreview
            productName={product.name}
            graph={graph}
            isLoading={graphLoading}
            onExpand={() => setShowArchitecture(true)}
          />
          <p className="text-xs text-gray-400 mt-2">
            {product.system_count} system{product.system_count === 1 ? "" : "s"} ·{" "}
            {product.api_count} API{product.api_count === 1 ? "" : "s"} ·{" "}
            {product.data_store_count} data store{product.data_store_count === 1 ? "" : "s"}
          </p>
        </DetailSection>

        <DetailSection title={`Business capabilities (${linkedCapabilities.length})`}>
          {linkedCapabilities.length === 0 ? (
            <p className="text-sm text-gray-400">No capabilities mapped yet.</p>
          ) : (
            <div className="space-y-2">
              {linkedCapabilities.map((cap) => (
                <div
                  key={cap.id}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-md text-sm"
                >
                  <span className="text-gray-800 font-medium truncate">{cap.name}</span>
                  {cap.status && (
                    <span className="text-xs text-gray-400 capitalize">{cap.status.replace(/_/g, " ")}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailSection>
      </DetailPanel>

      {showArchitecture && (
        <ProductArchitectureView
          productId={productId}
          productName={product.name}
          onClose={() => setShowArchitecture(false)}
        />
      )}

      {showEditForm && (
        <ProductForm
          initialValues={product}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            onUpdate();
          }}
        />
      )}
    </>
  );
}
