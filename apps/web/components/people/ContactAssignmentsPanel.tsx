"use client";

import Link from "next/link";
import { ArrowUpRight, Box, Database, Flag, GitBranch, Layers, Map, Star } from "lucide-react";
import type { ContactAssignment } from "@minea/types";
import { useTenancy } from "@/lib/tenancy";
import { entityPath } from "@/lib/people-utils";

const ENTITY_ICON: Record<string, typeof Box> = {
  product: Box,
  capability: Star,
  business_domain: Layers,
  process: GitBranch,
  application: Database,
  data_domain: Flag,
  data_store: Database,
  journey: Map,
};

const SECTIONS: Array<{ key: string; title: string; entityKind: string }> = [
  { key: "products", title: "Products", entityKind: "product" },
  { key: "capabilities", title: "Capabilities", entityKind: "capability" },
  { key: "domains", title: "Capability Domains", entityKind: "business_domain" },
  { key: "processes", title: "Processes", entityKind: "process" },
  { key: "systems", title: "Systems", entityKind: "application" },
  { key: "journeys", title: "Journeys", entityKind: "journey" },
  { key: "data_domains", title: "Data Domains", entityKind: "data_domain" },
  { key: "data_stores", title: "Data Stores", entityKind: "data_store" },
];

function AssignmentRow({ item }: { item: ContactAssignment }) {
  const { basePath } = useTenancy();
  const Icon = ENTITY_ICON[item.entity_kind] ?? Box;
  const href = entityPath(basePath, item.entity_kind, item.entity_id);

  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg bg-white border border-gray-200/80 hover:border-gray-300 transition-colors">
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
      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-sky-50 text-sky-700 flex-shrink-0">
        point of contact
      </span>
      {href && (
        <Link href={href} className="text-gray-300 hover:text-gray-500 flex-shrink-0">
          <ArrowUpRight size={13} />
        </Link>
      )}
    </div>
  );
}

export function ContactAssignmentsPanel({ assignments }: { assignments: ContactAssignment[] }) {
  const sections = SECTIONS.map((section) => ({
    ...section,
    items: assignments.filter((item) => item.entity_kind === section.entityKind),
  })).filter((section) => section.items.length > 0);

  return (
    <div className="flex flex-col h-full bg-[#faf8f5]">
      <div className="px-6 pt-5 pb-4">
        <p className="text-xs text-gray-400">
          Where this contact is the point of contact — assigned from object forms.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {assignments.length === 0 ? (
          <div className="rounded-lg border border-gray-200/60 px-4 py-6 bg-white/50 text-center">
            <p className="text-sm text-gray-400 italic">Not a point of contact on anything yet.</p>
            <p className="text-xs text-gray-400 mt-1">
              Set this person as point of contact when editing a system, product, or process.
            </p>
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.key}>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
                {section.title}
              </p>
              <div className="space-y-1.5">
                {section.items.map((item) => (
                  <AssignmentRow key={`${item.entity_kind}-${item.entity_id}`} item={item} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
