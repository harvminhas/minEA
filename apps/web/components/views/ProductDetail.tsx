"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Link2, Trash2 } from "lucide-react";
import type {
  MinEAObject,
  Product,
  ProductIntegrationItem,
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
import { ConfirmDeleteDialog } from "@/components/ui/ConfirmDeleteDialog";
import { EntityHistoryPanel } from "@/components/shared/EntityHistory";
import { invalidateProductQueries } from "@/lib/product-queries";
import { ProductForm } from "@/components/views/ProductForm";
import { ProductIntegrationsSummary } from "@/components/views/ProductIntegrationsSummary";
import { ProductSignalDots } from "@/components/views/ProductSignalDots";
import { CreateTechDebtPanel } from "@/components/risk/CreateTechDebtPanel";
import { TechDebtDetail } from "@/components/risk/TechDebtDetail";
import {
  formatDebtCockpit,
  formatProductCost,
  formatProductCoverageLine,
  isUnowned,
  roadmapStatusLabel,
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

const MILESTONE_SEGMENT: Record<string, string> = {
  done: "bg-emerald-500",
  in_flight: "bg-blue-500",
  not_started: "bg-gray-200",
};

type ProductDetailTab = "details" | "roadmap_debt" | "history";

const PRODUCT_DETAIL_TABS: { id: ProductDetailTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "roadmap_debt", label: "Roadmap & Debt" },
  { id: "history", label: "History" },
];

function formatLabel(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProductIntegrationDetail({ product }: { product: Product }) {
  const [view, setView] = useState<"provided" | "consumed">("provided");
  const providedCount = product.apis_provided?.length ?? 0;
  const consumedCount = product.apis_consumed?.length ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView("provided")}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
            view === "provided"
              ? "border-indigo-200 bg-indigo-50 text-indigo-800"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          )}
        >
          APIs provided ({providedCount})
        </button>
        <button
          type="button"
          onClick={() => setView("consumed")}
          className={cn(
            "rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
            view === "consumed"
              ? "border-indigo-200 bg-indigo-50 text-indigo-800"
              : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
          )}
        >
          APIs consumed ({consumedCount})
        </button>
      </div>
      {view === "provided" ? (
        <IntegrationSubsection title="APIs provided" items={product.apis_provided} variant="owned" />
      ) : (
        <IntegrationSubsection title="APIs consumed" items={product.apis_consumed} variant="dependency" />
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <IntegrationSubsection
          title="Events produced"
          items={product.events_produced}
          variant="owned"
        />
        <IntegrationSubsection
          title="Events subscribed"
          items={product.events_subscribed}
          variant="dependency"
        />
        <IntegrationSubsection title="Flows in" items={product.flows_in} variant="dependency" />
        <IntegrationSubsection title="Flows out" items={product.flows_out} variant="owned" />
      </div>
      <IntegrationSubsection
        title="Data stores touched"
        items={product.data_stores}
        variant="owned"
      />
    </div>
  );
}

function IntegrationSubsection({
  title,
  items,
  variant,
}: {
  title: string;
  items?: ProductIntegrationItem[];
  variant: "owned" | "dependency";
}) {
  const list = items ?? [];
  const headerClass =
    variant === "owned"
      ? "text-violet-800 bg-violet-50 border-violet-100"
      : "text-amber-800 bg-amber-50 border-amber-100";

  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <div className={cn("px-3 py-2 text-xs font-semibold border-b", headerClass)}>
        {title} ({list.length})
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-gray-400 px-3 py-2.5">None</p>
      ) : (
        <ul className="divide-y divide-gray-50">
          {list.map((item) => (
            <li key={item.id} className="px-3 py-2 text-sm text-gray-800 truncate">
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignalCard({
  label,
  value,
  subtext,
  valueClassName,
}: {
  label: string;
  value: string;
  subtext?: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-stone-50 px-3 py-2.5 min-w-0 flex-1">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className={cn("text-sm font-semibold mt-0.5 truncate", valueClassName ?? "text-gray-900")}>
        {value}
      </p>
      {subtext && <p className="text-[11px] text-gray-400 truncate mt-0.5">{subtext}</p>}
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
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProductDetailTab>("details");
  const [showEditForm, setShowEditForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["product-history", orgSlug, workspaceSlug, productId],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.history(orgSlug, workspaceSlug, productId, token!);
    },
    enabled: activeTab === "history",
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
  const debtCockpit = product ? formatDebtCockpit(product) : null;

  const productRef = product
    ? { product_id: product.id, product_name: product.name }
    : null;

  const refreshProduct = () => {
    refetch();
    void queryClient.invalidateQueries({
      queryKey: ["product-history", orgSlug, workspaceSlug, productId],
    });
    onUpdate();
  };

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      return productsApi.delete(orgSlug, workspaceSlug, productId, token);
    },
    onSuccess: () => {
      setShowDeleteConfirm(false);
      invalidateProductQueries(queryClient, orgSlug, workspaceSlug);
      onUpdate();
      onClose();
    },
  });

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
          <div className="border-b border-gray-100">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                >
                  {product.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h2 className="font-semibold text-gray-900 truncate">{product.name}</h2>
                  <p className="text-sm text-gray-400">
                    Product · {product.owner ?? "Unassigned"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowEditForm(true)}
                  className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 hover:text-gray-700 transition-colors"
                  aria-label="Edit product"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="p-1.5 rounded-md hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                  aria-label="Delete product"
                >
                  <Trash2 size={14} />
                </button>
                <DetailPanelCloseButton onClose={onClose} />
              </div>
            </div>
            {/* Tab bar */}
            <div className="flex px-6 gap-4 overflow-x-auto">
              {PRODUCT_DETAIL_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "pb-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex-shrink-0",
                    activeTab === tab.id
                      ? "border-indigo-600 text-indigo-700"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        }
        footer={
          activeTab === "details" ? (
            <div className="border-t border-gray-100 px-6 py-3">
              <p className="text-xs text-gray-400">
                {product.trend_label ?? "No recent changes"} · Updated{" "}
                {new Date(product.updated_at).toLocaleDateString()}
              </p>
            </div>
          ) : null
        }
      >
        {activeTab === "history" && (
          <EntityHistoryPanel
            entries={historyData?.entries ?? []}
            isLoading={historyLoading}
          />
        )}

        {activeTab === "details" && (
          <>
            <DetailSection title="Signals">
              <div className="space-y-4">
                <ProductSignalDots product={product} />
                <div className="flex gap-2">
                  <SignalCard
                    label="Tech debt"
                    value={debtCockpit?.value ?? "—"}
                    subtext={debtCockpit?.subtext}
                    valueClassName={
                      debtCockpit?.critical
                        ? "text-red-700"
                        : debtCockpit?.value === "None open"
                          ? "text-gray-700"
                          : "text-gray-900"
                    }
                  />
                  <SignalCard label="Cost / yr" value={formatProductCost(product.annual_cost_total)} />
                  <SignalCard
                    label="Roadmap"
                    value={roadmapStatusLabel(product.roadmap_status)}
                    subtext={activeRoadmaps > 0 ? `${activeRoadmaps} active` : undefined}
                  />
                </div>
              </div>
            </DetailSection>

            <DetailSection title="Properties">
              <div className="space-y-3 text-sm">
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
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                      LIFECYCLE_STYLE[product.lifecycle] ?? LIFECYCLE_STYLE.planned
                    )}
                  >
                    {formatLabel(product.lifecycle)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-gray-500">Coverage</span>
                  <span className="text-gray-900 text-right">{formatProductCoverageLine(product)}</span>
                </div>
                {product.description && (
                  <div className="pt-2 border-t border-gray-100">
                    <p className="text-gray-500 text-xs mb-1">Description</p>
                    <p className="text-gray-800">{product.description}</p>
                  </div>
                )}
              </div>
            </DetailSection>

            <DetailSection
              title={`Business capabilities · ${linkedCapabilities.length}`}
            >
              {linkedCapabilities.length === 0 ? (
                <p className="text-sm text-gray-400">No capabilities mapped yet.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {linkedCapabilities.map((cap) => (
                    <span
                      key={cap.id}
                      className="inline-block rounded-full bg-violet-50 border border-violet-100 px-2.5 py-1 text-xs font-medium text-violet-800"
                    >
                      {cap.name}
                    </span>
                  ))}
                </div>
              )}
            </DetailSection>

            <ProductIntegrationsSummary product={product} />
          </>
        )}

        {activeTab === "roadmap_debt" && (
          <>
            <DetailSection
              title={`Roadmap · ${activeRoadmaps} active`}
            >
              <div className="space-y-2">
                {roadmapItems.length === 0 ? (
                  <p className="text-sm text-gray-400">No roadmap items for this product yet.</p>
                ) : (
                  roadmapItems.map((item) => (
                    <RoadmapCard key={item.id} item={item} onOpen={() => openRoadmap(item.id)} />
                  ))
                )}
              </div>
            </DetailSection>

            <DetailSection
              title={`Tech debt · ${debtItems.length}`}
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
              <div className="space-y-2">
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

            <DetailSection title="Integration detail">
              <ProductIntegrationDetail product={product} />
            </DetailSection>
          </>
        )}
      </DetailPanel>

      {showDeleteConfirm && (
        <ConfirmDeleteDialog
          title="Delete product?"
          message={
            <>
              <span className="font-medium text-gray-700">{product.name}</span> will be permanently
              removed from this workspace, including its capability links and history.
            </>
          }
          confirmLabel="Delete product"
          isPending={deleteMutation.isPending}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}

      {showEditForm && (
        <ProductForm
          initialValues={product}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refreshProduct();
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
            refreshProduct();
          }}
          onUpdate={() => {
            refreshProduct();
          }}
        />
      )}
    </>
  );
}
