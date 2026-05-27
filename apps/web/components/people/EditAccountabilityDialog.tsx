"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { peopleApi } from "@/lib/api-client";
import {
  ACCOUNTABILITY_LINK_OPTIONS,
  accountabilityPairKey,
  linkKindsForEntity,
} from "@/lib/people-utils";
import type { AccountabilityLinkKind, PeopleAccountability } from "@minea/types";

interface ExistingPair {
  entityId: string;
  linkKind: string;
}

interface Props {
  item: PeopleAccountability;
  subjectType: "role" | "team";
  existingPairs: ExistingPair[];
  onClose: () => void;
  onSuccess: () => void;
}

export function EditAccountabilityDialog({
  item,
  subjectType,
  existingPairs,
  onClose,
  onSuccess,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mounted, setMounted] = useState(false);
  const [linkKind, setLinkKind] = useState<AccountabilityLinkKind>(
    item.link_kind as AccountabilityLinkKind
  );
  const [error, setError] = useState<string | null>(null);

  const allowedLinkKinds = useMemo(
    () => linkKindsForEntity(item.entity_kind),
    [item.entity_kind]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLinkKind(item.link_kind as AccountabilityLinkKind);
    setError(null);
  }, [item]);

  const existingKeys = useMemo(
    () =>
      new Set(
        existingPairs
          .filter((p) => p.entityId !== item.entity_id)
          .map((p) => accountabilityPairKey(p.entityId, p.linkKind))
      ),
    [existingPairs, item.entity_id]
  );

  const pairTaken = existingKeys.has(accountabilityPairKey(item.entity_id, linkKind));
  const unchanged = linkKind === item.link_kind;

  const updateMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return peopleApi.updateAccountability(
        orgSlug,
        workspaceSlug,
        item.id,
        { link_kind: linkKind },
        token
      );
    },
  });

  const handleSave = async () => {
    if (unchanged || pairTaken) return;
    setError(null);
    try {
      await updateMutation.mutateAsync();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update assignment.");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-800">Edit assignment</p>
            <p className="text-[11px] text-gray-400">{item.entity_name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              How does this {subjectType} relate?
            </label>
            <div className="relative">
              <select
                value={linkKind}
                onChange={(e) => setLinkKind(e.target.value as AccountabilityLinkKind)}
                className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 pr-8"
              >
                {allowedLinkKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {ACCOUNTABILITY_LINK_OPTIONS[kind].label} — {ACCOUNTABILITY_LINK_OPTIONS[kind].description}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                ▾
              </span>
            </div>
            {pairTaken && (
              <p className="text-xs text-amber-600 mt-1.5">
                This {subjectType} already has this relationship to {item.entity_name}.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-4 py-3 flex justify-end gap-2 border-t border-gray-100">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={unchanged || pairTaken || updateMutation.isPending}
            className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {updateMutation.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
