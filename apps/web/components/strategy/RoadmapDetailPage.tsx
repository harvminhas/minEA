"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, MoreHorizontal, Trash2 } from "lucide-react";
import type { MinEAObject, RoadmapItemProperties, RoadmapMilestone } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import { AddMilestoneDialog } from "@/components/strategy/AddMilestoneDialog";
import { CreateRoadmapPanel } from "@/components/strategy/CreateRoadmapPanel";
import { RoadmapTimeline } from "@/components/strategy/RoadmapTimeline";
import {
  roadmapKindLabel,
  roadmapListPath,
  ROADMAP_STATUS_LABEL,
  INVESTMENT_CATEGORIES,
  defaultInvestmentCategory,
  STRATEGY_LAYER_COLOR,
  TECH_DEBT_EFFORT_LABEL,
  targetResolutionLabel,
} from "@/lib/roadmap-utils";
import { resolveRoadmapSpend } from "@/lib/investment-pipeline";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import { formatCurrency } from "@/lib/utils";

interface Props {
  roadmapId: string;
}

export function RoadmapDetailPage({ roadmapId }: Props) {
  const router = useRouter();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [milestoneDialog, setMilestoneDialog] = useState<{
    mode: "add" | "edit";
    defaultTarget?: string;
    milestone?: RoadmapMilestone;
  } | null>(null);

  const queryKey = ["object", orgSlug, workspaceSlug, roadmapId] as const;
  const listPath = roadmapListPath(orgSlug, workspaceSlug);

  const { data: roadmap, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, roadmapId, token!);
    },
    enabled,
  });

  const props = (roadmap?.properties ?? {}) as RoadmapItemProperties;
  const milestones = props.milestones ?? [];
  const kindLabel = roadmapKindLabel(props);
  const subtitleParts = [kindLabel, props.product?.product_name, roadmap?.owner].filter(Boolean);
  const spend = roadmap ? resolveRoadmapSpend(props) : null;
  const categoryValue = props.investment_category ?? defaultInvestmentCategory(props.roadmap_kind ?? "epic");
  const categoryLabel = INVESTMENT_CATEGORIES.find((c) => c.value === categoryValue)?.label;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"] });
  };

  const saveMilestones = useMutation({
    mutationFn: async (nextMilestones: RoadmapMilestone[]) => {
      if (!roadmap) throw new Error("Roadmap not loaded");
      const token = await getToken();
      const nextProps: RoadmapItemProperties = { ...props, milestones: nextMilestones };
      return objectsApi.update(
        orgSlug,
        workspaceSlug,
        roadmap.id,
        { properties: nextProps as Record<string, unknown> },
        token!
      );
    },
    onSuccess: () => {
      setMilestoneDialog(null);
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, roadmapId, token!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"] });
      router.push(listPath);
    },
  });

  if (isLoading || !enabled) {
    return <p className="p-8 text-sm text-gray-400">Loading roadmap…</p>;
  }

  if (isError || !roadmap) {
    return (
      <div className="p-8">
        <p className="text-sm text-gray-500">Roadmap item not found.</p>
        <Link href={listPath} className="text-sm text-violet-600 hover:text-violet-700 mt-2 inline-block">
          Back to roadmaps
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full min-h-0 bg-gray-50">
        <div className="px-8 pt-6 pb-5 border-b border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <nav className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
                <Link href={listPath} className="hover:text-violet-600 transition-colors">
                  Strategy
                </Link>
                <span>·</span>
                <span style={{ color: STRATEGY_LAYER_COLOR }}>Roadmap</span>
              </nav>

              <h1 className="text-2xl font-semibold text-gray-900 leading-tight">{roadmap.name}</h1>
              {subtitleParts.length > 0 && (
                <p className="text-sm text-gray-500 mt-1.5">{subtitleParts.join(" · ")}</p>
              )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowEditForm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <Edit2 size={14} />
                Edit
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMenu((v) => !v)}
                  className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                  aria-label="More actions"
                >
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-40 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMenu(false);
                          deleteMutation.mutate();
                        }}
                        disabled={deleteMutation.isPending}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="rounded-xl border border-gray-200 bg-white p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {ROADMAP_STATUS_LABEL[props.roadmap_status ?? "discovery"] ?? props.roadmap_status}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Target</p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {props.target_resolution ? targetResolutionLabel(props.target_resolution) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Effort</p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {props.effort_estimate
                  ? TECH_DEBT_EFFORT_LABEL[props.effort_estimate] ?? props.effort_estimate.toUpperCase()
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Category</p>
              <p className="text-sm font-medium text-gray-900 mt-1">{categoryLabel ?? "—"}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">AI role</p>
              <p className="text-sm font-medium text-gray-900 mt-1">{aiRoleLabel(props.ai_role)}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Spend</p>
              <p className="text-sm font-medium text-gray-900 mt-1">
                {spend && spend.amount > 0 ? (
                  <>
                    {formatCurrency(spend.amount)}
                    {spend.estimated && <span className="text-xs text-gray-400 ml-1">est</span>}
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
            {props.roadmap_status === "blocked" && props.blocked_reason?.trim() && (
              <div className="col-span-2 md:col-span-3 lg:col-span-6">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">Blocked reason</p>
                <p className="text-sm text-red-700 mt-1">{props.blocked_reason.trim()}</p>
              </div>
            )}
          </div>

          <RoadmapTimeline
            properties={props}
            milestones={milestones}
            onAddAtQuarter={(quarter) =>
              setMilestoneDialog({ mode: "add", defaultTarget: quarter })
            }
            onEditMilestone={(milestone) =>
              setMilestoneDialog({ mode: "edit", milestone })
            }
          />
        </div>
      </div>

      {showEditForm && (
        <CreateRoadmapPanel
          initialValues={roadmap}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refresh();
          }}
        />
      )}

      {milestoneDialog && (
        <AddMilestoneDialog
          initial={milestoneDialog.milestone}
          defaultTarget={milestoneDialog.defaultTarget}
          onClose={() => setMilestoneDialog(null)}
          onSave={(milestone) => {
            const next =
              milestoneDialog.mode === "edit"
                ? milestones.map((m) => (m.id === milestone.id ? milestone : m))
                : [...milestones, milestone];
            saveMilestones.mutate(next);
          }}
        />
      )}
    </>
  );
}
