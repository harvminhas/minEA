"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { capabilityMapApi } from "@/lib/api-client";
import { PickerItem, TemplateAccordionSection } from "@/components/capability-map/TemplateAccordion";
import { domainIcon } from "@/lib/capability-map-icons";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

interface Props {
  existingDomainNames: string[];
  onSelectLibrary: (name: string, icon: string, templateId: string) => void;
  onCreateNew: (name: string) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

export function AddDomainPickerDialog({
  existingDomainNames,
  onSelectLibrary,
  onCreateNew,
  onClose,
  isSubmitting,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mode, setMode] = useState<"library" | "create">("library");
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["capability-library-domains", orgSlug, workspaceSlug, existingDomainNames.join(",")],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.libraryDomains(orgSlug, workspaceSlug, token!);
    },
  });

  const toggleTemplate = (templateId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreateNew(trimmed);
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="add-domain-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 id="add-domain-title" className="font-semibold text-gray-900">
              Add domain
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Choose a <strong>level-1 domain</strong> from an industry library, or name your own.
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Domains group capabilities on your map — not individual capabilities.
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 flex gap-2 flex-shrink-0">
          <TabButton active={mode === "library"} onClick={() => setMode("library")}>
            Browse industries
          </TabButton>
          <TabButton active={mode === "create"} onClick={() => setMode("create")}>
            Name your own
          </TabButton>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === "library" ? (
            isLoading ? (
              <p className="text-sm text-gray-400">Loading industries…</p>
            ) : (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1">
                  Industry libraries
                </p>
                {groups.map((group) => {
                  const available = group.domains.filter((d) => !d.already_on_map).length;
                  return (
                    <TemplateAccordionSection
                      key={group.template_id}
                      templateId={group.template_id}
                      templateName={group.template_name}
                      templateIconKey={group.template_icon}
                      expanded={expanded.has(group.template_id)}
                      onToggle={() => toggleTemplate(group.template_id)}
                      countLabel={`${available} domain${available === 1 ? "" : "s"}`}
                    >
                      {group.domains.map((domain) => {
                        const Icon = domainIcon(domain.icon);
                        return (
                          <div key={`${group.template_id}-${domain.name}`} className="flex items-start gap-2">
                            <div className="rounded-md bg-indigo-50 p-1 mt-1.5 text-indigo-600 flex-shrink-0">
                              <Icon size={12} />
                            </div>
                            <PickerItem
                              label={domain.name}
                              hint="Level 1 · Domain"
                              disabled={domain.already_on_map || isSubmitting}
                              disabledReason={domain.already_on_map ? "Already on your map" : undefined}
                              onClick={() => onSelectLibrary(domain.name, domain.icon, group.template_id)}
                            />
                          </div>
                        );
                      })}
                    </TemplateAccordionSection>
                  );
                })}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Create a new top-level domain on your map.</p>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 mb-1.5 block">Domain name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Customer, Finance, Product"
                  className={formFieldClass}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                />
              </label>
              <button
                type="button"
                disabled={!newName.trim() || isSubmitting}
                onClick={handleCreate}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md px-4 py-2 text-sm font-medium"
              >
                <Plus size={14} />
                Add domain
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-indigo-100 text-indigo-700" : "text-gray-500 hover:bg-gray-100"
      )}
    >
      {children}
    </button>
  );
}
