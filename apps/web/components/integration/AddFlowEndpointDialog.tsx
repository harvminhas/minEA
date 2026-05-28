"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { dataApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  isEntityCoveredByWildcard,
  toEntitySelection,
  toSystemSelection,
} from "@/lib/flow-utils";
import type {
  FlowEndpointCatalog,
  FlowEndpointSide,
  FlowEntitySelection,
  FlowSystemSelection,
} from "@minea/types";
import { cn } from "@/lib/utils";

type FilterMode = "all" | "systems" | "entities";

interface Props {
  side: "source" | "destination";
  current: FlowEndpointSide;
  onClose: () => void;
  onApply: (next: FlowEndpointSide) => void;
}

export function AddFlowEndpointDialog({ side, current, onClose, onApply }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [selectedSystems, setSelectedSystems] = useState<FlowSystemSelection[]>([...current.systems]);
  const [selectedEntities, setSelectedEntities] = useState<FlowEntitySelection[]>([...current.entities]);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ["flow-endpoint-catalog", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return dataApi.getFlowEndpointCatalog(orgSlug, workspaceSlug, token!);
    },
    enabled,
  });

  const selectedSystemIds = useMemo(
    () => new Set(selectedSystems.map((s) => s.system_id)),
    [selectedSystems]
  );
  const selectedEntityIds = useMemo(
    () => new Set(selectedEntities.map((e) => e.entity_id)),
    [selectedEntities]
  );

  const filteredSystems = useMemo(() => {
    if (!catalog || filter === "entities") return [];
    const q = search.trim().toLowerCase();
    return catalog.systems.filter(
      (s) =>
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q) ||
        (s.vendor ?? "").toLowerCase().includes(q)
    );
  }, [catalog, filter, search]);

  const filteredEntities = useMemo(() => {
    if (!catalog || filter === "systems") return [];
    const q = search.trim().toLowerCase();
    return catalog.entities.filter(
      (e) =>
        !q ||
        e.name.toLowerCase().includes(q) ||
        (e.system_name ?? "").toLowerCase().includes(q)
    );
  }, [catalog, filter, search]);

  // How many entities will this side cover
  const coveredCount = useMemo(() => {
    if (!catalog) return 0;
    const wildcardEntities = catalog.entities.filter(
      (e) => e.system_id && selectedSystemIds.has(e.system_id) && !selectedEntityIds.has(e.id)
    ).length;
    return selectedEntities.length + wildcardEntities;
  }, [catalog, selectedEntities.length, selectedEntityIds, selectedSystemIds]);

  const hasWildcard = selectedSystems.length > 0;

  const wildcardHasPii = useMemo(() => {
    if (!catalog || !hasWildcard) return false;
    return catalog.entities.some(
      (e) => e.system_id && selectedSystemIds.has(e.system_id) && (e.sensitivity === "pii" || e.classification === "pii")
    );
  }, [catalog, hasWildcard, selectedSystemIds]);

  const toggleSystem = (system: FlowEndpointCatalog["systems"][number]) => {
    const id = system.id;
    if (selectedSystemIds.has(id)) {
      setSelectedSystems((prev) => prev.filter((s) => s.system_id !== id));
      return;
    }
    // Select whole system → remove any individual entities from it
    setSelectedSystems((prev) => [...prev, toSystemSelection(system)]);
    setSelectedEntities((prev) => prev.filter((e) => e.system_id !== id));
  };

  const toggleEntity = (entity: FlowEndpointCatalog["entities"][number]) => {
    if (isEntityCoveredByWildcard(entity, selectedSystems)) return;
    const id = entity.id;
    if (selectedEntityIds.has(id)) {
      setSelectedEntities((prev) => prev.filter((e) => e.entity_id !== id));
      return;
    }
    setSelectedEntities((prev) => [...prev, toEntitySelection(entity)]);
  };

  // Summary footer text
  const summaryText = useMemo(() => {
    const parts: string[] = [];
    if (selectedSystems.length) {
      parts.push(`${selectedSystems.length} system${selectedSystems.length === 1 ? "" : "s"} selected`);
    }
    if (coveredCount) {
      parts.push(`covers ${coveredCount} entit${coveredCount === 1 ? "y" : "ies"}`);
    }
    return parts.join(" · ") || "Select at least one system to continue";
  }, [coveredCount, selectedSystems.length]);

  const title = side === "source" ? "Add source" : "Add destination";
  const applyEnabled = selectedSystems.length > 0;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[120] bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[130] w-full max-w-[560px] bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 flex-shrink-0">
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Pick a whole system or specific entities
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400">
            <X size={14} />
          </button>
        </div>

        {/* Search + filters */}
        <div className="px-5 py-3 border-b border-gray-100 space-y-2.5 flex-shrink-0">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search systems and entities…"
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "systems", "entities"] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setFilter(mode)}
                className={cn(
                  "flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-colors",
                  filter === mode
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                {mode === "all" ? "All" : mode === "systems" ? "Systems only" : "Entities only"}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {isLoading ? (
            <p className="text-xs text-gray-400 text-center py-10">Loading…</p>
          ) : (
            <>
              {/* SYSTEMS */}
              {filter !== "entities" && filteredSystems.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Systems
                    </p>
                    <p className="text-[10px] text-gray-400">Includes all current &amp; future entities</p>
                  </div>
                  <ul className="space-y-1">
                    {filteredSystems.map((system) => {
                      const checked = selectedSystemIds.has(system.id);
                      const subtitle = [
                        system.category,
                        system.entity_count
                          ? `${system.entity_count} entit${system.entity_count === 1 ? "y" : "ies"} discovered`
                          : null,
                        system.connection_label
                          ? `connected as ${system.connection_label}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ");

                      return (
                        <li key={system.id}>
                          <button
                            type="button"
                            onClick={() => toggleSystem(system)}
                            className={cn(
                              "w-full text-left rounded-lg border px-3 py-2.5 flex items-start gap-2.5 transition-colors",
                              checked
                                ? "border-teal-300 bg-teal-50/50"
                                : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                                checked
                                  ? "border-teal-600 bg-teal-600 text-white"
                                  : "border-gray-300"
                              )}
                            >
                              {checked && <Check size={10} strokeWidth={3} />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-gray-900 truncate">{system.name}</p>
                                {checked && (
                                  <span className="flex-shrink-0 rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[10px] font-semibold">
                                    All entities
                                  </span>
                                )}
                              </div>
                              {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {/* ENTITIES */}
              {filter !== "systems" && filteredEntities.length > 0 && (
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                      Entities
                    </p>
                    <p className="text-[10px] text-gray-400">Pick specific tables or objects</p>
                  </div>
                  <ul className="space-y-1">
                    {filteredEntities.map((entity) => {
                      const covered = isEntityCoveredByWildcard(entity, selectedSystems);
                      const checked = covered || selectedEntityIds.has(entity.id);
                      const hasPii =
                        entity.sensitivity === "pii" || entity.classification === "pii";

                      return (
                        <li key={entity.id}>
                          <button
                            type="button"
                            onClick={() => toggleEntity(entity)}
                            disabled={covered}
                            className={cn(
                              "w-full text-left rounded-lg border px-3 py-2.5 flex items-start gap-2.5 transition-colors",
                              covered
                                ? "border-gray-100 bg-gray-50 cursor-not-allowed"
                                : checked
                                  ? "border-teal-300 bg-teal-50/50"
                                  : "border-gray-200 hover:border-gray-300 bg-white"
                            )}
                          >
                            <span
                              className={cn(
                                "mt-0.5 h-4 w-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors",
                                covered
                                  ? "border-gray-300 bg-gray-100"
                                  : checked
                                    ? "border-teal-600 bg-teal-600 text-white"
                                    : "border-gray-300"
                              )}
                            >
                              {checked && <Check size={10} strokeWidth={3} className={covered ? "text-gray-400" : ""} />}
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p
                                  className={cn(
                                    "text-sm font-medium truncate",
                                    covered ? "text-gray-400" : "text-gray-900"
                                  )}
                                >
                                  {entity.name}
                                </p>
                                {hasPii && (
                                  <span className="flex-shrink-0 rounded-full bg-red-100 text-red-700 px-1.5 py-0.5 text-[10px] font-semibold">
                                    PII
                                  </span>
                                )}
                                {!entity.registered && (
                                  <span className="flex-shrink-0 rounded-full bg-violet-100 text-violet-700 px-1.5 py-0.5 text-[10px] font-semibold">
                                    Not registered
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-400 mt-0.5 truncate">
                                {covered
                                  ? `included via ${entity.system_name ?? "system"}`
                                  : entity.system_name
                                    ? `${entity.system_name}`
                                    : "No system assigned"}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}

              {filteredSystems.length === 0 && filteredEntities.length === 0 && !isLoading && (
                <p className="text-xs text-gray-400 text-center py-8">
                  {search ? "No results matching your search" : "No systems or entities found in this workspace"}
                </p>
              )}

              {/* Wildcard warning */}
              {hasWildcard && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
                  <p className="text-xs font-medium text-red-800">
                    Wildcard selection inherits Restricted classification
                  </p>
                  <p className="text-xs text-red-600 mt-0.5">
                    {wildcardHasPii
                      ? "Future entities added to selected systems may contain PII. The flow will be governed accordingly."
                      : "Future entities added to selected systems may contain sensitive data. The flow will be governed accordingly."}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-gray-200 flex items-center justify-between flex-shrink-0">
          <p className={cn("text-xs", applyEnabled ? "text-gray-500" : "text-gray-400 italic")}>
            {summaryText}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onApply({ systems: selectedSystems, entities: selectedEntities })}
              disabled={!applyEnabled}
              className="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-md disabled:opacity-40 transition-colors"
            >
              {title}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
