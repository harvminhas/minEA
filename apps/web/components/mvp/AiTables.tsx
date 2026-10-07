"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { modelItemPath } from "@/lib/mvp-paths";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { UI_TYPE_LABEL } from "@/lib/relationship-targets";
import { AI_TABLE_COLUMNS, aiTableRows, type AiTableType } from "@/lib/ai/tables";

const EMPTY_COPY: Record<AiTableType, string> = {
  agent:
    "No AI agents yet. Agents are bots that do work on their own: a sales assistant, an invoice reader, a support triage bot.",
  ai_model:
    "No AI models yet. Add the models your agents use (GPT-4o, Claude, Llama…) so a model or vendor outage shows up in impact.",
};

export function AiTable({ type, selectedId }: { type: AiTableType; selectedId?: string }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const rows = aiTableRows(type, catalog.data?.objects ?? [], catalog.data?.relationships ?? []);
  const section = type === "agent" ? "agents" : "ai-models";
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const create = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Type a name first");
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return objectsApi.create(orgSlug, workspaceSlug, { type, name: trimmed, properties: {} }, token);
    },
    onSuccess: (created) => {
      setName("");
      setError("");
      setAdding(false);
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
    },
    onError: (err: Error) => setError(err.message),
  });
  return (
    <div className="px-6 py-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">AI</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            {UI_TYPE_LABEL[type]} <span className="text-[14px] font-normal text-[#8b90a0]">{rows.length}</span>
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setAdding((value) => !value)}
          className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
        >
          + Add
        </button>
      </div>
      {adding && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Name"
            className="h-8 w-[220px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]"
          />
          <button type="submit" className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white">
            {create.isPending ? "Adding…" : "Add"}
          </button>
          {error && <p className="w-full text-[12px] text-[#b42318]">{error}</p>}
        </form>
      )}
      {rows.length > 0 && (
        <table className="w-full border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {AI_TABLE_COLUMNS[type].map((column) => (
                <th key={column} className="h-11 px-2 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => router.push(modelItemPath(basePath, section, row.id))}
                className={cn(
                  "cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]",
                  selectedId === row.id && "bg-[#f6f5ff]"
                )}
              >
                {row.cells.map((cell, index) => (
                  <td key={`${row.id}-${index}`} className={cn("px-2 py-3", index === 0 && "font-medium text-[#1c2230]")}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {catalog.data && rows.length === 0 && (
        <div className="py-8">
          <p className="text-[13px] text-[#8b90a0]">{EMPTY_COPY[type]}</p>
          {type === "agent" && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="mt-3 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white"
            >
              + Add an agent
            </button>
          )}
        </div>
      )}
    </div>
  );
}
