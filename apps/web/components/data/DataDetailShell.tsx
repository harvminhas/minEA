"use client";

import { X } from "lucide-react";

interface Props {
  breadcrumb: string;
  title: string;
  badge?: React.ReactNode;
  onClose: () => void;
  left: React.ReactNode;
  right: React.ReactNode;
}

export function DataDetailShell({ breadcrumb, title, badge, onClose, left, right }: Props) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 left-[200px] bg-[#faf8f5] z-50 flex flex-col overflow-hidden">
        <div className="flex items-start justify-between px-8 pt-6 pb-2 bg-[#faf8f5]">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
              {breadcrumb}
            </p>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
              {badge}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-black/5 text-gray-400 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="h-px bg-gray-200/80 mx-8 mt-3" />
        <div className="flex flex-1 min-h-0">
          <div className="w-[340px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
            {left}
          </div>
          <div className="flex-1 min-w-0 overflow-y-auto">{right}</div>
        </div>
      </div>
    </>
  );
}

export function DataFormFooter({
  onSave,
  saving,
  disabled,
  label = "Save and close",
}: {
  onSave: () => void;
  saving: boolean;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="px-6 py-5 border-t border-gray-100 mt-auto">
      <button
        type="button"
        onClick={onSave}
        disabled={disabled || saving}
        className="w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white rounded-md py-3 text-sm font-semibold transition-colors"
      >
        {saving ? "Saving…" : label}
      </button>
    </div>
  );
}

export function DataFieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
      {children}
    </label>
  );
}

export function DataSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 pr-8"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
        ▾
      </span>
    </div>
  );
}
