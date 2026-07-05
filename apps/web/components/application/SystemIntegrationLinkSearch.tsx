"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { MinEAObject, ObjectType } from "@minea/types";
import { cn } from "@/lib/utils";
import {
  linkApiToSystemAsProvider,
  linkEventToSystemAsProducer,
} from "@/lib/system-integration-link-utils";

const MAX_RESULTS = 20;

export type IntegrationLinkKind = "api" | "event";

const LINK_CONFIG: Record<
  IntegrationLinkKind,
  {
    objectType: ObjectType;
    placeholder: string;
    createPrefix: string;
    objectLabel: string;
    objectLabelPlural: string;
    emptyWorkspace: string;
    emptyAvailable: string;
  }
> = {
  api: {
    objectType: "api",
    placeholder: "Search or create API…",
    createPrefix: "Create new API",
    objectLabel: "API",
    objectLabelPlural: "APIs",
    emptyWorkspace: "No APIs in this workspace yet.",
    emptyAvailable: "All workspace APIs are already linked to this system.",
  },
  event: {
    objectType: "event",
    placeholder: "Search or create event…",
    createPrefix: "Create new event",
    objectLabel: "event",
    objectLabelPlural: "events",
    emptyWorkspace: "No events in this workspace yet.",
    emptyAvailable: "All workspace events are already linked to this system.",
  },
};

interface Props {
  system: MinEAObject;
  kind: IntegrationLinkKind;
  linkedObjectIds: string[];
  onLinked: () => void;
  onCreateNew: (name: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function SystemIntegrationLinkSearch({
  system,
  kind,
  linkedObjectIds,
  onLinked,
  onCreateNew,
  onClose,
  autoFocus,
  disabled,
}: Props) {
  const config = LINK_CONFIG[kind];
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const authEnabled = useAuthQueryEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const objectsQueryKey = ["objects", orgSlug, workspaceSlug, config.objectType] as const;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: objectsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: config.objectType, page_size: 200 },
        token!
      );
    },
    enabled: authEnabled,
  });

  const workspaceObjects = data?.items ?? [];
  const linkedSet = useMemo(() => new Set(linkedObjectIds), [linkedObjectIds]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setFocused(true);
    }
  }, [autoFocus]);

  const availableObjects = useMemo(
    () => workspaceObjects.filter((item) => !linkedSet.has(item.id)),
    [workspaceObjects, linkedSet]
  );

  const trimmed = query.trim();
  const queryLower = trimmed.toLowerCase();

  const matches = useMemo(() => {
    const filtered = queryLower
      ? availableObjects.filter((item) => item.name.toLowerCase().includes(queryLower))
      : availableObjects;
    return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_RESULTS);
  }, [availableObjects, queryLower]);

  const exactMatch = availableObjects.some((item) => item.name.toLowerCase() === queryLower);
  const showCreate = trimmed.length > 0 && !exactMatch;
  const showPanel = focused;
  const objectsLoading = (isLoading || isFetching) && workspaceObjects.length === 0;

  const linkMutation = useMutation({
    mutationFn: async (objectId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const target = workspaceObjects.find((item) => item.id === objectId);
      if (!target) throw new Error(`${config.objectLabel} not found`);
      if (kind === "api") {
        await linkApiToSystemAsProvider(orgSlug, workspaceSlug, system, target, token);
      } else {
        await linkEventToSystemAsProducer(orgSlug, workspaceSlug, system, target, token);
      }
    },
    onSuccess: () => {
      setQuery("");
      setFocused(false);
      queryClient.invalidateQueries({ queryKey: objectsQueryKey });
      queryClient.invalidateQueries({ queryKey: ["relationships"] });
      onLinked();
      onClose?.();
    },
  });

  const pending = linkMutation.isPending;

  const emptyMessage = (() => {
    if (objectsLoading) return `Loading ${config.objectLabelPlural}…`;
    if (trimmed) return `No existing ${config.objectLabelPlural} match.`;
    if (workspaceObjects.length === 0) return config.emptyWorkspace;
    if (availableObjects.length === 0) return config.emptyAvailable;
    return `No ${config.objectLabelPlural} available to link.`;
  })();

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            window.setTimeout(() => {
              setFocused(false);
              if (!inputRef.current?.value.trim()) onClose?.();
            }, 150);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              setFocused(false);
              onClose?.();
            }
          }}
          disabled={disabled || pending}
          placeholder={config.placeholder}
          className={cn(
            "w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg",
            "focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-50"
          )}
        />
      </div>

      {showPanel && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {showCreate && (
            <button
              type="button"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setQuery("");
                setFocused(false);
                onCreateNew(trimmed);
                onClose?.();
              }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-indigo-50 border-b border-gray-100"
            >
              <span className="font-medium text-gray-900">
                {config.createPrefix}: &ldquo;{trimmed}&rdquo;
              </span>
              {matches.length === 0 && !objectsLoading && (
                <span className="block text-xs text-gray-400 mt-0.5">
                  No existing {config.objectLabelPlural} match.
                </span>
              )}
            </button>
          )}

          {objectsLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">Loading…</p>
          )}

          {matches.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={pending}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => linkMutation.mutate(item.id)}
              className="w-full text-left px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 border-b border-gray-50 last:border-b-0"
            >
              {item.name}
            </button>
          ))}

          {!objectsLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">{emptyMessage}</p>
          )}

          {!trimmed && matches.length > 0 && (
            <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              Type to filter {availableObjects.length} available {config.objectLabel}
              {availableObjects.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
