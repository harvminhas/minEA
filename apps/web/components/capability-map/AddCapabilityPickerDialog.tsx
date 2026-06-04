"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import type { CapabilityMapDomain, LibraryCapabilityTemplateGroup } from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { capabilityMapApi } from "@/lib/api-client";
import { PickerItem } from "@/components/capability-map/TemplateAccordion";
import { domainIcon } from "@/lib/capability-map-icons";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

export interface AddCapabilityPayload {
  name: string;
  owner?: string;
}

interface Props {
  domain: CapabilityMapDomain;
  onAdd: (payload: AddCapabilityPayload) => void;
  onClose: () => void;
  isSubmitting?: boolean;
}

interface FlatSuggestion {
  name: string;
  already_in_domain: boolean;
  templates: string[];
  recommended: boolean;
}

function flattenSuggestions(
  templateGroups: LibraryCapabilityTemplateGroup[] | undefined,
  sourceTemplateId?: string | null
): FlatSuggestion[] {
  const map = new Map<string, FlatSuggestion>();

  for (const group of templateGroups ?? []) {
    const isRecommended = group.template_id === sourceTemplateId;
    for (const cap of group.capabilities) {
      const key = cap.name.toLowerCase();
      const existing = map.get(key);
      if (existing) {
        if (!existing.templates.includes(group.template_name)) {
          existing.templates.push(group.template_name);
        }
        existing.already_in_domain = existing.already_in_domain || !!cap.already_in_domain;
        existing.recommended = existing.recommended || isRecommended;
      } else {
        map.set(key, {
          name: cap.name,
          already_in_domain: !!cap.already_in_domain,
          templates: [group.template_name],
          recommended: isRecommended,
        });
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.recommended !== b.recommended) return a.recommended ? -1 : 1;
    if (a.already_in_domain !== b.already_in_domain) return a.already_in_domain ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

export function AddCapabilityPickerDialog({ domain, onAdd, onClose, isSubmitting }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mode, setMode] = useState<"suggestions" | "create">("suggestions");
  const [newName, setNewName] = useState("");
  const [owner, setOwner] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["capability-library-caps", orgSlug, workspaceSlug, domain.id],
    queryFn: async () => {
      const token = await getToken();
      return capabilityMapApi.libraryCapabilities(orgSlug, workspaceSlug, domain.id, token!);
    },
  });

  const reusable = data?.reusable ?? [];
  const suggestions = useMemo(
    () => flattenSuggestions(data?.template_groups, domain.source_template_id),
    [data?.template_groups, domain.source_template_id]
  );

  const recommended = suggestions.filter((s) => s.recommended);
  const otherSuggestions = suggestions.filter((s) => !s.recommended);
  const sourceTemplateName = data?.template_groups?.find(
    (g) => g.template_id === domain.source_template_id
  )?.template_name;

  const submitAdd = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd({ name: trimmed, owner: owner.trim() || undefined });
  };

  const handleCreate = () => {
    submitAdd(newName);
  };

  const DomainIcon = domainIcon(domain.icon);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="add-capability-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <h3 id="add-capability-title" className="font-semibold text-gray-900">
              Add capability
            </h3>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-gray-400">In domain</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-1 text-sm font-medium text-indigo-900">
                <DomainIcon size={13} className="text-indigo-600" />
                {domain.name}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 pt-4 flex gap-2 flex-shrink-0">
          <TabButton active={mode === "suggestions"} onClick={() => setMode("suggestions")}>
            Pick a capability
          </TabButton>
          <TabButton active={mode === "create"} onClick={() => setMode("create")}>
            Name your own
          </TabButton>
        </div>

        <div className="px-5 pt-3 flex-shrink-0">
          <label className="block">
            <span className="text-xs font-medium text-gray-600 mb-1.5 block">Owner</span>
            <input
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="e.g. PDY, Sales Team"
              className={formFieldClass}
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {mode === "suggestions" ? (
            isLoading ? (
              <p className="text-sm text-gray-400">Loading suggestions…</p>
            ) : (
              <div className="space-y-5">
                {reusable.length > 0 && (
                  <SuggestionSection title="From your map">
                    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
                      {reusable.map((item) => (
                        <PickerItem
                          key={`${item.name}-${item.from_domain}`}
                          label={item.name}
                          hint={`Used in ${item.from_domain}`}
                          disabled={isSubmitting}
                          onClick={() => submitAdd(item.name)}
                        />
                      ))}
                    </div>
                  </SuggestionSection>
                )}

                {domain.source_template_id && recommended.length > 0 && (
                  <SuggestionSection
                    title="Recommended"
                    subtitle={
                      sourceTemplateName
                        ? `Common for ${domain.name} in ${sourceTemplateName}`
                        : `Common for ${domain.name}`
                    }
                  >
                    <SuggestionList items={recommended} isSubmitting={isSubmitting} onAdd={submitAdd} />
                  </SuggestionSection>
                )}

                {otherSuggestions.length > 0 && (
                  <SuggestionSection
                    title={domain.source_template_id ? "More ideas" : `Suggested for ${domain.name}`}
                    subtitle="From industry libraries — click to add to this domain"
                  >
                    <SuggestionList items={otherSuggestions} isSubmitting={isSubmitting} onAdd={submitAdd} />
                  </SuggestionSection>
                )}

                {reusable.length === 0 && suggestions.length === 0 && (
                  <p className="text-sm text-gray-400">
                    No suggestions yet for &ldquo;{domain.name}&rdquo;. Switch to Name your own to add one.
                  </p>
                )}
              </div>
            )
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">
                Name a level-2 capability inside <strong>{domain.name}</strong>.
              </p>
              <label className="block">
                <span className="text-xs font-medium text-gray-600 mb-1.5 block">Capability name</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Onboarding, Finance reporting"
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
                Add to {domain.name}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function SuggestionSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-0.5">{title}</p>
      {subtitle ? <p className="text-xs text-gray-400 mb-2">{subtitle}</p> : <div className="mb-2" />}
      {children}
    </section>
  );
}

function SuggestionList({
  items,
  isSubmitting,
  onAdd,
}: {
  items: FlatSuggestion[];
  isSubmitting?: boolean;
  onAdd: (name: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 divide-y divide-gray-100">
      {items.map((item) => (
        <PickerItem
          key={item.name}
          label={item.name}
          hint={
            item.templates.length > 0
              ? `Common in ${item.templates.slice(0, 2).join(", ")}${
                  item.templates.length > 2 ? ` +${item.templates.length - 2}` : ""
                }`
              : undefined
          }
          disabled={item.already_in_domain || isSubmitting}
          disabledReason={item.already_in_domain ? "Already in this domain" : undefined}
          onClick={() => onAdd(item.name)}
        />
      ))}
    </div>
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
