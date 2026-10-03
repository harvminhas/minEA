"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { addApi, objectsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { readCostLines } from "@/lib/cost/math";
import { annualCost } from "@/lib/cost/service";
import { askPath, modelItemPath, type ModelSection } from "@/lib/mvp-paths";
import {
  MOTION_CSS,
  cardQuestion,
  costShareLine,
  firstGap,
  formatRenewal,
  logoInitials,
  logoTint,
  noticeDeadline,
  recordSubtitle,
  savedAdded,
  savedKept,
  viewFromRows,
  type AddPhase,
  type AddReceipt,
  type GapField,
} from "@/lib/setup/add-cards";
import { buildBatch, planInputs, prepareRows, todoLines, type AddRow, type EstateItem } from "@/lib/setup/add-plan";
import { setupState } from "@/lib/setup/setupMin";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";

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
      <input autoFocus type={kind === "renewal" ? "date" : "text"} value={value} onChange={(event) => setValue(event.target.value)} className="h-7 rounded-lg border border-[#e6e8ee] px-2 text-[12px]" />
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

export function AddCard({ row, index, dim, motion, onRemove, onChange }: { row: AddRow; index: number; dim: boolean; motion: boolean; onRemove: () => void; onChange: (patch: Partial<AddRow>) => void }) {
  const question = cardQuestion(row);
  const typical = row.status === "matched" && row.tool?.typicalAnnual ? `typical $${row.tool.typicalAnnual.toLocaleString("en-US")}` : "";
  return (
    <article className={`rounded-2xl border border-[#e6e8ee] bg-white p-4 ${dim ? "opacity-60" : ""} ${motion ? "add-card-rise" : ""}`} style={motion ? { ["--add-i" as string]: index } : undefined}>
      <div className="flex items-start gap-3">
        <ItemLogo name={row.name} custom={row.status === "custom"} size={48} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold text-[#1c2230]">{row.name}</h3>
          <p className="truncate text-[13px] text-[#6b7289]">{[row.tool?.category, row.tool?.vendor].filter(Boolean).join(" · ")}</p>
          {typical && <span className="mt-1 inline-flex rounded-full bg-[#f3f4f8] px-2 py-0.5 text-[12px] text-[#3c4254]">{typical} /yr</span>}
        </div>
        <button type="button" aria-label={`Remove ${row.name}`} className="text-[16px] text-[#6b7289]" onClick={onRemove}>×</button>
      </div>
      <div className="mt-3 text-[13px] text-[#4b5163]">
        {question === "none" && (row.choice === "saas" || row.tool?.hosting === "saas") && <p>Cloud app (SaaS), nothing to ask</p>}
        {question === "fuzzy" && row.status === "weak" && (
          <p>Is it {row.tool?.name}? <button type="button" className="ml-2 font-medium text-[#3f35b5]" onClick={() => onChange({ status: "matched", name: row.tool?.name || row.name })}>Yes</button> <button type="button" className="ml-2 text-[#6b7289]" onClick={() => onChange({ status: "custom", tool: null, choice: "unknown", name: row.input })}>No</button></p>
        )}
        {question === "fuzzy" && row.status === "pick" && (
          <div className="flex flex-wrap gap-1.5">{row.options.map((option) => <button key={option.name} type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5" onClick={() => onChange({ status: "matched", tool: option, name: option.name, choice: option.hosting === "saas" ? "saas" : "unknown" })}>{option.name}</button>)}</div>
        )}
        {question === "hosting" && (
          <div>
            <p className="mb-1">Where does it live?</p>
            <div className="flex flex-wrap gap-1.5">
              {([["saas", "SaaS"], ["own", "Our server"], ["unknown", "Don't know"]] as const).map(([choice, label]) => (
                <button key={choice} type="button" className={`rounded-full border px-2 py-0.5 ${row.choice === choice ? "border-[#5b4ce6] bg-[#ece9ff]" : "border-[#e6e8ee]"}`} onClick={() => onChange({ choice })}>{label}</button>
              ))}
            </div>
          </div>
        )}
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
}: {
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
}) {
  const view = viewFromRows(rows, phase, reduced);
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
  if (view.mode === "closed" || (view.mode === "saved" && !snapshot)) return null;
  return (
    <section className="max-w-full overflow-x-hidden">
      {view.motion ? <style>{MOTION_CSS}</style> : null}
      {view.mode === "saved" && snapshot ? (
        <AddSaved added={snapshot.added} kept={snapshot.kept} todos={snapshot.todos} canUndo={snapshot.canUndo} motion={view.motion} onUndo={onUndo} />
      ) : (
        <>
          <h2 className="text-[18px] font-semibold text-[#1c2230]">{view.title}</h2>
          {view.subtitle && <p className="mt-1 text-[13px] text-[#6b7289]">{view.subtitle}</p>}
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
          {view.mode === "cards" && (
            <>
              <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {view.addCards.map((row, index) => (
                  <AddCard key={row.key} row={row} index={index} dim={phase === "saving"} motion={view.motion} onRemove={() => onRemove(row.key)} onChange={(patch) => onChange(row.key, patch)} />
                ))}
              </div>
              {view.alreadyLines.length > 0 && (
                <div className="mt-3 space-y-2">
                  {view.alreadyLines.map((row) => (
                    <AlreadyLine key={row.key} row={row} object={row.existing ? byId.get(row.existing.id) : undefined} basePath={basePath} onFillGap={(field, value) => row.existing && onFillGap(row.existing.id, field, value)} />
                  ))}
                </div>
              )}
              {view.button && (
                <button type="button" className="mt-4 rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white" onClick={() => { if (phase !== "saving") onSave(); }}>
                  {phase === "saving" && <span className={view.motion ? "add-check mr-1" : "mr-1"}>✓</span>}
                  {view.button}
                </button>
              )}
              {phase === "error" && error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function AskAdd({ initialText, onSaved }: { initialText: string; onSaved?: (receipt: AddReceipt) => void }) {
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { getToken } = useAuth();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<AddRow[]>([]);
  const [phase, setPhase] = useState<AddPhase>("idle");
  const [error, setError] = useState("");
  const [reduced, setReduced] = useState(false);
  const [closed, setClosed] = useState(false);
  const [snapshot, setSnapshot] = useState<{ added: string; kept: string; todos: string[]; canUndo: boolean; objectIds: string[]; relationshipIds: string[]; undoUntil: number } | null>(null);
  const edited = useRef(false);
  const objects = catalog.data?.objects ?? [];
  const relationships = catalog.data?.relationships ?? [];
  const estate = useMemo(() => estateItems(objects), [objects]);

  const textRef = useRef<string | null>(null);
  useEffect(() => {
    if (textRef.current === initialText) return;
    textRef.current = initialText;
    edited.current = false;
    setClosed(false);
    setPhase("idle");
    setSnapshot(null);
    setError("");
  }, [initialText]);

  useEffect(() => {
    if (edited.current || phase !== "idle") return;
    setRows(prepareRows(initialText, "app", estate));
  }, [initialText, estate, phase]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);

  const patch = (key: string, change: Partial<AddRow>) => {
    edited.current = true;
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  };

  const save = async () => {
    if (!orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) {
      setError("Not signed in");
      setPhase("error");
      return;
    }
    setPhase("saving");
    setError("");
    const planned = planInputs(rows);
    try {
      const batch = buildBatch(planned, estate);
      const before = setupState(objects, relationships);
      const saved = await addApi.save(orgSlug, workspaceSlug, {
        creates: batch.creates.map((item) => ({ key: item.key, type: item.type, name: item.name, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
        updates: batch.updates.map((item) => ({ id: item.id, properties: item.properties, owner: item.owner, owner_team_name: item.ownerTeam, point_of_contact_name: item.ownerName })),
        relationships: batch.relationships.map((item) => ({ type: item.type, from_key: item.fromKey, to_key: item.toKey, from_id: item.fromId, to_id: item.toId, from_type: item.fromType, to_type: item.toType })),
      }, token);
      for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
      for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
      const created = planned.filter((row) => !row.existing);
      const kept = planned.filter((row) => row.existing).map((row) => row.name);
      const afterObjects = [...objects, ...saved.objects.filter((object) => object.type === "application").map((object) => ({ type: object.type }))];
      const afterRels = [...relationships, ...saved.relationships.map((rel) => ({ type: rel.type }))];
      if (!before.met && setupState(afterObjects, afterRels).met && !setup.mapReadyShownAt) {
        void setup.save({ mapReadyShownAt: new Date().toISOString() });
      }
      const receipt: AddReceipt = {
        question: initialText,
        added: savedAdded(created.map((row) => row.name)),
        kept: savedKept(kept),
        todos: todoLines(planned.map((row) => ({ name: row.name, kind: row.kind, kept: Boolean(row.existing), updating: false, owner: "", renewal: "", choice: row.choice, hint: row.hint }))),
        canUndo: saved.created_object_ids.length + saved.created_relationship_ids.length > 0,
        objectIds: saved.created_object_ids,
        relationshipIds: saved.created_relationship_ids,
        undoUntil: Date.now() + UNDO_MS,
      };
      onSaved?.(receipt);
      setSnapshot(receipt);
      setPhase("saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setPhase("error");
    }
  };

  const undo = async () => {
    if (!snapshot || !orgSlug || !workspaceSlug || Date.now() > snapshot.undoUntil) return;
    const token = await getToken();
    if (!token) return;
    await addApi.undo(orgSlug, workspaceSlug, { object_ids: snapshot.objectIds, relationship_ids: snapshot.relationshipIds }, token);
    for (const id of snapshot.objectIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: id });
    for (const id of snapshot.relationshipIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    setSnapshot(null);
    setPhase("idle");
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
      onUndo={() => { void undo(); }}
    />
  );
}
