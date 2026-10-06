"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { infraConfig } from "@/lib/infra/infraConfig";
import { locationMigrationPlan, locationPresence, locationTypeLabel, locationTypes } from "@/lib/infra/locations";
import { applyCatalogWrite } from "@/lib/use-model-catalog";
import { AddFlow } from "@/components/add/AddFlow";
import { modelItemPath } from "@/lib/mvp-paths";

function ownerName(object: MinEAObject): string {
  return object.owner_team_name?.trim() || object.point_of_contact_name?.trim() || object.owner?.trim() || "";
}

function dash(value: string) {
  return value || <span className="text-[#c5c8d4]">—</span>;
}

export function LocationsTable({ anywhere = false, selectedId }: { anywhere?: boolean; selectedId?: string }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const locations = catalog.data?.locations ?? [];
  const [name, setName] = useState("");
  const [kind, setKind] = useState("office");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);

  const rows = catalog.data?.rows ?? [];
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const enumKeys = new Set<string>(infraConfig.locations.map((item) => item.key));
  const notes = rows
    .filter((row) => row.kind === "runtime")
    .map((row) => {
      const raw = String((row.object.properties ?? {}).location ?? "").trim();
      return { id: row.id, name: row.name, location: enumKeys.has(raw) ? "" : raw };
    })
    .filter((note) => note.location && !enumKeys.has(note.location));
  const plan = locationMigrationPlan(notes).filter(
    (group) => !locations.some((location) => location.name.trim().toLowerCase() === group.name.trim().toLowerCase())
  );

  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Type a name first");
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return objectsApi.create(orgSlug, workspaceSlug, {
        type: "location",
        name: trimmed,
        properties: { location_type: kind, ...(address.trim() ? { address: address.trim() } : {}) },
      }, token);
    },
    onSuccess: (created) => {
      setName("");
      setAddress("");
      setError("");
      setOpen(false);
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
    },
    onError: (err: Error) => setError(err.message),
  });

  const migrate = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const createdObjects: MinEAObject[] = [];
      const createdRels: Relationship[] = [];
      for (const group of plan) {
        const created = await objectsApi.create(orgSlug, workspaceSlug, {
          type: "location",
          name: group.name,
          properties: { location_type: "other" },
        }, token);
        createdObjects.push(created);
        for (const serverId of group.serverIds) {
          const server = rowById.get(serverId);
          if (!server) continue;
          createdRels.push(await relationshipsApi.create(orgSlug, workspaceSlug, {
            type: "located_at",
            from_object_id: server.id,
            from_type: server.object.type,
            to_object_id: created.id,
            to_type: "location",
          }, token));
        }
      }
      return { createdObjects, createdRels };
    },
    onSuccess: ({ createdObjects, createdRels }) => {
      if (!orgSlug || !workspaceSlug) return;
      for (const object of createdObjects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
      for (const relationship of createdRels) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
    },
    onError: (err: Error) => setError(err.message),
  });

  const suggestions = name.trim().length < 2
    ? []
    : locations.filter((location) => location.name.toLowerCase().includes(name.trim().toLowerCase()));

  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">SITES AND REGIONS</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Locations <span className="text-[14px] font-normal text-[#8b90a0]">{locations.length}</span>
          </h1>
        </div>
        {anywhere && (
          <button type="button" onClick={() => setAdding((value) => !value)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
            + Add
          </button>
        )}
      </div>
      {adding && <div className="mb-4"><AddFlow origin="model" kind="location" compact /></div>}
      {plan.length > 0 && (
        <div className="mb-4 rounded-xl border border-[#f3e2b3] bg-[#fffaf0] px-4 py-3 text-[13px] text-[#6b5420]">
          <p>{plan.length} place {plan.length === 1 ? "name is" : "names are"} still only a note on a server. Creating them does not remove the note.</p>
          <button type="button" onClick={() => migrate.mutate()} className="mt-2 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[12px] font-semibold text-white">
            {migrate.isPending ? "Creating…" : "Create these locations"}
          </button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Type", "Address", "Items there", "Apps affected", "Owner"].map((heading) => (
                <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {locations.map((location) => {
              const props = location.properties ?? {};
              const typeKey = typeof props.location_type === "string" ? props.location_type : "";
              const addressText = typeof props.address === "string" ? props.address : "";
              const presence = locationPresence(
                location.id,
                impact.relationships,
                impact.nodes,
                impact.edges,
                new Set(rows.filter((row) => row.kind === "application").map((row) => row.id))
              );
              return (
                <tr
                  key={location.id}
                  onClick={() => router.push(modelItemPath(basePath, "locations", location.id))}
                  className={`cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb] ${selectedId === location.id ? "bg-[#f6f5ff]" : ""}`}
                >
                  <td className="px-2 py-3 font-medium text-[#1c2230]">{location.name}</td>
                  <td className="px-2 py-3">{dash(locationTypeLabel(typeKey))}</td>
                  <td className="px-2 py-3">{dash(addressText)}</td>
                  <td className="px-2 py-3">{presence.items || dash("")}</td>
                  <td className="px-2 py-3">{presence.apps || dash("")}</td>
                  <td className="px-2 py-3">{dash(ownerName(location))}</td>
                </tr>
              );
            })}
            {!anywhere && <tr className="border-b border-[#f3f4f8]">
              <td className="px-2 py-3" colSpan={6}>
                <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
                  <span className="text-[#5b4ce6]">+</span>
                  <div className="relative">
                    <input
                      value={name}
                      onChange={(event) => { setName(event.target.value); setOpen(true); }}
                      onFocus={() => setOpen(true)}
                      placeholder="Add a location"
                      className="h-8 w-[220px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
                    />
                    {open && name.trim() && (
                      <div className="absolute left-0 top-9 z-10 w-[260px] rounded-lg border border-[#e6e8ee] bg-white p-1 shadow-lg">
                        {suggestions.map((location) => (
                          <button key={location.id} type="button" className="block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-[#f6f5ff]" onClick={() => router.push(modelItemPath(basePath, "locations", location.id))}>
                            {location.name}
                          </button>
                        ))}
                        <button type="submit" className="block w-full rounded px-2 py-1.5 text-left text-[13px] font-medium text-[#3f35b5] hover:bg-[#f6f5ff]">
                          + Create “{name.trim()}”
                        </button>
                      </div>
                    )}
                  </div>
                  <select value={kind} onChange={(event) => setKind(event.target.value)} className="h-8 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
                    {locationTypes.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  <input value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Address" className="h-8 w-[220px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
                </form>
                <p className="mt-1 text-[12px] text-[#8b90a0]">Every location picker works this way: pick a match or create one as you type.</p>
                {error && <p className="mt-1 text-[12px] text-[#b42318]">{error}</p>}
              </td>
            </tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
