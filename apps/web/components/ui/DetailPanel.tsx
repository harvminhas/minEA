"use client";

import { X } from "lucide-react";

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

export function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
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
