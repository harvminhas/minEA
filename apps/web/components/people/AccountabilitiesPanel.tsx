"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Box, Database, GitBranch, Layers, Link2, Star } from "lucide-react";
import type { PeopleAccountability } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { entityPath, groupAccountabilities, LINK_KIND_STYLE } from "@/lib/people-utils";
import { cn } from "@/lib/utils";

const ENTITY_ICON: Record<string, typeof Box> = {
  product: Box,
  capability: Star,
  business_domain: Layers,
  process: GitBranch,
  application: Database,
};

const SECTION_ICON: Record<string, typeof Box> = {
  "products-owns": Box,
  "capabilities-owns": Star,
  "domains-owns": Layers,
  "processes-owns": GitBranch,
  "processes-performs": GitBranch,
  "systems-stewards": Database,
};

function AccountabilityRow({ item }: { item: PeopleAccountability }) {
  const { basePath } = useTenancy();
  const Icon = ENTITY_ICON[item.entity_kind] ?? Box;
  const href = entityPath(basePath, item.entity_kind, item.entity_id);
  const isProcess = item.entity_kind === "process";

  const inner = (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-gray-200/80 hover:border-gray-300 transition-colors">
      <div className="h-6 w-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 flex-shrink-0">
        <Icon size={12} />
      </div>
      <p className="text-sm text-gray-800 flex-1 min-w-0 truncate">
        {item.entity_name}
        {item.subtitle && !isProcess && (
          <span className="text-gray-400 font-normal"> · {item.subtitle}</span>
        )}
      </p>
      {isProcess && (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0",
            LINK_KIND_STYLE[item.link_kind] ?? "bg-gray-100 text-gray-600"
          )}
        >
          {item.link_kind}
        </span>
      )}
      <ArrowUpRight size={13} className="text-gray-300 flex-shrink-0" />
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

interface AssignTarget {
  sectionKey: string;
  entityKind: string;
  linkKind: string;
  sectionTitle: string;
}

interface Props {
  accountabilities: PeopleAccountability[];
  subjectLabel: "role" | "team";
  includeDomains?: boolean;
  onAssign?: (target: AssignTarget) => void;
}

export function AccountabilitiesPanel({ accountabilities, subjectLabel, includeDomains, onAssign }: Props) {
  const sections = groupAccountabilities(accountabilities, includeDomains);

  return (
    <div className="flex flex-col h-full bg-[#faf8f5]">
      <div className="px-6 pt-5 pb-4">
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Link2 size={12} className="text-gray-300" />
          Everything this {subjectLabel} {subjectLabel === "team" ? "is accountable for" : "touches"} · read-only · edit from each entity
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {sections.map((section) => {
          const SectionIcon = SECTION_ICON[section.key] ?? Box;
          return (
            <section key={section.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <SectionIcon size={12} className="text-gray-400" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {section.title} · {section.subtitle}
                  </span>
                </div>
                {onAssign && (
                  <button
                    type="button"
                    onClick={() =>
                      onAssign({
                        sectionKey: section.key,
                        entityKind: section.entityKind,
                        linkKind: section.linkKind,
                        sectionTitle: section.title,
                      })
                    }
                    className="text-[11px] text-gray-500 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-white transition-colors"
                  >
                    + Assign
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
                    <AccountabilityRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
