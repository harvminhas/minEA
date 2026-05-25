"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Search, X } from "lucide-react";
import type {
  CapabilityMapCapability,
  DomainMappingSystem,
  MappingFitness,
} from "@minea/types";
import { useAuth } from "@/lib/auth-context";
import { objectsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { cn } from "@/lib/utils";

const FITNESS_OPTIONS: { value: MappingFitness; label: string; className: string }[] = [
  { value: "none", label: "None", className: "text-gray-600" },
  { value: "weak", label: "Weak", className: "text-red-600" },
  { value: "adequate", label: "Adequate", className: "text-amber-700" },
  { value: "strong", label: "Strong", className: "text-emerald-700" },
];

interface Props {
  capability: CapabilityMapCapability;
  system?: DomainMappingSystem | null;
  currentFitness?: MappingFitness | null;
  existingSystemIds: string[];
  onClose: () => void;
  onMap: (systemId: string, fitness: MappingFitness, createName?: string) => void;
  isSubmitting?: boolean;
}

export function MapCapabilitySystemDialog({
  capability,
  system: initialSystem,
  currentFitness,
  existingSystemIds,
  onClose,
  onMap,
  isSubmitting,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [search, setSearch] = useState(initialSystem?.name ?? "");
  const [selectedSystem, setSelectedSystem] = useState<DomainMappingSystem | null>(initialSystem ?? null);
  const [fitness, setFitness] = useState<MappingFitness>(currentFitness ?? "strong");

  const { data: applications } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "application"],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: "application" }, token!);
    },
  });

  const filtered = useMemo(() => {
    const items = applications?.items ?? [];
    const query = search.trim().toLowerCase();
    if (!query) return items.slice(0, 8);
    return items
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 8);
  }, [applications?.items, search]);

  const trimmedSearch = search.trim();
  const canCreate =
    trimmedSearch.length > 0 &&
    !(applications?.items ?? []).some((item) => item.name.toLowerCase() === trimmedSearch.toLowerCase());

  const handleMap = () => {
    if (selectedSystem) {
      onMap(selectedSystem.id, fitness);
      return;
    }
    if (canCreate) {
      onMap("", fitness, trimmedSearch);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-labelledby="map-capability-system-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">
                Map {capability.name} to a system
              </p>
            </div>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 flex-shrink-0">
              <X size={15} />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Step 1 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">1. Choose a system</p>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                autoFocus
                onChange={(e) => {
                  setSearch(e.target.value);
                  setSelectedSystem(null);
                }}
                placeholder="Search systems..."
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            <div className="mt-1.5 rounded-lg border border-gray-200 divide-y divide-gray-100 max-h-36 overflow-y-auto">
              {filtered.map((item) => {
                const props = item.properties as { category?: string; hosting_model?: string };
                const isSelected = selectedSystem?.id === item.id;
                const alreadyOnMap = existingSystemIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => {
                      setSelectedSystem({
                        id: item.id,
                        name: item.name,
                        category: props.category ?? null,
                        vendor: null,
                        status: item.status ?? null,
                        hosting_model: props.hosting_model ?? null,
                      });
                      setSearch(item.name);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors",
                      isSelected ? "bg-indigo-50" : "hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded bg-gray-100 text-gray-500 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                        {item.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{item.name}</p>
                        {(props.category || props.hosting_model) && (
                          <p className="text-xs text-gray-400">
                            {[props.category, props.hosting_model?.replace(/_/g, " ")].filter(Boolean).join(" · ")}
                          </p>
                        )}
                      </div>
                    </div>
                    {alreadyOnMap && (
                      <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded px-1.5 py-0.5 flex-shrink-0">
                        Healthy
                      </span>
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && !canCreate && (
                <p className="px-3 py-3 text-sm text-gray-400 text-center">No matching systems</p>
              )}
            </div>

            {canCreate && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setSelectedSystem(null)}
                className="mt-1.5 w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 inline-flex items-center gap-2 transition-colors"
              >
                <Plus size={13} />
                Add new: &ldquo;{trimmedSearch}&rdquo;
              </button>
            )}
          </div>

          {/* Step 2 */}
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-2">2. Set fitness</p>
            <div className="grid grid-cols-4 gap-2">
              {FITNESS_OPTIONS.map((option) => {
                const isActive = fitness === option.value;
                const activeStyles: Record<string, string> = {
                  none:     "bg-gray-100 border-gray-400 text-gray-700",
                  weak:     "bg-red-500 border-red-500 text-white",
                  adequate: "bg-amber-400 border-amber-400 text-white",
                  strong:   "bg-emerald-500 border-emerald-500 text-white",
                };
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setFitness(option.value)}
                    className={cn(
                      "rounded-lg border-2 px-2 py-2.5 text-sm font-semibold transition-all",
                      isActive ? activeStyles[option.value] : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50"
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <p className="text-xs text-gray-400">If new system, it&apos;ll appear as a column</p>
          <button
            type="button"
            disabled={isSubmitting || (!selectedSystem && !canCreate)}
            onClick={handleMap}
            className="rounded-lg bg-gray-900 hover:bg-gray-700 disabled:opacity-40 text-white px-5 py-2 text-sm font-semibold transition-colors"
          >
            {isSubmitting ? "Mapping…" : "Map"}
          </button>
        </div>
      </div>
    </>
  );
}
