"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import type { MinEAObject } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { friendlyError } from "@/lib/row-saving";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { SUPPLIED_ITEM_TYPES, planSupplyAdd, planSupplyRemove, suppliedItems, type SupplyPlan } from "@/lib/vendor-supplies";

/**
 * "Supplies" on a vendor: the reverse of each item's Vendor field, editable here. Links are still
 * stored item -[supplied_by]-> vendor, and the item's Vendor text follows, like editing the item.
 */
export function VendorSupplies({ vendor, canEdit }: { vendor: MinEAObject; canEdit: boolean }) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const objects = catalog.data?.objects ?? [];
  const rels = catalog.data?.relationships ?? [];
  const items = suppliedItems(vendor, objects, rels);
  const listed = new Set(items.map((item) => item.id));
  const candidates = objects
    .filter((obj) => (SUPPLIED_ITEM_TYPES as readonly string[]).includes(obj.type) && !listed.has(obj.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function apply(item: MinEAObject, plan: SupplyPlan) {
    if (!orgSlug || !workspaceSlug) return;
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      for (const rel of plan.addRel) {
        const created = await relationshipsApi.createWithStatus(orgSlug, workspaceSlug, rel, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created.body });
      }
      for (const id of plan.removeRelIds) {
        await relationshipsApi.delete(orgSlug, workspaceSlug, id, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
      }
      if (plan.vendorText !== undefined) {
        const saved = await objectsApi.update(orgSlug, workspaceSlug, item.id, { properties: { vendor: plan.vendorText } }, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
      }
    } catch (err) {
      setError(friendlyError(err));
      queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section data-testid="vendor-supplies">
      <h3 className="mb-1 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">SUPPLIES</h3>
      {items.length === 0 && <p className="text-[13px] text-[#8b90a0]">Nothing lists this vendor yet.</p>}
      {items.map((item) => {
        const obj = objects.find((candidate) => candidate.id === item.id);
        return (
          <div key={item.id} className="group flex items-center justify-between py-1.5 text-[13px] text-[#1c2230]">
            <span>{item.name}</span>
            {canEdit && obj && (
              <button
                type="button"
                disabled={busy}
                title={`${vendor.name} no longer supplies ${item.name}`}
                onClick={() => apply(obj, planSupplyRemove(vendor, obj, rels))}
                className="rounded p-1 text-[#8b90a0] opacity-60 hover:bg-[#f4f5f8] hover:text-[#c2410c] group-hover:opacity-100"
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
      {canEdit && candidates.length > 0 && (
        <select
          aria-label={`Add something ${vendor.name} supplies`}
          disabled={busy}
          value=""
          onChange={(event) => {
            const obj = objects.find((candidate) => candidate.id === event.target.value);
            if (obj) apply(obj, planSupplyAdd(vendor, obj, rels));
          }}
          className="mt-1 w-full rounded-lg border border-[#e6e8ee] bg-white px-2 py-1.5 text-[13px] text-[#4b5163]"
        >
          <option value="">+ Add something {vendor.name} supplies…</option>
          {candidates.map((obj) => (
            <option key={obj.id} value={obj.id}>
              {obj.name}
            </option>
          ))}
        </select>
      )}
      {error && <p className="mt-1 text-[12px] text-[#c2410c]">{error}</p>}
    </section>
  );
}
