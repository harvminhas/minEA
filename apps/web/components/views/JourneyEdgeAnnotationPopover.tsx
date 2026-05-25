"use client";

import { ArrowRightLeft, Clock, GitBranch, Route, Signpost, X, Zap } from "lucide-react";
import { formFieldClass } from "@/components/ui/FormDrawer";
import type { JourneyEdgeTransition } from "@/lib/journey-state";
import { cn } from "@/lib/utils";

interface Props {
  sourceName: string;
  targetName: string;
  transition: JourneyEdgeTransition;
  anchor: { x: number; y: number };
  onChange: (transition: JourneyEdgeTransition) => void;
  onClose: () => void;
}

export function JourneyEdgeAnnotationPopover({
  sourceName,
  targetName,
  transition,
  anchor,
  onChange,
  onClose,
}: Props) {
  const setField = (field: keyof JourneyEdgeTransition, value: string) => {
    onChange({ ...transition, [field]: value });
  };

  return (
    <div
      className="absolute z-20 w-[320px] rounded-xl border border-gray-200 bg-white shadow-xl"
      style={{ left: anchor.x, top: anchor.y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 leading-snug">
          Edge: {sourceName} → {targetName}
        </p>
        <button type="button" onClick={onClose} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
          <X size={14} />
        </button>
      </div>

      <div className="px-4 py-3 space-y-3 max-h-[420px] overflow-y-auto">
        <Field
          icon={GitBranch}
          color="text-amber-700"
          label="Transition"
          value={transition.transition_description ?? ""}
          onChange={(v) => setField("transition_description", v)}
          placeholder="e.g. customer submits application"
        />
        <Field
          icon={Clock}
          color="text-gray-600"
          label="Time / wait"
          value={transition.time_wait ?? ""}
          onChange={(v) => setField("time_wait", v)}
          placeholder="e.g. up to 2 business days"
        />
        <Field
          icon={ArrowRightLeft}
          color="text-violet-700"
          label="Channel switch"
          value={transition.channel_switch ?? ""}
          onChange={(v) => setField("channel_switch", v)}
          placeholder="e.g. web → email"
        />
        <Field
          icon={Route}
          color="text-sky-700"
          label="Dependency"
          value={transition.dependency ?? ""}
          onChange={(v) => setField("dependency", v)}
          placeholder="e.g. requires KYC approval"
        />
        <Field
          icon={Signpost}
          color="text-emerald-700"
          label="Entry criteria"
          value={transition.entry_criteria ?? ""}
          onChange={(v) => setField("entry_criteria", v)}
          placeholder="e.g. account verified"
        />
      </div>

      <p className="px-4 pb-3 text-[10px] text-gray-400 border-t border-gray-50 pt-2">
        All fields optional. Labels appear on the arrow when filled.
      </p>
    </div>
  );
}

function Field({
  icon: Icon,
  color,
  label,
  value,
  onChange,
  placeholder,
}: {
  icon: typeof Zap;
  color: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium mb-1.5", color)}>
        <Icon size={12} />
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(formFieldClass, "text-sm")}
      />
    </label>
  );
}

export function JourneyEdgeTransitionLabels({ transition }: { transition?: JourneyEdgeTransition }) {
  if (!transition) return null;
  const items = [
    transition.transition_description && (
      <span key="t" className="rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[10px] italic text-amber-800 max-w-[140px] truncate">
        {transition.transition_description}
      </span>
    ),
    transition.time_wait && (
      <span key="w" className="inline-flex items-center gap-1 text-[10px] text-gray-500 max-w-[140px] truncate">
        <Clock size={10} />
        {transition.time_wait}
      </span>
    ),
    transition.channel_switch && (
      <span key="c" className="inline-flex items-center gap-1 text-[10px] text-violet-700 max-w-[140px] truncate">
        <ArrowRightLeft size={10} />
        {transition.channel_switch}
      </span>
    ),
    transition.dependency && (
      <span key="d" className="text-[10px] text-sky-700 max-w-[140px] truncate">{transition.dependency}</span>
    ),
    transition.entry_criteria && (
      <span key="e" className="text-[10px] text-emerald-700 max-w-[140px] truncate">{transition.entry_criteria}</span>
    ),
  ].filter(Boolean);

  if (!items.length) return null;
  return <div className="flex flex-col items-center gap-1 pointer-events-none">{items}</div>;
}
