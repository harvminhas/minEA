"use client";

import { useMemo, useState } from "react";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey } from "@/lib/use-model-catalog";
import { useQueryClient } from "@tanstack/react-query";
import { isActivity } from "@/lib/capability-tree";
import { type StructureActions } from "@/components/capability-map/StructureActions";

type DomainNode = { id: string; name: string; caps: CapNode[] };
type CapNode = { id: string; name: string; domainId: string; activities: ActNode[] };
type ActNode = { id: string; name: string; parentId: string; domainId: string };

function build(objects: readonly MinEAObject[]): DomainNode[] {
  const domains = objects
    .filter((o) => o.type === "business_domain")
    .sort((a, b) => a.name.localeCompare(b.name));
  const caps = objects.filter((o) => o.type === "capability");
  const l2 = caps.filter((c) => !isActivity(c.properties));
  const l3 = caps.filter((c) => isActivity(c.properties));
  return [
    ...domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      caps: l2
        .filter((c) => c.properties?.domain_id === domain.id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          domainId: domain.id,
          activities: l3
            .filter((a) => a.properties?.parent_id === c.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => ({
              id: a.id,
              name: a.name,
              parentId: c.id,
              domainId: domain.id,
            })),
        })),
    })),
    {
      id: "",
      name: "No domain",
      caps: l2
        .filter((c) => !c.properties?.domain_id)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          id: c.id,
          name: c.name,
          domainId: "",
          activities: l3
            .filter((a) => a.properties?.parent_id === c.id)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((a) => ({ id: a.id, name: a.name, parentId: c.id, domainId: "" })),
        })),
    },
  ].filter((d) => d.id || d.caps.length);
}

export function CapabilityStructureEditor({
  objects,
  onBack,
  structure,
}: {
  objects: readonly MinEAObject[];
  edges?: readonly Relationship[];
  onBack: () => void;
  structure: StructureActions;
}) {
  const { getToken } = useAuth();
  const { orgSlug, workspaceSlug } = useTenancy();
  const queryClient = useQueryClient();
  const tree = useMemo(() => build(objects), [objects]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const token = async () => {
    const value = await getToken();
    if (!value || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return value;
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
  };
  const run = async (work: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await work();
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  };

  const rename = (id: string, name: string) =>
    run(async () => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const current = objects.find((o) => o.id === id);
      if (!current || current.name === trimmed) return;
      const t = await token();
      const updated = await objectsApi.update(orgSlug!, workspaceSlug!, id, { name: trimmed }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: updated });
    });

  const remove = (id: string, name: string, kind: "domain" | "capability" | "activity", domainId?: string, parentId?: string) => {
    structure.openDelete({ id, kind, name, domainId, parentId });
  };

  const addDomain = () =>
    void run(async () => {
      const t = await token();
      const created = await objectsApi.create(orgSlug!, workspaceSlug!, { type: "business_domain", name: "New domain", properties: {} }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
    });

  const addCapability = (domainId: string) =>
    void run(async () => {
      const t = await token();
      const created = await objectsApi.create(
        orgSlug!,
        workspaceSlug!,
        { type: "capability", name: "New capability", properties: domainId ? { domain_id: domainId } : {} },
        t,
      );
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
    });

  const addActivity = (parentId: string, domainId: string) =>
    void run(async () => {
      const t = await token();
      const properties: Record<string, string> = { parent_id: parentId };
      if (domainId) properties.domain_id = domainId;
      const created = await objectsApi.create(orgSlug!, workspaceSlug!, { type: "capability", name: "New activity", properties }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: created });
    });

  const moveDomain = (from: number, to: number) => {
    if (to < 0 || to >= tree.length) return;
    const item = tree[from];
    if (!item?.id) return;
    void run(async () => {
      const t = await token();
      const updated = await objectsApi.update(orgSlug!, workspaceSlug!, item.id, { properties: { order_index: to } }, t);
      applyCatalogWrite(queryClient, orgSlug!, workspaceSlug!, { object: updated });
    });
  };

  const capCount = tree.reduce((n, d) => n + d.caps.length, 0);
  const actCount = tree.reduce((n, d) => n + d.caps.reduce((m, c) => m + c.activities.length, 0), 0);

  return (
    <section data-testid="capability-structure-editor">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-[22px] font-semibold text-[#1c2230]">Edit structure</h2>
          <p className="text-[13px] text-[#6b7289]">
            {tree.length} domain{tree.length === 1 ? "" : "s"} · {capCount} capabilit{capCount === 1 ? "y" : "ies"} · {actCount} activit{actCount === 1 ? "y" : "ies"}.
            Click a name to rename. Changes save as you go.
          </p>
        </div>
        <button type="button" onClick={onBack} className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] px-3 text-[12.5px] text-[#4b5163]">
          Back to map
        </button>
      </div>
      {error && <p className="mb-3 text-[12.5px] text-[#b42318]">{error}</p>}
      <div className={`space-y-2 ${busy ? "opacity-70" : ""}`}>
        {tree.map((domain, di) => (
          <article key={domain.id || "no-domain"} className="overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
            <header className="flex items-center gap-2 border-b border-[#f3f4f8] bg-[#fafafb] px-2.5 py-2">
              {domain.id ? (
                <button type="button" className="text-[#8b90a0]" aria-label="Move domain up" onClick={() => moveDomain(di, di - 1)}>
                  ::
                </button>
              ) : (
                <span className="w-4" />
              )}
              {domain.id ? (
                <input
                  aria-label="Domain name"
                  defaultValue={domain.name}
                  key={domain.name}
                  onBlur={(e) => void rename(domain.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  }}
                  className="min-w-[140px] flex-1 border-0 bg-transparent text-[13.5px] font-semibold outline-none"
                />
              ) : (
                <span className="flex-1 text-[13.5px] font-semibold text-[#8b90a0]">{domain.name}</span>
              )}
              <span className="text-[11px] text-[#8b90a0]">{domain.caps.length} capabilities</span>
              <button type="button" className="text-[12px] text-[#5b4ce6]" onClick={() => addCapability(domain.id)}>
                + Capability
              </button>
              {domain.id && (
                <button type="button" className="text-[12px] text-[#8b90a0] hover:text-[#b42318]" aria-label={`Remove ${domain.name}`} onClick={() => remove(domain.id, domain.name, "domain")}>
                  ×
                </button>
              )}
            </header>
            <div className="px-3 py-2 pl-6">
              {domain.caps.map((cap) => (
                <div key={cap.id} className="mb-1">
                  <div className="flex items-center gap-2 py-1">
                    <input
                      aria-label="Capability name"
                      defaultValue={cap.name}
                      key={cap.name}
                      onBlur={(e) => void rename(cap.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      className="min-w-[120px] border-0 bg-transparent text-[13px] font-semibold outline-none"
                    />
                    <span className="flex-1" />
                    <button type="button" className="text-[12px] text-[#8b90a0] hover:text-[#b42318]" aria-label={`Remove ${cap.name}`} onClick={() => remove(cap.id, cap.name, "capability", cap.domainId)}>
                      ×
                    </button>
                  </div>
                  <div className="mb-2 flex flex-wrap gap-1.5 pl-4">
                    {cap.activities.map((act) => (
                      <span key={act.id} className="inline-flex items-center gap-1 rounded-md border border-[#eef0f4] px-2 py-0.5">
                        <input
                          aria-label="Activity name"
                          defaultValue={act.name}
                          key={act.name}
                          onBlur={(e) => void rename(act.id, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                          }}
                          className="w-[9rem] border-0 bg-transparent text-[12.5px] outline-none"
                        />
                        <button type="button" aria-label={`Remove ${act.name}`} className="text-[#8b90a0] hover:text-[#b42318]" onClick={() => remove(act.id, act.name, "activity", act.domainId, act.parentId)}>
                          ×
                        </button>
                      </span>
                    ))}
                    <button type="button" className="rounded-md border border-dashed border-[#d6d3f0] px-2 py-0.5 text-[12.5px] text-[#5b4ce6]" onClick={() => addActivity(cap.id, cap.domainId)}>
                      + Activity
                    </button>
                  </div>
                </div>
              ))}
              <button type="button" className="mt-1 rounded-md border border-dashed border-[#d6d3f0] px-2 py-0.5 text-[12.5px] text-[#5b4ce6]" onClick={() => addCapability(domain.id)}>
                + Capability
              </button>
            </div>
          </article>
        ))}
        <button type="button" className="rounded-md border border-dashed border-[#d6d3f0] px-3 py-1.5 text-[12.5px] text-[#5b4ce6]" onClick={addDomain}>
          + Domain
        </button>
      </div>
    </section>
  );
}
