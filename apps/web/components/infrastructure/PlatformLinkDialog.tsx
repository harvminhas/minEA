"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import type { MinEAObject } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useTenancy } from "@/lib/tenancy";
import { useAuthQueryEnabled } from "@/lib/use-auth-query-enabled";
import {
  COMPONENT_PLATFORM_REL,
  SYSTEM_PLATFORM_REL,
} from "@/lib/platform-relationship-utils";
import { cn } from "@/lib/utils";

interface Props {
  platform: MinEAObject;
  onClose: () => void;
  onLinked: () => void;
}

type LinkKind = "application" | "component";

export function PlatformLinkDialog({ platform, onClose, onLinked }: Props) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const enabled = useAuthQueryEnabled();

  const [kind, setKind] = useState<LinkKind>("application");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: entities, isLoading } = useQuery({
    queryKey: ["platform-link-candidates", orgSlug, workspaceSlug, kind, search],
    queryFn: async () => {
      const token = await getToken();
      return objectsApi.list(orgSlug, workspaceSlug, { type: kind, search: search || undefined }, token!);
    },
    enabled,
  });

  const { data: existingRels } = useQuery({
    queryKey: ["platform-existing-rels", orgSlug, workspaceSlug, platform.id],
    queryFn: async () => {
      const token = await getToken();
      return relationshipsApi.list(orgSlug, workspaceSlug, { to_object_id: platform.id }, token!);
    },
    enabled,
  });

  const alreadyLinked = useMemo(() => {
    const relType = kind === "application" ? SYSTEM_PLATFORM_REL : COMPONENT_PLATFORM_REL;
    return new Set(
      (existingRels ?? [])
        .filter((r) => r.type === relType && r.from_type === kind)
        .map((r) => r.from_object_id)
    );
  }, [existingRels, kind]);

  const candidates = useMemo(() => {
    return (entities?.items ?? []).filter((item) => !alreadyLinked.has(item.id));
  }, [entities?.items, alreadyLinked]);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  const linkMutation = useMutation({
    mutationFn: async () => {
      if (!selected) return;
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const relType = kind === "application" ? SYSTEM_PLATFORM_REL : COMPONENT_PLATFORM_REL;
      const fromType = kind;

      const outgoing = await relationshipsApi.list(
        orgSlug,
        workspaceSlug,
        { from_object_id: selected.id },
        token
      );
      for (const rel of outgoing) {
        if (rel.type === relType && rel.from_type === fromType && rel.to_type === "cloud_service") {
          await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
        }
      }

      await relationshipsApi.create(
        orgSlug,
        workspaceSlug,
        {
          type: relType,
          from_object_id: selected.id,
          from_type: fromType,
          to_object_id: platform.id,
          to_type: "cloud_service",
        },
        token
      );

      const props = (selected.properties ?? {}) as Record<string, unknown>;
      await objectsApi.update(
        orgSlug,
        workspaceSlug,
        selected.id,
        {
          properties: {
            ...props,
            platform: { platform_id: platform.id, platform_name: platform.name },
          },
        },
        token
      );
    },
    onSuccess: () => {
      setError(null);
      onLinked();
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Could not create link"),
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[130]" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-h-[80vh] bg-white rounded-xl shadow-2xl z-[140] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-900">Link to platform</h3>
            <p className="text-xs text-gray-400 mt-0.5">{platform.name}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="flex gap-2">
            {(["application", "component"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setKind(k);
                  setSelectedId(null);
                  setSearch("");
                }}
                className={cn(
                  "flex-1 py-2 text-sm font-medium rounded-md border transition-colors",
                  kind === k
                    ? "border-slate-600 bg-slate-50 text-slate-700"
                    : "border-gray-200 text-gray-500 hover:bg-gray-50"
                )}
              >
                {k === "application" ? "System" : "Component"}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${kind === "application" ? "systems" : "components"}…`}
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="border border-gray-200 rounded-md max-h-48 overflow-y-auto">
            {isLoading ? (
              <p className="text-sm text-gray-400 p-3">Loading…</p>
            ) : candidates.length === 0 ? (
              <p className="text-sm text-gray-400 p-3">
                No {kind === "application" ? "systems" : "components"} available to link.
              </p>
            ) : (
              candidates.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50",
                    selectedId === item.id && "bg-indigo-50 text-indigo-700"
                  )}
                >
                  {item.name}
                </button>
              ))
            )}
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="p-5 border-t border-gray-100 flex justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => linkMutation.mutate()}
            disabled={!selected || linkMutation.isPending}
            className="px-4 py-2 text-sm text-white bg-slate-700 rounded-md hover:bg-slate-800 disabled:opacity-40"
          >
            {linkMutation.isPending ? "Linking…" : "Link"}
          </button>
        </div>
      </div>
    </>
  );
}
