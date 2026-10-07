"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { moneyLabel } from "@/lib/model-catalog";
import {
  addButtonLabel,
  addedSentence,
  buildBatch,
  categoryHint,
  dedupeKey,
  findExisting,
  homeSentence,
  prepareRows,
  saasSkipCount,
  resolveKind,
  todoLines,
  type AddKind,
  type AddRow,
  type EstateItem,
  type PlanInput,
} from "@/lib/setup/add-plan";
import { APP_OR_PLATFORM, nextPreset, typeGuidance } from "@/lib/setup/type-guidance";
import { defaultHosting, type ToolRecord } from "@/lib/setup/match-tools";
import { setupState } from "@/lib/setup/setupMin";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useTenancy } from "@/lib/tenancy";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { AskAdd } from "@/components/add/AddCards";
import { cardQuestion, hostingChoices, undoneSentence, type AddReceipt } from "@/lib/setup/add-cards";
import { SetupFlow } from "@/components/mvp/setup-flow";

const UNDO_MS = 10 * 60 * 1000;
const KINDS: AddKind[] = ["app", "platform", "server", "location", "vendor"];
const KIND_TITLE: Record<AddKind, string> = {
  app: "App",
  platform: "Platform",
  server: "Server",
  location: "Location",
  capability: "Capability",
  vendor: "Vendor",
};

export function AddFlow({
  origin,
  inline = false,
  kind = "app",
  initialText,
  compact = false,
  cards = false,
  onSaved,
  onClose,
}: {
  origin: "setup" | "ask" | "model" | "views";
  inline?: boolean;
  kind?: AddKind;
  initialText?: string;
  compact?: boolean;
  /** Applications page. The Platforms page keeps its own add flow. */
  cards?: boolean;
  onSaved?: (receipt: AddReceipt) => void;
  onClose?: () => void;
}) {
  if (origin === "setup") return <SetupFlow inline={inline} />;
  const askKind = kind === "platform" ? "platform" : "app";
  if (origin === "ask" || cards || (origin === "model" && kind === "app")) {
    return <AskAdd initialText={initialText ?? ""} kind={askKind} onSaved={onSaved} onClose={onClose} />;
  }
  return <AnywhereAdd origin={origin} kind={kind} initialText={initialText} compact={compact} inline={inline} onClose={onClose} />;
}

function estateItems(objects: { id: string; type: string; name: string; owner?: string | null; properties?: Record<string, unknown> | null }[], rows: { id: string; ownerTeam: string; ownerPerson: string; annualCostNumber: number | null; lifecycleLabel: string; vendor: string; renewalLabel: string; category?: string }[]): EstateItem[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return objects.map((object) => {
    const row = byId.get(object.id);
    const props = object.properties ?? {};
    const category = typeof props.category === "string" ? props.category : "";
    const catalogTool = typeof props.catalog_tool === "string" ? props.catalog_tool : "";
    const renewal = typeof props.contract_renewal === "string" ? props.contract_renewal : typeof props.commitment_ends === "string" ? props.commitment_ends : "";
    return {
      id: object.id,
      type: object.type,
      name: object.name,
      owner: row?.ownerPerson || row?.ownerTeam || object.owner || "",
      cost: row?.annualCostNumber ? moneyLabel(row.annualCostNumber) : "",
      lifecycle: row?.lifecycleLabel || "",
      category,
      catalogTool,
      vendor: row?.vendor || (typeof props.vendor === "string" ? props.vendor : ""),
      renewal: row?.renewalLabel || renewal,
    };
  });
}

function toPlan(text: string, preset: AddKind, estate: EstateItem[]): PlanInput[] {
  return prepareRows(text, preset, estate).map((row) => ({
    ...row,
    keep: Boolean(row.existing),
    serverName: "",
    where: "",
    ownerTeam: "",
    ownerName: "",
    renewal: "",
    yearly: row.status === "matched" && row.tool?.typicalAnnual ? String(row.tool.typicalAnnual) : "",
    domainId: "",
  }));
}

function AnywhereAdd({
  origin,
  kind,
  initialText,
  compact,
  inline = false,
  onClose,
}: {
  origin: "ask" | "model" | "views";
  kind: AddKind;
  initialText?: string;
  compact?: boolean;
  inline?: boolean;
  onClose?: () => void;
}) {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const setup = useWorkspaceSetup();
  const estate = useMemo(
    () => estateItems(catalog.data?.objects ?? [], catalog.data?.rows ?? []),
    [catalog.data?.objects, catalog.data?.rows],
  );
  const [preset, setPreset] = useState<AddKind>(kind);
  const [locked, setLocked] = useState(false);
  const [text, setText] = useState(initialText ?? "");
  const guidance = useMemo(() => typeGuidance(text), [text]);
  const [rows, setRows] = useState<PlanInput[]>([]);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ added: string; home: string; todos: string[]; undoUntil: number; objectIds: string[]; relationshipIds: string[]; mapReady: boolean; names: string[] } | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    const incoming = (initialText ?? "").trim();
    if (!incoming || dirty.current) return;
    setText(incoming);
    setRows(toPlan(incoming, preset, estate));
    setStarted(true);
  }, [initialText, estate, preset]);

  useEffect(() => {
    if (locked) return;
    setPreset((current) => nextPreset(current, text, false));
  }, [locked, text]);

  const servers = useMemo(() => {
    const names = new Map<string, string>();
    for (const item of estate) {
      if (item.type === "model") names.set(dedupeKey(item.name), item.name);
    }
    for (const row of rows) {
      if (row.kind === "server") names.set(row.key, row.name);
    }
    return [...names.values()];
  }, [estate, rows]);

  const creating = rows.filter((row) => !row.existing);
  const one = compact || creating.length + rows.filter((row) => row.existing).length <= 1;
  const skip = saasSkipCount(rows);
  const hostingRows = rows.filter((row) => {
    if (row.existing || (row.kind !== "app" && row.kind !== "platform")) return false;
    if (row.kind === "platform") return cardQuestion(row) === "hosting";
    return one || skip === null;
  });
  const listId = `add-servers-${origin}`;

  const patch = (key: string, change: Partial<PlanInput> & { tool?: ToolRecord | null; status?: AddRow["status"] }) => {
    dirty.current = true;
    setRows((current) =>
      current.map((row) => {
        if (row.key !== key) return row;
        const next = { ...row, ...change };
        const item = { input: next.input, status: next.status, tool: next.tool, options: next.options, customBuilt: next.customBuilt };
        next.kind = resolveKind(item, preset);
        next.existing = findExisting(item, next.kind, estate);
        next.hint = next.existing ? null : categoryHint(next.tool, estate);
        if (change.status || change.tool) {
          next.choice = defaultHosting(item);
          next.yearly = next.status === "matched" && next.tool?.typicalAnnual ? String(next.tool.typicalAnnual) : next.yearly;
          next.keep = Boolean(next.existing);
        }
        return next;
      }),
    );
  };

  const begin = () => {
    setRows(toPlan(text, preset, estate));
    setStarted(true);
    setReceipt(null);
  };

  const save = async () => {
    if (!orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) throw new Error("Not signed in");
    const planned = rows;
    const batch = buildBatch(planned, estate);
    const before = setupState(catalog.data?.objects ?? [], catalog.data?.relationships ?? []);
    const saved = await addApi.save(orgSlug, workspaceSlug, {
      creates: batch.creates.map((item) => ({
        key: item.key,
        type: item.type,
        name: item.name,
        properties: item.properties,
        owner: item.owner,
        owner_team_name: item.ownerTeam,
        point_of_contact_name: item.ownerName,
      })),
      updates: batch.updates.map((item) => ({
        id: item.id,
        properties: item.properties,
        owner: item.owner,
        owner_team_name: item.ownerTeam,
        point_of_contact_name: item.ownerName,
      })),
      relationships: batch.relationships.map((item) => ({
        type: item.type,
        from_key: item.fromKey,
        to_key: item.toKey,
        from_id: item.fromId,
        to_id: item.toId,
        from_type: item.fromType,
        to_type: item.toType,
      })),
    }, token);
    for (const object of saved.objects) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object });
    for (const relationship of saved.relationships) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship });
    const created = planned.filter((row) => !row.existing).map((row) => ({ name: row.name, kind: row.kind }));
    const kept = planned.filter((row) => row.existing && row.keep).map((row) => row.name);
    const apps = planned.filter((row) => !row.existing && (row.kind === "app" || row.kind === "platform"));
    const afterObjects = [
      ...(catalog.data?.objects ?? []),
      ...saved.objects.filter((object) => object.type === "application").map((object) => ({ type: object.type })),
    ];
    const afterRels = [
      ...(catalog.data?.relationships ?? []),
      ...saved.relationships.map((rel) => ({ type: rel.type })),
    ];
    const metNow = !before.met && setupState(afterObjects, afterRels).met && !setup.mapReadyShownAt;
    if (metNow) void setup.save({ mapReadyShownAt: new Date().toISOString() });
    setReceipt({
      added: addedSentence(created, kept),
      names: created.map((row) => row.name),
      home: homeSentence(apps.map((row) => ({ choice: row.choice, linked: row.choice !== "own" || Boolean(row.serverName.trim()) }))),
      todos: todoLines(planned.map((row) => ({
        name: row.name,
        kind: row.kind,
        kept: Boolean(row.existing && row.keep),
        updating: Boolean(row.existing && !row.keep),
        owner: row.ownerTeam || row.ownerName,
        renewal: row.renewal,
        choice: row.choice,
        hint: row.hint,
      }))),
      undoUntil: Date.now() + UNDO_MS,
      objectIds: saved.created_object_ids,
      relationshipIds: saved.created_relationship_ids,
      mapReady: metNow,
    });
    setStarted(false);
    setRows([]);
  };

  const undo = async () => {
    if (!receipt || !orgSlug || !workspaceSlug) return;
    const token = await getToken();
    if (!token) return;
    await addApi.undo(orgSlug, workspaceSlug, { object_ids: receipt.objectIds, relationship_ids: receipt.relationshipIds }, token);
    for (const id of receipt.objectIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeId: id });
    for (const id of receipt.relationshipIds) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    setReceipt({ ...receipt, added: undoneSentence(receipt.names), home: "", todos: [], objectIds: [], relationshipIds: [] });
  };

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const canUndo = Boolean(receipt && Date.now() < receipt.undoUntil && receipt.objectIds.length + receipt.relationshipIds.length > 0);
  const reviewing = started && rows.length > 0 && !receipt;
  const panelRef = useRef<HTMLElement>(null);
  const cancelReview = () => {
    if (busy) return;
    setStarted(false);
    setRows([]);
    setReceipt(null);
    setError("");
  };
  const dismiss = () => {
    if (busy) return;
    if (onClose) onClose();
    else cancelReview();
  };
  useEffect(() => {
    if (reviewing) panelRef.current?.focus();
  }, [reviewing]);

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      className="rounded-2xl border border-[#e6e8ee] bg-white p-4 focus:outline-none"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || busy || receipt) return;
        event.preventDefault();
        event.stopPropagation();
        dismiss();
      }}
    >
      {(!inline || started) && KINDS.length > 1 && (
      <div>
      <div className="flex flex-wrap gap-1.5">
        {KINDS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setLocked(true);
              setPreset(item);
              if (text.trim()) setRows(toPlan(text, item, estate));
            }}
            className={`rounded-full border px-2.5 py-0.5 text-[12px] ${preset === item ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]" : "border-[#e6e8ee] text-[#4b5163]"}`}
          >
            {KIND_TITLE[item]}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[12px] leading-5 text-[#6b7289]">{APP_OR_PLATFORM}</p>
      {guidance.mode === "suggest" && !locked && (guidance.kind === "app" || guidance.kind === "platform") && preset === guidance.kind && (
        <p className="mt-1 text-[12px] text-[#4b5163]">
          {guidance.line}:{" "}
          <button
            type="button"
            className="font-medium text-[#3f35b5]"
            onClick={() => {
              const next = preset === "platform" ? "app" : "platform";
              setLocked(true);
              setPreset(next);
              if (text.trim()) setRows(toPlan(text, next, estate));
            }}
          >
            change
          </button>
        </p>
      )}
      {guidance.mode === "both" && (
        <ul className="mt-2 space-y-1">
          {guidance.options.map((option) => (
            <li key={option.kind}>
              <button
                type="button"
                onClick={() => {
                  setLocked(true);
                  setPreset(option.kind);
                  if (text.trim()) setRows(toPlan(text, option.kind, estate));
                }}
                className={`text-[12px] ${preset === option.kind ? "font-semibold text-[#3f35b5]" : "text-[#4b5163]"}`}
              >
                {option.kind === "app" ? "Application" : "Platform"}
              </button>
              <span className="text-[12px] text-[#6b7289]"> — {option.hint}</span>
            </li>
          ))}
        </ul>
      )}
      </div>
      )}

      {!started && (
        <>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={compact ? 2 : 3}
            placeholder="Zoom, HubSpot, the server in the back room"
            className="mt-3 w-full rounded-xl border border-[#e6e8ee] px-3 py-2 text-[14px] outline-none focus:border-[#5b4ce6]"
          />
          <button type="button" disabled={!text.trim()} onClick={begin} className="mt-3 rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
            Continue
          </button>
        </>
      )}

      {started && rows.length > 0 && (
        <>
          <ul className="mt-3 space-y-3">
            {rows.map((row) => (
              <li key={row.key} className="rounded-xl border border-[#e6e8ee] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  <span className="font-medium text-[#1c2230]">{row.name}</span>
                  {row.existing ? (
                    <span className="text-[#6b7289]">Already have this · {[row.existing.category, row.existing.owner, row.existing.cost ? `${row.existing.cost}/yr` : "", row.existing.lifecycle].filter(Boolean).join(" · ")}</span>
                  ) : row.status === "matched" ? (
                    <span className="text-[#6b7289]">New · matched{row.tool?.vendor ? ` · ${row.tool.vendor}` : ""}</span>
                  ) : row.status === "custom" ? (
                    <span className="text-[#6b7289]">Custom</span>
                  ) : row.status === "weak" ? (
                    <span className="text-[#6b7289]">Is it {row.tool?.name}?</span>
                  ) : (
                    <span className="text-[#6b7289]">Pick one</span>
                  )}
                  {row.status === "matched" && row.yearly && <span className="rounded-full bg-[#fff7ed] px-2 py-0.5 text-[12px] text-[#9a3412]">${Number(row.yearly).toLocaleString("en-US")} typical</span>}
                  {row.kind === "server" && preset !== "server" && <span className="text-[12px] text-[#6b7289]">Server</span>}
                </div>
                {row.existing && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={`rounded-full border px-2 py-0.5 text-[12px] ${row.keep ? "border-[#5b4ce6] bg-[#ece9ff]" : "border-[#e6e8ee]"}`} onClick={() => patch(row.key, { keep: true })}>Keep as is</button>
                    <button type="button" className={`rounded-full border px-2 py-0.5 text-[12px] ${row.keep ? "border-[#e6e8ee]" : "border-[#5b4ce6] bg-[#ece9ff]"}`} onClick={() => patch(row.key, { keep: false })}>Update it?</button>
                  </div>
                )}
                {row.status === "pick" && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {row.options.map((tool) => (
                      <button key={tool.name} type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[12px]" onClick={() => patch(row.key, { status: "matched", tool })}>{tool.name}</button>
                    ))}
                  </div>
                )}
                {row.status === "weak" && (
                  <div className="mt-2 flex gap-2">
                    <button type="button" className="rounded-full border border-[#c9c6f5] px-2 py-0.5 text-[12px]" onClick={() => patch(row.key, { status: "matched", name: row.tool?.name || row.name })}>Yes</button>
                    <button type="button" className="rounded-full border border-[#e6e8ee] px-2 py-0.5 text-[12px]" onClick={() => patch(row.key, { status: "custom", tool: null, yearly: "" })}>No, it's custom</button>
                  </div>
                )}
                {row.status === "custom" && !row.existing && (
                  <label className="mt-2 flex items-center gap-2 text-[12px] text-[#4b5163]">
                    <input type="checkbox" checked={row.customBuilt} onChange={(event) => patch(row.key, { customBuilt: event.target.checked })} />
                    We built it ourselves
                  </label>
                )}
                {row.hint && <p className="mt-2 text-[12px] text-[#9a3412]">{row.hint}</p>}
                {one && hostingRows.some((item) => item.key === row.key) && (
                  <HostingChoices row={row} servers={servers} listId={listId} showName={false} onChange={(change) => patch(row.key, change)} />
                )}
                {one && !row.existing && (
                  <input value={row.ownerTeam} onChange={(event) => patch(row.key, { ownerTeam: event.target.value })} placeholder="Owner (optional)" className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
                )}
              </li>
            ))}
          </ul>
          {!one && hostingRows.length > 0 && (
            <div className="mt-3 space-y-3">
              <h3 className="text-[14px] font-semibold text-[#1c2230]">Where does each one live?</h3>
              {hostingRows.map((row) => (
                <HostingChoices key={row.key} row={row} servers={servers} listId={listId} onChange={(change) => patch(row.key, change)} />
              ))}
            </div>
          )}
          {!one && creating.length > 1 && (
            <div className="mt-3 overflow-x-auto">
              <h3 className="text-[14px] font-semibold text-[#1c2230]">Owners and renewals</h3>
              <p className="mt-1 text-[12px] text-[#6b7289]">All optional. Empty cells are the ones still open.</p>
              <table className="mt-2 w-full text-left text-[13px]">
                <thead className="text-[12px] text-[#8b90a0]">
                  <tr>{["Name", "Owner team", "Named owner", "Renewal", "Yearly cost"].map((heading) => <th key={heading} className="px-2 py-1 font-medium">{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {creating.map((row) => (
                    <tr key={row.key}>
                      <td className="px-2 py-1">{row.name}</td>
                      <td className="px-2 py-1"><input value={row.ownerTeam} onChange={(event) => patch(row.key, { ownerTeam: event.target.value })} className={`h-8 w-full min-w-[7rem] rounded-lg border px-2 ${row.ownerTeam ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`} /></td>
                      <td className="px-2 py-1"><input value={row.ownerName} onChange={(event) => patch(row.key, { ownerName: event.target.value })} className={`h-8 w-full min-w-[7rem] rounded-lg border px-2 ${row.ownerName ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`} /></td>
                      <td className="px-2 py-1"><input type="date" value={row.renewal} onChange={(event) => patch(row.key, { renewal: event.target.value })} className={`h-8 w-full rounded-lg border px-2 ${row.renewal ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`} /></td>
                      <td className="px-2 py-1">
                        <input value={row.yearly} onChange={(event) => patch(row.key, { yearly: event.target.value })} className={`h-8 w-24 rounded-lg border px-2 ${row.yearly ? "border-[#e6e8ee]" : "border-[#fdba74] bg-[#fff7ed]"}`} />
                        {row.status === "matched" && row.tool?.typicalAnnual && row.yearly === String(row.tool.typicalAnnual) && <span className="ml-1 text-[11px] text-[#9a3412]">typical</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3 flex items-center gap-3">
            <button type="button" disabled={busy || rows.every((row) => row.existing && row.keep)} onClick={() => void run(save)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50">
              {busy ? "Saving…" : creating.length ? addButtonLabel(creating) : "Update"}
            </button>
            <button type="button" className="text-[13px] text-[#6b7289]" onClick={dismiss}>Cancel</button>
          </div>
        </>
      )}

      {receipt && (
        <div className="mt-3 rounded-xl border border-[#e4e0ff] bg-[#f7f6ff] px-3 py-2 text-[13px] text-[#1c2230]">
          <p>{receipt.added}</p>
          {receipt.home && <p className="mt-1 text-[#4b5163]">{receipt.home}</p>}
          <div className="mt-2 flex gap-3">
            {canUndo && <button type="button" className="text-[13px] font-medium text-[#3f35b5]" onClick={() => void run(undo)}>Undo</button>}
            <button type="button" className="text-[13px] text-[#6b7289]" onClick={cancelReview}>Cancel</button>
          </div>
          {receipt.todos.length > 0 && <p className="mt-2">Your to-do list: {receipt.todos.length} new {receipt.todos.length === 1 ? "item" : "items"}</p>}
          {receipt.mapReady && <p className="mt-2 font-medium">Your map is ready.</p>}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-[#b42318]">{error}</p>}
      <datalist id={listId}>{servers.map((name) => <option key={name} value={name} />)}</datalist>
    </section>
  );
}

function HostingChoices({
  row,
  servers,
  listId,
  showName = true,
  onChange,
}: {
  row: PlanInput;
  servers: string[];
  listId: string;
  showName?: boolean;
  onChange: (change: Partial<PlanInput>) => void;
}) {
  return (
    <div className="mt-2">
      {showName && <div className="text-[13px] font-medium text-[#1c2230]">{row.name}</div>}
      <div className="mt-1 flex flex-wrap gap-1.5">
        {hostingChoices(row.kind).map(({ choice, label }) => (
          <button key={choice} type="button" onClick={() => onChange({ choice, serverName: choice === "own" ? row.serverName || servers[0] || "" : "" })} className={`rounded-full border px-2 py-0.5 text-[12px] ${row.choice === choice ? "border-[#5b4ce6] bg-[#ece9ff]" : "border-[#e6e8ee]"}`}>
            {row.kind === "platform" ? label : choice === "saas" ? "SaaS (cloud)" : label}
          </button>
        ))}
      </div>
      {row.choice === "own" && (
        <>
          <input value={row.serverName} list={listId} onChange={(event) => onChange({ serverName: event.target.value })} placeholder="Server name" className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
          <input value={row.where} onChange={(event) => onChange({ where: event.target.value })} placeholder="Where is it?" className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
        </>
      )}
    </div>
  );
}
