"use client";

import { Link2, X } from "lucide-react";
import type { SystemDrawerLink } from "@/lib/system-drawer-utils";
import { relationshipWords } from "@/lib/relationship-display";
import { cn } from "@/lib/utils";

interface Props {
  links: SystemDrawerLink[];
  nameById: Record<string, string>;
  namesLoading?: boolean;
  emptyLabel: string;
  onRemove?: (relationshipId: string) => void;
  isRemoving?: boolean;
  /** The record these links hang off (these lists live on application-style records). */
  systemType?: string;
}

export function SystemLinkedObjectList({
  links,
  nameById,
  namesLoading = false,
  emptyLabel,
  onRemove,
  isRemoving,
  systemType = "application",
}: Props) {
  if (links.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => {
        const name = nameById[link.objectId] ?? (namesLoading ? "Loading…" : "Unknown object");
        // Read from this system: forward when it is the stored source, the reverse words otherwise.
        const verb =
          link.direction === "outbound"
            ? relationshipWords(link.relationshipType, systemType, link.objectType).forward
            : relationshipWords(link.relationshipType, link.objectType, systemType).reverse;

        return (
          <li
            key={`${link.relationshipId}-${link.direction}`}
            className="flex items-center justify-between gap-3 py-2.5 px-3 bg-stone-50 rounded-lg"
          >
            <div className="flex items-start gap-2 min-w-0">
              <Link2 size={14} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm text-gray-900 leading-snug truncate">{name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {verb}
                </p>
              </div>
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(link.relationshipId)}
                disabled={isRemoving}
                className={cn(
                  "text-gray-300 hover:text-red-400 transition-colors flex-shrink-0",
                  isRemoving && "opacity-50 cursor-not-allowed"
                )}
                aria-label={`Remove link to ${name}`}
              >
                <X size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
