"use client";

import { X } from "lucide-react";

interface FormDrawerProps {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  submitDisabled?: boolean;
  error?: string | null;
  children: React.ReactNode;
}

export function FormDrawer({
  title,
  onClose,
  onSubmit,
  submitLabel = "Create",
  isSubmitting = false,
  submitDisabled = false,
  error,
  children,
}: FormDrawerProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-[80]" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[440px] bg-white shadow-xl z-[90] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">{children}</div>

        {error && <p className="px-6 pb-2 text-xs text-red-600">{error}</p>}

        <div className="border-t border-gray-100 p-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitDisabled || isSubmitting}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            {isSubmitting ? "Saving..." : submitLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export const formFieldClass =
  "w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

export function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

export function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="pt-2 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">{title}</p>
      {children}
    </div>
  );
}
