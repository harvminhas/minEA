"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship, SuggestedCapabilityLink } from "@minea/types";
import { capabilityMapApi, objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey } from "@/lib/use-model-catalog";
import { SUPPORTED_BY } from "@/lib/capabilities";
import { buildCapabilityTree, flatten } from "@/lib/capability-tree";

export function CapabilityAppMapping({
  objects,
  edges,
  onBack,
  onOpen,
}: {
  objects: readonly MinEAObject[];
  edges: readonly Relationship[];
  onBack: () => void;
  onOpen?: (id: string) => void;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [newApp, setNewApp] = useState("");
  const [error, setError] = useState("");
  const tree = useMemo(() => buildCapabilityTree(objects, edges), [objects, edges]);
  const leaves = flatten(tree, "l3");
  const query = useQuery({
    queryKey: ["capability-suggest-links", orgSlug, workspaceSlug],
    enabled: Boolean(orgSlug && workspaceSlug),
    queryFn: async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return capabilityMapApi.suggestLinks(orgSlug!, workspaceSlug!, token);
    },
  });

  const token = async () => {
    const value = await getToken();
    if (!value || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return value;
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["capability-suggest-links", orgSlug, workspaceSlug] });
  };

  const accept = useMutation({
    mutationFn: async (link: SuggestedCapabilityLink) => {
      const t = await token();
      const app = objects.find((o) => o.id === link.app_id);
      const rel = await relationshipsApi.create(
        orgSlug!,
        workspaceSlug!,
        { type: SUPPORTED_BY, from_object_id: link.capability_id, from_type: "capability", to_object_id: link.app_id, to_type: (app?.type ?? "application") as "application" },
        t,
      );
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { relationship: rel });
      return rel;
    },
    onSuccess: () => refresh(),
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't link the app"),
  });

  const acceptAll = async (links: SuggestedCapabilityLink[]) => {
    setError("");
    for (const link of links) {
      try {
        await accept.mutateAsync(link);
      } catch {
        break;
      }
    }
  };

  const createApp = async (name: string, capabilityId?: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError("");
    try {
      const t = await token();
      const app = await objectsApi.create(orgSlug!, workspaceSlug!, { type: "application", name: trimmed, properties: {} }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: app });
      if (capabilityId) {
        const rel = await relationshipsApi.create(
          orgSlug!,
          workspaceSlug!,
          { type: SUPPORTED_BY, from_object_id: capabilityId, from_type: "capability", to_object_id: app.id, to_type: "application" },
          t,
        );
        applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { relationship: rel });
      }
      setNewApp("");
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the app");
    }
  };

  const suggestions = query.data?.suggestions ?? [];
  const unmapped = query.data?.unmapped ?? [];
  const gaps = leaves.filter((n) => n.uniqueAppIds.length === 0);
  const byId = new Map(objects.map((o) => [o.id, o]));

  return (
    <div data-testid="capability-app-mapping">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold text-[#1c2230]">Link apps to capabilities</h2>
          <p className="text-[13px] text-[#6b7289]">
            AI matches each app to the most specific activity. Confirm, change, or add a missing app or capability here — you don't need to leave this page.
          </p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] px-3 text-[12.5px] text-[#4b5163]">
          Back to map
        </button>
        <button
          type="button"
          disabled={!suggestions.length}
          onClick={() => void acceptAll(suggestions)}
          className="inline-flex h-8 items-center rounded-md bg-[#5b4ce6] px-3 text-[12.5px] font-semibold text-white disabled:opacity-50"
        >
          Accept remaining {suggestions.length || ""}
        </button>
      </div>
      {query.data?.warning && <p className="mb-3 text-[12.5px] text-[#9a3412]">{query.data.warning}</p>}
      {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
      <div className="mb-4 grid grid-cols-4 gap-2.5">
        <Kpi value={String(unmapped.length)} label="Apps still unmapped" />
        <Kpi value={String(suggestions.length)} label="Suggestions to review" />
        <Kpi value={String(gaps.length)} label="Activities with no app" />
        <Kpi value={String(new Set(suggestions.map((s) => s.app_id)).size < suggestions.length ? suggestions.length - new Set(suggestions.map((s) => s.app_id)).size : 0)} label="Apps suggested on more than one activity" />
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[320px] flex-[1.15] overflow-hidden rounded-xl border border-[#e6e8ee]">
          <div className="border-b border-[#f3f4f8] px-3.5 py-3 text-[13.5px] font-semibold">
            Suggested links <span className="ml-1 rounded-full bg-[#ece9ff] px-2 py-0.5 text-[11px] font-medium text-[#3f35b5]">{suggestions.length}</span>
          </div>
          {query.isPending && <p className="px-3.5 py-6 text-[13px] text-[#8b90a0]">Finding matches…</p>}
          {suggestions.map((link) => (
            <div key={`${link.app_id}-${link.capability_id}`} className="flex items-start gap-3 border-t border-[#f3f4f8] px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px]">
                  <b>{link.app_name}</b> <span className="text-[#8b90a0]">→</span> <b>{link.capability_name}</b>
                </div>
                <div className="text-[11px] text-[#8b90a0]">{link.path} · {link.confidence} confidence</div>
              </div>
              <button type="button" onClick={() => accept.mutate(link)} className="inline-flex h-7 items-center rounded-md bg-[#5b4ce6] px-2.5 text-[12.5px] font-semibold text-white">
                Accept
              </button>
            </div>
          ))}
          <div className="border-t border-[#f3f4f8] px-3.5 py-2.5">
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void createApp(newApp);
              }}
            >
              <input
                value={newApp}
                onChange={(e) => setNewApp(e.target.value)}
                placeholder="+ Add an app and pick a capability"
                className="flex-1 rounded-md border border-dashed border-[#d6d3f0] px-2 py-1 text-[12.5px] outline-none focus:border-[#5b4ce6]"
              />
              <button type="submit" className="text-[12.5px] font-medium text-[#5b4ce6]">Add</button>
            </form>
          </div>
        </div>
        <div className="min-w-[260px] flex-1 overflow-hidden rounded-xl border border-[#e6e8ee]">
          <div className="border-b border-[#f3f4f8] px-3.5 py-3 text-[13.5px] font-semibold">
            Unmapped apps <span className="ml-1 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-medium text-[#c2410c]">{unmapped.length}</span>
          </div>
          <div className="px-3.5 py-3">
            {unmapped.map((app) => (
              <div key={app.id} className="mb-2.5 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <b className="text-[13px]">{app.name}</b>
                </div>
                <LinkPicker
                  leaves={leaves}
                  onPick={(id) => {
                    const cap = byId.get(id);
                    if (!cap) return;
                    accept.mutate({
                      app_id: app.id,
                      app_name: app.name,
                      capability_id: id,
                      capability_name: cap.name,
                      path: cap.name,
                      confidence: "medium",
                    });
                  }}
                />
              </div>
            ))}
            {unmapped.length === 0 && <p className="text-[13px] text-[#8b90a0]">Every app has a suggestion or a link.</p>}
          </div>
        </div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-[#e6e8ee]">
        <div className="px-3.5 py-3 text-[13.5px] font-semibold">Already on the map</div>
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-[#fafafb] text-[10.5px] tracking-[0.08em] text-[#8b90a0]">
              <th className="px-2.5 py-2 font-semibold">ACTIVITY</th>
              <th className="px-2.5 py-2 font-semibold">UNDER</th>
              <th className="px-2.5 py-2 font-semibold">APPS</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {leaves.map((leaf) => {
              const domain = tree.find((d) => d.children.some((c) => c.id === leaf.parentId || c.id === leaf.id) || d.id === leaf.domainId);
              const parent = domain?.children.find((c) => c.id === leaf.parentId);
              const path = parent ? `${domain?.name} · ${parent.name}` : domain?.name ?? "";
              const apps = leaf.uniqueAppIds.map((id) => byId.get(id)).filter(Boolean);
              return (
                <tr key={leaf.id} className="border-t border-[#f3f4f8]">
                  <td className="px-2.5 py-2 font-medium">
                    <button type="button" className="text-left hover:text-[#5b4ce6]" onClick={() => onOpen?.(leaf.id)}>{leaf.name}</button>
                  </td>
                  <td className="px-2.5 py-2 text-[#8b90a0]">{path}</td>
                  <td className="px-2.5 py-2">
                    {apps.length ? apps.map((app) => (
                      <span key={app!.id} className="mb-1 mr-1 inline-flex rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[12px]">{app!.name}</span>
                    )) : <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-medium text-[#c2410c]">No app</span>}
                  </td>
                  <td className="px-2.5 py-2">
                    <AddAppOn onCreate={(name) => void createApp(name, leaf.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#eef0f4] px-3.5 py-3">
      <div className="text-[20px] font-semibold">{value}</div>
      <div className="mt-0.5 text-[12px] text-[#6b7289]">{label}</div>
    </div>
  );
}

function LinkPicker({ leaves, onPick }: { leaves: { id: string; name: string }[]; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const matches = leaves.filter((l) => l.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-md border border-dashed border-[#d6d3f0] px-2 py-0.5 text-[12.5px] text-[#5b4ce6]">
        + Link or create
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-56 rounded-md border border-[#e6e8ee] bg-white p-2 shadow-lg">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search capabilities…" className="mb-1 w-full border-b border-[#eef0f4] px-1 py-1 text-[12.5px] outline-none" />
          {matches.map((leaf) => (
            <button key={leaf.id} type="button" className="block w-full rounded px-1 py-1 text-left text-[12.5px] hover:bg-[#f6f5ff]" onClick={() => { onPick(leaf.id); setOpen(false); }}>
              {leaf.name}
            </button>
          ))}
          {matches.length === 0 && <p className="px-1 text-[12px] text-[#8b90a0]">No matches</p>}
        </div>
      )}
    </div>
  );
}

function AddAppOn({ onCreate }: { onCreate: (name: string) => void }) {
  const [on, setOn] = useState(false);
  const [name, setName] = useState("");
  if (!on) {
    return (
      <button type="button" onClick={() => setOn(true)} className="text-[12.5px] text-[#5b4ce6]">
        + Add app
      </button>
    );
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onCreate(name.trim());
        setOn(false);
        setName("");
      }}
    >
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onBlur={() => !name && setOn(false)} placeholder="App name" className="w-32 border-b border-[#5b4ce6] text-[12.5px] outline-none" />
    </form>
  );
}
