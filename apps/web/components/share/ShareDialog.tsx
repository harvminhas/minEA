"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link2, X } from "lucide-react";
import type { ShareCreate, ShareResourceType } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { billingApi, workspacesApi } from "@/lib/api-client";
import { shareCreateBlockedMessage, shareQuotaLabel } from "@/lib/plan-features";

interface Props {
  resourceType: ShareResourceType;
  resourceKey?: string;
  resourceId?: string;
  defaultTitle: string;
  onClose: () => void;
}

export function ShareDialog({
  resourceType,
  resourceKey,
  resourceId,
  defaultTitle,
  onClose,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [title, setTitle] = useState(defaultTitle);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: billingStatus } = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return billingApi.status(orgSlug, token!);
    },
    enabled: !!orgSlug,
  });

  const atShareQuota = billingStatus?.can_create_share_link === false;

  const mutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body: ShareCreate = {
        resource_type: resourceType,
        resource_key: resourceKey ?? null,
        resource_id: resourceId ?? null,
        title: title.trim(),
        expires_in_days: expiresInDays,
      };
      return workspacesApi.createShare(orgSlug, workspaceSlug, body, token!);
    },
    onSuccess: (data) => {
      setError(null);
      setShareUrl(`${window.location.origin}${data.share_url}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="share-dialog-title"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <Link2 size={18} className="text-indigo-600" />
            <h3 id="share-dialog-title" className="font-semibold text-gray-900">
              Share link
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Create a read-only link anyone can open — no sign-in, no navigation chrome. Revoke
          anytime from workspace settings.
        </p>

        {billingStatus && (
          <p className="text-xs text-gray-400 mb-4">
            {shareQuotaLabel(
              billingStatus.active_share_link_count,
              billingStatus.active_share_link_limit
            )}
          </p>
        )}

        {atShareQuota ? (
          <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm text-amber-900">
            <p>
              {shareCreateBlockedMessage(
                billingStatus?.plan,
                billingStatus?.active_share_link_limit
              )}
            </p>
            <Link
              href={`/orgs/${orgSlug}/settings`}
              className="mt-2 inline-block text-xs font-medium text-indigo-700 hover:text-indigo-900"
            >
              View plan in settings
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Link title</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Expires in</label>
                <select
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
                >
                  <option value={7}>7 days</option>
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                </select>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

            {shareUrl ? (
              <div className="mt-4 rounded-lg bg-indigo-50 border border-indigo-100 p-3">
                <p className="text-xs font-medium text-indigo-800 mb-1">Share URL (copy and send)</p>
                <p className="text-xs text-indigo-900 break-all">{shareUrl}</p>
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(shareUrl)}
                  className="mt-2 text-xs font-medium text-indigo-700 hover:text-indigo-900"
                >
                  Copy link
                </button>
              </div>
            ) : (
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => mutation.mutate()}
                  disabled={!title.trim() || mutation.isPending}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
                >
                  {mutation.isPending ? "Creating…" : "Create link"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
