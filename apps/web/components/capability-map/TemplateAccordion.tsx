"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { templateIcon } from "@/lib/capability-map-icons";
import { cn } from "@/lib/utils";

interface Props {
  templateId: string;
  templateName: string;
  templateIconKey: string;
  expanded: boolean;
  onToggle: () => void;
  countLabel: string;
  children: React.ReactNode;
}

export function TemplateAccordionSection({
  templateId,
  templateName,
  templateIconKey,
  expanded,
  onToggle,
  countLabel,
  children,
}: Props) {
  const Icon = templateIcon(templateIconKey);

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      <button
        type="button"
        id={`template-toggle-${templateId}`}
        aria-expanded={expanded}
        aria-controls={`template-panel-${templateId}`}
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        {expanded ? (
          <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-gray-500 flex-shrink-0" />
        )}
        <Icon size={14} className="text-gray-500 flex-shrink-0" />
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-600 flex-1 truncate">
          {templateName}
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 flex-shrink-0">
          Industry · {countLabel}
        </span>
      </button>
      {expanded && (
        <div id={`template-panel-${templateId}`} className="px-3 py-2 space-y-1 border-t border-gray-100 bg-white">
          {children}
        </div>
      )}
    </div>
  );
}

interface PickerItemProps {
  label: string;
  hint?: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick: () => void;
}

export function PickerItem({ label, hint, disabled, disabledReason, onClick }: PickerItemProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={disabled ? disabledReason : undefined}
      className={cn(
        "w-full rounded-md px-2.5 py-2 text-left transition-colors",
        disabled
          ? "opacity-50 cursor-not-allowed bg-gray-50"
          : "hover:bg-indigo-50/60 hover:text-indigo-900"
      )}
    >
      <p className="text-sm font-medium text-gray-900">{label}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5 truncate">{hint}</p>}
      {disabled && disabledReason && (
        <p className="text-[10px] text-gray-400 mt-0.5">{disabledReason}</p>
      )}
    </button>
  );
}
