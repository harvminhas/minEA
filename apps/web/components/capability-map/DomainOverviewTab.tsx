"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import type { CapabilityMapCapability, DomainDetail, MinEAObject } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { FitnessHealthBar, FitnessLegend } from "@/components/capability-map/DomainFitnessBar";
import { capabilityCoverageDisplay } from "@/lib/capability-map-card-utils";
import {
  capabilityFitnessCounts,
  roadmapsForDomain,
  type DomainGapItem,
} from "@/lib/domain-overview-utils";
import { formFieldClass, FormDrawer } from "@/components/ui/FormDrawer";
import { RoadmapDetailModal } from "@/components/strategy/RoadmapDetailModal";
import {
  roadmapCardFromObject,
  ROADMAP_MILESTONE_SEGMENT,
} from "@/lib/roadmap-utils";
import { useTenancy } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { cn } from "@/lib/utils";

type DomainTab = "overview" | "mapping" | "processes" | "products" | "history";

interface Props {
  domain: DomainDetail;
  onSwitchTab: (tab: DomainTab) => void;
  onEditCapability?: (capability: CapabilityMapCapability) => void;
  onRefresh: () => void;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
    </div>
  );
}

function SectionCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white", className)}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {action}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function TabLinkButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
    >
      {label}
      <ArrowUpRight size={12} />
    </button>
  );
}

function CapabilityRow({
  capability,
  onEdit,
}: {
  capability: CapabilityMapCapability;
  onEdit?: () => void;
}) {
  const coverage = capabilityCoverageDisplay(capability);
  const unowned = !capability.owner?.trim();
  const className =
    "w-full flex items-center justify-between gap-3 py-2.5 text-left -mx-2 px-2 rounded-lg transition-colors";
  const content = (
    <>
      <div className="min-w-0 flex items-start gap-2.5">
        <span className={cn("mt-1.5 h-2 w-2 rounded-full flex-shrink-0", coverage.dot)} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{capability.name}</p>
          <p className={cn("text-xs mt-0.5", unowned ? "text-red-600 font-medium" : "text-gray-500")}>
            {unowned ? "Unassigned" : capability.owner}
          </p>
        </div>
      </div>
      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium flex-shrink-0", coverage.badge)}>
        {coverage.label}
      </span>
    </>
  );

  if (!onEdit) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" onClick={onEdit} className={cn(className, "hover:bg-gray-50")}>
      {content}
    </button>
  );
}

function RoadmapPreview({ item, onOpen }: { item: MinEAObject; onOpen: () => void }) {
  const model = roadmapCardFromObject(item);
  const nextTarget = model.nextMilestone?.target_label ?? "";

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left rounded-lg border border-gray-200 p-4 hover:border-violet-200 hover:bg-violet-50/30 transition-colors"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] font-medium bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">
          {model.kindLabel}
        </span>
        <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
          {model.statusLabel}
        </span>
      </div>
      <p className="text-sm font-semibold text-gray-900 mt-2">{model.name}</p>
      {model.milestonesTotal > 0 && (
        <div className="mt-3 space-y-2">
          <div className="flex gap-1">
            {model.milestoneStrip.map((seg, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  ROADMAP_MILESTONE_SEGMENT[seg.status] ?? ROADMAP_MILESTONE_SEGMENT.not_started
                )}
              />
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {model.milestonesDone} of {model.milestonesTotal} segments
            {nextTarget ? ` · ${nextTarget}` : ""}
          </p>
        </div>
      )}
    </button>
  );
}

export function DomainOverviewTab({ domain, onSwitchTab, onEditCapability, onRefresh }: Props) {
  const { canEdit } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [showDescriptionEdit, setShowDescriptionEdit] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState(domain.description ?? "");
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string | null>(null);

  const fitnessCounts = useMemo(() => capabilityFitnessCounts(domain), [domain]);

  const sortedCapabilities = useMemo(() => {
    return [...domain.capabilities].sort((a, b) => {
      const aGap = (a.system_count ?? 0) === 0 ? 1 : 0;
      const bGap = (b.system_count ?? 0) === 0 ? 1 : 0;
      if (aGap !== bGap) return aGap - bGap;
      return a.name.localeCompare(b.name);
    });
  }, [domain.capabilities]);

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ["domain-products", orgSlug, workspaceSlug, domain.id],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.getDomainProducts(orgSlug, workspaceSlug, domain.id, token!);
    },
  });

  const { data: roadmapsData, isLoading: roadmapsLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "roadmap_item" }, token!);
    },
  });

  const linkedProducts = productsData?.items ?? [];
  const linkedProductIds = useMemo(
    () => new Set(linkedProducts.map((p) => p.id)),
    [linkedProducts]
  );

  const domainRoadmaps = useMemo(() => {
    const items = roadmapsData?.items ?? [];
    return roadmapsForDomain(items, linkedProductIds);
  }, [roadmapsData?.items, linkedProductIds]);

  const saveDescriptionMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.update(
        orgSlug,
        workspaceSlug,
        domain.id,
        { description: descriptionDraft.trim() || undefined },
        token!
      );
    },
    onSuccess: () => {
      setShowDescriptionEdit(false);
      onRefresh();
    },
  });

  const gaps: DomainGapItem[] = useMemo(() => {
    const items: DomainGapItem[] = [];
    for (const cap of domain.capabilities) {
      if ((cap.system_count ?? 0) === 0) {
        items.push({
          id: `no-system-${cap.id}`,
          severity: "error",
          message: `${cap.name} has no system mapped`,
          fixLabel: "Fix",
          onFix: () => onSwitchTab("mapping"),
        });
      } else if (!cap.owner?.trim()) {
        items.push({
          id: `unowned-${cap.id}`,
          severity: "error",
          message: `${cap.name} has no owner assigned`,
          fixLabel: "Fix",
          onFix: onEditCapability ? () => onEditCapability(cap) : undefined,
        });
      }
    }
    if (!domain.description?.trim()) {
      items.push({
        id: "no-description",
        severity: "warning",
        message: "Domain has no description",
        fixLabel: "Fix",
        onFix: canEdit
          ? () => {
              setDescriptionDraft("");
              setShowDescriptionEdit(true);
            }
          : undefined,
      });
    }
    return items;
  }, [domain, onSwitchTab, onEditCapability]);

  return (
    <>
      <div className="p-8 space-y-6 max-w-6xl">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Capabilities"
            value={domain.stats.capability_count}
            hint={
              domain.stats.gap_count === 0
                ? "no gaps"
                : `${domain.stats.gap_count} gap${domain.stats.gap_count === 1 ? "" : "s"}`
            }
          />
          <StatCard
            label="Systems"
            value={domain.stats.mapped_system_count}
            hint="mapped"
          />
          <StatCard
            label="Products"
            value={productsLoading ? "…" : linkedProducts.length}
            hint="consuming"
          />
          <StatCard
            label="Roadmap"
            value={roadmapsLoading ? "…" : domainRoadmaps.length}
            hint={`active item${domainRoadmaps.length === 1 ? "" : "s"}`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard
            title="Capabilities"
            action={<TabLinkButton label="View mapping" onClick={() => onSwitchTab("mapping")} />}
          >
            <div className="space-y-4">
              <FitnessHealthBar counts={fitnessCounts} total={domain.capabilities.length} />
              <FitnessLegend counts={fitnessCounts} />
              <div className="divide-y divide-gray-100">
                {sortedCapabilities.length === 0 ? (
                  <p className="text-sm text-gray-400 italic py-2">No capabilities yet</p>
                ) : (
                  sortedCapabilities.map((cap) => (
                    <CapabilityRow
                      key={cap.id}
                      capability={cap}
                      onEdit={onEditCapability ? () => onEditCapability(cap) : undefined}
                    />
                  ))
                )}
              </div>
            </div>
          </SectionCard>

          <div className="space-y-6">
            <SectionCard
              title="Description"
              action={
                canEdit ? (
                  <button
                    type="button"
                    onClick={() => {
                      setDescriptionDraft(domain.description ?? "");
                      setShowDescriptionEdit(true);
                    }}
                    className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Edit
                  </button>
                ) : undefined
              }
            >
              <p className="text-sm text-gray-600 leading-relaxed">
                {domain.description?.trim() ||
                  "No description yet — add one to help your team understand the scope of this domain."}
              </p>
            </SectionCard>

            <SectionCard
              title="Systems"
              action={<TabLinkButton label="View all" onClick={() => onSwitchTab("mapping")} />}
            >
              {domain.systems.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No systems on the mapping grid yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {domain.systems.map((system) => (
                    <span
                      key={system.id}
                      className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700"
                    >
                      {system.name}
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Products"
              action={<TabLinkButton label="View all" onClick={() => onSwitchTab("products")} />}
            >
              {productsLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : linkedProducts.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No products linked yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {linkedProducts.map((product) => (
                    <span
                      key={product.id}
                      className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm font-medium text-gray-700"
                    >
                      {product.name}
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Roadmap">
              {roadmapsLoading ? (
                <p className="text-sm text-gray-400">Loading…</p>
              ) : domainRoadmaps.length === 0 ? (
                <p className="text-sm text-gray-400 italic">
                  No active roadmap items for products in this domain
                </p>
              ) : (
                <div className="space-y-3">
                  {domainRoadmaps.map((item) => (
                    <RoadmapPreview
                      key={item.id}
                      item={item}
                      onOpen={() => setSelectedRoadmapId(item.id)}
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {gaps.length > 0 && (
          <SectionCard
            title="Gaps"
            action={<TabLinkButton label="View all" onClick={() => onSwitchTab("mapping")} />}
          >
            <ul className="space-y-3">
              {gaps.map((gap) => (
                <li key={gap.id} className="flex items-center justify-between gap-4">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className={cn(
                        "mt-1.5 h-2 w-2 rounded-full flex-shrink-0",
                        gap.severity === "error" ? "bg-red-500" : "bg-amber-400"
                      )}
                    />
                    <p className="text-sm text-gray-700">{gap.message}</p>
                  </div>
                  {gap.onFix && (
                    <button
                      type="button"
                      onClick={gap.onFix}
                      className="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex-shrink-0"
                    >
                      {gap.fixLabel} →
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>

      {canEdit && showDescriptionEdit && (
        <FormDrawer
          title="Edit domain description"
          onClose={() => setShowDescriptionEdit(false)}
          onSubmit={() => saveDescriptionMutation.mutate()}
          submitLabel="Save"
          isSubmitting={saveDescriptionMutation.isPending}
          error={saveDescriptionMutation.isError ? (saveDescriptionMutation.error as Error).message : null}
        >
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1.5 block">Description</span>
            <textarea
              value={descriptionDraft}
              onChange={(e) => setDescriptionDraft(e.target.value)}
              rows={6}
              className={cn(formFieldClass, "resize-y min-h-[120px]")}
              placeholder="What does this domain cover?"
            />
          </label>
        </FormDrawer>
      )}

      {selectedRoadmapId && (
        <RoadmapDetailModal
          roadmapId={selectedRoadmapId}
          onClose={() => {
            setSelectedRoadmapId(null);
            onRefresh();
          }}
        />
      )}
    </>
  );
}
