"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi, processesApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { DataLinkSection } from "@/lib/data-utils";

interface EntityOption {
  id: string;
  name: string;
  subtitle?: string;
}

interface Props {
  section: DataLinkSection;
  existingEntityIds: string[];
  assignedRoleByEntityId?: Record<string, string | undefined>;
  onClose: () => void;
  onAssign: (entityId: string, roleTag?: string) => void | Promise<void>;
}

const OBJECT_KINDS = new Set([
  "data_domain",
  "data_store",
  "data_object",
  "application",
  "integration_flow",
  "capability",
  "business_domain",
]);

function optionSubtitle(entityKind: string, properties: Record<string, unknown>): string | undefined {
  if (entityKind === "data_store") {
    const storeType = properties.store_type;
    const technology = properties.technology;
    const parts = [storeType, technology]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => value.replace(/_/g, " "));
    return parts.length > 0 ? parts.join(" · ") : undefined;
  }
  if (entityKind === "data_object") {
    const classification = properties.classification;
    return typeof classification === "string" ? classification : undefined;
  }
  const classification = properties.classification;
  return typeof classification === "string" ? classification : undefined;
}

function useEntityOptions(entityKind: string) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const objectsQuery = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, entityKind],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: entityKind, page_size: 200 },
        token
      );
    },
    enabled: enabled && OBJECT_KINDS.has(entityKind),
  });

  const processesQuery = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return processesApi.list(orgSlug, workspaceSlug, token);
    },
    enabled: enabled && entityKind === "process",
  });

  if (entityKind === "process") {
    return {
      options: (processesQuery.data?.items ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        subtitle: p.status,
      })),
      isLoading: processesQuery.isLoading,
      isError: processesQuery.isError,
      error: processesQuery.error,
    };
  }

  return {
    options: (objectsQuery.data?.items ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      subtitle: optionSubtitle(entityKind, (o.properties ?? {}) as Record<string, unknown>),
    })),
    isLoading: objectsQuery.isLoading,
    isError: objectsQuery.isError,
    error: objectsQuery.error,
  };
}

export function AssignDataLinkDialog({
  section,
  existingEntityIds,
  assignedRoleByEntityId = {},
  onClose,
  onAssign,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [roleTag, setRoleTag] = useState(section.roleTags?.[0] ?? "");

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setSearch("");
    setSelectedId("");
    setRoleTag(section.roleTags?.[0] ?? "");
  }, [section.key, section.entityKind, section.linkKind, section.roleTags]);

  const { options, isLoading, isError, error } = useEntityOptions(section.entityKind);
  const isDomainPicker = section.entityKind === "data_domain";
  const isStorePicker = section.entityKind === "data_store" && section.linkKind === "stored_in";

  const assignedIds = useMemo(
    () => new Set(existingEntityIds.map(String)),
    [existingEntityIds]
  );

  const hasPrimaryAssigned = useMemo(
    () => Object.values(assignedRoleByEntityId).some((tag) => tag === "primary"),
    [assignedRoleByEntityId]
  );

  useEffect(() => {
    if (!section.roleTags?.includes("primary")) return;
    setRoleTag(hasPrimaryAssigned ? "analytical" : "primary");
  }, [hasPrimaryAssigned, section.roleTags, section.key]);

  const available = useMemo(
    () => options.filter((option) => !assignedIds.has(String(option.id))),
    [options, assignedIds]
  );

  const visibleOptions = isStorePicker ? options : available;

  const domainSelectOptions = useMemo(
    () =>
      available.map((option) => ({
        value: option.id,
        label: option.subtitle ? `${option.name} · ${option.subtitle}` : option.name,
      })),
    [available]
  );

  const filtered = useMemo(() => {
    const base = isStorePicker ? visibleOptions : available;
    if (!search) return base;
    return base.filter((option) => option.name.toLowerCase().includes(search.toLowerCase()));
  }, [available, isStorePicker, search, visibleOptions]);

  const assignMutation = useMutation({
    mutationFn: async () => onAssign(selectedId, roleTag || undefined),
    onSuccess: onClose,
  });

  const actionLabel = section.actionLabel === "Change" ? "Set" : "Assign";

  const emptyMessage = useMemo(() => {
    if (isLoading) return null;
    if (options.length === 0) {
      return `No ${section.title.toLowerCase()} in this workspace yet.`;
    }
    if (available.length === 0) {
      return isStorePicker
        ? "Every data store in this workspace is already linked to this entity."
        : `All ${section.title.toLowerCase()} are already assigned.`;
    }
    return null;
  }, [available.length, isLoading, isStorePicker, options.length, section.title]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[100] bg-black/40" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[110] w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div>
            <p className="text-xs font-semibold text-gray-800">
              {section.actionLabel} {section.title}
            </p>
            {section.subtitle && (
              <p className="text-[11px] text-gray-400 uppercase">{section.subtitle}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={14} />
          </button>
        </div>

        {section.roleTags && section.roleTags.length > 0 && (
          <div className="px-4 py-2 border-b border-gray-100">
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Store role
            </label>
            <select
              value={roleTag}
              onChange={(e) => setRoleTag(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm capitalize"
            >
              {section.roleTags.map((tag) => (
                <option key={tag} value={tag} disabled={tag === "primary" && hasPrimaryAssigned}>
                  {tag.replace(/_/g, " ")}
                  {tag === "primary" && hasPrimaryAssigned ? " (already set)" : ""}
                </option>
              ))}
            </select>
            {isStorePicker && (
              <p className="text-[11px] text-gray-400 mt-1.5">
                Primary marks the system-of-record store. You can link additional stores as analytical copies.
              </p>
            )}
          </div>
        )}

        {isDomainPicker ? (
          <div className="px-4 py-4 border-b border-gray-100">
            {isLoading ? (
              <p className="text-xs text-gray-400 text-center py-2">Loading domains…</p>
            ) : isError ? (
              <p className="text-xs text-red-600 text-center py-2">
                {error instanceof Error ? error.message : "Could not load domains."}
              </p>
            ) : domainSelectOptions.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">{emptyMessage}</p>
            ) : (
              <select
                autoFocus
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="">Select a domain…</option>
                {domainSelectOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : (
          <>
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${section.title.toLowerCase()}…`}
                  className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="max-h-64 overflow-y-auto">
              {isLoading ? (
                <p className="text-xs text-gray-400 text-center py-6">Loading…</p>
              ) : isError ? (
                <p className="text-xs text-red-600 text-center py-6 px-4">
                  {error instanceof Error ? error.message : "Could not load options."}
                </p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-6 px-4">{emptyMessage ?? "Nothing available"}</p>
              ) : (
                <ul className="py-1">
                  {filtered.map((option) => {
                    const alreadyAssigned = assignedIds.has(String(option.id));
                    const assignedRole = assignedRoleByEntityId[option.id];
                    const selectable = !alreadyAssigned;

                    return (
                      <li key={option.id}>
                        <button
                          type="button"
                          disabled={!selectable}
                          onClick={() => {
                            if (!selectable) return;
                            setSelectedId(option.id === selectedId ? "" : option.id);
                          }}
                          className={`w-full text-left px-4 py-2.5 flex items-center gap-2 ${
                            selectable ? "hover:bg-gray-50" : "opacity-60 cursor-not-allowed"
                          } ${selectedId === option.id ? "bg-amber-50" : ""}`}
                        >
                          <span
                            className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                              selectedId === option.id
                                ? "border-amber-500 bg-amber-500"
                                : alreadyAssigned
                                  ? "border-emerald-400 bg-emerald-400"
                                  : "border-gray-300"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-800 truncate">{option.name}</p>
                            {option.subtitle && (
                              <p className="text-xs text-gray-400 truncate capitalize">{option.subtitle}</p>
                            )}
                          </div>
                          {alreadyAssigned && (
                            <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2 py-0.5 capitalize flex-shrink-0">
                              Linked{assignedRole ? ` · ${assignedRole.replace(/_/g, " ")}` : ""}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {isStorePicker && available.length === 0 && options.length > 0 && (
              <p className="text-[11px] text-gray-400 px-4 pb-3">
                Create another data store in Data → Data Stores to map a warehouse or secondary location.
              </p>
            )}
          </>
        )}

        <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
          {assignMutation.isError && (
            <p className="text-xs text-red-600">
              {assignMutation.error instanceof Error
                ? assignMutation.error.message
                : "Could not save assignment."}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500">
              Cancel
            </button>
            <button
              type="button"
              onClick={() => assignMutation.mutate()}
              disabled={!selectedId || assignMutation.isPending}
              className="px-4 py-1.5 text-sm bg-gray-900 text-white rounded-md disabled:opacity-40"
            >
              {assignMutation.isPending ? "Saving…" : actionLabel}
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
