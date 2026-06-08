"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";
import type { ShareResourceType } from "@minea/types";
import { useAppStore } from "@/lib/store";
import { planAllowsShareResource, shareUnavailableReason } from "@/lib/share-plan";
import { usePermissions } from "@/lib/use-permissions";
import { ShareDialog } from "@/components/share/ShareDialog";

interface Props {
  resourceType: ShareResourceType;
  resourceKey?: string;
  resourceId?: string;
  title: string;
  className?: string;
}

export function ShareButton({ resourceType, resourceKey, resourceId, title, className }: Props) {
  const { canShare } = usePermissions();
  const { activeOrg } = useAppStore();
  const [open, setOpen] = useState(false);

  if (!canShare) return null;

  const plan = activeOrg?.plan;
  const allowed = planAllowsShareResource(plan, resourceType, resourceKey);
  const disabledReason = shareUnavailableReason(plan, resourceType, resourceKey);

  const buttonClass =
    className ??
    "inline-flex items-center gap-1.5 text-xs font-medium border rounded-md px-2.5 py-1.5 transition-colors";

  const enabledClass =
    "text-gray-600 hover:text-indigo-700 border-gray-200 bg-white hover:bg-gray-50";
  const disabledClass = "text-gray-400 border-gray-200 bg-gray-50 cursor-not-allowed opacity-70";

  if (!allowed) {
    return (
      <span title={disabledReason ?? "Sharing unavailable"} className="inline-flex">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className={`${buttonClass} ${disabledClass}`}
        >
          <Link2 size={13} />
          Share
        </button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonClass} ${enabledClass}`}
      >
        <Link2 size={13} />
        Share
      </button>
      {open && (
        <ShareDialog
          resourceType={resourceType}
          resourceKey={resourceKey}
          resourceId={resourceId}
          defaultTitle={title}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
