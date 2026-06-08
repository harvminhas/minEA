"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { orgsApi, workspacesApi } from "@/lib/api-client";
import { usePermissions } from "@/lib/use-permissions";
import { primaryViewPath } from "@/lib/tenancy";
import { workspaceSlugFromName } from "@/lib/workspace-slug";
import { cn } from "@/lib/utils";

type StartMode = "fresh" | "copy";

export default function NewWorkspacePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { getToken } = useAuth();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [startMode, setStartMode] = useState<StartMode>("copy");
  const [sourceSlug, setSourceSlug] = useState<string>("");
  const [selectedLayers, setSelectedLayers] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const { data: org } = useQuery({
    queryKey: ["org", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return orgsApi.get(orgSlug, token!);
    },
  });

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces", orgSlug],
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.list(orgSlug, token!);
    },
  });

  const { canCreateWorkspace } = usePermissions();

  useEffect(() => {
    if (!workspaces?.length) return;
    if (!sourceSlug) {
      const defaultWs = workspaces.find((w) => w.slug === "default") ?? workspaces[0]!;
      setSourceSlug(defaultWs.slug);
    }
  }, [workspaces, sourceSlug]);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(workspaceSlugFromName(name));
    }
  }, [name, slugTouched]);

  const { data: copyPreview, isLoading: previewLoading } = useQuery({
    queryKey: ["workspace-copy-preview", orgSlug, sourceSlug],
    enabled: startMode === "copy" && !!sourceSlug,
    queryFn: async () => {
      const token = await getToken();
      return workspacesApi.copyPreview(orgSlug, sourceSlug, token!);
    },
  });

  useEffect(() => {
    if (!copyPreview?.layers.length) return;
    setSelectedLayers((prev) => {
      if (prev.size > 0) return prev;
      return new Set(copyPreview.layers.map((l) => l.id));
    });
  }, [copyPreview]);

  const layerRows = copyPreview?.layers ?? [];

  const selectedCount = useMemo(
    () => layerRows.filter((l) => selectedLayers.has(l.id)).reduce((sum, l) => sum + l.count, 0),
    [layerRows, selectedLayers]
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      const body = {
        name: name.trim(),
        slug: slug.trim(),
        ...(startMode === "copy" && sourceSlug && selectedLayers.size > 0
          ? {
              source_workspace_slug: sourceSlug,
              copy_layers: [...selectedLayers],
            }
          : {}),
      };
      return workspacesApi.create(orgSlug, body, token);
    },
    onSuccess: (workspace) => {
      queryClient.invalidateQueries({ queryKey: ["workspaces", orgSlug] });
      router.push(primaryViewPath(orgSlug, workspace.slug));
    },
    onError: (err: Error) => setError(err.message),
  });

  const toggleLayer = (id: string) => {
    setSelectedLayers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllLayers = () => setSelectedLayers(new Set(layerRows.map((l) => l.id)));
  const deselectAllLayers = () => setSelectedLayers(new Set());

  if (org && !canCreateWorkspace) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <p className="text-sm text-gray-600">Only org owners and admins can create workspaces.</p>
        <Link href={`/orgs/${orgSlug}/settings`} className="text-sm text-indigo-600 mt-4 inline-block">
          Back to settings
        </Link>
      </div>
    );
  }

  const canSubmit =
    name.trim().length > 0 &&
    slug.trim().length >= 2 &&
    (startMode === "fresh" || (sourceSlug && selectedLayers.size > 0));

  return (
    <div className="min-h-[calc(100vh-3rem)] bg-gray-50/80">
      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="mb-8">
          <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">
            New workspace
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Create a workspace</h1>
          <p className="text-sm text-gray-500 mt-2 max-w-xl">
            Workspaces are independent architecture repositories with their own objects and views.
            Copied content gets new IDs — nothing stays linked to the source workspace.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Workspace name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Target state 2027, AcmeCorp integration…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">URL slug</label>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="truncate">/orgs/{orgSlug}/workspaces/</span>
              <input
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                }}
                className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-600 mb-2">Start from</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStartMode("fresh")}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-colors",
                  startMode === "fresh"
                    ? "border-indigo-400 bg-indigo-50/50"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles size={16} className="text-indigo-600" />
                  <span className="text-sm font-semibold text-gray-900">Fresh workspace</span>
                </div>
                <p className="text-xs text-gray-500">Empty repository, start from scratch</p>
              </button>
              <button
                type="button"
                onClick={() => setStartMode("copy")}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition-colors",
                  startMode === "copy"
                    ? "border-indigo-400 bg-indigo-50/50"
                    : "border-gray-200 hover:border-gray-300"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Copy size={16} className="text-indigo-600" />
                  <span className="text-sm font-semibold text-gray-900">Copy existing</span>
                </div>
                <p className="text-xs text-gray-500">Clone layers as an independent starting point</p>
              </button>
            </div>
          </div>

          {startMode === "copy" && (
            <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Copy from</label>
                <select
                  value={sourceSlug}
                  onChange={(e) => {
                    setSourceSlug(e.target.value);
                    setSelectedLayers(new Set());
                  }}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {(workspaces ?? []).map((ws) => (
                    <option key={ws.id} value={ws.slug}>
                      {ws.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-600">Select layers to copy</p>
                  <div className="flex gap-3 text-[11px]">
                    <button
                      type="button"
                      onClick={selectAllLayers}
                      className="text-indigo-600 hover:text-indigo-700 font-medium"
                    >
                      Select all
                    </button>
                    <button
                      type="button"
                      onClick={deselectAllLayers}
                      className="text-gray-500 hover:text-gray-700 font-medium"
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                {previewLoading ? (
                  <p className="text-xs text-gray-400 py-4">Loading layer counts…</p>
                ) : (
                  <div className="space-y-2">
                    {layerRows.map((layer) => {
                      const checked = selectedLayers.has(layer.id);
                      return (
                        <label
                          key={layer.id}
                          className={cn(
                            "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                            checked
                              ? "border-indigo-200 bg-white"
                              : "border-transparent bg-white/70 hover:bg-white"
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleLayer(layer.id)}
                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{layer.label}</p>
                            <p className="text-xs text-gray-500">{layer.subtitle}</p>
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                            {layer.count} item{layer.count === 1 ? "" : "s"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {selectedLayers.size > 0 && (
                  <p className="text-[11px] text-gray-500 mt-3">
                    {selectedCount} item{selectedCount === 1 ? "" : "s"} will be copied with new IDs.
                    Relationships are only kept between copied objects in this workspace.
                  </p>
                )}
              </div>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <Link
              href={`/orgs/${orgSlug}/settings`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </Link>
            <button
              type="button"
              disabled={!canSubmit || createMutation.isPending}
              onClick={() => {
                setError(null);
                createMutation.mutate();
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 text-sm font-medium transition-colors"
            >
              {createMutation.isPending ? (
                "Creating…"
              ) : (
                <>
                  <Check size={16} />
                  Create workspace
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
