"use client";

import { useMemo, useState } from "react";
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
  onClose: () => void;
  onAssign: (entityId: string, roleTag?: string) => void;
}

function useEntityOptions(entityKind: string) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const objectsQuery = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, entityKind],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: entityKind }, token!);
    },
    enabled: enabled && entityKind !== "process",
  });

  const processesQuery = useQuery({
    queryKey: ["processes", orgSlug, workspaceSlug],
    queryFn: async () => {
      const token = await getToken();
      return processesApi.list(orgSlug, workspaceSlug, token!);
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
    };
  }

  return {
    options: (objectsQuery.data?.items ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      subtitle: (o.properties as Record<string, unknown>)?.classification as string | undefined,
    })),
    isLoading: objectsQuery.isLoading,
  };
}

export function AssignDataLinkDialog({
  section,
  existingEntityIds,
  onClose,
  onAssign,
}: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [roleTag, setRoleTag] = useState(section.roleTags?.[0] ?? "");

  const { options, isLoading } = useEntityOptions(section.entityKind);

  const available = useMemo(
    () => options.filter((o) => !existingEntityIds.includes(o.id)),
    [options, existingEntityIds]
  );

  const filtered = search
    ? available.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()))
    : available;

  const assignMutation = useMutation({
    mutationFn: async () => onAssign(selectedId, roleTag || undefined),
    onSuccess: onClose,
  });

  const actionLabel = section.actionLabel === "Change" ? "Set" : "Assign";

  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[70] w-full max-w-sm bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden">
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
            <select
              value={roleTag}
              onChange={(e) => setRoleTag(e.target.value)}
              className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm capitalize"
            >
              {section.roleTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        )}

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
          ) : filtered.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">Nothing available</p>
          ) : (
            <ul className="py-1">
              {filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(option.id === selectedId ? "" : option.id)}
                    className={`w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-gray-50 ${
                      selectedId === option.id ? "bg-amber-50" : ""
                    }`}
                  >
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 flex-shrink-0 ${
                        selectedId === option.id ? "border-amber-500 bg-amber-500" : "border-gray-300"
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

        <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-2">
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
    </>
  );
}
