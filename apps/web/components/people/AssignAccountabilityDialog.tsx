"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, peopleApi, processesApi, productsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  ACCOUNTABILITY_LINK_OPTIONS,
  accountabilityPairKey,
  linkKindsForEntity,
} from "@/lib/people-utils";
import type { AccountabilityLinkKind } from "@minea/types";

interface EntityOption {
  id: string;
  name: string;
  subtitle?: string;
}

interface ExistingPair {
  entityId: string;
  linkKind: string;
}

interface Props {
  subjectType: "role" | "team";
  subjectId: string;
  entityKind: string;
  sectionTitle: string;
  existingPairs: ExistingPair[];
  onClose: () => void;
  onSuccess: () => void;
}

function useEntityOptions(entityKind: string): { options: EntityOption[]; isLoading: boolean } {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const productsQuery = useQuery({
    queryKey: ["products", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return productsApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled: enabled && entityKind === "product",
  });

  const processesQuery = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return processesApi.list(orgSlug, workspaceSlug, token!);
    },
    enabled: enabled && entityKind === "process",
  });

  const objectsQuery = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, entityKind],
    queryFn: async () => {
      const token = await getToken();
      const typeMap: Record<string, string> = {
        capability: "capability",
        business_domain: "business_domain",
        application: "application",
        data_domain: "data_domain",
        data_store: "data_store",
      };
      return objectsApi.list(orgSlug, workspaceSlug, { type: typeMap[entityKind] ?? entityKind }, token!);
    },
    enabled: enabled && ["capability", "business_domain", "application", "data_domain", "data_store"].includes(entityKind),
  });

  if (entityKind === "product") {
    return {
      options: (productsQuery.data?.items ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.product_line ?? undefined,
      })),
      isLoading: productsQuery.isLoading,
    };
  }
  if (entityKind === "process") {
    return {
      options: (processesQuery.data?.items ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.status,
      })),
      isLoading: processesQuery.isLoading,
    };
  }
  return {
    options: (objectsQuery.data?.items ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      subtitle: (o.properties as Record<string, unknown>)?.status as string | undefined,
    })),
    isLoading: objectsQuery.isLoading,
  };
}

export function AssignAccountabilityDialog({
  subjectType,
  subjectId,
  entityKind,
  sectionTitle,
  existingPairs,
  onClose,
  onSuccess,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const allowedLinkKinds = useMemo(() => linkKindsForEntity(entityKind), [entityKind]);
  const [linkKind, setLinkKind] = useState<AccountabilityLinkKind>(allowedLinkKinds[0]!);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setLinkKind(allowedLinkKinds[0]!);
    setSelectedId("");
    setSearch("");
    setError(null);
  }, [entityKind, allowedLinkKinds]);

  const { options, isLoading } = useEntityOptions(entityKind);

  const existingKeys = useMemo(
    () => new Set(existingPairs.map((p) => accountabilityPairKey(p.entityId, p.linkKind))),
    [existingPairs]
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    return options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const selectedPairTaken =
    !!selectedId && existingKeys.has(accountabilityPairKey(selectedId, linkKind));

  const assignMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const body = { entity_kind: entityKind, entity_id: selectedId, link_kind: linkKind };
      if (subjectType === "role") {
        return peopleApi.addRoleAccountability(orgSlug, workspaceSlug, subjectId, body, token);
      }
      return peopleApi.addTeamAccountability(orgSlug, workspaceSlug, subjectId, body, token);
    },
  });

  const handleAssign = async () => {
    if (!selectedId || selectedPairTaken) return;
    setError(null);
    try {
      await assignMutation.mutateAsync();
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign. Please try again.");
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/30" onClick={onClose} />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-800">Assign {sectionTitle}</p>
            <p className="text-[11px] text-gray-400">Pick an entity and how this {subjectType} relates</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-4 border-b border-gray-100">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Entity
            </label>
            <div className="relative mb-2">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Search ${sectionTitle.toLowerCase()}…`}
                className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <div className="max-h-40 overflow-y-auto rounded-md border border-gray-200">
              {isLoading ? (
                <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No results</p>
              ) : (
                <ul className="py-1">
                  {filtered.map((option) => (
                    <li key={option.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(option.id === selectedId ? "" : option.id)}
                        className={`w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                          selectedId === option.id ? "bg-rose-50" : ""
                        }`}
                      >
                        <span
                          className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 transition-colors ${
                            selectedId === option.id
                              ? "border-rose-500 bg-rose-500"
                              : "border-gray-300"
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-sm text-gray-800 truncate">{option.name}</p>
                          {option.subtitle && (
                            <p className="text-xs text-gray-400 truncate capitalize">{option.subtitle}</p>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {!selectedId && (
              <p className="text-[11px] text-gray-400 mt-1.5">Select an entity to continue.</p>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              How does this {subjectType} relate?
            </label>
            <div className="relative">
              <select
                value={linkKind}
                onChange={(e) => setLinkKind(e.target.value as AccountabilityLinkKind)}
                className="w-full appearance-none rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-rose-500 pr-8"
              >
                {allowedLinkKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {ACCOUNTABILITY_LINK_OPTIONS[kind].label} — {ACCOUNTABILITY_LINK_OPTIONS[kind].description}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                ▾
              </span>
            </div>
            {selectedPairTaken && (
              <p className="text-xs text-amber-600 mt-1.5">
                This {subjectType} already has this relationship to the selected entity.
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="px-4 py-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleAssign}
            disabled={!selectedId || selectedPairTaken || assignMutation.isPending}
            className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md disabled:opacity-40 transition-colors"
          >
            {assignMutation.isPending ? "Assigning…" : "Assign"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}
