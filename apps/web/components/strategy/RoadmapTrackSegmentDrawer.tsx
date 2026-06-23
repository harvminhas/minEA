"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2, X } from "lucide-react";
import type { RoadmapMilestoneStatus, RoadmapSegment, RoadmapTrack } from "@minea/types";
import {
  dateToPeriod,
  defaultSegmentPeriods,
  newSegmentId,
  newTrackId,
  periodOptions,
  periodToEndDate,
  periodToStartDate,
  ROADMAP_MILESTONE_STATUS,
  normalizeSegmentStatus,
  sortedTracks,
  type RoadmapTimelineBinding,
  TRACK_COLORS,
  trackColor,
} from "@/lib/roadmap-utils";
import { cn } from "@/lib/utils";

export type RoadmapTimelineDrawer =
  | { mode: "add-track" }
  | { mode: "edit-track"; track: RoadmapTrack }
  | { mode: "add-segment"; trackId: string; startDate: string }
  | { mode: "edit-segment"; trackId: string; segment: RoadmapSegment };

interface Props {
  state: RoadmapTimelineDrawer;
  tracks: RoadmapTrack[];
  timelineBinding: RoadmapTimelineBinding;
  onClose: () => void;
  onSave: (next: RoadmapTrack[]) => void;
  saving?: boolean;
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-gray-600 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function RoadmapTrackSegmentDrawer({
  state,
  tracks,
  timelineBinding,
  onClose,
  onSave,
  saving = false,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const ordered = sortedTracks(tracks);
  const isTrack = state.mode === "add-track" || state.mode === "edit-track";
  const isSegment = state.mode === "add-segment" || state.mode === "edit-segment";
  const isEdit = state.mode === "edit-track" || state.mode === "edit-segment";

  const editTrack = state.mode === "edit-track" ? state.track : null;
  const editSegment = state.mode === "edit-segment" ? state.segment : null;
  const addSegmentTrackId = state.mode === "add-segment" ? state.trackId : null;
  const addSegmentStart = state.mode === "add-segment" ? state.startDate : undefined;

  const editTrackIdx = editTrack ? ordered.findIndex((t) => t.id === editTrack.id) : 0;

  const initialPeriods = (() => {
    if (editSegment) {
      return {
        startPeriod: dateToPeriod(timelineBinding, editSegment.start_date),
        endPeriod: dateToPeriod(timelineBinding, editSegment.end_date),
      };
    }
    return defaultSegmentPeriods(timelineBinding, addSegmentStart);
  })();

  const periodOpts = periodOptions(timelineBinding);
  const startLabel =
    timelineBinding.mode === "date_bound"
      ? "Start month"
      : `Start ${timelineBinding.periodPrefix || "period"}`;
  const endLabel =
    timelineBinding.mode === "date_bound"
      ? "End month"
      : `End ${timelineBinding.periodPrefix || "period"}`;

  const [trackLabel, setTrackLabel] = useState(
    editTrack?.label ?? ""
  );
  const [trackColorVal, setTrackColorVal] = useState(
    editTrack ? trackColor(editTrack, Math.max(0, editTrackIdx)) : TRACK_COLORS[ordered.length % TRACK_COLORS.length]!
  );

  const [segLabel, setSegLabel] = useState(editSegment?.label ?? "");
  const [segDescription, setSegDescription] = useState(editSegment?.description ?? "");
  const [segStartPeriod, setSegStartPeriod] = useState(initialPeriods.startPeriod);
  const [segEndPeriod, setSegEndPeriod] = useState(initialPeriods.endPeriod);
  const [segStatus, setSegStatus] = useState<RoadmapMilestoneStatus | "">(
    editSegment?.status ? normalizeSegmentStatus(editSegment.status) : "not_started"
  );

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const segStart = periodToStartDate(timelineBinding, segStartPeriod);
  const segEnd = periodToEndDate(timelineBinding, segEndPeriod);

  const canSaveTrack = trackLabel.trim().length > 0;
  const canSaveSegment =
    segLabel.trim().length > 0 && segStartPeriod >= 1 && segEndPeriod >= segStartPeriod;

  const title =
    state.mode === "add-track"
      ? "Add track"
      : state.mode === "edit-track"
        ? "Edit track"
        : state.mode === "add-segment"
          ? "Add segment"
          : "Edit segment";

  const subtitle =
    state.mode === "add-track"
      ? "A named lane on the timeline"
      : state.mode === "edit-track"
        ? "Rename, recolor, or remove this lane"
        : state.mode === "add-segment"
          ? `On track: ${ordered.find((t) => t.id === addSegmentTrackId)?.label ?? ""}`
          : "Update label, span, or status";

  function handleSaveTrack() {
    if (!canSaveTrack) return;
    if (state.mode === "add-track") {
      onSave([
        ...tracks,
        {
          id: newTrackId(),
          label: trackLabel.trim(),
          color: trackColorVal,
          sort_order: tracks.length,
          segments: [],
        },
      ]);
      return;
    }
    if (state.mode === "edit-track") {
      onSave(
        tracks.map((t) =>
          t.id === state.track.id ? { ...t, label: trackLabel.trim(), color: trackColorVal } : t
        )
      );
    }
  }

  function handleSaveSegment() {
    if (!canSaveSegment) return;
    const segmentTrack =
      state.mode === "add-segment" || state.mode === "edit-segment"
        ? ordered.find((t) => t.id === state.trackId)
        : undefined;
    const segmentTrackIdx = segmentTrack ? ordered.findIndex((t) => t.id === segmentTrack.id) : 0;
    const segment: RoadmapSegment = {
      id: editSegment?.id ?? newSegmentId(),
      label: segLabel.trim(),
      description: segDescription.trim() || undefined,
      start_date: segStart,
      end_date: segEnd,
      status: segStatus ? normalizeSegmentStatus(segStatus) : undefined,
      color: segmentTrack ? trackColor(segmentTrack, Math.max(0, segmentTrackIdx)) : undefined,
    };

    if (state.mode === "add-segment") {
      onSave(
        tracks.map((t) =>
          t.id === state.trackId ? { ...t, segments: [...t.segments, segment] } : t
        )
      );
      return;
    }

    if (state.mode === "edit-segment") {
      onSave(
        tracks.map((t) =>
          t.id === state.trackId
            ? {
                ...t,
                segments: t.segments.map((s) => (s.id === segment.id ? segment : s)),
              }
            : t
        )
      );
    }
  }

  function handleDeleteTrack() {
    if (state.mode !== "edit-track") return;
    onSave(tracks.filter((t) => t.id !== state.track.id));
  }

  function handleDeleteSegment() {
    if (state.mode !== "edit-segment") return;
    onSave(
      tracks.map((t) =>
        t.id === state.trackId
          ? { ...t, segments: t.segments.filter((s) => s.id !== state.segment.id) }
          : t
      )
    );
  }

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/25 z-[130]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[400px] bg-white shadow-2xl z-[140] flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 flex-shrink-0">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-5 py-5 space-y-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {isTrack && (
            <>
              <div>
                <FieldLabel required>Name</FieldLabel>
                <input
                  autoFocus
                  value={trackLabel}
                  onChange={(e) => setTrackLabel(e.target.value)}
                  placeholder='e.g. "Partner Sourcing"'
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div>
                <FieldLabel>Color</FieldLabel>
                <div className="flex items-center gap-2 flex-wrap">
                  {TRACK_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setTrackColorVal(c)}
                      className={cn(
                        "h-7 w-7 rounded-full border-2 transition-transform",
                        trackColorVal === c ? "border-violet-500 scale-110" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}

          {isSegment && (
            <>
              <div>
                <FieldLabel required>Label</FieldLabel>
                <input
                  autoFocus
                  value={segLabel}
                  onChange={(e) => setSegLabel(e.target.value)}
                  placeholder='e.g. "RFI"'
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FieldLabel required>{startLabel}</FieldLabel>
                  <select
                    value={String(segStartPeriod)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setSegStartPeriod(v);
                      if (v > segEndPeriod) setSegEndPeriod(v);
                    }}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {periodOpts.map((opt, i) => (
                      <option key={opt.value} value={String(i + 1)}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <FieldLabel required>{endLabel}</FieldLabel>
                  <select
                    value={String(segEndPeriod)}
                    onChange={(e) => setSegEndPeriod(Number(e.target.value))}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {periodOpts.map((opt, i) => {
                      const period = i + 1;
                      if (period < segStartPeriod) return null;
                      return (
                        <option key={opt.value} value={String(period)}>
                          {opt.label}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
              <div>
                <FieldLabel>Status</FieldLabel>
                <select
                  value={segStatus}
                  onChange={(e) => setSegStatus(e.target.value as RoadmapMilestoneStatus)}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                  {ROADMAP_MILESTONE_STATUS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Description</FieldLabel>
                <textarea
                  value={segDescription}
                  onChange={(e) => setSegDescription(e.target.value)}
                  placeholder="What specifically is happening in this span…"
                  rows={3}
                  className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex items-center gap-2 flex-shrink-0">
          {isEdit && (
            <button
              type="button"
              onClick={isTrack ? handleDeleteTrack : handleDeleteSegment}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 rounded-md hover:bg-red-50 disabled:opacity-50"
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || (isTrack ? !canSaveTrack : !canSaveSegment)}
            onClick={isTrack ? handleSaveTrack : handleSaveSegment}
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:opacity-50"
          >
            {isEdit ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
