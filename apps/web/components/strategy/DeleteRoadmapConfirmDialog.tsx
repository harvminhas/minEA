"use client";

import { Trash2 } from "lucide-react";
import type { MinEAObject, RoadmapItemProperties, RoadmapTrack } from "@minea/types";
import {
  formatRoadmapTimelineLabel,
  roadmapKindLabel,
  ROADMAP_STATUS_LABEL,
  segmentTotalCount,
  sortedTracks,
  STRATEGY_LAYER_COLOR,
} from "@/lib/roadmap-utils";

interface Props {
  roadmap: MinEAObject;
  tracks: RoadmapTrack[];
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function DeleteRoadmapConfirmDialog({
  roadmap,
  tracks,
  onConfirm,
  onCancel,
  isPending = false,
}: Props) {
  const props = (roadmap.properties ?? {}) as RoadmapItemProperties;
  const kindLabel = roadmapKindLabel(props);
  const statusLabel =
    ROADMAP_STATUS_LABEL[props.roadmap_status ?? "discovery"] ?? props.roadmap_status;
  const timelineLabel = formatRoadmapTimelineLabel(props);
  const trackCount = tracks.length;
  const segmentCount = segmentTotalCount(tracks);
  const orderedTracks = sortedTracks(tracks);

  return (
    <>
      <div className="fixed inset-0 z-[150] bg-black/30" onClick={isPending ? undefined : onCancel} />
      <div
        role="dialog"
        aria-labelledby="delete-roadmap-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[160] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center flex-shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div className="min-w-0">
            <h3 id="delete-roadmap-title" className="font-semibold text-gray-900">
              Delete roadmap item?
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              This roadmap and its timeline will be permanently removed. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
              Roadmap item
            </p>
            <p className="text-sm font-medium text-gray-900">{roadmap.name}</p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
              <span style={{ color: STRATEGY_LAYER_COLOR }}>{kindLabel}</span>
              <span>·</span>
              <span>{statusLabel}</span>
              {props.product?.product_name && (
                <>
                  <span>·</span>
                  <span>{props.product.product_name}</span>
                </>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">Timeline: {timelineLabel}</p>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-2">
              Timeline content
            </p>
            {trackCount === 0 ? (
              <p className="text-sm text-gray-400">No tracks or segments on this roadmap.</p>
            ) : (
              <>
                <p className="text-sm text-gray-700">
                  {trackCount} track{trackCount === 1 ? "" : "s"}
                  {segmentCount > 0 && (
                    <>
                      {" "}
                      · {segmentCount} segment{segmentCount === 1 ? "" : "s"}
                    </>
                  )}
                </p>
                {orderedTracks.length > 0 && (
                  <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto pr-1">
                    {orderedTracks.map((track) => (
                      <li
                        key={track.id}
                        className="flex items-center gap-2 text-xs text-gray-600 py-1 px-2 bg-white rounded border border-gray-100"
                      >
                        <span
                          className="h-2 w-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: track.color ?? STRATEGY_LAYER_COLOR }}
                        />
                        <span className="truncate">{track.label}</span>
                        {track.segments.length > 0 && (
                          <span className="text-gray-400 flex-shrink-0 ml-auto">
                            {track.segments.length} seg
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
          >
            {isPending ? "Deleting…" : "Delete roadmap"}
          </button>
        </div>
      </div>
    </>
  );
}
