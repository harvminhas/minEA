"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { usePermissions } from "@/lib/use-permissions";
import { peopleApi, processesApi, productsApi, relationshipsApi } from "@/lib/api-client";
import { applyCatalogWrite, catalogQueryKey } from "@/lib/use-model-catalog";
import { useQueryClient } from "@tanstack/react-query";
import type { MappedLink } from "@/lib/capability-mapping";
import type { Product } from "@minea/types";

export function CapabilityRelationshipsSection({
  groups,
  onAdd,
  showAdd = true,
  heading = "Relationships",
  addStyle = "link",
  addTestId,
}: {
  groups: { key: string; label: string; items: MappedLink[] }[];
  onAdd?: () => void;
  showAdd?: boolean;
  heading?: string;
  addStyle?: "link" | "button";
  addTestId?: string;
}) {
  const { canEdit } = usePermissions();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const count = groups.reduce((sum, group) => sum + group.items.length, 0);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["capability-mapping-lists", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["entity-accountabilities"] });
    void queryClient.invalidateQueries({ queryKey: ["processes"] });
    void queryClient.invalidateQueries({ queryKey: ["products"] });
    void queryClient.invalidateQueries({ queryKey: ["relationships"] });
  };

  const onRemove = async (link: MappedLink) => {
    if (!orgSlug || !workspaceSlug) return;
    setError("");
    setBusyId(link.id);
    try {
      const token = await getToken();
      if (!token) throw new Error("Sign in to make changes.");
      if (link.kind === "relationship") {
        await relationshipsApi.delete(orgSlug, workspaceSlug, link.id, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: link.id });
      } else if (link.kind === "process") {
        await processesApi.removeCapability(orgSlug, workspaceSlug, link.targetId, link.scopeId, token);
      } else if (link.kind === "product") {
        const product = queryClient.getQueryData<{ items: Product[] }>(["products", orgSlug, workspaceSlug]);
        // Fall back to a get if the list cache is a different shape.
        const listed = (queryClient.getQueryData(["capability-mapping-lists", orgSlug, workspaceSlug]) as
          | { products?: Product[] }
          | undefined)?.products;
        const current = listed?.find((item) => item.id === link.targetId);
        const next = (current?.capability_ids ?? []).filter((id) => id !== link.scopeId);
        await productsApi.update(orgSlug, workspaceSlug, link.targetId, { capability_ids: next }, token);
        void product;
      } else if (link.kind === "people") {
        await peopleApi.deleteAccountability(orgSlug, workspaceSlug, link.id, token);
      }
      refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove that link.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="mb-6" data-testid="capability-relationships">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="m-0 text-[15px] font-semibold tracking-[-0.01em] text-[#1c2230]">
          {heading}
          <span className="ml-2 text-[12.5px] font-medium text-[#8b90a0]">{count}</span>
        </h2>
        {showAdd && canEdit && onAdd ? (
          <button
            type="button"
            data-testid={addTestId ?? (addStyle === "button" ? "add-relationship" : "add-relationship-inline")}
            onClick={onAdd}
            className={
              addStyle === "button"
                ? "inline-flex h-8 items-center rounded-lg border border-[#5b4ce6] bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white"
                : "text-[12.5px] font-semibold text-[#5b4ce6]"
            }
          >
            Add relationship
          </button>
        ) : null}
      </div>
      {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}
      {count === 0 ? (
        <p className="text-[13px] text-[#8b90a0]">No relationships yet. Link an app or another record.</p>
      ) : (
        groups.map((group) => (
          <div key={group.key} className="mb-4" data-testid={`relationship-group-${group.key}`}>
            <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">{group.label.toUpperCase()}</p>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-[10px] border border-[#eef0f4] bg-white px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-medium text-[#1c2230]">
                      {item.fitness ? (
                        <span
                          className={cn(
                            "mr-1.5 inline-block h-1.5 w-1.5 rounded-full align-[1px]",
                            item.fitness === "strong" && "bg-[#10b981]",
                            item.fitness === "adequate" && "bg-[#f59e0b]",
                            item.fitness === "weak" && "bg-[#ef4444]"
                          )}
                        />
                      ) : null}
                      {item.name}
                      {item.peopleRole === "owns" ? (
                        <span className="ml-2 rounded-full bg-[#f3f4f8] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#4b5163]">
                          Owner
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[12px] text-[#6b7289]">{item.relationshipLabel}</div>
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      data-testid={`remove-mapped-link-${item.id}`}
                      onClick={() => void onRemove(item)}
                      className="shrink-0 text-[11px] font-medium text-[#8b90a0] hover:text-red-500 disabled:opacity-50"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}
