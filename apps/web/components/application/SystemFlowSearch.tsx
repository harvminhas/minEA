"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { objectsApi } from "@/lib/api-client";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import type { MinEAObject } from "@minea/types";
import { cn } from "@/lib/utils";
import { flowIdsLinkedToSystem, linkFlowToSystem, systemFlowEndpoint } from "@/lib/flow-system-utils";

const MAX_RESULTS = 20;

interface Props {
  system: MinEAObject;
  allFlows?: MinEAObject[];
  linkedFlowIds?: string[];
  onLinked: () => void;
  onCreateNew: (name: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function SystemFlowSearch({
  system,
  allFlows = [],
  linkedFlowIds,
  onLinked,
  onCreateNew,
  onClose,
  autoFocus,
  disabled,
}: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const authEnabled = useAuthQueryEnabled();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);

  const flowsQueryKey = ["objects", orgSlug, workspaceSlug, "integration_flow"] as const;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: flowsQueryKey,
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(
        orgSlug,
        workspaceSlug,
        { type: "integration_flow", page_size: 200 },
        token!
      );
    },
    enabled: authEnabled,
  });

  const workspaceFlows = data?.items ?? allFlows;

  const excludedIds = useMemo(() => {
    if (linkedFlowIds) return new Set(linkedFlowIds);
    return new Set(flowIdsLinkedToSystem(system.id, workspaceFlows));
  }, [linkedFlowIds, system.id, workspaceFlows]);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
      setFocused(true);
    }
  }, [autoFocus]);

  const availableFlows = useMemo(
    () => workspaceFlows.filter((flow) => !excludedIds.has(flow.id)),
    [workspaceFlows, excludedIds]
  );

  const trimmed = query.trim();
  const queryLower = trimmed.toLowerCase();

  const matches = useMemo(() => {
    const filtered = queryLower
      ? availableFlows.filter((flow) => flow.name.toLowerCase().includes(queryLower))
      : availableFlows;
    return filtered.sort((a, b) => a.name.localeCompare(b.name)).slice(0, MAX_RESULTS);
  }, [availableFlows, queryLower]);

  const exactMatch = availableFlows.some((item) => item.name.toLowerCase() === queryLower);
  const showCreate = trimmed.length > 0 && !exactMatch;
  const showPanel = focused;
  const flowsLoading = (isLoading || isFetching) && workspaceFlows.length === 0;

  const linkMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const flow = workspaceFlows.find((item) => item.id === flowId);
      if (!flow) throw new Error("Flow not found");
      await linkFlowToSystem(orgSlug, workspaceSlug, flow, systemFlowEndpoint(system), token);
    },
    onSuccess: () => {
      setQuery("");
      setFocused(false);
      queryClient.invalidateQueries({ queryKey: flowsQueryKey });
      onLinked();
      onClose?.();
    },
  });

  const pending = linkMutation.isPending;

  const emptyMessage = (() => {
    if (flowsLoading) return "Loading flows…";
    if (trimmed) return "No existing flows match.";
    if (workspaceFlows.length === 0) return "No flows in this workspace yet.";
    if (availableFlows.length === 0) {
      return "All workspace flows are already linked to this system.";
    }
    return "No flows available to link.";
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
          placeholder="Search or create flow…"
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
              <span className="font-medium text-gray-900">Create new flow: &ldquo;{trimmed}&rdquo;</span>
              {matches.length === 0 && !flowsLoading && (
                <span className="block text-xs text-gray-400 mt-0.5">No existing flows match.</span>
              )}
            </button>
          )}

          {flowsLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">Loading flows…</p>
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

          {!flowsLoading && matches.length === 0 && !showCreate && (
            <p className="px-3 py-2.5 text-sm text-gray-400">{emptyMessage}</p>
          )}

          {!trimmed && matches.length > 0 && (
            <p className="px-3 py-2 text-[11px] text-gray-400 border-t border-gray-100">
              Type to filter {availableFlows.length} available flow
              {availableFlows.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
