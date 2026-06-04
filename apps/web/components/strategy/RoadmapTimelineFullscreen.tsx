"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { RoadmapItemProperties, RoadmapMilestone } from "@minea/types";
import { RoadmapTimeline } from "@/components/strategy/RoadmapTimeline";
import { STRATEGY_LAYER_COLOR } from "@/lib/roadmap-utils";

interface Props {
  title: string;
  subtitle?: string;
  properties: RoadmapItemProperties;
  milestones: RoadmapMilestone[];
  onClose: () => void;
  onAddAtQuarter: (quarter: string) => void;
  onEditMilestone: (milestone: RoadmapMilestone) => void;
}

export function RoadmapTimelineFullscreen({
  title,
  subtitle,
  properties,
  milestones,
  onClose,
  onAddAtQuarter,
  onEditMilestone,
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

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <RoadmapTimeline
          properties={properties}
          milestones={milestones}
          onAddAtQuarter={onAddAtQuarter}
          onEditMilestone={onEditMilestone}
          fullWidth
        />
      </div>
    </div>
  );
}
