"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Box,
  Database,
  Flag,
  GitBranch,
  Server,
  Star,
} from "lucide-react";
import type { DataLink } from "@minea/types";
import { entityPath, ROLE_TAG_STYLE } from "@/lib/data-utils";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Box> = {
  data_object: Box,
  data_store: Database,
  data_domain: Flag,
  application: Server,
  integration_flow: ArrowLeftRight,
  capability: Star,
  process: GitBranch,
};

export function OperationalLinkList({
  links,
  basePath,
  emptyLabel = "None assigned",
}: {
  links: DataLink[];
  basePath: string;
  emptyLabel?: string;
}) {
  if (links.length === 0) {
    return <p className="text-sm text-gray-400">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {links.map((link) => {
        const href = entityPath(basePath, link.entity_kind, link.entity_id);
        const Icon = ICON[link.entity_kind] ?? Box;
        const inner = (
          <>
            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded bg-gray-50 text-gray-400">
              <Icon size={12} />
            </div>
            <p className="min-w-0 flex-1 truncate text-sm text-gray-800">{link.entity_name}</p>
            {link.role_tag && (
              <span
                className={cn(
                  "flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium capitalize",
                  ROLE_TAG_STYLE[link.role_tag] ?? "bg-gray-100 text-gray-600"
                )}
              >
                {link.role_tag.replace(/_/g, " ")}
              </span>
            )}
            {href && <ArrowUpRight size={13} className="flex-shrink-0 text-gray-300" />}
          </>
        );

        return (
          <li key={link.id}>
            {href ? (
              <Link
                href={href}
                className="flex items-center gap-2.5 rounded-lg border border-gray-200/80 bg-white px-3 py-2.5 transition-colors hover:border-gray-300"
              >
                {inner}
              </Link>
            ) : (
              <div className="flex items-center gap-2.5 rounded-lg border border-gray-200/80 bg-white px-3 py-2.5">
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
