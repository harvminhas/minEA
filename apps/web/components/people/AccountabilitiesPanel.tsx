"use client";

import Link from "next/link";
import { ArrowUpRight, Box, Database, Flag, GitBranch, HardDrive, Layers, Link2, Pencil, Star, Trash2 } from "lucide-react";
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
  data_domain: Flag,
  data_store: HardDrive,
};

const SECTION_ICON: Record<string, typeof Box> = {
  products: Box,
  capabilities: Star,
  domains: Layers,
  processes: GitBranch,
  systems: Database,
  data_domains: Flag,
  data_stores: HardDrive,
};

function AccountabilityRow({
  item,
  onEdit,
  onDelete,
  isDeleting,
}: {
  item: PeopleAccountability;
  onEdit?: (item: PeopleAccountability) => void;
  onDelete?: (item: PeopleAccountability) => void;
  isDeleting?: boolean;
}) {
  const { basePath } = useTenancy();
  const Icon = ENTITY_ICON[item.entity_kind] ?? Box;
  const href = entityPath(basePath, item.entity_kind, item.entity_id);

  return (
    <div className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-gray-200/80 hover:border-gray-300 transition-colors">
      <div className="h-6 w-6 rounded flex items-center justify-center bg-gray-50 text-gray-400 flex-shrink-0">
        <Icon size={12} />
      </div>

      <div className="flex-1 min-w-0">
        {href ? (
          <Link href={href} className="text-sm text-gray-800 hover:text-gray-900 truncate block">
            {item.entity_name}
            {item.subtitle && (
              <span className="text-gray-400 font-normal"> · {item.subtitle}</span>
            )}
          </Link>
        ) : (
          <p className="text-sm text-gray-800 truncate">
            {item.entity_name}
            {item.subtitle && (
              <span className="text-gray-400 font-normal"> · {item.subtitle}</span>
            )}
          </p>
        )}
      </div>

      <span
        className={cn(
          "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize flex-shrink-0",
          LINK_KIND_STYLE[item.link_kind] ?? "bg-gray-100 text-gray-600"
        )}
      >
        {item.link_kind}
      </span>

      {(onEdit || onDelete) && (
        <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onEdit && (
            <button
              type="button"
              title="Edit relationship"
              onClick={() => onEdit(item)}
              className="p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100"
            >
              <Pencil size={13} />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              title="Remove assignment"
              disabled={isDeleting}
              onClick={() => onDelete(item)}
              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-40"
            >
              <Trash2 size={13} />
            </button>
          )}
        </div>
      )}

      {href && (
        <Link href={href} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

export interface AssignTarget {
  sectionKey: string;
  entityKind: string;
  sectionTitle: string;
}

interface Props {
  accountabilities: PeopleAccountability[];
  subjectLabel: "role" | "team";
  includeDomains?: boolean;
  onAssign?: (target: AssignTarget) => void;
  onEdit?: (item: PeopleAccountability) => void;
  onDelete?: (item: PeopleAccountability) => void;
  deletingId?: string | null;
}

export function AccountabilitiesPanel({
  accountabilities,
  subjectLabel,
  includeDomains,
  onAssign,
  onEdit,
  onDelete,
  deletingId,
}: Props) {
  const sections = groupAccountabilities(accountabilities, includeDomains);
  const editable = !!(onAssign || onEdit || onDelete);

  return (
    <div className="flex flex-col h-full bg-[#faf8f5]">
      <div className="px-6 pt-5 pb-4">
        <p className="text-xs text-gray-400 flex items-center gap-1.5">
          <Link2 size={12} className="text-gray-300" />
          Everything this {subjectLabel} {subjectLabel === "team" ? "is accountable for" : "touches"}
          {editable ? " · assign, edit, or remove below" : " · read-only"}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {sections.map((section) => {
          const SectionIcon = SECTION_ICON[section.key] ?? Box;
          return (
            <section key={section.key}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <SectionIcon size={12} className="text-gray-400 flex-shrink-0" />
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
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
                        sectionTitle: section.title,
                      })
                    }
                    className="text-[11px] text-gray-500 border border-gray-200 rounded-md px-2 py-0.5 hover:bg-white transition-colors flex-shrink-0 ml-2"
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
                    <AccountabilityRow
                      key={item.id}
                      item={item}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      isDeleting={deletingId === item.id}
                    />
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
