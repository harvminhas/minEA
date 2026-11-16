"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { SuggestedDomain } from "@minea/types";
import { cn } from "@/lib/utils";
import { useTenancy } from "@/lib/tenancy";
import { useAuth } from "@/lib/auth-context";
import { modelItemPath } from "@/lib/mvp-paths";
import { capabilityMapApi, objectsApi } from "@/lib/api-client";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";
import { usePermissions } from "@/lib/use-permissions";
import { capabilityViewFrom, type CapabilityView } from "@/lib/capabilities";
import {
  NO_DOMAIN,
  capabilityRows,
  domainSuggestions,
  groupByDomain,
  resolveDomain,
} from "@/lib/capabilities";
import { isActivity } from "@/lib/capability-tree";
import { CapabilityInterview, type InterviewValues } from "@/components/capability-map/CapabilityInterview";
import { CapabilityReview } from "@/components/capability-map/CapabilityReview";
import { CapabilityHeatMap } from "@/components/capability-map/CapabilityHeatMap";
import { CapabilityAppMapping } from "@/components/capability-map/CapabilityAppMapping";
import { CapabilityStructureEditor } from "@/components/capability-map/CapabilityStructureEditor";

type Mode = "none" | "add" | "interview" | "review" | "mapping" | "edit";

export function CapabilitiesSection({ selectedId }: { selectedId?: string }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const { canCreate } = usePermissions();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const objects = useMemo(() => catalog.data?.objects ?? [], [catalog.data]);
  const edges = useMemo(() => catalog.data?.relationships ?? [], [catalog.data]);
  const catalogRows = useMemo(() => catalog.data?.rows ?? [], [catalog.data]);
  const rows = useMemo(() => capabilityRows(objects, edges), [objects, edges]);
  const groups = useMemo(() => groupByDomain(rows), [rows]);
  const gaps = rows.filter((row) => row.gap).length;
  const [mode, setMode] = useState<Mode>("none");
  const [gapsOnly, setGapsOnly] = useState(false);
  const [view, setView] = useState<CapabilityView>("map");
  const [suggestion, setSuggestion] = useState<SuggestedDomain[]>([]);
  const [suggestWarning, setSuggestWarning] = useState<string | null>(null);
  const [suggestExisting, setSuggestExisting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => setView(capabilityViewFrom(window.location.search)), []);
  const openCapability = (id: string) => router.push(modelItemPath(basePath, "capabilities", id));
  const refreshMap = () => {
    void queryClient.invalidateQueries({ queryKey: ["capability-map", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: ["capability-map-status", orgSlug, workspaceSlug] });
    void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
  };

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

  const suggest = async (values: InterviewValues, existing: boolean) => {
    setError("");
    setBusy(true);
    try {
      const result = await capabilityMapApi.suggest(
        orgSlug,
        workspaceSlug,
        {
          about: values.about,
          industry: values.industry || null,
          size: values.size || null,
          services: values.services || null,
          website: values.website || null,
        },
        await token(),
      );
      setSuggestion(result.domains);
      setSuggestWarning(result.warning ?? null);
      setSuggestExisting(existing || result.mode === "activities");
      if (!result.domains.length) {
        setError(result.warning || "No suggestion came back. Try a bit more detail, or add one capability yourself.");
        return;
      }
      setMode("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't suggest a map");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setError("");
    setBusy(true);
    try {
      await capabilityMapApi.accept(orgSlug, workspaceSlug, suggestion, await token());
      refreshMap();
      setSuggestion([]);
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the map");
    } finally {
      setBusy(false);
    }
  };

  const empty = !catalog.isLoading && rows.length === 0;
  const shownGroups = gapsOnly ? groups.map((group) => ({ ...group, rows: group.rows.filter((row) => row.gap) })).filter((group) => group.rows.length) : groups;
  const flat = groups.length === 1 && groups[0]!.domain === NO_DOMAIN;
  const focused = mode === "review" || mode === "mapping" || mode === "edit" || mode === "interview";

  return (
    <div className="px-6 py-5" data-testid="capabilities-section">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">WHAT THE BUSINESS DOES</p>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">
            Capability map <span className="text-[14px] font-normal text-[#8b90a0]">{rows.length}</span>
          </h1>
        </div>
        {!empty && !focused && (
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
        {canCreate && !empty && !focused && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { setError(""); setMode("interview"); }} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3f35b5]">
              Suggest activities
            </button>
            <button type="button" onClick={() => setMode("mapping")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3f35b5]">
              Map apps
            </button>
            <button type="button" onClick={() => setMode("edit")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3f35b5]">
              Edit structure
            </button>
            <button type="button" onClick={() => setMode(mode === "add" ? "none" : "add")} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
              + Add
            </button>
          </div>
        )}
      </div>
      {error && mode !== "interview" && mode !== "review" && <p className="mb-3 text-[12px] text-[#b42318]">{error}</p>}

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
        <div data-testid="capabilities-empty">
          {canCreate ? (
            <CapabilityInterview busy={busy} error={error} onSuggest={(values) => void suggest(values, false)} onAddYourself={() => setMode("add")} />
          ) : (
            <p className="text-[13px] text-[#6b7289]">No capabilities yet.</p>
          )}
        </div>
      )}

      {mode === "interview" && (
        <CapabilityInterview
          existing={!empty}
          busy={busy}
          error={error}
          onSuggest={(values) => void suggest(values, !empty)}
          onAddYourself={canCreate ? () => setMode("add") : undefined}
        />
      )}

      {mode === "review" && (
        <CapabilityReview
          domains={suggestion}
          onChange={setSuggestion}
          onAccept={() => void accept()}
          onCancel={() => {
            setSuggestion([]);
            setMode(empty ? "none" : "none");
            setError("");
          }}
          busy={busy}
          error={error}
          warning={suggestWarning}
          existing={suggestExisting}
        />
      )}

      {mode === "mapping" && (
        <CapabilityAppMapping objects={objects} edges={edges} onBack={() => setMode("none")} onOpen={openCapability} />
      )}

      {mode === "edit" && (
        <CapabilityStructureEditor objects={objects} onBack={() => setMode("none")} />
      )}

      {rows.length > 0 && view === "map" && !focused && mode !== "add" && (
        <div data-testid="capability-map-view">
          <CapabilityHeatMap objects={objects} edges={edges} rows={catalogRows} onOpen={openCapability} />
        </div>
      )}

      {rows.length > 0 && view === "list" && !focused && mode !== "add" && (
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
            {shownGroups.map((group) => {
              const byId = new Map(objects.map((object) => [object.id, object]));
              const children = new Map<string, typeof group.rows>();
              const top: typeof group.rows = [];
              for (const row of group.rows) {
                const parent = byId.get(row.id)?.properties?.parent_id;
                if (isActivity(byId.get(row.id)?.properties) && typeof parent === "string" && parent) {
                  children.set(parent, [...(children.get(parent) ?? []), row]);
                } else {
                  top.push(row);
                }
              }
              return (
                <tbody key={group.domain} data-testid="capability-group">
                  {!flat && (
                    <tr>
                      <td colSpan={3} className="px-2 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8b90a0]">
                        {group.domain} <span className="font-normal">{group.rows.length}</span>
                      </td>
                    </tr>
                  )}
                  {top.map((row) => (
                    <ListRows key={row.id} row={row} childrenRows={children.get(row.id) ?? []} selectedId={selectedId} onOpen={openCapability} />
                  ))}
                </tbody>
              );
            })}
          </table>
        </>
      )}
    </div>
  );
}

function ListRows({
  row,
  childrenRows,
  selectedId,
  onOpen,
}: {
  row: { id: string; name: string; owner: string; supportedBy: { id: string; name: string }[]; gap: boolean };
  childrenRows: { id: string; name: string; owner: string; supportedBy: { id: string; name: string }[]; gap: boolean }[];
  selectedId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <>
      <ListRow row={row} indent={false} selectedId={selectedId} onOpen={onOpen} />
      {childrenRows.map((child) => (
        <ListRow key={child.id} row={child} indent selectedId={selectedId} onOpen={onOpen} />
      ))}
    </>
  );
}

function ListRow({
  row,
  indent,
  selectedId,
  onOpen,
}: {
  row: { id: string; name: string; owner: string; supportedBy: { id: string; name: string }[]; gap: boolean };
  indent: boolean;
  selectedId?: string;
  onOpen: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onOpen(row.id)}
      className={cn("cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]", selectedId === row.id && "bg-[#f6f5ff]")}
    >
      <td className={cn("px-2 py-3 font-medium text-[#1c2230]", indent && "pl-8 font-normal")}>{row.name}</td>
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
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Capability name"
        aria-label="Capability name"
        autoFocus
        className="h-8 w-56 rounded-lg border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#5b4ce6]"
      />
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        placeholder="Domain (optional)"
        aria-label="Domain"
        list="capability-domain-suggestions"
        className="h-8 w-44 rounded-lg border border-[#e6e8ee] px-2.5 text-[13px] outline-none focus:border-[#5b4ce6]"
      />
      <datalist id="capability-domain-suggestions">
        {suggestions.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <button type="submit" disabled={!name.trim()} className="h-8 rounded-lg bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50">
        Add
      </button>
      <button type="button" onClick={onCancel} className="h-8 px-2 text-[13px] text-[#6b7289]">
        Cancel
      </button>
    </form>
  );
}
