"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { dataApi, objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";

interface Props {
  system: MinEAObject;
  linkedEntityIds: string[];
  onLinked: () => void;
  disabled?: boolean;
}

export function SystemEntitySearch({ system, linkedEntityIds, onLinked, disabled }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const enabled = useAuthQueryEnabled();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["objects", orgSlug, workspaceSlug, "data_object", "entity-search", query],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: "data_object", search: query.trim() || undefined, page_size: 20 },
        token!
      );
    },
    enabled: enabled && query.trim().length > 0,
  });

  const linkedSet = useMemo(() => new Set(linkedEntityIds), [linkedEntityIds]);

  const matches = useMemo(() => {
    const items = data?.items ?? [];
    return items.filter((item) => !linkedSet.has(item.id));
  }, [data?.items, linkedSet]);

  const trimmed = query.trim();
  const exactMatch = matches.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = trimmed.length > 0 && !exactMatch;
  const showPanel = focused && trimmed.length > 0;

  const linkMutation = useMutation({
    mutationFn: async (entityId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      await dataApi.updateEntity(orgSlug, workspaceSlug, entityId, { owner_system_id: system.id }, token);
    },
    onSuccess: () => {
      setQuery("");
      setFocused(false);
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      onLinked();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const created = await dataApi.createEntity(orgSlug, workspaceSlug, { name }, token);
      await dataApi.updateEntity(
        orgSlug,
        workspaceSlug,
        created.id,
        { owner_system_id: system.id },
        token
      );
      return created;
    },
    onSuccess: () => {
      setQuery("");
      setFocused(false);
      queryClient.invalidateQueries({ queryKey: ["objects", orgSlug, workspaceSlug, "data_object"] });
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      onLinked();
    },
  });

  const pending = linkMutation.isPending || createMutation.isPending;

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          disabled={disabled || pending}
          placeholder="Search or create entity…"
          className={cn(
            "w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          )}
        />
      </div>

      {showPanel && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          {showCreate && (
            <button
              type="button"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => createMutation.mutate(trimmed)}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-100"
            >
              <span className="font-medium text-gray-900">Create new data entity: &ldquo;{trimmed}&rdquo;</span>
              {matches.length === 0 && !isLoading && (
                <span className="block text-xs text-gray-400 mt-0.5">No existing entities match.</span>
              )}
            </button>
          )}

          {isLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">Searching…</p>
          )}

          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => linkMutation.mutate(item.id)}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50"
            >
              {item.name}
            </button>
          ))}

          {!isLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">No existing entities match.</p>
          )}
        </div>
      )}
    </div>
  );
}
