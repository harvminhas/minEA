"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { type MinEAObject, OBJECT_TYPE_LABELS, type ObjectListResponse } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { ALLOWED_TRIPLES_FRONTEND, OUTBOUND_ONLY_TRIPLES, tripleKey } from "@/lib/allowed-triples";
import { appendComponentSystemRef } from "@/lib/component-relationship-utils";
import { useTenancy } from "@/lib/tenancy";

interface Props {
  fromObject: MinEAObject;
  onClose: () => void;
  onSuccess: () => void;
  /** Pre-select target object type in the link picker (e.g. data_store). */
  initialTargetType?: string;
}

type RelDirection = "outbound" | "inverse";

type RelOption = {
  key: string;
  type: string;
  direction: RelDirection;
  label: string;
  dropdownLabel: string;
};

const OUTBOUND_OPTION_LABELS: Partial<Record<string, string>> = {
  calls: "Calls",
  consumes: "Consumes",
  exposes: "Exposes",
  publishes: "Publishes",
  subscribes: "Subscribes to",
  part_of: "Part of",
  replaces: "Replaces",
  runs_on: "Runs on",
  uses: "Uses",
  reads: "Reads from",
  writes: "Writes to",
  creates: "Creates",
  updates: "Updates",
  owns: "Owns",
  belongs_to: "Belongs to",
  connects_to: "Connects to",
  built_on: "Built on",
  contains: "Contains",
  routes: "Routes to",
  hosts: "Hosts",
  carries: "Carries",
  accesses: "Accesses",
  connects: "Connects to",
  uses_model: "Uses model",
  can_call: "Can call",
  supports: "Supports",
  escalates_to: "Escalates to",
  affects: "Affects",
  resolves: "Resolves",
  depends_on: "Depends on",
  supported_by: "Supports",
};

const INVERSE_OPTION_LABELS: Partial<Record<string, string>> = {
  part_of: "Includes",
  supported_by: "Supported by",
  affects: "Affected by",
  calls: "Called by",
  consumes: "Consumes from",
  exposes: "Exposed by",
  publishes: "Published by",
  subscribes: "Subscribed by",
  escalates_to: "Escalated from",
  connects_to: "Connected from",
  runs_on: "Hosts",
  uses: "Used by",
  resolves: "Resolved by",
  depends_on: "Required by",
  built_on: "Platform for",
  reads: "Read by",
  writes: "Written by",
  creates: "Created by",
  updates: "Updated by",
  owns: "Owned by",
  belongs_to: "Includes",
  supports: "Supported by",
  uses_model: "Uses model from",
  can_call: "Callable from",
  contains: "Contained in",
  routes: "Routed from",
  hosts: "Hosted by",
  carries: "Carried by",
  accesses: "Accessed by",
  replaces: "Replaced by",
  connects: "Connected from",
};

/** Preferred order when listing connectable object types. */
const ENTITY_TYPE_ORDER: string[] = [
  "data_store",
  "data_object",
  "data_domain",
  "api",
  "event",
  "integration_flow",
  "message_broker",
  "application",
  "solution",
  "component",
  "technical_capability",
  "capability",
  "cloud_service",
  "tool",
  "model",
  "agent",
  "initiative",
  "tech_debt",
  "roadmap_item",
];

function entityTypeSortKey(type: string): number {
  const idx = ENTITY_TYPE_ORDER.indexOf(type);
  return idx === -1 ? ENTITY_TYPE_ORDER.length : idx;
}

function outboundOptionLabel(type: string): string {
  return OUTBOUND_OPTION_LABELS[type] ?? type.replace(/_/g, " ");
}

function connectableTargetTypes(fromType: string): string[] {
  const types = new Set<string>();
  for (const [type, from, to] of ALLOWED_TRIPLES_FRONTEND) {
    if (from === fromType) types.add(to);
    if (to === fromType && !OUTBOUND_ONLY_TRIPLES.has(tripleKey(type, from, to))) {
      types.add(from);
    }
  }
  return [...types].sort((a, b) => entityTypeSortKey(a) - entityTypeSortKey(b));
}

function buildRelationshipOptionsForTarget(fromType: string, targetType: string): RelOption[] {
  const options: RelOption[] = [];

  for (const [type, from, to] of ALLOWED_TRIPLES_FRONTEND) {
    if (from === fromType && to === targetType) {
      const label = outboundOptionLabel(type);
      options.push({
        key: `outbound:${type}`,
        type,
        direction: "outbound",
        label,
        dropdownLabel: label,
      });
    }
    if (
      to === fromType &&
      from === targetType &&
      !OUTBOUND_ONLY_TRIPLES.has(tripleKey(type, from, to))
    ) {
      const label = INVERSE_OPTION_LABELS[type] ?? type.replace(/_/g, " ");
      options.push({
        key: `inverse:${type}`,
        type,
        direction: "inverse",
        label,
        dropdownLabel: label,
      });
    }
  }

  return options.sort((a, b) => {
    if (a.direction !== b.direction) return a.direction === "outbound" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

type RelOptionGroup = {
  key: string;
  label: string;
  options: RelOption[];
};

function buildRelationshipOptionGroupsForTarget(fromType: string, targetType: string): RelOptionGroup[] {
  const options = buildRelationshipOptionsForTarget(fromType, targetType);
  if (options.length === 1) {
    return [{ key: "relationship", label: "Relationship", options }];
  }
  const outbound = options.filter((option) => option.direction === "outbound");
  const inbound = options.filter((option) => option.direction === "inverse");
  const groups: RelOptionGroup[] = [];

  if (outbound.length > 0) {
    groups.push({ key: "outbound", label: "Outgoing", options: outbound });
  }
  if (inbound.length > 0) {
    groups.push({ key: "inverse", label: "Incoming", options: inbound });
  }

  return groups;
}

export function RelationshipForm({ fromObject, onClose, onSuccess, initialTargetType }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [targetSearch, setTargetSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState(initialTargetType ?? "");
  const [selectedTarget, setSelectedTarget] = useState<MinEAObject | null>(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState("");

  const connectableTypes = useMemo(
    () => connectableTargetTypes(fromObject.type),
    [fromObject.type]
  );

  const searchableTypes = typeFilter ? [typeFilter] : [];

  const { data: candidates } = useQuery({
    queryKey: ["objects-candidates", orgSlug, workspaceSlug, fromObject.type, typeFilter, targetSearch],
    enabled: connectableTypes.length > 0 && typeFilter.length > 0,
    queryFn: async () => {
      const token = await getToken();
      const results = await Promise.all(
        searchableTypes.map((type) =>
          objectsApi.list(orgSlug, workspaceSlug, { type, search: targetSearch || undefined }, token!)
        )
      );
      return results
        .flatMap((r: ObjectListResponse) => r.items)
        .filter((obj) => obj.id !== fromObject.id)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });

  const relationshipOptionGroups = useMemo(() => {
    if (!selectedTarget) return [];
    return buildRelationshipOptionGroupsForTarget(fromObject.type, selectedTarget.type);
  }, [fromObject.type, selectedTarget]);

  const relationshipOptions = useMemo(
    () => relationshipOptionGroups.flatMap((group) => group.options),
    [relationshipOptionGroups]
  );

  const selectedOption = relationshipOptions.find((option) => option.key === selectedOptionKey);

  const resolvedTriple = useMemo(() => {
    if (!selectedOption || !selectedTarget) return null;
    if (selectedOption.direction === "outbound") {
      return {
        type: selectedOption.type,
        fromType: fromObject.type,
        toType: selectedTarget.type,
        fromId: fromObject.id,
        toId: selectedTarget.id,
      };
    }
    return {
      type: selectedOption.type,
      fromType: selectedTarget.type,
      toType: fromObject.type,
      fromId: selectedTarget.id,
      toId: fromObject.id,
    };
  }, [fromObject, selectedOption, selectedTarget]);

  const isValidTriple = resolvedTriple
    ? ALLOWED_TRIPLES_FRONTEND.some(
        ([type, from, to]) =>
          type === resolvedTriple.type &&
          from === resolvedTriple.fromType &&
          to === resolvedTriple.toType
      )
    : false;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!resolvedTriple || !isValidTriple) return;
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      const created = await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: resolvedTriple.type as never,
          from_object_id: resolvedTriple.fromId,
          from_type: resolvedTriple.fromType,
          to_object_id: resolvedTriple.toId,
          to_type: resolvedTriple.toType,
        },
        token
      );

      if (
        selectedOption?.direction === "inverse" &&
        resolvedTriple.type === "part_of" &&
        selectedTarget?.type === "component" &&
        fromObject.type === "application"
      ) {
        await appendComponentSystemRef(orgSlug, workspaceSlug, selectedTarget, fromObject, token);
      }

      return created;
    },
    onSuccess,
  });

  function selectTarget(obj: MinEAObject) {
    setSelectedTarget(obj);
    setSelectedOptionKey("");
    const options = buildRelationshipOptionsForTarget(fromObject.type, obj.type);
    if (options.length === 1) {
      setSelectedOptionKey(options[0].key);
    }
  }

  function clearTarget() {
    setSelectedTarget(null);
    setSelectedOptionKey("");
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[100]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] bg-white rounded-xl shadow-2xl z-[110]">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Add Relationship</h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <div className="flex items-center gap-2 py-2 px-3 bg-gray-50 rounded-md text-sm text-gray-700">
              <span className="font-medium">{fromObject.name}</span>
              <span className="text-gray-400">({OBJECT_TYPE_LABELS[fromObject.type]})</span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Link to *</label>
            {connectableTypes.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No relationships allowed from this object type.</p>
            ) : selectedTarget ? (
              <div className="flex items-center gap-2 py-2 px-3 bg-indigo-50 border border-indigo-100 rounded-md text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-indigo-900">{selectedTarget.name}</span>
                  <span className="text-indigo-600/70 ml-2">
                    ({OBJECT_TYPE_LABELS[selectedTarget.type]})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={clearTarget}
                  className="text-xs font-medium text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <>
                <select
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setTargetSearch("");
                  }}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select object type...</option>
                  {connectableTypes.map((type) => (
                    <option key={type} value={type}>
                      {OBJECT_TYPE_LABELS[type as keyof typeof OBJECT_TYPE_LABELS] ??
                        type.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
                {!typeFilter ? (
                  <p className="text-xs text-gray-400 mt-2">
                    Choose an object type to search and select a target.
                  </p>
                ) : (
                  <>
                    <div className="relative mb-2 mt-2">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        value={targetSearch}
                        onChange={(e) => setTargetSearch(e.target.value)}
                        placeholder="Search by name..."
                        className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-50">
                      {(candidates ?? []).map((obj) => (
                        <button
                          key={obj.id}
                          type="button"
                          onClick={() => selectTarget(obj)}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors text-gray-700"
                        >
                          <span className="font-medium">{obj.name}</span>
                          <span className="text-xs text-gray-400 ml-2">
                            ({OBJECT_TYPE_LABELS[obj.type]})
                          </span>
                        </button>
                      ))}
                      {(candidates ?? []).length === 0 && (
                        <p className="text-xs text-gray-400 px-3 py-2">No matching objects found.</p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          {selectedTarget && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Relationship type *</label>
              {relationshipOptions.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">
                  No relationship types are allowed between these object types.
                </p>
              ) : (
                <select
                  value={selectedOptionKey}
                  onChange={(e) => setSelectedOptionKey(e.target.value)}
                  className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select relationship type...</option>
                  {relationshipOptionGroups.map((group) => (
                    <optgroup key={group.key} label={group.label}>
                      {group.options.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.dropdownLabel}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t border-gray-100">
          <button
            onClick={onClose}
            className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!selectedTarget || !selectedOption || !isValidTriple || mutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
          >
            {mutation.isPending ? "Adding..." : "Add relationship"}
          </button>
        </div>
      </div>
    </>
  );
}
