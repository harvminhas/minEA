"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { RoadmapSegment, RoadmapTimelineView, RoadmapTrack } from "@minea/types";
import { RoadmapTimeline } from "@/components/strategy/RoadmapTimeline";
import { STRATEGY_LAYER_COLOR, type RoadmapTimelineBinding } from "@/lib/roadmap-utils";

interface Props {
  title: string;
  subtitle?: string;
  tracks: RoadmapTrack[];
  timelineBinding: RoadmapTimelineBinding;
  timelineView?: RoadmapTimelineView;
  onClose: () => void;
  onTimelineViewChange?: (view: RoadmapTimelineView) => void;
  onAddTrack?: () => void;
  onEditTrack?: (track: RoadmapTrack) => void;
  onAddSegment?: (trackId: string, defaults: { startDate: string }) => void;
  onEditSegment?: (trackId: string, segment: RoadmapSegment) => void;
  saving?: boolean;
}

export function RoadmapTimelineFullscreen({
  title,
  subtitle,
  tracks,
  timelineBinding,
  timelineView,
  onClose,
  onTimelineViewChange,
  onAddTrack,
  onEditTrack,
  onAddSegment,
  onEditSegment,
  saving,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50">
      <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="min-w-0">
          <p
            className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1"
            style={{ color: STRATEGY_LAYER_COLOR }}
          >
            Roadmap timeline
          </p>
          <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
          {subtitle && <p className="text-sm text-gray-500 mt-0.5 truncate">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-md hover:bg-gray-100 text-gray-500 flex-shrink-0"
          aria-label="Close fullscreen timeline"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 md:p-8 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <RoadmapTimeline
          tracks={tracks}
          timelineBinding={timelineBinding}
          timelineView={timelineView}
          onTimelineViewChange={onTimelineViewChange}
          onAddTrack={onAddTrack}
          onEditTrack={onEditTrack}
          onAddSegment={onAddSegment}
          onEditSegment={onEditSegment}
          saving={saving}
          fullWidth
        />
      </div>
    </div>
  );
}
