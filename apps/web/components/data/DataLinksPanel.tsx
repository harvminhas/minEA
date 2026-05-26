"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Box,
  Database,
  Flag,
  GitBranch,
  Link2,
  Server,
  Sparkles,
  Star,
} from "lucide-react";
import type { DataLink } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { entityPath, ROLE_TAG_STYLE, type DataLinkSection } from "@/lib/data-utils";
import { cn } from "@/lib/utils";

const ICON: Record<string, typeof Box> = {
  data_object: Box,
  data_store: Database,
  data_domain: Flag,
  application: Server,
  integration_flow: ArrowLeftRight,
  capability: Star,
  process: GitBranch,
  business_domain: Star,
};

function LinkRow({ item }: { item: DataLink }) {
  const { basePath } = useTenancy();
  const Icon = ICON[item.entity_kind] ?? Box;
  const href = entityPath(basePath, item.entity_kind, item.entity_id);

  const inner = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-gray-200/80 hover:border-gray-300 transition-colors">
      <div className="h-6 w-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 flex-shrink-0">
        <Icon size={12} />
      </div>
      <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">
        {item.entity_name}
        {item.subtitle && !item.role_tag && (
          <span className="text-gray-400 font-normal"> · {item.subtitle}</span>
        )}
      </p>
      {item.role_tag && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0",
            ROLE_TAG_STYLE[item.role_tag] ?? "bg-gray-100 text-gray-600"
          )}
        >
          {item.role_tag.replace(/_/g, " ")}
        </span>
      )}
      {href && <ArrowUpRight size={13} className="text-gray-300 flex-shrink-0" />}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

export type AssignTarget = DataLinkSection;

interface Props {
  sections: DataLinkSection[];
  headerText: string;
  inferredSummary?: string[];
  onAssign?: (target: AssignTarget) => void;
  twoColumnKeys?: string[];
}

export function DataLinksPanel({
  sections,
  headerText,
  inferredSummary,
  onAssign,
  twoColumnKeys = ["capabilities", "processes"],
}: Props) {
  const mainSections = sections.filter((s) => !twoColumnKeys.includes(s.key));
  const sideSections = sections.filter((s) => twoColumnKeys.includes(s.key));

  return (
    <div className="flex flex-col h-full bg-[#faf8f5]">
      <div className="px-6 pt-5 pb-4">
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Link2 size={12} className="text-gray-300" />
          {headerText}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {mainSections.map((section) => (
          <SectionBlock key={section.key} section={section} onAssign={onAssign} />
        ))}

        {sideSections.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            {sideSections.map((section) => (
              <SectionBlock key={section.key} section={section} onAssign={onAssign} compact />
            ))}
          </div>
        )}

        {inferredSummary && inferredSummary.length > 0 && (
          <div className="rounded-lg border border-violet-200/60 bg-violet-50/40 px-4 py-3">
            <p className="text-xs font-medium text-violet-700 flex items-center gap-1.5 mb-2">
              <Sparkles size={12} />
              Inferred from governed entities
            </p>
            <ul className="space-y-1">
              {inferredSummary.map((line) => (
                <li key={line} className="text-xs text-violet-600/80">
                  · {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionBlock({
  section,
  onAssign,
  compact,
}: {
  section: DataLinkSection;
  onAssign?: (target: AssignTarget) => void;
  compact?: boolean;
}) {
  const label = section.subtitle
    ? `${section.title} · ${section.subtitle}`
    : section.title;

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <span
          className={cn(
            "font-semibold text-gray-400 uppercase tracking-wider",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          {label}
        </span>
        {!section.readOnly && section.actionLabel && onAssign && (
          <button
            type="button"
            onClick={() => onAssign(section)}
            className="text-[11px] text-gray-500 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-white transition-colors"
          >
            {section.actionLabel}
          </button>
        )}
      </div>

      {section.items.length === 0 ? (
        <div className="rounded-lg border border-gray-200/60 px-3 py-2.5 bg-white/50">
          <p className="text-sm text-gray-400 italic">
            No {section.title.toLowerCase()} assigned
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {section.items.map((item) => (
            <LinkRow key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}
