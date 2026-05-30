"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { RoadmapMilestone, RoadmapMilestoneStatus } from "@minea/types";
import {
  buildTargetResolutionOptions,
  ROADMAP_MILESTONE_STATUS,
} from "@/lib/roadmap-utils";

interface Props {
  initial?: RoadmapMilestone;
  defaultTarget?: string;
  onClose: () => void;
  onSave: (milestone: RoadmapMilestone) => void;
}

export function AddMilestoneDialog({ initial, defaultTarget, onClose, onSave }: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(initial?.title ?? "");
  const [target, setTarget] = useState(
    initial?.target_resolution ?? defaultTarget ?? buildTargetResolutionOptions()[0]?.value ?? "2026_q1"
  );
  const [status, setStatus] = useState<RoadmapMilestoneStatus>(initial?.status ?? "not_started");

  const targetOptions = buildTargetResolutionOptions().filter((o) => o.value !== "no_target");

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const canSave = title.trim().length > 0;

  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/25 z-[130]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-xl shadow-2xl z-[140]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {initial ? "Edit milestone" : "Add milestone"}
          </h3>
          <button type="button" onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Title</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Pilot live in EU"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Target</label>
              <select
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {targetOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as RoadmapMilestoneStatus)}
                className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {ROADMAP_MILESTONE_STATUS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onSave({
                id: initial?.id ?? `ms_${Date.now()}`,
                title: title.trim(),
                target_resolution: target,
                status,
                sort_order: initial?.sort_order,
              })
            }
            className="px-3 py-1.5 text-sm bg-violet-600 hover:bg-violet-700 text-white rounded-md disabled:opacity-50"
          >
            {initial ? "Save" : "Add"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
