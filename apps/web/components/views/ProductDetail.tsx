"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useQuery } from "@tanstack/react-query";
import { Edit2, Link2 } from "lucide-react";
import type {
  MinEAObject,
  Product,
  ProductHealthDimensions,
  ProductRoadmapItem,
  ProductTechDebtItem,
} from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, productsApi } from "@/lib/api-client";
import {
  DetailPanel,
  DetailPanelCloseButton,
  DetailSection,
} from "@/components/ui/DetailPanel";
import { ProductForm } from "@/components/views/ProductForm";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import {
  formatDebtSummary,
  formatProductCost,
  HEALTH_LABEL,
  isUnowned,
  productHealthStatus,
} from "@/lib/portfolio-utils";
import { roadmapDetailPath } from "@/lib/roadmap-utils";
import { SEVERITY_STYLE, TECH_DEBT_SEVERITY_LABEL } from "@/lib/tech-debt-utils";
import { cn } from "@/lib/utils";

const LIFECYCLE_STYLE: Record<string, string> = {
  live: "bg-emerald-50 text-emerald-700",
  beta: "bg-amber-50 text-amber-700",
  planned: "bg-gray-100 text-gray-600",
  retiring: "bg-orange-50 text-orange-700",
  retired: "bg-gray-100 text-gray-400",
};

const DIM_LABELS: { key: keyof ProductHealthDimensions; label: string }[] = [
  { key: "ops", label: "Ops" },
  { key: "debt", label: "Debt" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "ownership", label: "Ownership" },
];

const DIM_DOT: Record<string, string> = {
  healthy: "bg-emerald-500",
  warning: "bg-amber-400",
  critical: "bg-red-500",
};

const MILESTONE_SEGMENT: Record<string, string> = {
  done: "bg-emerald-500",
  in_flight: "bg-blue-500",
  not_started: "bg-gray-200",
};

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function SignalCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-stone-50 px-3 py-2.5 min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{value}</p>
    </div>
  );
}

function CompositeHealth({ product }: { product: Product }) {
  const dims = product.health_dimensions;
  const health = productHealthStatus(product);

  return (
    <div className="px-6 pb-4 space-y-3">
      <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
        {HEALTH_LABEL[health]}
      </span>
      {dims && (
        <div className="flex items-start gap-4">
          {DIM_LABELS.map(({ key, label }) => (
            <div key={key} className="flex flex-col items-center gap-1.5 min-w-[3rem]">
              <span className={cn("h-2.5 w-2.5 rounded-full", DIM_DOT[dims[key]] ?? DIM_DOT.healthy)} />
              <span className="text-[10px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TechDebtCard({
  item,
  onOpenDebt,
  onOpenRoadmap,
}: {
  item: ProductTechDebtItem;
  onOpenDebt: () => void;
  onOpenRoadmap: (roadmapId: string) => void;
}) {
  const sev = item.severity ?? "medium";
  const style = SEVERITY_STYLE[sev] ?? SEVERITY_STYLE.medium;

  return (
    <button
      type="button"
      onClick={onOpenDebt}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3.5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <span
          className={cn(
            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border",
            style.border,
            style.bg,
            style.text
          )}
        >
          {TECH_DEBT_SEVERITY_LABEL[sev] ?? sev}
        </span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wide">
          {item.debt_type_label} · {item.age_days}d open
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
      <p className="text-[11px] text-gray-500 mt-1">
        Affects: {item.affects_name} · {item.owner ?? "Unassigned"}
      </p>
      {item.remediation && (
        <p
          role="link"
          onClick={(e) => {
            e.stopPropagation();
            onOpenRoadmap(item.remediation!.roadmap_id);
          }}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-100"
        >
          <Link2 size={11} className="flex-shrink-0" />
          Planned remediation:{" "}
          <span className="font-medium text-gray-800">{item.remediation.roadmap_title}</span>
        </p>
      )}
    </button>
  );
}

function MilestoneStrip({ segments }: { segments: { status: string }[] }) {
  const display = [...segments.slice(0, 4)];
  while (display.length < 4) display.push({ status: "not_started" });

  return (
    <div className="flex gap-1 mt-3">
      {display.map((seg, i) => (
        <div
          key={i}
          className={cn("h-1.5 flex-1 rounded-full", MILESTONE_SEGMENT[seg.status] ?? MILESTONE_SEGMENT.not_started)}
        />
      ))}
    </div>
  );
}

function RoadmapCard({ item, onOpen }: { item: ProductRoadmapItem; onOpen: () => void }) {
  const next = item.next_milestone;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-gray-200 bg-white p-3.5 hover:border-gray-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
        <span className="text-[10px] font-semibold uppercase text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded">
          {item.kind_label}
        </span>
        <span className="text-[10px] font-medium text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded uppercase">
          {item.status_label}
        </span>
        <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{item.target_label}</span>
        {item.owner && (
          <span className="text-[10px] text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded truncate max-w-[8rem]">
            {item.owner}
          </span>
        )}
      </div>
      <p className="text-sm font-semibold text-gray-900">{item.name}</p>
      <MilestoneStrip segments={item.milestone_strip} />
      {item.milestones_total > 0 && (
        <p className="text-[11px] text-gray-500 mt-2">
          {item.milestones_done} of {item.milestones_total} milestones done
          {next ? ` · next: ${next.title} (${next.target_label})` : ""}
        </p>
      )}
    </button>
  );
}

interface Props {
  productId: string;
  accentColor?: string;
  onClose: () => void;
  onUpdate: () => void;
}

export function ProductDetail({ productId, accentColor = "#6366f1", onClose, onUpdate }: Props) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [showEditForm, setShowEditForm] = useState(false);
  const [selectedDebtId, setSelectedDebtId] = useState<string | null>(null);
  const [showCreateDebt, setShowCreateDebt] = useState(false);

  const { data: product, isLoading, refetch } = useQuery({
    queryKey: ["product", orgSlug, workspaceSlug, productId],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.get(orgSlug, workspaceSlug, productId, token!);
    },
  });

  const { data: selectedDebt } = useQuery({
    queryKey: ["object", orgSlug, workspaceSlug, selectedDebtId],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, selectedDebtId!, token!);
    },
    enabled: !!selectedDebtId,
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

  const openRoadmap = (roadmapId: string) => {
    onClose();
    router.push(roadmapDetailPath(orgSlug, workspaceSlug, roadmapId));
  };

  const unowned = product ? isUnowned(product) : false;
  const debtItems = product?.tech_debt_items ?? [];
  const roadmapItems = product?.roadmap_items ?? [];
  const activeRoadmaps = roadmapItems.filter(
    (r) => r.status !== "delivered" && r.status !== "cancelled"
  ).length;

  const productRef = product
    ? { product_id: product.id, product_name: product.name }
    : null;

  const refreshProduct = () => {
    refetch();
    onUpdate();
  };

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
        <p className="text-sm text-gray-400 px-6">Loading product…</p>
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
                <p className="text-sm text-gray-400">Product · Layer 1</p>
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
                className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"
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
              {product.trend_label ?? "No recent changes"} · Updated{" "}
              {new Date(product.updated_at).toLocaleDateString()}
            </p>
          </div>
        }
      >
        <DetailSection title="Health">
          <CompositeHealth product={product} />
        </DetailSection>

        <DetailSection title="Signals">
          <div className="px-6 pb-4 flex gap-2">
            <SignalCard label="Tech debt" value={formatDebtSummary(product)} />
            <SignalCard label="Cost / yr" value={formatProductCost(product.annual_cost_total)} />
            <SignalCard label="Roadmap" value={activeRoadmaps > 0 ? `${activeRoadmaps} active` : "None"} />
          </div>
        </DetailSection>

        <DetailSection
          title={`Tech debt (${debtItems.length})`}
          action={
            <button
              type="button"
              onClick={() => setShowCreateDebt(true)}
              className="text-[11px] font-medium text-indigo-600 hover:text-indigo-700"
            >
              + Add
            </button>
          }
        >
          <div className="px-6 pb-4 space-y-2">
            {debtItems.length === 0 ? (
              <p className="text-sm text-gray-400">No open tech debt rolled up to this product.</p>
            ) : (
              debtItems.map((item) => (
                <TechDebtCard
                  key={item.id}
                  item={item}
                  onOpenDebt={() => setSelectedDebtId(item.id)}
                  onOpenRoadmap={openRoadmap}
                />
              ))
            )}
          </div>
        </DetailSection>

        <DetailSection title={`Roadmap (${activeRoadmaps} active)`}>
          <div className="px-6 pb-4 space-y-2">
            {roadmapItems.length === 0 ? (
              <p className="text-sm text-gray-400">No roadmap items for this product yet.</p>
            ) : (
              roadmapItems.map((item) => (
                <RoadmapCard key={item.id} item={item} onOpen={() => openRoadmap(item.id)} />
              ))
            )}
          </div>
        </DetailSection>

        {product.description && (
          <DetailSection title="Description">
            <p className="text-sm text-gray-700 px-6 pb-4">{product.description}</p>
          </DetailSection>
        )}

        <DetailSection title="Properties">
          <div className="px-6 pb-4 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">Owner</span>
              {unowned ? (
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Assign a team →
                </button>
              ) : (
                <span className="text-gray-900 font-medium">{product.owner}</span>
              )}
            </div>
            {product.product_line && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-gray-500">Product line</span>
                <span className="text-gray-900">{product.product_line}</span>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">Lifecycle</span>
              <span className="text-gray-900 capitalize">{formatLabel(product.lifecycle)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-gray-500">Coverage</span>
              <span className="text-gray-900 text-right">
                {product.system_count} system{product.system_count === 1 ? "" : "s"} · {product.api_count} API
                {product.api_count === 1 ? "" : "s"} · {product.capability_count} capabilit
                {product.capability_count === 1 ? "y" : "ies"}
              </span>
            </div>
          </div>
        </DetailSection>

        <DetailSection title={`Business capabilities (${linkedCapabilities.length})`}>
          {linkedCapabilities.length === 0 ? (
            <p className="text-sm text-gray-400 px-6 pb-4">No capabilities mapped yet.</p>
          ) : (
            <div className="space-y-1.5 px-6 pb-4">
              {linkedCapabilities.map((cap) => (
                <div
                  key={cap.id}
                  className="flex items-center justify-between py-2 px-3 bg-stone-50 rounded-md text-sm"
                >
                  <span className="text-gray-800 font-medium truncate">{cap.name}</span>
                  {cap.status && (
                    <span className="text-xs text-gray-400 capitalize ml-2 flex-shrink-0">
                      {cap.status.replace(/_/g, " ")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </DetailSection>
      </DetailPanel>

      {showEditForm && (
        <ProductForm
          initialValues={product}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refetch();
            onUpdate();
          }}
        />
      )}

      {showCreateDebt && productRef && (
        <CreateTechDebtPanel
          scopedProduct={productRef}
          defaultOwner={unowned ? undefined : product.owner ?? undefined}
          onClose={() => setShowCreateDebt(false)}
          onSuccess={() => {
            setShowCreateDebt(false);
            refreshProduct();
          }}
        />
      )}

      {selectedDebt && selectedDebtId && (
        <TechDebtDetail
          techDebt={selectedDebt as MinEAObject}
          onClose={() => setSelectedDebtId(null)}
          onDelete={() => {
            setSelectedDebtId(null);
            refetch();
            onUpdate();
          }}
          onUpdate={() => {
            refetch();
            onUpdate();
          }}
        />
      )}
    </>
  );
}
