"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, ExternalLink, MoreHorizontal, Trash2, X } from "lucide-react";
import type { RoadmapItemProperties, RoadmapSegment, RoadmapTimelineView, RoadmapTrack } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  RoadmapTrackSegmentDrawer,
  type RoadmapTimelineDrawer,
} from "@/components/strategy/RoadmapTrackSegmentDrawer";
import { CreateRoadmapPanel } from "@/components/strategy/CreateRoadmapPanel";
import { DeleteRoadmapConfirmDialog } from "@/components/strategy/DeleteRoadmapConfirmDialog";
import { RoadmapTimeline } from "@/components/strategy/RoadmapTimeline";
import { RoadmapTimelineFullscreen } from "@/components/strategy/RoadmapTimelineFullscreen";
import {
  roadmapDetailPath,
  roadmapKindLabel,
  roadmapListPath,
  ROADMAP_STATUS_LABEL,
  INVESTMENT_CATEGORIES,
  defaultInvestmentCategory,
  STRATEGY_LAYER_COLOR,
  TECH_DEBT_EFFORT_LABEL,
  formatRoadmapTimelineLabel,
  resolveTimelineBinding,
  tracksFromProperties,
} from "@/lib/roadmap-utils";
import { resolveRoadmapSpend } from "@/lib/investment-pipeline";
import { aiRoleLabel } from "@/lib/ai-role-utils";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

interface Props {
  roadmapId: string;
  layout?: "page" | "modal";
  onClose?: () => void;
}

export function RoadmapDetailContent({ roadmapId, layout = "page", onClose }: Props) {
  const router = useRouter();
  const { canEdit, canDelete } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();

  const [showEditForm, setShowEditForm] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [timelineFullscreen, setTimelineFullscreen] = useState(false);
  const [timelineDrawer, setTimelineDrawer] = useState<RoadmapTimelineDrawer | null>(null);

  const queryKey = ["object", orgSlug, workspaceSlug, roadmapId] as const;
  const listPath = roadmapListPath(orgSlug, workspaceSlug);
  const fullPagePath = roadmapDetailPath(orgSlug, workspaceSlug, roadmapId);

  const { data: roadmap, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.get(orgSlug, workspaceSlug, roadmapId, token!);
    },
    enabled,
  });

  const props = (roadmap?.properties ?? {}) as RoadmapItemProperties;
  const tracks = tracksFromProperties(props);
  const timelineBinding = useMemo(() => resolveTimelineBinding(props, tracks), [props, tracks]);
  const kindLabel = roadmapKindLabel(props);
  const subtitleParts = [kindLabel, props.product?.product_name, roadmap?.owner].filter(Boolean);
  const spend = roadmap ? resolveRoadmapSpend(props) : null;
  const categoryValue = props.investment_category ?? defaultInvestmentCategory(props.roadmap_kind ?? "epic");
  const categoryLabel = INVESTMENT_CATEGORIES.find((c) => c.value === categoryValue)?.label;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"] });
  };

  const saveTracks = useMutation({
    mutationFn: async (nextTracks: RoadmapTrack[]) => {
      if (!roadmap) throw new Error("Roadmap not loaded");
      const token = await getToken();
      // Tracks replace legacy milestones; clear them on first write.
      const nextProps: RoadmapItemProperties = { ...props, tracks: nextTracks, milestones: [] };
      return objectsApi.update(
        orgSlug,
        workspaceSlug,
        roadmap.id,
        { properties: nextProps as Record<string, unknown> },
        token!
      );
    },
    onSuccess: () => {
      setTimelineDrawer(null);
      refresh();
    },
  });

  const saveTimelineView = useMutation({
    mutationFn: async (view: RoadmapTimelineView) => {
      if (!roadmap) throw new Error("Roadmap not loaded");
      const token = await getToken();
      const nextProps: RoadmapItemProperties = { ...props, timeline_view: view };
      return objectsApi.update(
        orgSlug,
        workspaceSlug,
        roadmap.id,
        { properties: nextProps as Record<string, unknown> },
        token!
      );
    },
    onSuccess: refresh,
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      return objectsApi.delete(orgSlug, workspaceSlug, roadmapId, token!);
    },
    onSuccess: () => {
      setDeleteError(null);
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "roadmap_item"] });
      if (layout === "modal") {
        onClose?.();
      } else {
        router.push(listPath);
      }
    },
    onError: (err) => {
      setShowDeleteConfirm(false);
      setDeleteError(err instanceof Error ? err.message : "Could not delete roadmap");
    },
  });

  if (isLoading || !enabled) {
    return (
      <p className={cn("text-sm text-gray-400", layout === "page" ? "p-8" : "p-6")}>
        Loading roadmap…
      </p>
    );
  }

  if (isError || !roadmap) {
    return (
      <div className={layout === "page" ? "p-8" : "p-6"}>
        <p className="text-sm text-gray-500">Roadmap item not found.</p>
        {layout === "page" ? (
          <Link href={listPath} className="text-sm text-violet-600 hover:text-violet-700 mt-2 inline-block">
            Back to roadmaps
          </Link>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-violet-600 hover:text-violet-700 mt-2"
          >
            Close
          </button>
        )}
      </div>
    );
  }

  const header = (
    <div
      className={cn(
        "border-b border-gray-200 bg-white flex-shrink-0",
        layout === "page" ? "px-8 pt-6 pb-5" : "px-5 py-4"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {layout === "page" ? (
            <nav className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
              <Link href={listPath} className="hover:text-violet-600 transition-colors">
                Strategy
              </Link>
              <span>·</span>
              <span style={{ color: STRATEGY_LAYER_COLOR }}>Roadmap</span>
            </nav>
          ) : (
            <p
              className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1"
              style={{ color: STRATEGY_LAYER_COLOR }}
            >
              Roadmap item
            </p>
          )}

          <h1
            className={cn(
              "font-semibold text-gray-900 leading-tight",
              layout === "page" ? "text-2xl" : "text-lg"
            )}
          >
            {roadmap.name}
          </h1>
          {subtitleParts.length > 0 && (
            <p className="text-sm text-gray-500 mt-1.5">{subtitleParts.join(" · ")}</p>
          )}
          {deleteError && (
            <p className="text-sm text-red-600 mt-2">{deleteError}</p>
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {layout === "modal" && (
            <Link
              href={fullPagePath}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
            >
              <ExternalLink size={12} />
              Open full page
            </Link>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowEditForm(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 rounded-md border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              <Edit2 size={14} />
              Edit
            </button>
          )}

          {canDelete && (
            <div className={cn("relative", showMenu && "z-[120]")}>
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setShowMenu((v) => !v);
                }}
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                aria-label="More actions"
              >
                <MoreHorizontal size={16} />
              </button>
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-[110]" onClick={() => setShowMenu(false)} />
                  <div className="absolute right-0 top-full mt-1 z-[120] w-40 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setShowMenu(false);
                        setDeleteError(null);
                        setShowDeleteConfirm(true);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {layout === "modal" && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const body = (
    <div
      className={cn(
        "space-y-6",
        layout === "page"
          ? "p-8"
          : "flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      )}
    >
      <div className="rounded-xl border border-gray-200 bg-white p-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {ROADMAP_STATUS_LABEL[props.roadmap_status ?? "discovery"] ?? props.roadmap_status}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Timeline</p>
          <p className="text-sm font-medium text-gray-900 mt-1">
            {formatRoadmapTimelineLabel(props)}
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
        tracks={tracks}
        timelineBinding={timelineBinding}
        timelineView={props.timeline_view}
        onTimelineViewChange={canEdit ? (view) => saveTimelineView.mutate(view) : undefined}
        onAddTrack={canEdit ? () => setTimelineDrawer({ mode: "add-track" }) : undefined}
        onEditTrack={canEdit ? (track) => setTimelineDrawer({ mode: "edit-track", track }) : undefined}
        onAddSegment={
          canEdit
            ? (trackId, defaults) =>
                setTimelineDrawer({ mode: "add-segment", trackId, startDate: defaults.startDate })
            : undefined
        }
        onEditSegment={
          canEdit
            ? (trackId, segment) => setTimelineDrawer({ mode: "edit-segment", trackId, segment })
            : undefined
        }
        onExpand={() => setTimelineFullscreen(true)}
        saving={saveTracks.isPending || saveTimelineView.isPending}
      />
    </div>
  );

  const overlays = (
    <>
      {timelineFullscreen && (
        <RoadmapTimelineFullscreen
          title={roadmap.name}
          subtitle={subtitleParts.join(" · ")}
          tracks={tracks}
          timelineBinding={timelineBinding}
          timelineView={props.timeline_view}
          onClose={() => setTimelineFullscreen(false)}
          onTimelineViewChange={canEdit ? (view) => saveTimelineView.mutate(view) : undefined}
          onAddTrack={canEdit ? () => setTimelineDrawer({ mode: "add-track" }) : undefined}
          onEditTrack={canEdit ? (track) => setTimelineDrawer({ mode: "edit-track", track }) : undefined}
          onAddSegment={
            canEdit
              ? (trackId, defaults) =>
                  setTimelineDrawer({ mode: "add-segment", trackId, startDate: defaults.startDate })
              : undefined
          }
          onEditSegment={
            canEdit
              ? (trackId, segment) => setTimelineDrawer({ mode: "edit-segment", trackId, segment })
              : undefined
          }
          saving={saveTracks.isPending || saveTimelineView.isPending}
        />
      )}

      {canEdit && showEditForm && (
        <CreateRoadmapPanel
          initialValues={roadmap}
          onClose={() => setShowEditForm(false)}
          onSuccess={() => {
            setShowEditForm(false);
            refresh();
          }}
        />
      )}

      {canEdit && timelineDrawer && (
        <RoadmapTrackSegmentDrawer
          state={timelineDrawer}
          tracks={tracks}
          timelineBinding={timelineBinding}
          onClose={() => setTimelineDrawer(null)}
          onSave={(next) => saveTracks.mutate(next)}
          saving={saveTracks.isPending}
        />
      )}

      {canDelete && showDeleteConfirm && roadmap && (
        <DeleteRoadmapConfirmDialog
          roadmap={roadmap}
          tracks={tracks}
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={() => deleteMutation.mutate()}
          isPending={deleteMutation.isPending}
        />
      )}
    </>
  );

  if (layout === "modal") {
    return (
      <>
        <div className="flex flex-col min-h-0 flex-1">
          {header}
          {body}
        </div>
        {overlays}
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col min-h-0 bg-gray-50">
        {header}
        {body}
      </div>
      {overlays}
    </>
  );
}
