"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { addApi, billingApi, catalogLookupApi, objectsApi, toolCatalogApi } from "@/lib/api-client";
import { useAppStore } from "@/lib/store";
import { billingUiEnabled } from "@/lib/billing/flags";
import { saveAddDraft, takeAddDraft } from "@/lib/add-draft";
import { countedTypes, limitOffer, limitState, objectLimitFromError, partialSummary, pendingAppCount, restLink, roomFromDetail, roomHintText, takeFirst, type LimitState, type ObjectRoom } from "@/lib/object-limit";
import { normalizeTerm } from "@/lib/setup/match-tools";
import { LimitActions, LimitDivider, LimitPanel, RoomHint } from "@/components/add/LimitPanel";
import { refreshLiveCatalog } from "@/lib/catalog/live-catalog";
import { OwnerDatalists, TEAM_PICKS_ID, useOwnerPicks } from "@/components/ownership/OwnerPicks";
import { useAuth } from "@/lib/auth-context";
import { readCostLines } from "@/lib/cost/math";
import { annualCost } from "@/lib/cost/service";
import { askPath, modelItemPath, type ModelSection } from "@/lib/mvp-paths";
import {
  MOTION_CSS,
  cardQuestion,
  catalogHostingLine,
  costShareLine,
  firstGap,
  formatRenewal,
  hostingChoices,
  logoInitials,
  logoTint,
  noticeDeadline,
  recordSubtitle,
  savedAdded,
  savedKept,
  undoneSentence,
  viewFromRows,
  type AddPhase,
  type AddReceipt,
  type GapField,
} from "@/lib/setup/add-cards";
import { LOOKUP_DEBOUNCE_MS, applySuggestions, builtInHouse, lookupKey, namesToLookUp, rememberFailed, rememberLookups } from "@/lib/setup/ai-lookup";
import { buildBatch, catalogLists, markAlreadySaved, objectTypeFor, planInputs, prepareRows, todoLines, type AddRow, type EstateItem } from "@/lib/setup/add-plan";
import { addSaveErrorMessage, maybeStillSaving } from "@/lib/add-batch-save";
import { choiceForTool } from "@/lib/setup/match-tools";
import { CLOUD_PROVIDERS, SAAS_PROVIDERS, defaultTenantName, providerForVendor, suggestsOwnCloud, type CloudProvider } from "@/lib/hosting/cloud";
import { useCloudPicker } from "@/lib/hosting/use-cloud-regions";
import { collectPendingTenants, firstPendingFor, resolveSharedTenants, type PendingTenant } from "@/lib/hosting/pending-tenants";
import { CloudPicker } from "@/components/hosting/CloudPicker";
import { setupState } from "@/lib/setup/setupMin";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, catalogQueryKey, useModelCatalog } from "@/lib/use-model-catalog";

const UNDO_MS = 10 * 60 * 1000;

export function ItemLogo({ name, custom, size = 40 }: { name: string; custom?: boolean; size?: 24 | 40 | 48 }) {
  const box = size === 24 ? "h-6 w-6 text-[10px]" : size === 48 ? "h-12 w-12 text-[15px]" : "h-10 w-10 text-[13px]";
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-lg font-semibold text-white ${box}`} style={{ background: logoTint(name, Boolean(custom)) }}>
      {logoInitials(name)}
    </span>
  );
}

function estateItems(objects: MinEAObject[]): EstateItem[] {
  return objects.map((object) => {
    const props = object.properties ?? {};
    const renewal = typeof props.contract_renewal === "string" ? props.contract_renewal : typeof props.commitment_ends === "string" ? props.commitment_ends : "";
    const cost = annualCost(props);
    return {
      id: object.id,
      type: object.type,
      name: object.name,
      owner: object.owner_team_name || object.point_of_contact_name || object.owner || "",
      cost: cost.missing ? "" : cost.label,
      lifecycle: "",
      category: typeof props.category === "string" ? props.category : "",
      catalogTool: typeof props.catalog_tool === "string" ? props.catalog_tool : "",
      vendor: typeof props.vendor === "string" ? props.vendor : "",
      renewal,
    };
  });
}

function sectionFor(type: string): ModelSection {
  if (type === "cloud_service") return "platforms";
  if (type === "model") return "servers";
  if (type === "location") return "locations";
  if (type === "external_party") return "vendors";
  return "applications";
}

function dependents(id: string, relationships: Relationship[], objects: MinEAObject[]): string[] {
  const names = new Map(objects.map((object) => [object.id, object.name]));
  return relationships
    .filter((rel) => rel.to_object_id === id && (rel.type === "runs_on" || rel.type === "built_on"))
    .map((rel) => names.get(rel.from_object_id) || "")
    .filter(Boolean);
}

/** Teams already in the workspace, offered while typing an owner (typing a new one still works). */
function TeamPickList() {
  const picks = useOwnerPicks();
  return <OwnerDatalists teams={picks.teams} people={picks.people} />;
}

function GapFieldEditor({ label, kind, onSave }: { label: string; kind: GapField; onSave: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  if (!open) {
    return (
      <button type="button" className="rounded-full border border-[#f0d3b0] bg-[#fff7ed] px-2 py-0.5 text-[12px] text-[#9a3412]" onClick={() => setOpen(true)}>
        {label} · Add
      </button>
    );
  }
  return (
    <form className="flex gap-1" onSubmit={(event) => { event.preventDefault(); if (value.trim()) onSave(value.trim()); setOpen(false); }}>
      {kind === "owner" && <TeamPickList />}
      <input autoFocus type={kind === "renewal" ? "date" : "text"} list={kind === "owner" ? TEAM_PICKS_ID : undefined} autoComplete={kind === "owner" ? "off" : undefined} value={value} onChange={(event) => setValue(event.target.value)} className="h-7 rounded-lg border border-[#e6e8ee] px-2 text-[12px]" />
      <button type="submit" className="rounded-lg bg-[#5b4ce6] px-2 text-[12px] font-semibold text-white">Save</button>
    </form>
  );
}

export function RecordCard({
  row,
  object,
  relationships,
  objects,
  basePath,
  onAskNew,
  onFillGap,
}: {
  row: AddRow;
  object: MinEAObject | undefined;
  relationships: Relationship[];
  objects: MinEAObject[];
  basePath: string;
  onAskNew: () => void;
  onFillGap: (field: GapField, value: string) => void;
}) {
  const props = object?.properties ?? {};
  const vendor = typeof props.vendor === "string" ? props.vendor : "";
  const renewalRaw = typeof props.contract_renewal === "string" ? props.contract_renewal : typeof props.commitment_ends === "string" ? props.commitment_ends : "";
  const criticality = typeof props.criticality === "string" ? props.criticality : "";
  const owner = [object?.owner_team_name, object?.point_of_contact_name].filter(Boolean).join(" · ") || object?.owner || "";
  const names = object ? dependents(object.id, relationships, objects) : [];
  const share = costShareLine(props, names.length);
  const noticeDays = (readCostLines(props) ?? []).find((line) => line.notice_days)?.notice_days ?? 0;
  const gap = firstGap({ owner, renewal: renewalRaw, criticality });
  const saas = row.choice === "saas" || row.tool?.hosting === "saas" || props.hosting_model === "saas";
  return (
    <article className="rounded-2xl border border-[#e6e8ee] bg-white p-4">
      <div className="flex items-start gap-3">
        <ItemLogo name={row.name} size={40} />
        <div className="min-w-0">
          <h3 className="text-[16px] font-semibold text-[#1c2230]">{row.name}</h3>
          <p className="text-[13px] text-[#6b7289]">{recordSubtitle(object?.type || "application", vendor, Boolean(saas))}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-[#ecfdf3] px-2 py-0.5 text-[12px] text-[#047857]">In your map</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
        <div><dt className="text-[#6b7289]">Owner</dt><dd>{owner || "—"}</dd></div>
        <div><dt className="text-[#6b7289]">Annual cost</dt><dd>{share.amount || "—"}{share.detail ? <span className="block text-[12px] text-[#6b7289]">{share.detail}</span> : null}</dd></div>
        <div><dt className="text-[#6b7289]">Renewal</dt><dd>{renewalRaw ? formatRenewal(renewalRaw) : "—"}{noticeDays > 0 && renewalRaw ? <span className="block text-[12px] text-[#6b7289]">{noticeDays} days notice</span> : null}</dd></div>
        <div><dt className="text-[#6b7289]">Depends on it</dt><dd>{names.length === 0 ? "—" : `${names.length} ${names.length === 1 ? "app" : "apps"}`}<span className="block text-[12px] text-[#6b7289]">{names.join(", ")}</span></dd></div>
      </dl>
      <div className="mt-3 text-[13px]">
        {gap ? <GapFieldEditor label={gap.label} kind={gap.field} onSave={(value) => onFillGap(gap.field, value)} /> : <p className="text-[#047857]">Nothing missing{noticeDays > 0 && renewalRaw ? ` · notice by ${noticeDeadline(renewalRaw, noticeDays)}` : ""}</p>}
      </div>
      <div className="mt-3 flex gap-3 text-[13px]">
        {object && <Link className="font-medium text-[#3f35b5]" href={modelItemPath(basePath, sectionFor(object.type), object.id)}>Open</Link>}
        <Link className="font-medium text-[#3f35b5]" href={askPath(basePath, `What breaks if ${row.name} goes down?`, object?.id)}>Ask about it</Link>
      </div>
      <button type="button" className="mt-3 text-[12px] text-[#6b7289]" onClick={onAskNew}>Not what you meant? Add &apos;{row.input}&apos; as new</button>
    </article>
  );
}

/** Switching the card's choice: Our cloud starts on Azure (its one tenant picked, else a new one);
 *  SaaS starts on the catalogue vendor's provider; a provider from the other mode is dropped. */
export function choicePatch(row: AddRow, choice: AddRow["choice"], azureTenants: { id: string; name: string }[], saasProvider: CloudProvider, pending: PendingTenant[] = []): Partial<AddRow> {
  if (choice === "own_cloud" && (!row.cloudProvider || !CLOUD_PROVIDERS.some((p) => p.id === row.cloudProvider))) {
    // No saved Azure tenant but another card is adding one: join it instead of starting a second.
    const joined = azureTenants.length === 0 ? firstPendingFor(pending, "azure") : undefined;
    if (joined) return { choice, cloudProvider: "azure", tenantId: undefined, tenantName: joined.name, tenantShared: true, tenantSharedWith: joined.originKey, regionKey: null };
    const only = azureTenants.length === 1 ? azureTenants[0]! : undefined;
    return { choice, cloudProvider: "azure", tenantId: only?.id, tenantName: only ? only.name : azureTenants.length ? "" : defaultTenantName("azure"), regionKey: null };
  }
  if (choice === "saas" && row.cloudProvider && !SAAS_PROVIDERS.some((p) => p.id === row.cloudProvider)) {
    return { choice, cloudProvider: saasProvider, tenantId: undefined, tenantName: "", regionKey: null };
  }
  return { choice };
}

/** The five "Where does it run?" chips on an app card, with provider / tenant / region for Our cloud and SaaS. */
/** A card's hosting as the picker sees it. */
export function cardDetail(row: AddRow, saasProvider: CloudProvider) {
  return { provider: row.cloudProvider ?? (row.choice === "saas" ? saasProvider : null), tenantName: row.tenantName ?? "", tenantId: row.tenantId, regionKey: row.regionKey ?? null, tenantShared: row.tenantShared, tenantSharedWith: row.tenantSharedWith };
}

/** New tenants typed on any card, offered on every card. */
export function cardPendingTenants(rows: AddRow[], tenants: { id: string; name: string; provider: CloudProvider; regionKeys: string[] }[]): PendingTenant[] {
  return collectPendingTenants(rows.map((row) => (row.choice === "own_cloud" || row.choice === "saas" ? { ...cardDetail(row, providerForVendor(row.tool?.vendor) ?? "other"), key: row.key } : null)), tenants);
}

function CardWhere({ row, onChange, pending }: { row: AddRow; onChange: (patch: Partial<AddRow>) => void; pending: PendingTenant[] }) {
  const { tenants, custom, addRegion } = useCloudPicker();
  const saasProvider = providerForVendor(row.tool?.vendor) ?? "other";
  const detail = cardDetail(row, saasProvider);
  return (
    <div data-testid="card-where">
      <p className="mb-1">Where does it run?</p>
      <div role="radiogroup" aria-label="Where it runs" className="flex flex-wrap gap-1.5">
        {hostingChoices("app").map(({ choice, label }) => {
          const on = row.choice === choice;
          const suggested = !on && choice === "own_cloud" && suggestsOwnCloud(row);
          return (
            <button key={choice} type="button" role="radio" aria-checked={on} data-choice={choice} className={`rounded-full border px-2 py-0.5 ${on ? "border-[#5b4ce6] bg-[#ece9ff]" : suggested ? "border-dashed border-[#a99cf5] text-[#3f35b5]" : "border-[#e6e8ee]"}`} onClick={() => onChange(choicePatch(row, choice, tenants.filter((tenant) => tenant.provider === "azure"), saasProvider, pending))}>
              {label}{suggested ? " · suggested" : ""}
            </button>
          );
        })}
      </div>
      {(row.choice === "own_cloud" || row.choice === "saas") && (
        <CloudPicker
          mode={row.choice === "own_cloud" ? "own_cloud" : "saas"}
          value={detail}
          tenants={tenants}
          pending={pending}
          custom={custom}
          onAddRegion={addRegion}
          onChange={(next) => onChange({ cloudProvider: next.provider, tenantName: next.tenantName, tenantId: next.tenantId, regionKey: next.regionKey, tenantShared: next.tenantShared, tenantSharedWith: next.tenantSharedWith })}
        />
      )}
    </div>
  );
}

export function AddCard({ row, index, dim, motion, onRemove, onChange, pendingTenants = [] }: { row: AddRow; index: number; dim: boolean; motion: boolean; onRemove: () => void; onChange: (patch: Partial<AddRow>) => void; pendingTenants?: PendingTenant[] }) {
  const question = cardQuestion(row);
  const [open, setOpen] = useState(false);
  const hosting = catalogHostingLine(row);
  const known = row.status === "matched" && row.tool;
  const suggested = Boolean(known && row.tool?.suggested);
  const subtitle = known ? [row.tool?.category, row.tool?.vendor].filter(Boolean).join(" · ") : row.customBuilt ? "Built in-house" : "New";
  const typical = known && row.tool?.typicalAnnual ? `typical $${row.tool.typicalAnnual.toLocaleString("en-US")}` : "";
  return (
    <article className={`rounded-2xl border border-[#e6e8ee] bg-white p-4 ${dim ? "opacity-60" : ""} ${motion ? "add-card-rise" : ""}`} style={motion ? { ["--add-i" as string]: index } : undefined}>
      <div className="flex items-start gap-3">
        <ItemLogo name={row.name} custom={row.status === "custom"} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-[#1c2230]">{row.name}</h3>
          <p className="truncate text-[13px] text-[#6b7289]">{subtitle || "New"}</p>
          {typical && <span className="mt-1 inline-flex rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[12px] text-[#3c4254]">{typical} /yr</span>}
          {suggested && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px]">
              <span data-testid="suggested-label" title="Not in our catalogue yet: details suggested by AI. Check them." className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[#6b7289]">Suggested</span>
              <button type="button" className="text-[#6b7289] underline-offset-2 hover:underline" onClick={() => onChange(builtInHouse(row))}>We built it ourselves</button>
            </p>
          )}
        </div>
        <button type="button" aria-label={`Remove ${row.name}`} className="text-[16px] text-[#6b7289]" onClick={onRemove}>×</button>
      </div>
      <div className="mt-3 text-[13px] text-[#4b5163]">
        {hosting && !open && <p>{hosting}</p>}
        {question === "fuzzy" && row.status === "weak" && (
          <p data-testid="did-you-mean">Did you mean <strong>{row.tool?.name}</strong>? <button type="button" className="ml-2 font-medium text-[#3f35b5]" onClick={() => onChange({ status: "matched", name: row.tool?.name || row.name })}>Yes, use {row.tool?.name}</button> <button type="button" className="ml-2 text-[#6b7289]" onClick={() => onChange({ status: "custom", tool: null, options: [], choice: "unknown", name: row.input, keptTyped: true })}>Keep “{row.input}”</button></p>
        )}
        {question === "fuzzy" && row.status === "pick" && (
          <div className="flex flex-wrap gap-1.5">{row.options.map((option) => <button key={option.name} type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5" onClick={() => onChange({ status: "matched", tool: option, name: option.name, choice: choiceForTool(option) })}>{option.name}</button>)}</div>
        )}
        {question === "hosting" && row.kind !== "app" && (
          <div>
            <p className="mb-1">{row.kind === "platform" ? "Platform hosting" : "Where does it live?"}</p>
            <div className="flex flex-wrap gap-1.5">
              {hostingChoices(row.kind).map(({ choice, label }) => (
                <button key={choice} type="button" className={`rounded-full border px-2 py-0.5 ${row.choice === choice ? "border-[#5b4ce6] bg-[#ece9ff]" : "border-[#e6e8ee]"}`} onClick={() => onChange({ choice })}>{label}</button>
              ))}
            </div>
          </div>
        )}
        {row.kind === "app" && (question === "hosting" || (question === "none" && open)) && (
          <CardWhere row={row} onChange={onChange} pending={pendingTenants} />
        )}
        {row.kind === "app" && question === "none" && hosting && !open && (
          <button type="button" data-testid="card-where-change" className="mt-1 text-[12px] font-medium text-[#5b4ce6]" onClick={() => setOpen(true)}>Change, or add tenant &amp; region</button>
        )}
        {row.hint && <p className="mt-2 text-[13px] text-[#9a3412]">{row.hint}</p>}
      </div>
    </article>
  );
}

export function AlreadyLine({ row, object, onFillGap, basePath }: { row: AddRow; object: MinEAObject | undefined; onFillGap: (field: GapField, value: string) => void; basePath: string }) {
  const props = object?.properties ?? {};
  const owner = [object?.owner_team_name, object?.point_of_contact_name].filter(Boolean).join(" · ") || object?.owner || row.existing?.owner || "";
  const renewal = typeof props.contract_renewal === "string" ? props.contract_renewal : row.existing?.renewal || "";
  const criticality = typeof props.criticality === "string" ? props.criticality : "";
  const share = costShareLine(props, 0);
  const cost = share.amount ? `${share.amount}/yr` : row.existing?.cost ? `${row.existing.cost}/yr` : "";
  const gap = firstGap({ owner, renewal, criticality });
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e6e8ee] bg-white px-3 py-2 text-[13px]">
      <ItemLogo name={row.name} size={24} />
      <span>{row.name} is already in your map</span>
      <span className="text-[#6b7289]">{[row.existing?.category, cost].filter(Boolean).join(" · ")}</span>
      {gap && <GapFieldEditor label={gap.label} kind={gap.field} onSave={(value) => onFillGap(gap.field, value)} />}
      {object && <Link className="ml-auto font-medium text-[#3f35b5]" href={modelItemPath(basePath, sectionFor(object.type), object.id)}>Open</Link>}
    </div>
  );
}

export function AddSaved({ added, kept, todos, canUndo, motion, onUndo }: { added: string; kept: string; todos: string[]; canUndo: boolean; motion: boolean; onUndo: () => void }) {
  return (
    <div className={`rounded-2xl border border-[#e6e8ee] bg-white p-4 ${motion ? "add-saved-in" : ""}`}>
      {added && <p className="text-[15px] font-semibold text-[#1c2230]">{added}</p>}
      {kept && <p className="mt-1 text-[14px] text-[#4b5163]">{kept}</p>}
      {canUndo && <button type="button" className="mt-3 text-[13px] font-medium text-[#3f35b5]" onClick={onUndo}>Undo</button>}
      {todos.length > 0 && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-[#1c2230]">{todos.length} new to-dos</p>
          <ul className="mt-1 list-disc pl-5 text-[13px] text-[#4b5163]">{todos.map((line) => <li key={line}>{line}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** After "Add the first N for now": the compact result that replaces the cards. */
export type PartialView = {
  summary: string;
  notAdded: string[];
  canUndo: boolean;
  limit: LimitState | null;
};

export function AddPartial({ view, onUndo, onLeave }: { view: PartialView; onUndo: () => void; onLeave: () => void }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = view.limit ? restLink(view.limit.offer, view.limit.orgSlug) : null;
  const count = view.notAdded.length;
  return (
    <div data-testid="limit-partial" role="status" className="rounded-2xl border border-[#e6e8ee] bg-white p-4">
      <p className="text-[15px] font-semibold text-[#1c2230]"><span className="mr-1 text-[#16a34a]">✓</span>{view.summary}</p>
      {view.canUndo && <button type="button" className="mt-1 text-[13px] font-medium text-[#3f35b5]" onClick={onUndo}>Undo</button>}
      {count > 0 && (
        <div className="mt-3 rounded-xl border border-[#eef0f4] bg-[#fafafb]">
          <button
            type="button"
            data-testid="limit-not-added-toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] text-[#4b5163]"
          >
            <span>{count} not added · kept for later</span>
            <span aria-hidden="true" className={`text-[#8b90a0] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
          </button>
          {open && (
            <div data-testid="limit-not-added" className="border-t border-[#eef0f4] px-3 py-2">
              <p className="text-[12px] leading-5 text-[#6b7289]">{view.notAdded.join(", ")}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                {link && <Link href={link.href} onClick={onLeave} data-testid="limit-rest-link" className="font-medium text-[#3f35b5]">{link.label}</Link>}
                {!link && view.limit && (
                  <>
                    <span className="text-[#6b7289]">Ask an owner or admin to upgrade to add the rest.</span>
                    <button
                      type="button"
                      className="font-medium text-[#3f35b5]"
                      onClick={() => {
                        void navigator.clipboard?.writeText(`${window.location.origin}${restLink("upgrade", view.limit!.orgSlug)!.href}`);
                        setCopied(true);
                      }}
                    >
                      {copied ? "Link copied" : "Copy link for your admin"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AddResult({
  rows,
  phase,
  error,
  reduced,
  snapshot,
  objects,
  relationships,
  basePath,
  onRemove,
  onChange,
  onAddAsNew,
  onFillGap,
  onSave,
  onUndo,
  onCancel,
  limit = null,
  partial = null,
  onAddFirst = () => {},
  onLeave = () => {},
  onUndoPartial = () => {},
}: {
  /** Room on the plan for this Add (null: no limit on apps & AI agents). */
  limit?: LimitState | null;
  /** After "Add the first N for now": what was saved, the rest still on the cards. */
  partial?: PartialView | null;
  onAddFirst?: (count: number) => void;
  /** Leaving for Plan & billing: keep the list. */
  onLeave?: () => void;
  onUndoPartial?: () => void;
  rows: AddRow[];
  phase: AddPhase;
  error: string;
  reduced: boolean;
  snapshot: { added: string; kept: string; todos: string[]; canUndo: boolean } | null;
  objects: MinEAObject[];
  relationships: Relationship[];
  basePath: string;
  onRemove: (key: string) => void;
  onChange: (key: string, patch: Partial<AddRow>) => void;
  onAddAsNew: (key: string) => void;
  onFillGap: (id: string, field: GapField, value: string) => void;
  onSave: () => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const view = viewFromRows(rows, phase, reduced);
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
  const { tenants: cloudTenants } = useCloudPicker();
  const pendingTenants = view.mode === "cards" ? cardPendingTenants(view.addCards, cloudTenants) : [];
  if (!partial && (view.mode === "closed" || (view.mode === "saved" && !snapshot))) return null;
  return (
    <section className="max-w-full overflow-x-hidden">
      {view.motion ? <style>{MOTION_CSS}</style> : null}
      {partial ? (
        // The person chose "Add the first N": a compact result, the rest collapsed. No cards, no
        // upgrade button, no Adding/Cancel footer; Next (setup) or Add carries on with what was saved.
        <AddPartial view={partial} onUndo={onUndoPartial} onLeave={onLeave} />
      ) : view.mode === "saved" && snapshot ? (
        <AddSaved added={snapshot.added} kept={snapshot.kept} todos={snapshot.todos} canUndo={snapshot.canUndo} motion={view.motion} onUndo={onUndo} />
      ) : (
        <>
          <h2 className="text-[18px] font-semibold text-[#1c2230]">{view.title}</h2>
          {view.subtitle && <p className="mt-1 text-[13px] text-[#6b7289]">{view.subtitle}</p>}
          {view.mode === "cards" && limit && <div className="mt-2"><RoomHint limit={limit} /></div>}
          {view.mode === "cards" && limit?.over && <LimitPanel limit={limit} busy={phase === "saving"} onAddFirst={onAddFirst} onLeave={onLeave} />}
          {view.mode === "records" && (
            <div className="mt-3 space-y-3">
              {view.recordCards.map((row) => (
                <RecordCard
                  key={row.key}
                  row={row}
                  object={row.existing ? byId.get(row.existing.id) : undefined}
                  relationships={relationships}
                  objects={objects}
                  basePath={basePath}
                  onAskNew={() => onAddAsNew(row.key)}
                  onFillGap={(field, value) => row.existing && onFillGap(row.existing.id, field, value)}
                />
              ))}
            </div>
          )}
          {view.mode === "records" && (
            <button type="button" className="mt-3 text-[13px] text-[#6b7289]" onClick={onCancel}>Cancel</button>
          )}
          {view.mode === "cards" && (
            <>
              <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {view.addCards.map((row, index) => {
                  const card = <AddCard key={row.key} row={row} index={index} dim={phase === "saving"} motion={view.motion} onRemove={() => onRemove(row.key)} onChange={(patch) => onChange(row.key, patch)} pendingTenants={pendingTenants} />;
                  // Over the plan: the cards that fit come first (paste order), the rest wait, dimmed.
                  const fits = limit?.over ? limit.fitCards : Infinity;
                  if (index < fits) return card;
                  return (
                    <Fragment key={row.key}>
                      {index === fits && limit && <LimitDivider fits={fits} waiting={view.addCards.length - fits} label={limit.label} />}
                      <div data-testid="limit-waiting" className="opacity-[0.72]">{card}</div>
                    </Fragment>
                  );
                })}
              </div>
              {view.alreadyLines.length > 0 && (
                <div className="mt-3 space-y-2">
                  {view.alreadyLines.map((row) => (
                    <AlreadyLine key={row.key} row={row} object={row.existing ? byId.get(row.existing.id) : undefined} basePath={basePath} onFillGap={(field, value) => row.existing && onFillGap(row.existing.id, field, value)} />
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {view.button && limit?.over && <LimitActions limit={limit} busy={phase === "saving"} onAddFirst={onAddFirst} onLeave={onLeave} />}
                {view.button && !limit?.over && (
                  <button type="button" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white" onClick={() => { if (phase !== "saving") onSave(); }}>
                    {phase === "saving" && <span className={view.motion ? "add-check mr-1" : "mr-1"}>✓</span>}
                    {view.button}
                  </button>
                )}
                <button type="button" className="text-[13px] text-[#6b7289]" disabled={phase === "saving"} onClick={onCancel}>Cancel</button>
                {limit && (
                  <span data-testid="limit-footer" className="ml-auto text-[12px] text-[#6b7289]">Adding {limit.adding} · {roomHintText(limit)}</span>
                )}
              </div>
              {phase === "error" && error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function AskAdd({
  initialText,
  kind = "app",
  onSaved,
  onClose,
  submitSignal = 0,
  onPendingApps,
}: {
  initialText: string;
  kind?: "app" | "platform";
  /** New applications the cards would still save (what fits on the plan); the setup pill adds it to the saved apps. */
  onPendingApps?: (count: number) => void;
  /** Bump to save the current rows through the same path as the cards' Add button. */
  submitSignal?: number;
  onSaved?: (receipt: AddReceipt) => void;
  onClose?: () => void;
}) {
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { getToken } = useAuth();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<AddRow[]>([]);
  const [rowsFor, setRowsFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<AddPhase>("idle");
  const [error, setError] = useState("");
  const [reduced, setReduced] = useState(false);
  const [closed, setClosed] = useState(false);
  const [snapshot, setSnapshot] = useState<AddReceipt | null>(null);
  // The last save timed out or hit a 5xx: it may still be committing on the server.
  const [stillSaving, setStillSaving] = useState(false);
  const edited = useRef(false);
  const kindRef = useRef(kind);
  const { objects, relationships } = catalogLists(catalog.data);
  const loaded = Boolean(catalog.data);
  const estate = useMemo(() => estateItems(objects), [objects]);

  // Room on the plan (Free: 50 apps & AI agents per workspace), checked before saving so a long paste gets the
  // upgrade panel instead of a refused batch. The server's count and cap include org overrides.
  const { activeOrg } = useAppStore();
  const roomKey = ["object-room", orgSlug, workspaceSlug] as const;
  const roomQuery = useQuery({
    queryKey: roomKey,
    queryFn: async () => addApi.room(orgSlug!, workspaceSlug!, (await getToken())!),
    enabled: Boolean(orgSlug && workspaceSlug),
    staleTime: 30_000,
    retry: false,
  });
  const capped = roomQuery.data ? roomQuery.data.max != null : limitState({ plan: activeOrg?.plan, catalogCount: 0, adding: 0, offer: "upgrade", orgSlug: "" }) != null;
  const billing = useQuery({
    queryKey: ["billing-status", orgSlug],
    queryFn: async () => billingApi.status(orgSlug!, (await getToken())!),
    enabled: Boolean(orgSlug) && capped,
    staleTime: 60_000,
  });
  // A 403 limit_exceeded from the server wins until the room query has refetched.
  const [serverRoom, setServerRoom] = useState<ObjectRoom | null>(null);
  useEffect(() => setServerRoom(null), [roomQuery.dataUpdatedAt]);
  const refreshRoom = () => { void queryClient.invalidateQueries({ queryKey: roomKey }); };
  // After "Add the first N for now": the receipt, and the rows that went (Undo puts them back).
  const [partial, setPartial] = useState<{ summary: string; receipt: AddReceipt; rows: AddRow[]; notAdded: string[] } | null>(null);
  const countedInMap = useMemo(() => countedTypes(objects.map((object) => object.type)), [objects]);
  const limit: LimitState | null = useMemo(() => {
    if (!orgSlug || !loaded) return null;
    const planned = planInputs(rows);
    const cards = planned.filter((row) => !row.existing).length;
    // Only apps & AI agents count: a card's new tenant or server costs nothing.
    const itemsFor = (count: number) => countedTypes(buildBatch(takeFirst(planned, count).planned, estate).creates.map((item) => item.type));
    return limitState({
      plan: activeOrg?.plan,
      room: serverRoom ?? roomQuery.data ?? null,
      catalogCount: countedInMap,
      adding: itemsFor(cards),
      cards,
      itemsFor,
      offer: limitOffer(billing.data, billingUiEnabled()),
      orgSlug,
    });
  }, [orgSlug, loaded, rows, estate, activeOrg?.plan, serverRoom, roomQuery.data, countedInMap, billing.data]);

  const freshTypes = useMemo(() => rows.filter((row) => !row.existing).map((row) => objectTypeFor(row.kind)), [rows]);
  const pendingApps = pendingAppCount(freshTypes, limit, Boolean(partial));
  useEffect(() => {
    onPendingApps?.(pendingApps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingApps]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPendingApps?.(0), []);

  // Keep the cards' names in sessionStorage so the list comes back after Plan & billing.
  const keepForUpgrade = (only?: string[]) => {
    if (!orgSlug || !workspaceSlug) return;
    const names = only ?? rows.filter((row) => !row.existing).map((row) => row.name || row.input);
    const here = typeof window === "undefined" ? basePath : `${window.location.pathname}${window.location.search}`;
    // Ask has no add box to come back to without its question: return to Model > Applications.
    const back = here.includes("/model/") || here.includes("/setup") || here.includes("/views") ? here : `${basePath}/model/applications`;
    saveAddDraft(orgSlug, workspaceSlug, names, back);
  };

  const textRef = useRef<string | null>(null);
  useEffect(() => {
    if (textRef.current === initialText) return;
    textRef.current = initialText;
    edited.current = false;
    setPartial(null);
    setClosed(false);
    setPhase("idle");
    setSnapshot(null);
    setError("");
    setStillSaving(false);
  }, [initialText]);

  useEffect(() => {
    if (kindRef.current === kind) return;
    if (phase === "saved") return;
    kindRef.current = kind;
    edited.current = false;
    setClosed(false);
    setError("");
    if (phase !== "idle") setPhase("idle");
  }, [kind, phase]);

  useEffect(() => {
    // Wait for the catalog so rows match existing records instead of all looking new.
    if (!loaded || edited.current || phase !== "idle") return;
    setRows(prepareRows(initialText, kind, estate));
    setRowsFor(initialText);
  }, [loaded, initialText, estate, phase, kind]);

  // After a timed-out save the catalogue is refetched; cards whose records arrived show as already
  // in the map, so Add again only sends what's really missing.
  useEffect(() => {
    if (!stillSaving) return;
    setRows((current) => markAlreadySaved(current, estate));
  }, [stillSaving, estate]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  // AI lookup for names the catalogue doesn't know: debounced, cached per name, and silent on
  // failure (the card just stays Custom). Suggestions never mark the rows as edited.
  // The platform-admin-edited catalogue (falls back to the bundled list when the API can't serve it).
  useEffect(() => {
    void refreshLiveCatalog(async () => {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");
      return toolCatalogApi.tools(token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dismissed = useRef(new Set<string>());
  const [lookupTick, setLookupTick] = useState(0);
  useEffect(() => {
    setRows((current) => applySuggestions(current, dismissed.current));
    if (!orgSlug || phase !== "idle") return;
    const names = namesToLookUp(rows, dismissed.current);
    if (names.length === 0) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const giveUp = window.setTimeout(() => controller.abort(), 8000);
      try {
        const token = await getToken();
        if (!token) return;
        const { results } = await catalogLookupApi.lookup(orgSlug, names, token, controller.signal);
        rememberLookups(names, results);
      } catch {
        rememberFailed(names);
      } finally {
        window.clearTimeout(giveUp);
      }
      setLookupTick((n) => n + 1);
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, orgSlug, phase, lookupTick]);

  const patch = (key: string, change: Partial<AddRow>) => {
    edited.current = true;
    if (change.customBuilt) {
      const row = rows.find((item) => item.key === key);
      if (row) dismissed.current.add(lookupKey(row.input));
    }
    // Cards that picked a new tenant typed on this one follow its name (one record on save).
    setRows((current) => resolveSharedTenants(current.map((row) => (row.key === key ? { ...row, ...change } : row))));
  };

  const save = async (firstCount?: number) => {
    if (!orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) {
      setError("Not signed in");
      setPhase("error");
      return;
    }
    setPhase("saving");
    setError("");
    setStillSaving(false);
    // "Add the first N for now": the first N new cards in paste order (cards already in the map go along).
    const { planned, taken, fresh } = takeFirst(planInputs(rows), firstCount);
    const batch = buildBatch(planned, estate);
    try {
      const before = setupState(objects, relationships);
      const saved = await addApi.save(orgSlug, workspaceSlug, {
        creates: batch.creates.map((item) => ({ key: item.key, type: item.type, name: item.name, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
        updates: batch.updates.map((item) => ({ id: item.id, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
        relationships: batch.relationships.map((item) => ({ type: item.type, from_key: item.fromKey, to_key: item.toKey, from_id: item.fromId, to_id: item.toId, from_type: item.fromType, to_type: item.toType, ...(item.attributes ? { attributes: item.attributes } : {}) })),
      }, token, { quietLimit: true });
      refreshRoom();
      for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
      for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
      const created = planned.filter((row) => !row.existing);
      const names = created.map((row) => row.name);
      const kept = planned.filter((row) => row.existing).map((row) => row.name);
      const afterObjects = [...objects, ...saved.objects.filter((object) => object.type === "application").map((object) => ({ type: object.type }))];
      const afterRels = [...relationships, ...saved.relationships.map((rel) => ({ type: rel.type }))];
      if (!before.met && setupState(afterObjects, afterRels).met && !setup.mapReadyShownAt) {
        void setup.save({ mapReadyShownAt: new Date().toISOString() });
      }
      // What each typed line was saved as: the setup wizard ties its drafts by id, not by name
      // (an AI suggestion can save "Wait While" as "Waitwhile").
      const idByKey = new Map(batch.creates.map((item, index) => [item.key, saved.created_object_ids[index]]));
      const idsByInput: Record<string, string> = {};
      for (const row of created) {
        const id = idByKey.get(row.key);
        if (id) idsByInput[normalizeTerm(row.input)] = id;
      }
      const receipt: AddReceipt = {
        idsByInput,
        question: initialText,
        added: savedAdded(names),
        names,
        kept: savedKept(kept),
        todos: todoLines(planned.map((row) => ({ name: row.name, kind: row.kind, kept: Boolean(row.existing), updating: false, owner: "", renewal: "", choice: row.choice, hint: row.hint, tool: row.status === "matched" ? row.tool : null }))),
        canUndo: saved.created_object_ids.length + saved.created_relationship_ids.length > 0,
        objectIds: saved.created_object_ids,
        relationshipIds: saved.created_relationship_ids,
        undoUntil: Date.now() + UNDO_MS,
      };
      if (firstCount !== undefined && firstCount < fresh) {
        // Saved what fits; the rest stay on the cards, still waiting for an upgrade.
        edited.current = true;
        const went = rows.filter((row) => taken.has(row.key));
        const waiting = rows.filter((row) => !row.existing && !taken.has(row.key));
        const notAdded = waiting.map((row) => row.name || row.input);
        setRows((current) => current.filter((row) => !taken.has(row.key) && !row.existing));
        const partialReceipt: AddReceipt = { ...receipt, notAdded: waiting.map((row) => row.input) };
        setPartial({ summary: partialSummary(firstCount, fresh - firstCount, limit?.label ?? "Free", kind === "platform" ? "platforms" : "apps"), receipt: partialReceipt, rows: went, notAdded });
        // The rest are kept for later (they come back in the add box after an upgrade).
        keepForUpgrade(notAdded);
        setPhase("idle");
        return;
      }
      setPartial(null);
      onSaved?.(receipt);
      setSnapshot(receipt);
      setPhase("saved");
    } catch (err) {
      const refused = objectLimitFromError(err);
      if (refused) {
        // Same panel as the pre-check, with the server's numbers.
        setServerRoom(roomFromDetail(refused));
        refreshRoom();
        const stillFits = batch.creates.length <= (refused.remaining ?? Math.max(0, refused.max - refused.current));
        setError(stillFits ? (err instanceof Error ? err.message : "") : "");
        setPhase(stillFits ? "error" : "idle");
        return;
      }
      setError(addSaveErrorMessage(err));
      setPhase("error");
      if (maybeStillSaving(err)) {
        setStillSaving(true);
        void queryClient.invalidateQueries({ queryKey: catalogQueryKey(orgSlug, workspaceSlug) });
      }
    }
  };

  const submitSeen = useRef(submitSignal);
  const submitPending = useRef(false);
  useEffect(() => {
    if (submitSeen.current !== submitSignal) {
      submitSeen.current = submitSignal;
      submitPending.current = true;
    }
    if (!submitPending.current || !loaded || phase !== "idle") return;
    if (textRef.current !== initialText || rowsFor !== initialText) return;
    const ready = rows.length > 0 && rows.some((row) => !row.existing);
    submitPending.current = false;
    // More than the plan has room for: stay on the cards with the upgrade panel instead of sending a
    // batch the server would refuse. After "Add the first N", Add/Next carries on with what was saved
    // (the setup wizard moves to its next step).
    if (ready && limit?.over) {
      if (partial) onSaved?.(partial.receipt);
      return;
    }
    if (ready) void save();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitSignal, rows, rowsFor, loaded, phase, initialText, limit?.over]);

  const undoPartial = async () => {
    if (!partial || !orgSlug || !workspaceSlug || Date.now() > partial.receipt.undoUntil) return;
    const token = await getToken();
    if (!token) return;
    const { receipt, rows: went } = partial;
    await addApi.undo(orgSlug, workspaceSlug, { object_ids: receipt.objectIds, relationship_ids: receipt.relationshipIds }, token);
    for (const id of receipt.objectIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: id });
    for (const id of receipt.relationshipIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    refreshRoom();
    setPartial(null);
    takeAddDraft(orgSlug, workspaceSlug);
    setRows((current) => [...went, ...current]);
  };

  const undo = async () => {
    if (!snapshot || !orgSlug || !workspaceSlug || Date.now() > snapshot.undoUntil) return;
    const token = await getToken();
    if (!token) return;
    await addApi.undo(orgSlug, workspaceSlug, { object_ids: snapshot.objectIds, relationship_ids: snapshot.relationshipIds }, token);
    for (const id of snapshot.objectIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: id });
    for (const id of snapshot.relationshipIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    refreshRoom();
    const undone: AddReceipt = {
      ...snapshot,
      added: undoneSentence(snapshot.names ?? []),
      kept: "",
      todos: [],
      canUndo: false,
      objectIds: [],
      relationshipIds: [],
    };
    onSaved?.(undone);
    setSnapshot(undone);
  };

  const fillGap = async (id: string, field: GapField, value: string) => {
    if (!orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) return;
    const body = field === "owner"
      ? { owner: value, owner_team_name: value }
      : { properties: field === "renewal" ? { contract_renewal: value } : { criticality: value } };
    const object = await objectsApi.update(orgSlug, workspaceSlug, id, body, token);
    applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
  };

  if (!catalog.data || closed) return null;
  return (
    <AddResult
      rows={rows}
      phase={phase}
      error={error}
      reduced={reduced}
      snapshot={snapshot}
      objects={objects}
      relationships={relationships}
      basePath={basePath}
      onRemove={(key) => {
        edited.current = true;
        setRows((current) => {
          const next = current.filter((row) => row.key !== key);
          if (next.every((row) => row.existing)) setClosed(true);
          return next;
        });
      }}
      onChange={patch}
      onAddAsNew={(key) => patch(key, { existing: null, status: "custom", tool: null, choice: "unknown", name: rows.find((row) => row.key === key)?.input || "" })}
      onFillGap={(id, field, value) => { void fillGap(id, field, value); }}
      onSave={() => { void save(); }}
      limit={limit}
      partial={partial ? { summary: partial.summary, notAdded: partial.notAdded, canUndo: partial.receipt.canUndo && Date.now() < partial.receipt.undoUntil, limit } : null}
      onAddFirst={(count) => { if (phase !== "saving") void save(count); }}
      onLeave={() => keepForUpgrade(partial?.notAdded)}
      onUndoPartial={() => { void undoPartial(); }}
      onUndo={() => { void undo(); }}
      onCancel={() => {
        if (onClose) {
          onClose();
          return;
        }
        setRows([]);
        setError("");
        setClosed(true);
      }}
    />
  );
}
