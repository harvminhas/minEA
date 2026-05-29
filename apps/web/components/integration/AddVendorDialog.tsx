"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface Props {
  onClose: () => void;
  onAdded: (vendorName: string) => void;
}

export function AddVendorDialog({ onClose, onAdded }: Props) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleAdd = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Vendor name is required");
      return;
    }
    onAdded(trimmed);
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[220] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[230] w-full max-w-sm bg-white rounded-xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Add vendor</h3>
            <p className="text-xs text-gray-400 mt-0.5">Register a vendor for integration infrastructure</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vendor name</label>
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setError(null);
              }}
              placeholder="e.g. Workato"
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
            />
          </div>
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 rounded-md border border-gray-200 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm bg-slate-600 hover:bg-slate-700 text-white rounded-md disabled:bg-slate-300 disabled:text-slate-600"
          >
            Add
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
