"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize2, Pencil, Plus } from "lucide-react";
import type { RoadmapSegment, RoadmapTimelineView, RoadmapTrack } from "@minea/types";
import {
  autoTimelineRange,
  buildTimelineTicks,
  extendTimelineView,
  formatTimelineBindingLabel,
  normalizeSegmentStatus,
  segmentAddAnchor,
  segmentBarStyle,
  segmentDoneCount,
  segmentStatusDensity,
  segmentStatusLabel,
  segmentTotalCount,
  sortedSegments,
  sortedTracks,
  trackColor,
  type RoadmapTimelineBinding,
} from "@/lib/roadmap-utils";
import { SegmentBarStatus, SegmentStatusLegend } from "@/components/strategy/SegmentStatusBadge";
import {
  SegmentHoverTooltip,
  type SegmentHoverTarget,
} from "@/components/strategy/SegmentHoverTooltip";
import { cn } from "@/lib/utils";

const LABEL_COL_WIDTH = 220;
const ADD_COL_WIDTH = 36;

interface Props {
  tracks: RoadmapTrack[];
  timelineBinding: RoadmapTimelineBinding;
  timelineView?: RoadmapTimelineView;
  onTimelineViewChange?: (view: RoadmapTimelineView) => void;
  onAddTrack?: () => void;
  onEditTrack?: (track: RoadmapTrack) => void;
  onAddSegment?: (trackId: string, defaults: { startDate: string }) => void;
  onEditSegment?: (trackId: string, segment: RoadmapSegment) => void;
  fullWidth?: boolean;
  onExpand?: () => void;
  saving?: boolean;
}

export function RoadmapTimeline({
  tracks,
  timelineBinding,
  timelineView,
  onTimelineViewChange,
  onAddTrack,
  onEditTrack,
  onAddSegment,
  onEditSegment,
  fullWidth = false,
  onExpand,
  saving = false,
}: Props) {
  const [showStatus, setShowStatus] = useState(true);
  const [hoveredSegment, setHoveredSegment] = useState<SegmentHoverTarget | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasWidth, setCanvasWidth] = useState(0);
  const ordered = useMemo(() => sortedTracks(tracks), [tracks]);
  const autoRange = useMemo(() => autoTimelineRange(tracks), [tracks]);
  const { range, axis: axisMode, mode: timelineMode } = timelineBinding;
  const ticks = useMemo(
    () =>
      buildTimelineTicks(range, axisMode, {
        relative: timelineMode === "relative",
        maxPeriod: timelineBinding.maxPeriod,
        periodPrefix: timelineBinding.periodPrefix,
      }),
    [range, axisMode, timelineMode, timelineBinding.maxPeriod, timelineBinding.periodPrefix]
  );
  const total = segmentTotalCount(tracks);
  const done = segmentDoneCount(tracks);
  const canEdit = Boolean(onAddTrack || onAddSegment);
  const canExtend = Boolean(onTimelineViewChange && timelineMode === "date_bound");
  const isEmpty = ordered.length === 0;

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const update = () => setCanvasWidth(el.getBoundingClientRect().width);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tracks, fullWidth, isEmpty]);

  function extendRange(direction: "start" | "end") {
    if (!onTimelineViewChange) return;
    onTimelineViewChange(extendTimelineView(timelineView, autoRange, direction));
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 bg-white p-6 w-full",
        !fullWidth && "max-w-5xl mx-auto"
      )}
    >
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
          Timeline{total > 0 && ` · ${done} of ${total} segments done`}
        </p>
        <div className="flex items-center gap-2 ml-auto">
          {total > 0 && (
            <label className="inline-flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs font-medium text-gray-600">Show status</span>
              <button
                type="button"
                role="switch"
                aria-checked={showStatus}
                onClick={() => setShowStatus((v) => !v)}
                className={cn(
                  "relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border transition-colors",
                  showStatus
                    ? "bg-violet-600 border-violet-600"
                    : "bg-gray-200 border-gray-300"
                )}
              >
                <span
                  className={cn(
                    "pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition-transform mt-0.5",
                    showStatus ? "translate-x-4 ml-0.5" : "translate-x-0.5"
                  )}
                />
              </button>
            </label>
          )}
          {onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50 hover:text-violet-700 hover:border-violet-200 transition-colors"
            >
              <Maximize2 size={14} /> Expand
            </button>
          )}
        </div>
      </div>

      {showStatus && total > 0 && !isEmpty && (
        <SegmentStatusLegend className="mb-4" />
      )}

      {isEmpty ? (
        <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl">
          <p className="text-sm text-gray-400 mb-4">
            No tracks yet — tracks are named lanes like &ldquo;Partner Sourcing&rdquo; that hold
            labeled date spans.
          </p>
          {onAddTrack && (
            <button
              type="button"
              onClick={onAddTrack}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-colors"
            >
              + Add first track
            </button>
          )}
        </div>
      ) : (
        <div className="w-full overflow-hidden">
          <div className="w-full">
            {/* Axis */}
            <div className="flex items-center mb-1">
              <div style={{ width: LABEL_COL_WIDTH }} className="flex-shrink-0 pr-2">
                <p
                  className="text-[10px] text-gray-400 text-right leading-tight truncate"
                  title={formatTimelineBindingLabel(timelineBinding)}
                >
                  {formatTimelineBindingLabel(timelineBinding)}
                </p>
              </div>
              <div className="flex-1 flex items-center gap-1 min-w-0">
                {canExtend && (
                  <button
                    type="button"
                    onClick={() => extendRange("start")}
                    disabled={saving}
                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:text-violet-700 hover:bg-violet-50 rounded border border-transparent hover:border-violet-200 transition-colors disabled:opacity-50"
                    title="Show 4 more weeks earlier"
                  >
                    <ChevronLeft size={12} />
                    4 wk
                  </button>
                )}
                <div ref={canvasRef} className="relative flex-1 h-6 min-w-0">
                  {ticks.map((tick) => (
                    <span
                      key={tick.key}
                      className="absolute top-0 -translate-x-1/2 text-[11px] text-gray-400 whitespace-nowrap"
                      style={{ left: `${tick.position}%` }}
                    >
                      {tick.label}
                    </span>
                  ))}
                </div>
                {canExtend && (
                  <button
                    type="button"
                    onClick={() => extendRange("end")}
                    disabled={saving}
                    className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-gray-500 hover:text-violet-700 hover:bg-violet-50 rounded border border-transparent hover:border-violet-200 transition-colors disabled:opacity-50"
                    title="Show 4 more weeks later"
                  >
                    4 wk
                    <ChevronRight size={12} />
                  </button>
                )}
              </div>
              {onAddSegment && <div style={{ width: ADD_COL_WIDTH }} className="flex-shrink-0" />}
            </div>

            {/* Track rows */}
            <div className="relative">
              <div
                className="absolute inset-y-0 pointer-events-none"
                style={{ left: LABEL_COL_WIDTH, right: onAddSegment ? ADD_COL_WIDTH : 0 }}
              >
                {ticks.map((tick) => (
                  <span
                    key={tick.key}
                    className="absolute inset-y-0 w-px bg-gray-100"
                    style={{ left: `${tick.position}%` }}
                  />
                ))}
              </div>

              {ordered.map((track, trackIdx) => {
                const color = trackColor(track, trackIdx);
                const anchor = segmentAddAnchor(track, timelineBinding);

                return (
                  <div key={track.id} className="flex items-stretch group/row">
                    <div
                      style={{ width: LABEL_COL_WIDTH }}
                      className="flex-shrink-0 pr-3 py-2 flex items-start gap-2 min-w-0 justify-end"
                    >
                      {onEditTrack && (
                        <button
                          type="button"
                          onClick={() => onEditTrack(track)}
                          className="opacity-0 group-hover/row:opacity-100 p-0.5 rounded text-gray-300 hover:text-violet-600 transition-opacity flex-shrink-0"
                          title="Edit track"
                        >
                          <Pencil size={11} />
                        </button>
                      )}
                      <span
                        className="h-2.5 w-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="text-xs font-medium text-gray-700 text-right whitespace-normal break-words leading-snug">
                        {track.label}
                      </span>
                    </div>

                    <div className="flex flex-1 min-w-0 items-center self-center">
                      {/* Segment canvas — bars only, no overlap with add control */}
                      <div className="relative flex-1 min-h-12 h-12 min-w-0">
                        {sortedSegments(track.segments).map((segment) => {
                          const bar = segmentBarStyle(segment, range);
                          const segmentStatus = normalizeSegmentStatus(segment.status);
                          const statusDensity = segmentStatusDensity(bar.width, canvasWidth);
                          return (
                            <button
                              key={segment.id}
                              type="button"
                              onClick={() => onEditSegment?.(track.id, segment)}
                              onMouseEnter={(e) =>
                                setHoveredSegment({
                                  segment,
                                  trackLabel: track.label,
                                  trackColor: color,
                                  rect: e.currentTarget.getBoundingClientRect(),
                                })
                              }
                              onMouseLeave={() => setHoveredSegment(null)}
                              onFocus={(e) =>
                                setHoveredSegment({
                                  segment,
                                  trackLabel: track.label,
                                  trackColor: color,
                                  rect: e.currentTarget.getBoundingClientRect(),
                                })
                              }
                              onBlur={() => setHoveredSegment(null)}
                              className={cn(
                                "absolute top-1/2 -translate-y-1/2 h-8 rounded-md px-2 flex items-center gap-1 text-left shadow-sm ring-1 ring-black/5 min-w-0 overflow-hidden",
                                onEditSegment
                                  ? "hover:shadow-md hover:brightness-105 transition-shadow cursor-pointer"
                                  : "cursor-default"
                              )}
                              style={{
                                left: `${bar.left}%`,
                                width: `${bar.width}%`,
                                backgroundColor: color,
                              }}
                              aria-label={`${segment.label}, ${segmentStatusLabel(segmentStatus)}, ${track.label}`}
                            >
                              <span className="text-[11px] font-medium text-white truncate flex-1 min-w-0">
                                {segment.label}
                              </span>
                              {showStatus && (
                                <SegmentBarStatus status={segmentStatus} density={statusDensity} />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Trailing add column — always at row end */}
                      {onAddSegment && (
                        <div
                          style={{ width: ADD_COL_WIDTH }}
                          className="flex-shrink-0 flex items-center justify-center h-12"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              onAddSegment(track.id, { startDate: anchor.startDate })
                            }
                            className="opacity-0 group-hover/row:opacity-100 h-7 w-7 rounded-full border border-dashed border-violet-300 bg-white text-violet-600 hover:bg-violet-50 hover:border-violet-400 flex items-center justify-center shadow-sm transition-opacity"
                            title="Add segment"
                          >
                            <Plus size={14} strokeWidth={2.5} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {onAddTrack && (
              <div className="flex items-center mt-2">
                <div style={{ width: LABEL_COL_WIDTH }} className="flex-shrink-0" />
                <button
                  type="button"
                  onClick={onAddTrack}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium text-gray-500 hover:text-violet-700 border border-dashed border-gray-300 hover:border-violet-300 hover:bg-violet-50/50 rounded-md py-2 transition-colors"
                  style={{ marginRight: ADD_COL_WIDTH }}
                >
                  + Add track
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      <SegmentHoverTooltip
        target={hoveredSegment}
        timelineBinding={timelineBinding}
        showEditHint={Boolean(onEditSegment)}
      />
    </div>
  );
}
