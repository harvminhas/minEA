"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { CapabilityMapCapability } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import { useTenancy } from "@/lib/tenancy";

interface Props {
  capability: CapabilityMapCapability;
  domainName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export function EditCapabilityDialog({ capability, domainName, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [name, setName] = useState(capability.name);
  const ownership = useOwnershipForm(capability);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = name.trim();
      if (!trimmedName) throw new Error("Name is required");
      const token = await getToken();
      return objectsApi.update(
        orgSlug,
        workspaceSlug,
        capability.id,
        {
          name: trimmedName,
          ...ownership.toPayload(),
        },
        token!
      );
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="edit-capability-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div>
            <h3 id="edit-capability-title" className="font-semibold text-gray-900">
              Edit capability
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {domainName} · ID preserved — links and mappings stay intact when you rename.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1.5 block">Capability name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={formFieldClass}
              autoFocus
            />
          </label>
          <OwnershipFields value={ownership.value} onChange={ownership.setValue} required={false} />
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50 rounded-b-xl">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="px-3 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md"
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>

        {saveMutation.isError && (
          <p className="px-5 pb-3 text-xs text-red-600">{(saveMutation.error as Error).message}</p>
        )}
      </div>
    </>
  );
}
