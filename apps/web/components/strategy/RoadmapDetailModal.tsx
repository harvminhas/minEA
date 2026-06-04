"use client";

import { useEffect } from "react";
import { RoadmapDetailContent } from "@/components/strategy/RoadmapDetailContent";

interface Props {
  roadmapId: string;
  onClose: () => void;
}

/** Expanded roadmap view (detail + timeline + fullscreen) in a modal overlay. */
export function RoadmapDetailModal({ roadmapId, onClose }: Props) {
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
    <>
      <div
        className="fixed inset-0 z-[80] bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="roadmap-detail-modal-title"
        className="fixed inset-3 sm:inset-6 md:inset-10 z-[90] flex flex-col rounded-xl bg-gray-50 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <span id="roadmap-detail-modal-title" className="sr-only">
          Roadmap detail
        </span>
        <RoadmapDetailContent roadmapId={roadmapId} layout="modal" onClose={onClose} />
      </div>
    </>
  );
}
