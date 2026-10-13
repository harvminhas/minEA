"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CapabilityTemplateDetail, CapabilityTemplateSummary } from "@minea/types";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { useAuth } from "@/lib/auth-context";
import { modelItemPath } from "@/lib/mvp-paths";
import { addApi, capabilityMapApi, objectsApi } from "@/lib/api-client";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { usePermissions } from "@/lib/use-permissions";
import { CapabilityMapPage } from "@/components/capability-map/CapabilityMapPage";
import { capabilityViewFrom, type CapabilityView } from "@/lib/capabilities";
import {
  NO_DOMAIN,
  capabilityRows,
  domainKey,
  domainSuggestions,
  draftFromApps,
  draftPlan,
  groupByDomain,
  resolveDomain,
  type DraftCapability,
} from "@/lib/capabilities";

export const TEMPLATE_START = "Start from a template";
export const DRAFT_FROM_APPS = "Draft from my apps";

export function CapabilitiesSection({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const objects = useMemo(() => catalog.data?.objects ?? [], [catalog.data]);
  const edges = useMemo(() => catalog.data?.relationships ?? [], [catalog.data]);
  const rows = useMemo(() => capabilityRows(objects, edges), [objects, edges]);
  const groups = useMemo(() => groupByDomain(rows), [rows]);
  const gaps = rows.filter((row) => row.gap).length;
  const [mode, setMode] = useState<"none" | "add" | "template" | "draft">("none");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [view, setView] = useState<CapabilityView>("map");
  useEffect(() => setView(capabilityViewFrom(window.location.search)), []);
  const openCapability = (id: string) => router.push(modelItemPath(basePath, "capabilities", id));
  const refreshMap = () => {
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
  };
  const [error, setError] = useState("");

  const token = async () => {
    const value = await getToken();
    if (!value || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
    return value;
  };
  const ensureDomain = async (text: string, t: string): Promise<string | null> => {
    const resolved = resolveDomain(text, queryClient.getQueryData<{ objects: typeof objects }>(catalogQueryKey(orgSlug, workspaceSlug))?.objects ?? objects);
    if ("clear" in resolved) return null;
    if ("id" in resolved) return resolved.id;
    const created = await objectsApi.create(orgSlug, workspaceSlug, { type: "business_domain", name: resolved.create, properties: {} }, t);
    applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
    return created.id;
  };
  const run = async (work: () => Promise<void>) => {
    setError("");
    try {
      await work();
      refreshMap();
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
    }
  };

  const empty = !catalog.isLoading && rows.length === 0;
  const shownGroups = gapsOnly ? groups.map((group) => ({ ...group, rows: group.rows.filter((row) => row.gap) })).filter((group) => group.rows.length) : groups;
  const flat = groups.length === 1 && groups[0]!.domain === NO_DOMAIN;

  return (
    <div className="px-6 py-5" data-testid="capabilities-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">WHAT THE BUSINESS DOES</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Capability map <span className="text-[14px] font-normal text-[#8b90a0]">{rows.length}</span>
          </h1>
        </div>
        {!empty && (
          <div className="ml-auto mr-2 flex rounded-lg border border-[#e6e8ee] p-0.5 text-[12px]" role="tablist" aria-label="Capability view">
            {(["map", "list"] as const).map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={view === item}
                data-testid={`capability-view-${item}`}
                onClick={() => setView(item)}
                className={cn("rounded-md px-2.5 py-1", view === item ? "bg-[#ece9ff] font-semibold text-[#3f35b5]" : "text-[#4b5163]")}
              >
                {item === "map" ? "Map" : "List"}
              </button>
            ))}
          </div>
        )}
        {canCreate && !empty && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMode(mode === "draft" ? "none" : "draft")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3f35b5]">
              {DRAFT_FROM_APPS}
            </button>
            <button type="button" onClick={() => setMode(mode === "add" ? "none" : "add")} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
              + Add
            </button>
          </div>
        )}
      </div>
      {error && <p className="mb-3 text-[12px] text-[#b42318]">{error}</p>}

      {mode === "add" && (
        <AddCapability
          suggestions={domainSuggestions(objects)}
          onCancel={() => setMode("none")}
          onAdd={(name, domain) =>
            run(async () => {
              const t = await token();
              const domainId = await ensureDomain(domain, t);
              const created = await objectsApi.create(orgSlug, workspaceSlug, { type: "capability", name, properties: domainId ? { domain_id: domainId } : {} }, t);
              applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
            })
          }
        />
      )}

      {empty && mode === "none" && (
        <div className="grid gap-3 md:grid-cols-2" data-testid="capabilities-empty">
          <EmptyCard
            title={TEMPLATE_START}
            body="Pick your industry, look over the starter list, then confirm. Nothing is added until you do."
            disabled={!canCreate}
            onClick={() => setMode("template")}
          />
          <EmptyCard
            title={DRAFT_FROM_APPS}
            body="We suggest capabilities from the apps you already have, each one linked to the apps that support it."
            disabled={!canCreate}
            onClick={() => setMode("draft")}
          />
          {canCreate && (
            <button type="button" className="text-left text-[13px] font-medium text-[#5b4ce6]" onClick={() => setMode("add")}>
              Or add one yourself
            </button>
          )}
        </div>
      )}

      {mode === "template" && (
        <TemplatePicker
          onCancel={() => setMode("none")}
          onConfirm={(templateId) =>
            run(async () => {
              await capabilityMapApi.adoptTemplate(orgSlug, workspaceSlug, templateId, await token());
              await queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
            })
          }
        />
      )}

      {mode === "draft" && (
        <DraftReview
          drafts={draftFromApps(objects, edges)}
          names={new Map(objects.map((object) => [object.id, object.name]))}
          onCancel={() => setMode("none")}
          onConfirm={(picked) =>
            run(async () => {
              const t = await token();
              const plan = draftPlan(picked, objects);
              const domainIds = new Map<string, string>();
              for (const name of plan.domainsToCreate) {
                const created = await objectsApi.create(orgSlug, workspaceSlug, { type: "business_domain", name, properties: {} }, t);
                applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: created });
                domainIds.set(domainKey(name), created.id);
              }
              const saved = await addApi.save(orgSlug, workspaceSlug, plan.batch(domainIds), t);
              for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
              for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
            })
          }
        />
      )}

      {rows.length > 0 && view === "map" && (
        <div data-testid="capability-map-view">
          <CapabilityMapPage embedded onOpenCapability={openCapability} />
        </div>
      )}

      {rows.length > 0 && view === "list" && (
        <>
          <div className="mb-2 flex items-center gap-3 text-[12px]">
            {gaps > 0 ? (
              <button
                type="button"
                data-testid="capability-gaps"
                onClick={() => setGapsOnly((value) => !value)}
                className={cn("rounded-full border px-2.5 py-0.5", gapsOnly ? "border-[#c2410c] bg-[#fff7ed] text-[#c2410c]" : "border-[#fed7aa] text-[#c2410c]")}
              >
                {gaps} with no app{gapsOnly ? " · show all" : ""}
              </button>
            ) : (
              <span className="text-[#15803d]">Every capability has an app</span>
            )}
          </div>
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
                <th className="h-11 px-2 font-medium">Name</th>
                <th className="h-11 px-2 font-medium">Supported by</th>
                <th className="h-11 px-2 font-medium">Owner</th>
              </tr>
            </thead>
            {shownGroups.map((group) => (
              <tbody key={group.domain} data-testid="capability-group">
                {!flat && (
                  <tr>
                    <td colSpan={3} className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]">
                      {group.domain} <span className="font-normal">{group.rows.length}</span>
                    </td>
                  </tr>
                )}
                {group.rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => openCapability(row.id)}
                    className={cn("cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]", selectedId === row.id && "bg-[#f6f5ff]")}
                  >
                    <td className="px-2 py-3 font-medium text-[#1c2230]">{row.name}</td>
                    <td className="px-2 py-3">
                      {row.gap ? (
                        <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] font-semibold text-[#c2410c]">No app</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {row.supportedBy.map((app) => (
                            <span key={app.id} className="rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[12px] text-[#3c4254]">{app.name}</span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3">{row.owner || <span className="text-[#b0b4c0]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </>
      )}
    </div>
  );
}

function EmptyCard({ title, body, onClick, disabled }: { title: string; body: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-xl border border-[#e6e8ee] p-4 text-left hover:border-[#c9c6f5] disabled:opacity-60">
      <div className="font-semibold text-[#1c2230]">{title}</div>
      <p className="mt-1 text-[13px] text-[#6b7289]">{body}</p>
    </button>
  );
}

function AddCapability({ suggestions, onAdd, onCancel }: { suggestions: string[]; onAdd: (name: string, domain: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  return (
    <form
      className="mb-4 flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onAdd(name.trim(), domain);
      }}
    >
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Capability name" aria-label="Capability name" className="h-8 w-[220px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
      <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="Domain (optional)" aria-label="Domain" list="capability-domain-suggestions" className="h-8 w-[180px] rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
      <datalist id="capability-domain-suggestions">
        {suggestions.map((item) => <option key={item} value={item} />)}
      </datalist>
      <button type="submit" disabled={!name.trim()} className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50">Add</button>
      <button type="button" onClick={onCancel} className="h-8 px-2 text-[13px] text-[#6b7289]">Cancel</button>
    </form>
  );
}

function TemplatePicker({ onConfirm, onCancel }: { onConfirm: (templateId: string) => Promise<void>; onCancel: () => void }) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const [picked, setPicked] = useState("");
  const [saving, setSaving] = useState(false);
  const list = useQuery({
    queryKey: ["capability-templates", orgSlug, workspaceSlug],
    queryFn: async () => capabilityMapApi.listTemplates(orgSlug, workspaceSlug, (await getToken())!),
  });
  const detail = useQuery({
    queryKey: ["capability-template", orgSlug, workspaceSlug, picked],
    enabled: Boolean(picked),
    queryFn: async () => capabilityMapApi.getTemplate(orgSlug, workspaceSlug, picked, (await getToken())!),
  });
  const templates: CapabilityTemplateSummary[] = list.data ?? [];
  const preview: CapabilityTemplateDetail | undefined = detail.data;
  return (
    <section className="mb-4 rounded-xl border border-[#e6e8ee] p-4" data-testid="capability-template-picker">
      <h2 className="text-[15px] font-semibold text-[#1c2230]">{TEMPLATE_START}</h2>
      <p className="mb-3 text-[13px] text-[#6b7289]">Pick your industry.</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => setPicked(template.id)}
            className={cn("rounded-full border px-3 py-1 text-[12px]", picked === template.id ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]")}
          >
            {template.name}
          </button>
        ))}
      </div>
      {preview && (
        <div className="mb-3 grid gap-3 md:grid-cols-3" data-testid="capability-template-preview">
          {preview.domains.map((domain) => (
            <div key={domain.name}>
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]">{domain.name}</div>
              <ul className="mt-1 text-[13px] text-[#3c4254]">
                {domain.capabilities.map((name) => <li key={name}>{name}</li>)}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!preview || saving}
          data-testid="capability-template-confirm"
          onClick={async () => {
            setSaving(true);
            try {
              await onConfirm(picked);
            } finally {
              setSaving(false);
            }
          }}
          className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
        >
          {preview ? `Add ${preview.capability_count} capabilities` : "Pick an industry"}
        </button>
        <button type="button" onClick={onCancel} className="h-8 px-2 text-[13px] text-[#6b7289]">Cancel</button>
      </div>
    </section>
  );
}

function DraftReview({
  drafts,
  names,
  onConfirm,
  onCancel,
}: {
  drafts: DraftCapability[];
  names: Map<string, string>;
  onConfirm: (picked: DraftCapability[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [off, setOff] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const picked = drafts.filter((draft) => !off.has(draft.key));
  return (
    <section className="mb-4 rounded-xl border border-[#e6e8ee] p-4" data-testid="capability-draft">
      <h2 className="text-[15px] font-semibold text-[#1c2230]">{DRAFT_FROM_APPS}</h2>
      {drafts.length === 0 ? (
        <p className="text-[13px] text-[#6b7289]">No suggestions from your apps yet. Add apps first, or start from a template.</p>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-[#6b7289]">Untick anything that doesn&apos;t fit. Nothing is saved until you confirm.</p>
          <ul className="space-y-1.5">
            {drafts.map((draft) => (
              <li key={draft.key} className="flex items-start gap-2 text-[13px]">
                <input
                  type="checkbox"
                  aria-label={draft.name}
                  checked={!off.has(draft.key)}
                  onChange={() =>
                    setOff((current) => {
                      const next = new Set(current);
                      if (next.has(draft.key)) next.delete(draft.key);
                      else next.add(draft.key);
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <span>
                  <span className="font-medium text-[#1c2230]">{draft.name}</span>
                  {draft.existingId && <span className="ml-1 text-[11px] text-[#8b90a0]">(already listed; adds links)</span>}
                  <span className="ml-2 text-[12px] text-[#8b90a0]">{draft.domain}</span>
                  <span className="block text-[12px] text-[#6b7289]">Supported by {draft.appIds.map((id) => names.get(id) ?? id).join(", ")}</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className="mt-3 flex gap-2">
        {drafts.length > 0 && (
          <button
            type="button"
            disabled={picked.length === 0 || saving}
            data-testid="capability-draft-confirm"
            onClick={async () => {
              setSaving(true);
              try {
                await onConfirm(picked);
              } finally {
                setSaving(false);
              }
            }}
            className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            Add {picked.length} capabilities
          </button>
        )}
        <button type="button" onClick={onCancel} className="h-8 px-2 text-[13px] text-[#6b7289]">Cancel</button>
      </div>
    </section>
  );
}
