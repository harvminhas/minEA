"use client";

import Link from "next/link";
import {
  ArrowLeftRight,
  ArrowUpRight,
  Box,
  Database,
  Flag,
  GitBranch,
  Info,
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

function LinkRow({ item, navigable = true }: { item: DataLink; navigable?: boolean }) {
  const { basePath } = useTenancy();
  const Icon = ICON[item.entity_kind] ?? Box;
  const href = navigable ? entityPath(basePath, item.entity_kind, item.entity_id) : null;

  const inner = (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-gray-200/80 transition-colors",
        href && "hover:border-gray-300"
      )}
    >
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

function SectionHint({ text }: { text: string }) {
  return (
    <span className="relative inline-flex flex-shrink-0 group/hint">
      <button
        type="button"
        className="rounded p-0.5 text-gray-300 hover:text-gray-500 focus:outline-none focus-visible:text-gray-500 focus-visible:ring-1 focus-visible:ring-gray-300"
        aria-label="More information"
      >
        <Info size={12} />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-20 mt-1.5 hidden w-56 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[11px] font-normal normal-case leading-snug tracking-normal text-gray-600 shadow-md group-hover/hint:block group-focus-within/hint:block"
      >
        {text}
      </span>
    </span>
  );
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
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={cn(
            "font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-1 min-w-0",
            compact ? "text-[9px]" : "text-[10px]"
          )}
        >
          <span className="truncate">{label}</span>
          {section.footnote && <SectionHint text={section.footnote} />}
        </span>
        {!section.readOnly && section.actionLabel && onAssign && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAssign(section);
            }}
            className="text-[11px] text-gray-500 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-white transition-colors flex-shrink-0"
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
            <LinkRow key={item.id} item={item} navigable={!section.nonNavigable} />
          ))}
        </div>
      )}
    </section>
  );
}
