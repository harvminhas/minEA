"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject } from "@minea/types";
import { addApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { friendlyError } from "@/lib/row-saving";
import { accessChoices } from "@/lib/ai/model-access";
import {
  MODEL_ACCESS_TARGETS,
  aiPlatformProperties,
  customFamilyLabel,
  filterFamilies,
  matchingProvider,
  suggestFamily,
  type ModelAccessProvider,
  type ModelFamily,
} from "@/lib/ai/model-families";

const POP = "absolute right-0 z-20 w-[280px] rounded-lg border border-[#e6e8ee] bg-white p-2 text-left shadow-lg";
const ITEM = "flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-[#fafafb] disabled:opacity-50";
const HEAD = "px-2 pb-1 pt-2 text-[11px] font-medium text-[#8b90a0]";
const fold = (value: string) => value.trim().toLowerCase();
export { vendorToFill } from "@/lib/ai/model-access";

/**
 * Model family: searchable list of common families with their vendor, a suggestion from the
 * model's name on top, and "+ Use 'X'" for anything else. Esc or click-away closes unchanged.
 */
export function ModelFamilyPopover({
  modelName,
  current,
  onPick,
  onCancel,
}: {
  modelName: string;
  current: string;
  onPick: (label: string, family: ModelFamily | null) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState("");
  const families = filterFamilies(query);
  const suggested = !query ? suggestFamily(modelName) : null;
  const custom = customFamilyLabel(query);
  const exact = families.find((family) => fold(family.label) === fold(query));
  return (
    <div className="relative">
      <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={onCancel} />
      <div
        className={POP}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <input
          autoFocus
          aria-label="Model family"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (exact) onPick(exact.label, exact);
            else if (families.length === 1 && query.trim()) onPick(families[0].label, families[0]);
            else if (custom) onPick(custom, null);
          }}
          placeholder="Search or type a family"
          className="mb-1 h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]"
        />
        {suggested && (
          <>
            <p className={HEAD}>From the name “{modelName}”</p>
            <button type="button" data-testid="family-suggestion" className={`${ITEM} bg-[#f6f5ff]`} onClick={() => onPick(suggested.label, suggested)}>
              <span>{suggested.label}</span>
              <span className="text-[12px] text-[#5b4ce6]">{suggested.vendor}</span>
            </button>
            <p className={HEAD}>All families</p>
          </>
        )}
        <div className="max-h-56 overflow-y-auto">
          {families.map((family) => (
            <button key={family.label} type="button" className={ITEM} onClick={() => onPick(family.label, family)}>
              <span>
                {fold(current) === fold(family.label) ? "✓ " : ""}
                {family.label}
              </span>
              <span className="text-[12px] text-[#8b90a0]">{family.vendor}</span>
            </button>
          ))}
          {families.length === 0 && <p className="px-2 py-1.5 text-[12px] text-[#8b90a0]">Not in the list.</p>}
        </div>
        {custom && !exact ? (
          <button type="button" className="mt-1 px-2 text-[12px] font-medium text-[#5b4ce6]" onClick={() => onPick(custom, null)}>
            + Use “{custom}”
          </button>
        ) : (
          <p className="mt-1 px-2 text-[11px] text-[#8b90a0]">Not listed? Type its name.</p>
        )}
        {current && (
          <button type="button" className="mt-1 block px-2 text-[12px] text-[#6b7289] hover:text-[#b42318]" onClick={() => onPick("", null)}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
}

/** Sets the model's Vendor link from a picked family: reuses the vendor record or creates it, in one call. */
export function useFillVendor() {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  return async (model: MinEAObject, vendor: string) => {
    const token = await getToken();
    if (!token || !orgSlug || !workspaceSlug) return;
    const objects = catalog.data?.objects ?? [];
    const party = objects.find((item) => item.type === "external_party" && fold(item.name) === fold(vendor));
    const saved = await addApi.save(
      orgSlug,
      workspaceSlug,
      {
        creates: party ? [] : [{ key: "vendor", type: "external_party", name: vendor, properties: {} }],
        updates: [],
        relationships: [
          party
            ? { type: "supplied_by", from_id: model.id, from_type: model.type, to_id: party.id, to_type: "external_party" }
            : { type: "supplied_by", from_id: model.id, from_type: model.type, to_key: "vendor", to_type: "external_party" },
        ],
      },
      token,
      { quietLimit: true }
    );
    for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
    for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
  };
}

/**
 * Accessed through for an AI model: pick a platform or app already in the workspace, a common
 * provider (reused if it exists, else created as an AI platform with its vendor), or add a typed one.
 * A new platform and its link are saved in one call.
 */
export function ModelAccessPopover({
  selfId,
  selfType,
  value,
  onSave,
  onCancel,
}: {
  selfId: string;
  selfType: string;
  value: unknown;
  onSave: (id: string) => void;
  onCancel: () => void;
}) {
  const catalog = useModelCatalog();
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const objects = catalog.data?.objects ?? [];
  const { workspace, providers, addLabel } = accessChoices(objects, selfId, query);
  const current = Array.isArray(value) ? String(value[0] ?? "") : value ? String(value) : "";

  const createAndLink = async (name: string, provider: ModelAccessProvider | null) => {
    if (pending || !orgSlug || !workspaceSlug) return;
    setPending(true);
    setError("");
    try {
      const token = await getToken();
      if (!token) throw new Error("You're signed out. Sign in again to save.");
      const saved = await addApi.save(
        orgSlug,
        workspaceSlug,
        {
          creates: [{ key: "access", type: "cloud_service", name, properties: aiPlatformProperties(provider) }],
          updates: [],
          relationships: [{ type: "runs_on", from_id: selfId, from_type: selfType, to_key: "access", to_type: "cloud_service" }],
        },
        token
      );
      for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
      for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
      // Single choice: the new link replaces the old one.
      const kept = new Set(saved.relationships.map((rel) => rel.id));
      const old = (catalog.data?.relationships ?? []).filter((rel) => rel.from_object_id === selfId && rel.type === "runs_on" && !kept.has(rel.id));
      for (const rel of old) {
        await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: rel.id });
      }
      onCancel();
    } catch (err) {
      setPending(false);
      setError(`Couldn't add: ${friendlyError(err)}`);
    }
  };
  const pickProvider = (provider: ModelAccessProvider) => {
    const existing = matchingProvider(objects, provider, MODEL_ACCESS_TARGETS as readonly string[]);
    if (existing) onSave(existing.id);
    else void createAndLink(provider.name, provider);
  };

  return (
    <div className="relative">
      <button type="button" aria-label="Close" className="fixed inset-0 z-10 cursor-default" onClick={onCancel} />
      <div
        className={POP}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <input
          autoFocus
          aria-label="Accessed through"
          value={query}
          disabled={pending}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search platforms and apps"
          className="mb-1 h-8 w-full rounded-md border border-[#e6e8ee] px-2 text-[13px]"
        />
        <div className="max-h-64 overflow-y-auto">
          {workspace.length > 0 && <p className={HEAD}>In your workspace</p>}
          {workspace.slice(0, 8).map((item) => (
            <button key={item.id} type="button" disabled={pending} className={ITEM} onClick={() => onSave(item.id)}>
              <span className="truncate">
                {current === item.id ? "✓ " : ""}
                {item.name}
              </span>
              <span className="flex-shrink-0 text-[11px] text-[#8b90a0]">{item.sub}</span>
            </button>
          ))}
          {providers.length > 0 && <p className={HEAD}>Common ways to reach a model</p>}
          {providers.map((provider) => (
            <button key={provider.name} type="button" disabled={pending} className={ITEM} onClick={() => pickProvider(provider)}>
              <span>{provider.name}</span>
              <span className="text-[11px] text-[#8b90a0]">{provider.vendor ?? "Self-hosted"}</span>
            </button>
          ))}
          {workspace.length === 0 && providers.length === 0 && !addLabel && (
            <p className="px-2 py-1.5 text-[12px] text-[#8b90a0]">Nothing matches.</p>
          )}
        </div>
        {pending ? (
          <p className="mt-1 px-2 text-[12px] text-[#8b90a0]">Adding…</p>
        ) : addLabel ? (
          <button type="button" className="mt-1 px-2 text-[12px] font-medium text-[#5b4ce6]" onClick={() => void createAndLink(addLabel, null)}>
            + Add “{addLabel}” as an AI platform
          </button>
        ) : (
          <p className="mt-1 px-2 text-[11px] text-[#8b90a0]">A common provider is added to your workspace when you pick it.</p>
        )}
        {error && <p role="alert" className="mt-1 px-2 text-[12px] text-[#b42318]">{error}</p>}
      </div>
    </div>
  );
}
