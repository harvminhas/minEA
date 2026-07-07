"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { CapabilityMapDomain } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { capabilityMapApi } from "@/lib/api-client";
import { PickerItem, TemplateAccordionSection } from "@/components/capability-map/TemplateAccordion";
import { domainIcon } from "@/lib/capability-map-icons";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

export type AddCapabilityWizardResult =
  | { capabilityName: string; domainId: string }
  | {
      capabilityName: string;
      newDomain: { name: string; icon?: string; sourceTemplateId?: string };
    };

interface Props {
  domains: CapabilityMapDomain[];
  existingDomainNames: string[];
  onSubmit: (result: AddCapabilityWizardResult) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

type DomainView = "list" | "expanded";

export function AddCapabilityWizardDialog({
  domains,
  existingDomainNames,
  onSubmit,
  onClose,
  isSubmitting,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();

  const [step, setStep] = useState<1 | 2>(1);
  const [capabilityName, setCapabilityName] = useState("");
  const [domainView, setDomainView] = useState<DomainView>(domains.length > 0 ? "list" : "expanded");
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);
  const [domainMode, setDomainMode] = useState<"library" | "create">("library");
  const [newDomainName, setNewDomainName] = useState("");
  const [selectedLibraryDomain, setSelectedLibraryDomain] = useState<{
    name: string;
    icon: string;
    templateId: string;
  } | null>(null);
  const [expandedTemplates, setExpandedTemplates] = useState<Set<string>>(new Set());

  const { data: libraryGroups = [], isLoading: libraryLoading } = useQuery({
    queryKey: ["capability-library-domains", orgSlug, workspaceSlug, existingDomainNames.join(",")],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.libraryDomains(orgSlug, workspaceSlug, token!);
    },
    enabled: step === 2 && domainView === "expanded",
  });

  const trimmedName = capabilityName.trim();

  const goToDomainStep = () => {
    if (!trimmedName) return;
    setStep(2);
    setDomainView(domains.length > 0 ? "list" : "expanded");
  };

  const canCreate =
    step === 2 &&
    !isSubmitting &&
    (domainView === "list"
      ? Boolean(selectedDomainId)
      : domainMode === "create"
        ? Boolean(newDomainName.trim())
        : Boolean(selectedLibraryDomain));

  const handleCreate = () => {
    if (!canCreate) return;

    if (domainView === "list" && selectedDomainId) {
      onSubmit({ capabilityName: trimmedName, domainId: selectedDomainId });
      return;
    }

    if (domainMode === "create") {
      onSubmit({
        capabilityName: trimmedName,
        newDomain: { name: newDomainName.trim() },
      });
      return;
    }

    if (selectedLibraryDomain) {
      onSubmit({
        capabilityName: trimmedName,
        newDomain: {
          name: selectedLibraryDomain.name,
          icon: selectedLibraryDomain.icon,
          sourceTemplateId: selectedLibraryDomain.templateId,
        },
      });
    }
  };

  const toggleTemplate = (templateId: string) => {
    setExpandedTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="add-capability-wizard-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              {step === 1 ? "Step 1 — Name" : "Step 2 — Domain"}
            </p>
            <h3 id="add-capability-wizard-title" className="font-semibold text-gray-900 text-lg">
              {step === 1
                ? "New capability"
                : domainView === "list"
                  ? `${trimmedName} · choose domain`
                  : "Choose a domain"}
            </h3>
            {step === 2 && domainView === "expanded" && (
              <p className="text-sm text-gray-500 mt-1">Domains group capabilities on your map.</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {step === 1 ? (
            <label className="block">
              <span className="text-sm font-medium text-gray-700 mb-1.5 block">
                Name <span className="text-red-500">*</span>
              </span>
              <input
                value={capabilityName}
                onChange={(e) => setCapabilityName(e.target.value)}
                placeholder="e.g. Order Management"
                className={formFieldClass}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") goToDomainStep();
                }}
              />
            </label>
          ) : domainView === "list" ? (
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Your domains</p>
              <div className="space-y-2">
                {domains.map((domain) => {
                  const selected = selectedDomainId === domain.id;
                  return (
                    <button
                      key={domain.id}
                      type="button"
                      onClick={() => setSelectedDomainId(domain.id)}
                      className={cn(
                        "w-full rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors",
                        selected
                          ? "border-indigo-500 bg-indigo-50 text-indigo-900"
                          : "border-gray-200 bg-white text-gray-800 hover:border-gray-300"
                      )}
                    >
                      {domain.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDomainView("expanded");
                  setSelectedDomainId(null);
                }}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
              >
                + Browse industry libraries or name a new domain
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <TabButton active={domainMode === "library"} onClick={() => setDomainMode("library")}>
                  Browse industries
                </TabButton>
                <TabButton active={domainMode === "create"} onClick={() => setDomainMode("create")}>
                  Name your own
                </TabButton>
              </div>

              {domainMode === "library" ? (
                libraryLoading ? (
                  <p className="text-sm text-gray-400">Loading industries…</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Industry libraries
                    </p>
                    {libraryGroups.map((group) => {
                      const available = group.domains.filter((d) => !d.already_on_map).length;
                      return (
                        <TemplateAccordionSection
                          key={group.template_id}
                          templateId={group.template_id}
                          templateName={group.template_name}
                          templateIconKey={group.template_icon}
                          expanded={expandedTemplates.has(group.template_id)}
                          onToggle={() => toggleTemplate(group.template_id)}
                          countLabel={`${available} domain${available === 1 ? "" : "s"}`}
                        >
                          {group.domains.map((domain) => {
                            const Icon = domainIcon(domain.icon);
                            const selected =
                              selectedLibraryDomain?.name === domain.name &&
                              selectedLibraryDomain.templateId === group.template_id;
                            return (
                              <div
                                key={`${group.template_id}-${domain.name}`}
                                className="flex items-start gap-2"
                              >
                                <div className="rounded-md bg-indigo-50 p-1 mt-1.5 text-indigo-600 flex-shrink-0">
                                  <Icon size={12} />
                                </div>
                                <PickerItem
                                  label={domain.name}
                                  hint={selected ? "Selected" : "Level 1 · Domain"}
                                  disabled={domain.already_on_map || isSubmitting}
                                  disabledReason={
                                    domain.already_on_map ? "Already on your map" : undefined
                                  }
                                  onClick={() =>
                                    setSelectedLibraryDomain({
                                      name: domain.name,
                                      icon: domain.icon,
                                      templateId: group.template_id,
                                    })
                                  }
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
                  <label className="block">
                    <span className="text-xs font-medium text-gray-600 mb-1.5 block">Domain name</span>
                    <input
                      value={newDomainName}
                      onChange={(e) => {
                        setNewDomainName(e.target.value);
                        setSelectedLibraryDomain(null);
                      }}
                      placeholder="e.g. Commerce, Finance, Product"
                      className={formFieldClass}
                      autoFocus
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-5 py-4 border-t border-gray-100 flex-shrink-0">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => {
                if (domainView === "expanded" && domains.length > 0) {
                  setDomainView("list");
                  setSelectedLibraryDomain(null);
                  setNewDomainName("");
                  setDomainMode("library");
                } else {
                  setStep(1);
                }
              }}
              className="flex-1 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          ) : (
            <div className="flex-1" />
          )}

          {step === 1 ? (
            <button
              type="button"
              disabled={!trimmedName || isSubmitting}
              onClick={goToDomainStep}
              className="flex-1 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium"
            >
              Next: choose domain
            </button>
          ) : (
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className="flex-1 rounded-lg bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2.5 text-sm font-medium"
            >
              Create capability
            </button>
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
        "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-gray-900 bg-gray-900 text-white"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
      )}
    >
      {children}
    </button>
  );
}
