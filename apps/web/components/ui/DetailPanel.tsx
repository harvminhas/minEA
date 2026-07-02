"use client";

import { Info, X } from "lucide-react";

interface DetailPanelProps {
  onClose: () => void;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function DetailPanel({ onClose, header, footer, children }: DetailPanelProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[80]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[480px] bg-white shadow-xl z-[90] flex flex-col overflow-hidden">
        {header}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">{children}</div>
        {footer}
      </div>
    </>
  );
}

export function DetailPanelCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500 transition-colors"
    >
      <X size={16} />
    </button>
  );
}

function DetailSectionHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex flex-shrink-0 group/hint">
      <button
        type="button"
        className="rounded p-0.5 text-gray-300 hover:text-gray-500 focus:outline-none focus-visible:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-300"
        aria-label="More information"
      >
        <Info size={12} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-56 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-gray-600 shadow-md group-hover/hint:block group-focus-within/hint:block"
      >
        {text}
      </span>
    </span>
  );
}

export function DetailSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1 min-w-0">
          <span className="truncate">{title}</span>
          {hint && <DetailSectionHint text={hint} />}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}
