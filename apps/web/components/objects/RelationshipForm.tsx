"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { X, Search } from "lucide-react";
import { type MinEAObject, OBJECT_TYPE_LABELS, type ObjectListResponse } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { ALLOWED_TRIPLES_FRONTEND } from "@/lib/allowed-triples";
import { appendComponentSystemRef } from "@/lib/component-relationship-utils";
import { useTenancy } from "@/lib/tenancy";

interface Props {
  fromObject: MinEAObject;
  onClose: () => void;
  onSuccess: () => void;
}

type RelDirection = "outbound" | "inverse";

type RelOption = {
  key: string;
  type: string;
  direction: RelDirection;
  allowedTargetTypes: string[];
  label: string;
  dropdownLabel: string;
};

function formatObjectTypeLabels(types: string[]): string {
  return types
    .map((type) => OBJECT_TYPE_LABELS[type as keyof typeof OBJECT_TYPE_LABELS] ?? type.replace(/_/g, " "))
    .join(", ");
}

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
  stores_in: "Stores data for",
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

function buildRelationshipOptions(fromType: string): RelOption[] {
  const outboundByType = new Map<string, Set<string>>();
  const inverseByType = new Map<string, Set<string>>();

  for (const [type, from, to] of ALLOWED_TRIPLES_FRONTEND) {
    if (from === fromType) {
      const targets = outboundByType.get(type) ?? new Set<string>();
      targets.add(to);
      outboundByType.set(type, targets);
    }
    if (to === fromType) {
      const sources = inverseByType.get(type) ?? new Set<string>();
      sources.add(from);
      inverseByType.set(type, sources);
    }
  }

  const options: RelOption[] = [];

  for (const [type, targetTypes] of outboundByType) {
    const allowedTargetTypes = [...targetTypes].sort();
    const label = type.replace(/_/g, " ");
    const typeHint = formatObjectTypeLabels(allowedTargetTypes);
    options.push({
      key: `outbound:${type}`,
      type,
      direction: "outbound",
      allowedTargetTypes,
      label,
      dropdownLabel: `${label} → ${typeHint}`,
    });
  }

  for (const [type, sourceTypes] of inverseByType) {
    const allowedTargetTypes = [...sourceTypes].sort();
    const label = INVERSE_OPTION_LABELS[type] ?? type.replace(/_/g, " ");
    const typeHint = formatObjectTypeLabels(allowedTargetTypes);
    options.push({
      key: `inverse:${type}`,
      type,
      direction: "inverse",
      allowedTargetTypes,
      label,
      dropdownLabel: `${label} ← ${typeHint}`,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label));
}

export function RelationshipForm({ fromObject, onClose, onSuccess }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [selectedOptionKey, setSelectedOptionKey] = useState("");
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<MinEAObject | null>(null);

  const relationshipOptions = useMemo(
    () => buildRelationshipOptions(fromObject.type),
    [fromObject.type]
  );

  const selectedOption = relationshipOptions.find((option) => option.key === selectedOptionKey);
  const allowedTargetTypes = selectedOption?.allowedTargetTypes ?? [];

  const { data: candidates } = useQuery({
    queryKey: ["objects-candidates", orgSlug, workspaceSlug, selectedOptionKey, allowedTargetTypes, targetSearch],
    enabled: allowedTargetTypes.length > 0,
    queryFn: async () => {
      const token = await getToken();
      const results = await Promise.all(
        allowedTargetTypes.map((type) =>
          objectsApi.list(orgSlug, workspaceSlug, { type, search: targetSearch || undefined }, token!)
        )
      );
      return results.flatMap((r: ObjectListResponse) => r.items);
    },
  });

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

  const targetTypeLabel = formatObjectTypeLabels(allowedTargetTypes);

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
            <label className="block text-xs font-medium text-gray-700 mb-1">Relationship type *</label>
            {relationshipOptions.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No relationships allowed from this object type.</p>
            ) : (
              <select
                value={selectedOptionKey}
                onChange={(e) => {
                  setSelectedOptionKey(e.target.value);
                  setSelectedTarget(null);
                  setTargetSearch("");
                }}
                className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select relationship type...</option>
                {relationshipOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.dropdownLabel}
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedOption && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {selectedOption.direction === "inverse" ? "Linked object" : "To"} (allowed types:{" "}
                {targetTypeLabel}) *
              </label>
              <div className="relative mb-2">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={targetSearch}
                  onChange={(e) => {
                    setTargetSearch(e.target.value);
                    setSelectedTarget(null);
                  }}
                  placeholder="Search objects..."
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="max-h-40 overflow-y-auto border border-gray-100 rounded-md divide-y divide-gray-50">
                {(candidates ?? []).map((obj) => (
                  <button
                    key={obj.id}
                    onClick={() => setSelectedTarget(obj)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors ${
                      selectedTarget?.id === obj.id ? "bg-indigo-50 text-indigo-700" : "text-gray-700"
                    }`}
                  >
                    <span className="font-medium">{obj.name}</span>
                    <span className="text-xs text-gray-400 ml-2">({OBJECT_TYPE_LABELS[obj.type]})</span>
                  </button>
                ))}
                {(candidates ?? []).length === 0 && (
                  <p className="text-xs text-gray-400 px-3 py-2">No matching objects found.</p>
                )}
              </div>
            </div>
          )}

          {selectedTarget && !isValidTriple && (
            <p className="text-xs text-red-500">This combination is not allowed by the relationship rules.</p>
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
