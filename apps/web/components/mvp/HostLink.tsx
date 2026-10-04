"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import type { CatalogRow } from "@/lib/model-catalog";
import { noHostLinked, readRuntimeInfra } from "@/lib/infra/read";
import { infraStatus } from "@/lib/infra/status";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";

export function HostLink({ row, onAddHost }: { row: CatalogRow; onAddHost?: () => void }) {
  const impact = useImpactGraph();
  const catalog = useModelCatalog();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const props = (row.object.properties ?? {}) as Record<string, unknown>;
  const hosting = typeof props.hosting_model === "string" ? props.hosting_model.replace(/_/g, " ") : "on-prem";
  const missing = row.kind === "application" && noHostLinked({ type: row.object.type, properties: props }, impact.edges, row.id);
  const note = row.object.description ?? "";

  const link = useMutation({
    mutationFn: async (host: CatalogRow) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      const edgeType = host.kind === "platform" ? "built_on" : "runs_on";
      const already = impact.edges.some((edge) => edge.fromId === row.id && edge.toId === host.id && (edge.type === "runs_on" || edge.type === "built_on"));
      if (already) return;
      return relationshipsApi.create(orgSlug, workspaceSlug, {
        type: edgeType,
        from_object_id: row.id,
        from_type: row.object.type,
        to_object_id: host.id,
        to_type: host.object.type,
      }, token);
    },
    onSuccess: (created, host) => {
      setMessage(`${row.name} now runs on ${host.name}`);
      setOpen(false);
      if (created && orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
      }
    },
    onError: (error: Error) => setMessage(error.message),
  });

  if (!missing) return null;
  const mentioned = note.match(/[A-Z][\w /-]{2,40}/);
  const needle = query.trim().toLowerCase();
  const servers = (catalog.data?.rows ?? []).filter((item) => item.kind === "runtime").filter((item) => {
    const infra = readRuntimeInfra(item.object);
    return !needle || `${item.name} ${infra.kindLabel} ${infra.locationDetail}`.toLowerCase().includes(needle);
  });

  return (
    <div className="rounded-xl border border-[#f5d7a8] bg-[#fffaf0] p-3 text-[13px]">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[#92400e]">No host linked</strong>
        <button
          type="button"
          className="font-medium text-[#c2410c]"
          onClick={() => {
            if (onAddHost) {
              onAddHost();
              return;
            }
            setOpen((value) => !value);
          }}
        >
          + Add host
        </button>
      </div>
      <p className="mt-1 text-[#7a5b32]">
        Hosting says {hosting}, but nothing links {row.name} to a server or device, so what breaks if it stops and infrastructure cost cannot include it.
        {mentioned ? ` Your note says "${mentioned[0]}".` : ""}
      </p>
      {open && (
        <div className="mt-3 rounded-lg border border-[#f0e2c8] bg-white p-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search servers & devices" className="mb-2 h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]" />
          <div className="max-h-48 space-y-1 overflow-y-auto">
            {servers.slice(0, 8).map((item) => {
              const infra = readRuntimeInfra(item.object);
              const status = infraStatus(infra, new Date());
              return (
                <button key={item.id} type="button" onClick={() => link.mutate(item)} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[#fafafb]">
                  <span>
                    <span className="font-medium text-[#1c2230]">{item.name}</span>
                    <span className="mt-0.5 block text-[11px] text-[#8b90a0]">{[infra.kindLabel, infra.locationLabel, infra.locationDetail].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="text-[11px] text-[#6b7289]">{status.label}</span>
                </button>
              );
            })}
            {servers.length === 0 && <p className="px-2 py-2 text-[12px] text-[#8b90a0]">No servers match.</p>}
          </div>
          <p className="mt-2 text-[11px] text-[#8b90a0]">Creates a runs-on link</p>
        </div>
      )}
      {message && <p className="mt-2 text-[12px] text-[#3c4254]">{message}</p>}
    </div>
  );
}
