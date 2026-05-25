"use client";

import { GitBranch, CornerDownRight, X, Zap } from "lucide-react";
import { formFieldClass } from "@/components/ui/FormDrawer";
import type { StageTransition } from "@/components/views/ProcessFlowCanvas";
import { cn } from "@/lib/utils";

export const HANDOFF_TEAMS = [
  "Compliance team",
  "Payments team",
  "Risk team",
  "Operations team",
  "Engineering team",
] as const;

interface Props {
  sourceName: string;
  targetName: string;
  transition: StageTransition;
  anchor: { x: number; y: number };
  onChange: (transition: StageTransition) => void;
  onClose: () => void;
}

export function EdgeAnnotationPopover({
  sourceName,
  targetName,
  transition,
  anchor,
  onChange,
  onClose,
}: Props) {
  const setField = (field: keyof StageTransition, value: string) => {
    onChange({ ...transition, [field]: value });
  };

  return (
    <div
      className="absolute z-20 w-[300px] rounded-xl border border-gray-200 bg-white shadow-xl"
      style={{ left: anchor.x, top: anchor.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-snug">
          Edge: {sourceName} → {targetName}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="p-0.5 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0"
          aria-label="Close edge editor"
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3">
        <label className="block">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1.5">
            <GitBranch size={12} />
            Condition
          </span>
          <input
            value={transition.condition ?? ""}
            onChange={(e) => setField("condition", e.target.value)}
            placeholder="e.g. if approved"
            className={cn(formFieldClass, "text-sm")}
          />
        </label>

        <label className="block">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 mb-1.5">
            <Zap size={12} />
            Trigger
          </span>
          <input
            value={transition.trigger ?? ""}
            onChange={(e) => setField("trigger", e.target.value)}
            placeholder="e.g. on submission"
            className={cn(formFieldClass, "text-sm")}
          />
        </label>

        <label className="block">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 mb-1.5">
            <CornerDownRight size={12} />
            Handoff
          </span>
          <select
            value={transition.handoff ?? ""}
            onChange={(e) => setField("handoff", e.target.value)}
            className={cn(formFieldClass, "text-sm")}
          >
            <option value="">Select team…</option>
            {HANDOFF_TEAMS.map((team) => (
              <option key={team} value={team}>
                {team}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="px-4 pb-3 text-[10px] text-gray-400 border-t border-gray-50 pt-2">
        All fields optional. Labels appear on the arrow when filled.
      </p>
    </div>
  );
}

export function EdgeTransitionLabels({ transition }: { transition?: StageTransition }) {
  if (!transition) return null;
  const { condition, trigger, handoff } = transition;
  if (!condition && !trigger && !handoff) return null;

  return (
    <div className="flex flex-col items-center gap-1 pointer-events-none">
      {condition && (
        <span className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] italic text-amber-800 whitespace-nowrap max-w-[140px] truncate">
          {condition}
        </span>
      )}
      {trigger && (
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 whitespace-nowrap max-w-[140px] truncate">
          <Zap size={10} className="flex-shrink-0" />
          {trigger}
        </span>
      )}
      {handoff && (
        <span className="inline-flex items-center gap-1 text-[10px] text-violet-700 whitespace-nowrap max-w-[140px] truncate">
          <CornerDownRight size={10} className="flex-shrink-0" />
          {handoff}
        </span>
      )}
    </div>
  );
}
