"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { RoadmapSegment } from "@minea/types";
import { SegmentStatusBadge } from "@/components/strategy/SegmentStatusBadge";
import {
  formatSegmentSpanLabel,
  type RoadmapTimelineBinding,
} from "@/lib/roadmap-utils";
import { cn } from "@/lib/utils";

export interface SegmentHoverTarget {
  segment: RoadmapSegment;
  trackLabel: string;
  trackColor: string;
  rect: DOMRect;
}

interface Props {
  target: SegmentHoverTarget | null;
  timelineBinding: RoadmapTimelineBinding;
  showEditHint?: boolean;
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</p>
      <div className="mt-1 text-sm text-gray-800">{children}</div>
    </div>
  );
}

export function SegmentHoverTooltip({
  target,
  timelineBinding,
  showEditHint = false,
}: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted || !target) return null;

  const { segment, trackLabel, trackColor, rect } = target;
  const spanLabel = formatSegmentSpanLabel(segment, timelineBinding);

  const centerX = rect.left + rect.width / 2;
  const preferAbove = rect.top > 140;
  const top = preferAbove ? rect.top - 10 : rect.bottom + 10;
  const translateY = preferAbove ? "-100%" : "0";

  return createPortal(
    <div
      className="fixed z-[200] pointer-events-none w-[min(280px,calc(100vw-24px))]"
      style={{
        left: centerX,
        top,
        transform: `translate(-50%, ${translateY})`,
      }}
      role="tooltip"
    >
      <div className="rounded-lg border border-gray-200 bg-white shadow-lg px-3.5 py-3 space-y-3">
        <div>
          <p className="text-sm font-semibold text-gray-900 leading-snug">{segment.label}</p>
          <div className="flex items-center gap-1.5 mt-1.5 min-w-0">
            <span
              className="h-2 w-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: trackColor }}
            />
            <span className="text-xs text-gray-500 truncate">{trackLabel}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <DetailRow label="Status">
            <SegmentStatusBadge status={segment.status} compact />
          </DetailRow>
          <DetailRow label="Span">{spanLabel}</DetailRow>
        </div>

        {segment.description?.trim() && (
          <DetailRow label="Description">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {segment.description.trim()}
            </p>
          </DetailRow>
        )}

        {showEditHint && (
          <p className="text-[10px] text-gray-400 pt-0.5 border-t border-gray-100">Click to edit</p>
        )}
      </div>
      <div
        className={cn(
          "absolute left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border-gray-200 bg-white",
          preferAbove
            ? "bottom-0 translate-y-1/2 border-r border-b"
            : "top-0 -translate-y-1/2 border-l border-t"
        )}
        aria-hidden
      />
    </div>,
    document.body
  );
}
