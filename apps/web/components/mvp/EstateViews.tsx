"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, modelPath, sectionForKind } from "@/lib/mvp-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { connectionPhrase, impactOf, type ImpactHit, type ImpactNode } from "@/lib/impact/relationship-impact";
import { moneyLabel, vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { noHostLinked, readPlatformInfra, readRuntimeInfra } from "@/lib/infra/read";
import { infraStatus } from "@/lib/infra/status";
import { cn } from "@/lib/utils";

const TABS = [
  ["impact", "Impact"],
  ["flow", "Data flow"],
  ["hosting", "Hosting & location"],
  ["vendors", "Vendors"],
  ["roadmap", "Roadmap"],
  ["protection", "Protection"],
] as const;

const HOW = [
  ["api", "API"],
  ["file", "File"],
  ["manual", "Manual"],
  ["integration_tool", "Integration tool"],
] as const;

const OFTEN = [
  ["realtime", "Real time"],
  ["daily", "Daily"],
  ["ad_hoc", "Ad hoc"],
] as const;

type Line = { x1: number; y1: number; x2: number; y2: number; stroke: string; dash?: string };

function ownerOf(row: CatalogRow | undefined): string {
  if (!row) return "";
  return row.ownerTeam || row.ownerPerson;
}

export function EstateViews() {
  const params = useSearchParams();
  const tab = params.get("tab") || "impact";
  const { basePath } = useTenancy();
  const sel = params.get("sel") ?? "";

  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[11px] font-semibold tracking-[0.16em] text-[#8b90a0]">VIEWS</span>
          <ViewTitle tab={tab} />
        </div>
        {tab === "flow" ? <DrawFlowButton /> : tab === "hosting" ? (
          <Link href={modelPath(basePath, "locations")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] text-[#1c2230]">Locations</Link>
        ) : (
          <AskAbout tab={tab} sel={sel} />
        )}
      </div>
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#eef0f4]">
        <div className="flex gap-5 text-[14px]">
          {TABS.map(([id, label]) => (
            <Link
              key={id}
              href={`${basePath}/views?tab=${id}${sel ? `&sel=${sel}` : ""}`}
              className={cn("-mb-px pb-2.5", tab === id ? "border-b-2 border-[#5b4ce6] font-semibold text-[#1c2230]" : "text-[#6b7280]")}
            >
              {label}
              {id === "protection" && <span className="ml-1.5 rounded bg-[#f3f4f8] px-1.5 py-0.5 text-[10px] font-medium text-[#8b90a0]">phase 2</span>}
            </Link>
          ))}
        </div>
        <Link href={`${basePath}/views/foundations`} className="mb-2 text-[12px] text-[#8b90a0]">Estate map <span className="rounded bg-[#f3f4f8] px-1.5 py-0.5">optional</span></Link>
      </div>
      {tab === "flow" && <DataFlowView />}
      {tab === "hosting" && <HostingView />}
      {tab === "vendors" && <VendorsView />}
      {tab === "roadmap" && <RoadmapView />}
      {tab === "protection" && (
        <p className="max-w-xl text-[14px] leading-6 text-[#4b5163]">Backup and firewall links are phase 2. They will not change what happens when something goes down.</p>
      )}
      {(tab === "impact" || !TABS.some(([id]) => id === tab)) && <ImpactView />}
    </div>
  );
}

function AskAbout({ tab, sel }: { tab: string; sel: string }) {
  const { basePath } = useTenancy();
  const impact = useImpactGraph();
  const name = impact.nodes.find((node) => node.id === sel)?.name;
  const question = tab === "impact" && name ? `What happens if ${name} goes down?` : "";
  if (!question) return null;
  return <Link href={askPath(basePath, question)} className="shrink-0 text-[13px] text-[#5b4ce6]">Ask about this →</Link>;
}

function ViewTitle({ tab }: { tab: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { basePath } = useTenancy();
  const impact = useImpactGraph();
  const sel = params.get("sel") ?? "";
  if (tab !== "impact") {
    const titles: Record<string, string> = {
      flow: "How does our data move?",
      hosting: "Where does everything live?",
      vendors: "Who do we depend on?",
      roadmap: "What's our plan?",
      protection: "How are we protected?",
    };
    return <h1 className="text-[22px] font-semibold tracking-tight text-[#1c2230]">{titles[tab] ?? "Views"}</h1>;
  }
  return (
    <h1 className="flex min-w-0 flex-wrap items-center gap-2 text-[22px] font-semibold tracking-tight text-[#1c2230]">
      What happens if
      <select
        aria-label="What goes down"
        value={sel}
        onChange={(event) => router.replace(`${basePath}/views?tab=impact&sel=${event.target.value}`)}
        className="h-10 max-w-[280px] rounded-lg border border-[#e6e8ee] bg-white px-3 text-[16px] font-semibold text-[#1c2230] shadow-sm"
      >
        <option value="">Choose…</option>
        {impact.nodes.map((node) => (
          <option key={node.id} value={node.id}>{node.name}</option>
        ))}
      </select>
      goes down?
    </h1>
  );
}

function ImpactView() {
  const params = useSearchParams();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const sel = params.get("sel") ?? "";
  const rows = catalog.data?.rows ?? [];
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const source = impact.nodes.find((node) => node.id === sel);
  const sourceRow = rowById.get(sel);
  const hits = source ? impactOf(impact.nodes, impact.edges, sel) : [];
  const bands = useMemo(() => groupBands(hits, rowById), [hits, rowById]);
  const [picker, setPicker] = useState<"runs" | "calls" | null>(null);
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);

  const link = useMutation({
    mutationFn: async (other: CatalogRow) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug || !source) throw new Error("Not signed in");
      const target = rowById.get(source.id);
      if (picker === "calls") {
        await relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "calls",
          from_object_id: other.id,
          from_type: other.object.type,
          to_object_id: source.id,
          to_type: target?.object.type ?? "application",
        }, token);
        return;
      }
      await relationshipsApi.create(orgSlug, workspaceSlug, {
        type: "runs_on",
        from_object_id: other.id,
        from_type: other.object.type,
        to_object_id: source.id,
        to_type: target?.object.type ?? "model",
      }, token);
    },
    onSuccess: () => {
      setPicker(null);
      setError("");
      queryClient.invalidateQueries({ queryKey: ["impact-relationships", orgSlug, workspaceSlug] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug || !sourceRow) throw new Error("This item is not in the model yet");
      await objectsApi.update(orgSlug, workspaceSlug, sourceRow.id, {
        properties: { impact_confirmed_at: new Date().toISOString().slice(0, 10) },
      }, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["model-catalog", orgSlug, workspaceSlug] }),
  });

  const affectedApps = [...bands.stop, ...bands.slow].map((hit) => rowById.get(hit.id)).filter((row): row is CatalogRow => Boolean(row));
  const noOwner = affectedApps.filter((row) => row.missing.owner);
  const noCriticality = affectedApps.filter((row) => row.missing.criticality);
  const outOfSupport = [sourceRow, ...hits.map((hit) => rowById.get(hit.id))]
    .filter((row): row is CatalogRow => row?.kind === "runtime")
    .filter((row) => {
      const status = infraStatus(readRuntimeInfra(row.object), new Date());
      return status.status === "out_of_support" || status.status === "unsupported_os";
    });
  const confirmed = String((sourceRow?.object.properties ?? {}).impact_confirmed_at ?? "");
  const teams = teamBoxes(affectedApps);
  const openCount = (noOwner.length ? 1 : 0) + (noCriticality.length ? 1 : 0) + (outOfSupport.length ? 1 : 0) + (confirmed ? 0 : 1);
  const lines = useConnectors(canvasRef, `${sel}:${hits.map((hit) => hit.id).join(",")}:${picker ?? ""}:${teams.length}:${noOwner.length}`);

  const sourceStatus = sourceRow?.kind === "runtime" ? infraStatus(readRuntimeInfra(sourceRow.object), new Date()) : null;
  const sourceKind = sourceRow?.kind === "runtime"
    ? readRuntimeInfra(sourceRow.object).kindLabel || sourceRow.typeLabel
    : sourceRow?.kind === "platform"
      ? readPlatformInfra(sourceRow.object).kindLabel || sourceRow.typeLabel
      : source?.typeLabel ?? "";
  const sourceNote = [sourceKind, sourceStatus && sourceStatus.severity === "bad" ? "out of support" : ""].filter(Boolean).join(" · ");

  return (
    <div className="flex items-start gap-5">
      <div className="min-w-0 flex-1">
        <p className="mb-1 text-[13px]">
          {hits.length === 0 && source ? (
            <span className="text-[#6b7280]">Nothing in your model depends on {source.name}.</span>
          ) : (
            <span className="flex flex-wrap gap-x-3">
              {bands.stop.length > 0 && <span className="font-medium text-[#e11d48]">{bands.stop.length} apps stop</span>}
              {bands.slow.length > 0 && <span className="font-medium text-[#b45309]">{bands.slow.length} slows down</span>}
              {bands.capabilities.length > 0 && <span className="font-medium text-[#7c3aed]">{bands.capabilities.length} capabilities hit</span>}
              {teams.length > 0 && <span className="font-medium text-[#4b5163]">{teams.length} teams to call</span>}
              {noOwner.length > 0 && <span className="font-medium text-[#b45309]">{noOwner.length} with no owner</span>}
            </span>
          )}
        </p>
        <p className="mb-3 text-[12px] text-[#8b90a0]">Read bottom to top. Lines show why each item is hit (hover a box for the full path).</p>
        <div ref={canvasRef} className="relative overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
            {lines.map((line, index) => (
              <path
                key={index}
                d={`M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`}
                fill="none"
                stroke={line.stroke}
                strokeWidth="1.4"
                strokeDasharray={line.dash}
              />
            ))}
          </svg>
          <Lane label="Teams to call">
            {teams.map((team) => (
              <Box key={team.name} node={`team:${team.name}`} tone="team" title={team.name} subtitle={team.apps} />
            ))}
            {noOwner.map((row) => (
              <Box key={row.id} node={`gap:${row.id}`} tone="gap" title="No owner" subtitle={row.name} />
            ))}
          </Lane>
          <Lane label="Capabilities hit">
            {bands.capabilities.map((hit) => (
              <HitBox key={hit.id} hit={hit} nodes={impact.nodes} row={rowById.get(hit.id)} tone="capability" />
            ))}
          </Lane>
          <Lane label="Apps that slow down">
            {bands.slow.map((hit) => (
              <HitBox key={hit.id} hit={hit} nodes={impact.nodes} row={rowById.get(hit.id)} tone="slow" />
            ))}
            {source && <AddButton label="+ Another app needs one" onClick={() => setPicker(picker === "calls" ? null : "calls")} />}
          </Lane>
          <Lane label="Apps that stop">
            {bands.stop.map((hit) => (
              <HitBox key={hit.id} hit={hit} nodes={impact.nodes} row={rowById.get(hit.id)} tone="stop" />
            ))}
            {source && <AddButton label="+ Something else runs on it" onClick={() => setPicker(picker === "runs" ? null : "runs")} />}
          </Lane>
          {bands.infra.length > 0 && (
            <Lane label="Infrastructure that goes with it">
              {bands.infra.map((hit) => (
                <HitBox key={hit.id} hit={hit} nodes={impact.nodes} row={rowById.get(hit.id)} tone="infra" />
              ))}
            </Lane>
          )}
          <Lane label="Goes down">
            {source && <Box node={source.id} tone="down" title={source.name} subtitle={sourceNote} />}
          </Lane>
        </div>
        {picker && (
          <div className="mt-3 max-w-md rounded-xl border border-[#e6e8ee] bg-white p-3 shadow-sm">
            <p className="mb-2 text-[13px] font-medium text-[#1c2230]">{picker === "runs" ? "What else runs on it?" : "Which app needs it?"}</p>
            <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
              {rows.filter((row) => row.kind === "application" && row.id !== sel).map((row) => (
                <button key={row.id} type="button" onClick={() => link.mutate(row)} className="rounded-full border border-[#e6e8ee] bg-white px-2.5 py-1 text-[12px] text-[#1c2230] hover:border-[#c4b5fd]">{row.name}</button>
              ))}
            </div>
            {error && <p className="mt-2 text-[12px] text-[#b42318]">{error}</p>}
          </div>
        )}
      </div>
      <aside className="w-[300px] shrink-0 rounded-xl border border-[#e6e8ee] bg-white p-4">
        <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">
          <span className="text-[#16a34a]">✓</span> TO DO FOR THIS VIEW <span className="text-[#1c2230]">{openCount}</span>
        </p>
        {noOwner.map((row) => (
          <TodoItem key={row.id} title={`${row.name} has no owner`} body="Nobody to call when it stops." action="Add owner team" href={modelItemPath(basePath, sectionForKind(row.kind), row.id)} />
        ))}
        {noCriticality.length > 0 && (
          <TodoItem title="Criticality is not set" body={noCriticality.map((row) => row.name).join(", ")} action="Open the first one" href={modelItemPath(basePath, "applications", noCriticality[0]!.id)} />
        )}
        {outOfSupport.map((row) => {
          const status = infraStatus(readRuntimeInfra(row.object), new Date());
          return <TodoItem key={row.id} title={`${row.name} is out of support`} body={status.reason} action="Open record" href={modelItemPath(basePath, "servers", row.id)} />;
        })}
        <label className="mt-1 flex items-start gap-2 text-[13px]">
          <input type="checkbox" className="mt-1" checked={Boolean(confirmed)} onChange={() => { if (!confirmed) confirm.mutate(); }} />
          <span>
            <span className="font-medium text-[#1c2230]">Is this list complete?</span>
            <span className="mt-0.5 block text-[12px] leading-5 text-[#8b90a0]">Check that nothing else runs on {source?.name ?? "it"}.</span>
            {confirmed && <span className="mt-0.5 block text-[12px] text-[#16a34a]">Confirmed {confirmed}</span>}
          </span>
        </label>
      </aside>
    </div>
  );
}

function teamBoxes(apps: CatalogRow[]): { name: string; apps: string }[] {
  const map = new Map<string, string[]>();
  for (const app of apps) {
    const owner = ownerOf(app);
    if (!owner) continue;
    map.set(owner, [...(map.get(owner) ?? []), app.name]);
  }
  return [...map.entries()].map(([name, names]) => ({ name, apps: names.join(", ") }));
}

function groupBands(hits: ImpactHit[], rowById: Map<string, CatalogRow>) {
  const stop: ImpactHit[] = [];
  const slow: ImpactHit[] = [];
  const capabilities: ImpactHit[] = [];
  const infra: ImpactHit[] = [];
  for (const hit of hits) {
    const row = rowById.get(hit.id);
    if (hit.severity === "loses_support") capabilities.push(hit);
    else if (row?.kind === "application" && hit.severity === "degraded") slow.push(hit);
    else if (row?.kind === "application") stop.push(hit);
    else if (row?.kind === "runtime" || row?.kind === "platform") infra.push(hit);
    else capabilities.push(hit);
  }
  return { stop, slow, capabilities, infra };
}

function useConnectors(rootRef: React.RefObject<HTMLDivElement | null>, key: string) {
  const [lines, setLines] = useState<Line[]>([]);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const rootRect = root.getBoundingClientRect();
      const spot = new Map<string, { cx: number; top: number; bottom: number }>();
      root.querySelectorAll<HTMLElement>("[data-node]").forEach((el) => {
        const id = el.dataset.node;
        if (!id) return;
        const rect = el.getBoundingClientRect();
        spot.set(id, {
          cx: rect.left - rootRect.left + rect.width / 2,
          top: rect.top - rootRect.top,
          bottom: rect.bottom - rootRect.top,
        });
      });
      const next: Line[] = [];
      root.querySelectorAll<HTMLElement>("[data-parent]").forEach((el) => {
        const parent = el.dataset.parent;
        const self = el.dataset.node;
        if (!parent || !self) return;
        const from = spot.get(self);
        const to = spot.get(parent);
        if (!from || !to) return;
        const lower = from.top > to.top ? from : to;
        const upper = from.top > to.top ? to : from;
        next.push({
          x1: lower.cx,
          y1: lower.top,
          x2: upper.cx,
          y2: upper.bottom,
          stroke: el.dataset.stroke || "#c5c8d4",
          dash: el.dataset.dash,
        });
      });
      setLines((prev) => (sameLines(prev, next) ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    return () => observer.disconnect();
  }, [rootRef, key]);
  return lines;
}

function sameLines(prev: Line[], next: Line[]): boolean {
  return prev.length === next.length && prev.every((line, index) => {
    const other = next[index];
    return other && line.x1 === other.x1 && line.y1 === other.y1 && line.x2 === other.x2 && line.y2 === other.y2 && line.stroke === other.stroke;
  });
}

function Lane({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-[76px] items-center border-b border-[#f3f4f8] last:border-b-0">
      <div className="w-[148px] shrink-0 px-4 text-[12px] text-[#8b90a0]">{label}</div>
      <div className="flex flex-1 flex-wrap items-center justify-center gap-3 px-4 py-3">{children}</div>
    </div>
  );
}

function Box({
  node,
  parent,
  tone,
  title,
  subtitle,
  hover,
}: {
  node: string;
  parent?: string;
  tone: "team" | "gap" | "capability" | "slow" | "stop" | "infra" | "down";
  title: string;
  subtitle?: string;
  hover?: string;
}) {
  const stroke = tone === "stop" ? "#e11d48" : tone === "slow" || tone === "gap" ? "#d97706" : tone === "capability" ? "#7c3aed" : "#94a3b8";
  const dash = tone === "stop" ? undefined : "4 4";
  return (
    <div
      data-node={node}
      data-parent={parent}
      data-stroke={parent ? stroke : undefined}
      data-dash={parent ? dash : undefined}
      title={hover}
      className={cn(
        "relative z-[1] min-w-[132px] rounded-lg px-3 py-2 text-center",
        tone === "down" && "bg-[#14182b] text-white shadow-sm",
        tone === "stop" && "border border-[#f3b4b4] bg-[#fff6f6]",
        tone === "slow" && "border border-[#f3d19c] bg-[#fffbeb]",
        tone === "capability" && "border border-[#ddd0fb] bg-[#f7f3ff]",
        tone === "infra" && "border border-[#e6e8ee] bg-[#fafafb]",
        tone === "team" && "border border-[#e6e8ee] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        tone === "gap" && "border border-dashed border-[#f3d19c] bg-[#fffaf0]"
      )}
    >
      <div className={cn("text-[13px] font-semibold", tone === "gap" ? "text-[#b45309]" : tone === "down" ? "text-white" : "text-[#1c2230]")}>{title}</div>
      {subtitle && <div className={cn("mt-0.5 text-[11px]", tone === "down" ? "text-white/70" : "text-[#8b90a0]")}>{subtitle}</div>}
    </div>
  );
}

function HitBox({ hit, nodes, row, tone }: { hit: ImpactHit; nodes: ImpactNode[]; row?: CatalogRow; tone: "capability" | "slow" | "stop" | "infra" }) {
  const phrase = connectionPhrase(hit, nodes);
  const last = hit.path[hit.path.length - 1];
  const parent = last ? (last.fromId === hit.id ? last.toId : last.fromId) : undefined;
  const crit = row?.criticalityLabel || "";
  const detail = [crit, phrase ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : ""].filter(Boolean).join(" · ");
  return (
    <Box
      node={hit.id}
      parent={parent}
      tone={tone}
      title={hit.name}
      subtitle={detail}
      hover={hit.path.map((step) => step.label).join(" → ")}
    />
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-dashed border-[#d9d4fb] bg-[#faf9ff] px-3 py-2 text-[13px] text-[#6d5ef5]">
      {label}
    </button>
  );
}

function TodoItem({ title, body, action, href }: { title: string; body: string; action: string; href: string }) {
  return (
    <div className="mb-3 flex items-start gap-2">
      <span className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border border-[#d0d5dd]" />
      <div>
        <p className="text-[13px] font-semibold text-[#1c2230]">{title}</p>
        <p className="text-[12px] leading-5 text-[#8b90a0]">{body}</p>
        {action && href && <Link href={href} className="text-[12px] font-medium text-[#5b4ce6]">{action}</Link>}
      </div>
    </div>
  );
}

function DrawFlowButton() {
  return null;
}

function DataFlowView() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const flows = impact.relationships.filter((rel) => rel.type === "sends_data_to");
  const rows = catalog.data?.rows ?? [];
  const parties = catalog.data?.parties ?? [];
  const nameOf = (id: string) => impact.nodes.find((node) => node.id === id)?.name ?? "Item";
  const subOf = (id: string) => {
    const row = rows.find((item) => item.id === id);
    if (row) return row.ownerTeam || row.ownerPerson || row.typeLabel;
    if (parties.some((party) => party.id === id)) return "Outside the company";
    return "";
  };
  const [draw, setDraw] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [what, setWhat] = useState("");
  const [how, setHow] = useState<(typeof HOW)[number][0]>("api");
  const [often, setOften] = useState<(typeof OFTEN)[number][0]>("realtime");
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const from = [...rows, ...parties.map((party) => ({ id: party.id, object: party as MinEAObject }))].find((item) => item.id === fromId);
      const to = [...rows, ...parties.map((party) => ({ id: party.id, object: party as MinEAObject }))].find((item) => item.id === toId);
      if (!token || !orgSlug || !workspaceSlug || !from || !to) throw new Error("Pick both ends");
      await relationshipsApi.create(orgSlug, workspaceSlug, {
        type: "sends_data_to",
        from_object_id: from.id,
        from_type: from.object.type,
        to_object_id: to.id,
        to_type: to.object.type,
        attributes: { what, how, frequency: often },
      }, token);
    },
    onSuccess: () => {
      setDraw(false);
      setWhat("");
      queryClient.invalidateQueries({ queryKey: ["impact-relationships", orgSlug, workspaceSlug] });
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: async (rel: Relationship) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["impact-relationships", orgSlug, workspaceSlug] }),
  });

  const connected = new Set(flows.flatMap((rel) => [rel.from_object_id, rel.to_object_id]));
  const noFlows = rows.filter((row) => row.kind === "application" && !connected.has(row.id));
  const manual = flows.filter((rel) => rel.attributes.how === "manual" || rel.attributes.how === "file");
  const unowned = rows.filter((row) => connected.has(row.id) && row.missing.owner);

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={() => setDraw(true)} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">+ Draw a flow</button>
      </div>
      <div className="mb-4 rounded-xl border border-[#e6e8ee] bg-white px-4 py-3">
        <p className="mb-2 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">✓ TO DO FOR THIS VIEW {(noFlows.length ? 1 : 0) + (unowned.length ? 1 : 0) + (manual.length ? 1 : 0)}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {noFlows.length > 0 && <TodoItem title={`${noFlows.length} apps have no flows recorded`} body={noFlows.slice(0, 3).map((row) => row.name).join(", ")} action="" href="" />}
          {unowned.length > 0 && <TodoItem title={`${unowned[0]?.name} has no owner`} body="It moves data to other systems." action="" href="" />}
          {manual.length > 0 && <TodoItem title={`${manual.length} flows are manual or file drops`} body="Worth a look when you plan integrations." action="" href="" />}
          {noFlows.length === 0 && unowned.length === 0 && manual.length === 0 && <p className="text-[13px] text-[#8b90a0]">Nothing to fix on this view.</p>}
        </div>
      </div>
      <p className="mb-3 text-[13px] text-[#1c2230]">
        <span className="font-semibold">{flows.length} flows</span>
        <span className="ml-3 font-semibold">{connected.size} apps connected</span>
        <span className="ml-3 text-[#8b90a0]">Arrows point the way the data goes.</span>
      </p>
      <div className="rounded-xl border border-[#e6e8ee] bg-[#fafafb] p-5">
        <div className="space-y-3">
          {flows.map((rel) => (
            <div key={rel.id} className="flex flex-wrap items-center gap-2">
              <FlowNode name={nameOf(rel.from_object_id)} sub={subOf(rel.from_object_id)} party={parties.some((party) => party.id === rel.from_object_id)} />
              <div className="flex min-w-[120px] flex-1 items-center gap-2 text-[11px] text-[#6b7280]">
                <span className="h-px flex-1 bg-[#d0d5dd]" />
                <span className="text-center">
                  <span className="block font-medium text-[#1c2230]">{String(rel.attributes.what ?? "Data")}</span>
                  {labelOf(HOW, rel.attributes.how)} · {labelOf(OFTEN, rel.attributes.frequency)}
                </span>
                <span className="h-px flex-1 bg-[#d0d5dd]" />
                <span>→</span>
              </div>
              <FlowNode name={nameOf(rel.to_object_id)} sub={subOf(rel.to_object_id)} party={parties.some((party) => party.id === rel.to_object_id)} />
              <button type="button" onClick={() => remove.mutate(rel)} className="text-[12px] text-[#b42318]">Delete</button>
            </div>
          ))}
        </div>
        {noFlows.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-[11px] font-semibold tracking-wide text-[#b45309]">NO FLOWS RECORDED</p>
            <div className="flex flex-wrap gap-2">
              {noFlows.map((row) => (
                <button key={row.id} type="button" onClick={() => { setFromId(row.id); setDraw(true); }} className="rounded-lg border border-dashed border-[#f3d19c] bg-[#fffaf0] px-3 py-2 text-left">
                  <span className="block text-[13px] font-medium text-[#92400e]">{row.name}</span>
                  <span className="text-[11px] text-[#b45309]">Drag an arrow from here</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {draw && (
          <form className="ml-auto mt-4 w-full max-w-sm rounded-xl border border-[#e6e8ee] bg-white p-4 shadow-sm" onSubmit={(event) => { event.preventDefault(); save.mutate(); }}>
            <p className="mb-3 text-[14px] font-semibold text-[#1c2230]">What does {nameOf(fromId) === "Item" ? "it" : nameOf(fromId)} send to {nameOf(toId) === "Item" ? "…" : nameOf(toId)}?</p>
            <div className="mb-2 flex gap-2">
              <select aria-label="From" value={fromId} onChange={(event) => setFromId(event.target.value)} className="h-9 flex-1 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
                <option value="">From</option>
                {rows.filter((row) => row.kind === "application" || row.kind === "platform").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
              </select>
              <select aria-label="To" value={toId} onChange={(event) => setToId(event.target.value)} className="h-9 flex-1 rounded-lg border border-[#e6e8ee] px-2 text-[13px]">
                <option value="">To</option>
                {rows.filter((row) => row.kind === "application" || row.kind === "platform").map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
                {parties.map((party) => <option key={party.id} value={party.id}>{party.name}</option>)}
              </select>
            </div>
            <input value={what} onChange={(event) => setWhat(event.target.value)} placeholder="e.g. Completed orders, Customer record" className="mb-3 h-9 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px]" />
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#8b90a0]">HOW</p>
            <div className="mb-2 flex flex-wrap gap-1">{HOW.map(([id, label]) => <button key={id} type="button" onClick={() => setHow(id)} className={cn("rounded-full border px-2.5 py-1 text-[12px]", how === id ? "border-[#5b4ce6] bg-[#ece9ff] text-[#3f35b5]" : "border-[#e6e8ee]")}>{label}</button>)}</div>
            <p className="mb-1 text-[11px] font-semibold tracking-wide text-[#8b90a0]">HOW OFTEN</p>
            <div className="mb-3 flex flex-wrap gap-1">{OFTEN.map(([id, label]) => <button key={id} type="button" onClick={() => setOften(id)} className={cn("rounded-full border px-2.5 py-1 text-[12px]", often === id ? "border-[#5b4ce6] bg-[#ece9ff] text-[#3f35b5]" : "border-[#e6e8ee]")}>{label}</button>)}</div>
            {error && <p className="mb-2 text-[12px] text-[#b42318]">{error}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraw(false)} className="rounded-lg px-3 py-1.5 text-[13px] text-[#6b7280]">Cancel</button>
              <button type="submit" className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">Save arrow</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function FlowNode({ name, sub, party }: { name: string; sub: string; party?: boolean }) {
  return (
    <div className={cn("min-w-[140px] rounded-lg border bg-white px-3 py-2", party ? "border-dashed border-[#d0d5dd] bg-[#f8fafc]" : "border-[#e6e8ee]")}>
      <div className="text-[13px] font-semibold text-[#1c2230]">{name}</div>
      {sub && <div className="text-[11px] text-[#8b90a0]">{sub}</div>}
    </div>
  );
}

function labelOf(options: readonly (readonly [string, string])[], value: unknown): string {
  return options.find((option) => option[0] === value)?.[1] ?? "";
}

function HostingView() {
  const { orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const rows = catalog.data?.rows ?? [];
  const locations = catalog.data?.locations ?? [];
  const [error, setError] = useState("");

  const place = useMutation({
    mutationFn: async ({ appId, hostId }: { appId: string; hostId: string }) => {
      const token = await getToken();
      const app = rows.find((row) => row.id === appId);
      const host = rows.find((row) => row.id === hostId);
      if (!token || !orgSlug || !workspaceSlug || !app || !host) throw new Error("Could not link those");
      if (!window.confirm(`${app.name} runs on ${host.name}?`)) return;
      await relationshipsApi.create(orgSlug, workspaceSlug, {
        type: host.kind === "platform" ? "built_on" : "runs_on",
        from_object_id: app.id,
        from_type: app.object.type,
        to_object_id: host.id,
        to_type: host.object.type,
      }, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["impact-relationships", orgSlug, workspaceSlug] }),
    onError: (err: Error) => setError(err.message),
  });

  const appsOn = (hostId: string) =>
    rows.filter((row) => row.kind === "application" && impact.edges.some((edge) => edge.fromId === row.id && edge.toId === hostId && (edge.type === "runs_on" || edge.type === "built_on")));
  const vmsOn = (hostId: string) =>
    rows.filter((row) => row.kind === "runtime" && impact.edges.some((edge) => edge.type === "runs_on" && edge.fromId === row.id && edge.toId === hostId));
  const atLocation = (locationId: string) =>
    rows.filter((row) => (row.kind === "runtime" || row.kind === "platform") && impact.relationships.some((rel) => rel.type === "located_at" && rel.from_object_id === row.id && rel.to_object_id === locationId));
  const homeless = rows.filter((row) => row.kind === "application" && noHostLinked({ type: row.object.type, properties: (row.object.properties ?? {}) as Record<string, unknown> }, impact.edges, row.id));
  const noLocation = rows.filter((row) => {
    if (row.kind !== "runtime") return false;
    const located = impact.relationships.some((rel) => rel.type === "located_at" && rel.from_object_id === row.id);
    const nested = impact.edges.some((edge) => edge.type === "runs_on" && edge.fromId === row.id);
    return !located && !nested;
  });
  const platforms = rows.filter((row) => row.kind === "platform");
  const placed = rows.filter((row) => row.kind === "runtime" && impact.relationships.some((rel) => rel.type === "located_at" && rel.from_object_id === row.id)).length;

  return (
    <div>
      <p className="mb-4 text-[13px] text-[#4b5163]">
        <span className="font-semibold">{locations.length} locations</span>
        <span className="ml-3 font-semibold">{placed} servers & devices placed</span>
        {homeless.length > 0 && <span className="ml-3 font-semibold text-[#b45309]">{homeless.length} app{homeless.length === 1 ? "" : "s"} with no home</span>}
        <span className="ml-3 text-[#8b90a0]">Drag an app into a box to say it runs there.</span>
      </p>
      <div className="flex items-start gap-5">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {locations.map((location) => (
              <section key={location.id} className="rounded-xl border border-[#e6e8ee] bg-white p-3">
                <h2 className="text-[14px] font-semibold text-[#1c2230]">{location.name}</h2>
                <p className="mb-2 text-[12px] text-[#8b90a0]">{typeof location.properties.address === "string" ? location.properties.address : "No address"}</p>
                <div className="space-y-2">
                  {atLocation(location.id).map((host) => (
                    <HostCard key={host.id} host={host} apps={appsOn(host.id)} vms={vmsOn(host.id)} appsOn={appsOn} onDrop={(appId) => place.mutate({ appId, hostId: host.id })} />
                  ))}
                </div>
              </section>
            ))}
          </div>
          <section className="rounded-xl bg-[#f4f7fb] p-4">
            <h2 className="mb-3 text-[14px] font-semibold text-[#1c2230]">Cloud & SaaS <span className="text-[12px] font-normal text-[#8b90a0]">Run by a provider</span></h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {platforms.map((platform) => (
                <HostCard key={platform.id} host={platform} apps={appsOn(platform.id)} vms={[]} appsOn={appsOn} onDrop={(appId) => place.mutate({ appId, hostId: platform.id })} />
              ))}
            </div>
          </section>
          {error && <p className="text-[12px] text-[#b42318]">{error}</p>}
        </div>
        <aside className="w-[300px] shrink-0 rounded-xl border border-[#e6e8ee] bg-white p-4">
          <p className="mb-3 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">✓ TO DO FOR THIS VIEW {(homeless.length ? 1 : 0) + (noLocation.length ? 1 : 0)}</p>
          {homeless.length > 0 && (
            <div className="mb-4">
              <p className="text-[13px] font-semibold text-[#1c2230]">Apps with no home</p>
              <p className="mb-2 text-[12px] text-[#8b90a0]">Probably on a PC or server. Drag it onto the box it runs on.</p>
              <div className="flex flex-wrap gap-1.5">
                {homeless.map((row) => (
                  <span key={row.id} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", row.id)} className="cursor-grab rounded-full border border-[#ddd0fb] bg-[#f7f3ff] px-2 py-1 text-[12px] text-[#5b4ce6]">{row.name}</span>
                ))}
              </div>
            </div>
          )}
          {noLocation.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-[#1c2230]">Servers with no location</p>
              {noLocation.map((row) => <p key={row.id} className="mt-1 text-[13px] text-[#4b5163]">{row.name}</p>)}
            </div>
          )}
          {homeless.length === 0 && noLocation.length === 0 && <p className="text-[13px] text-[#8b90a0]">Everything shown has a home and a location.</p>}
        </aside>
      </div>
    </div>
  );
}

function HostCard({
  host,
  apps,
  vms,
  appsOn,
  onDrop,
}: {
  host: CatalogRow;
  apps: CatalogRow[];
  vms: CatalogRow[];
  appsOn: (id: string) => CatalogRow[];
  onDrop: (appId: string) => void;
}) {
  const kind = host.kind === "platform" ? readPlatformInfra(host.object).kindLabel : readRuntimeInfra(host.object).kindLabel || host.typeLabel;
  return (
    <div
      className="rounded-lg border border-[#e6e8ee] bg-white p-2.5"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        const appId = event.dataTransfer.getData("text/plain");
        if (appId) onDrop(appId);
      }}
    >
      <p className="text-[13px] font-semibold text-[#1c2230]">{host.name} <span className="font-normal text-[#8b90a0]">{kind}</span></p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {apps.map((app) => <span key={app.id} className="rounded-full bg-[#f3eaff] px-2 py-0.5 text-[11px] text-[#5b4ce6]">{app.name}</span>)}
        {apps.length === 0 && vms.length === 0 && <span className="text-[11px] text-[#c5c8d4]">No apps linked</span>}
      </div>
      {vms.length > 0 && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {vms.map((vm) => (
            <div key={vm.id} className="rounded-md border border-[#eef0f4] p-2">
              <p className="text-[12px] font-medium text-[#1c2230]">{vm.name}</p>
              <p className="text-[11px] text-[#8b90a0]">{readRuntimeInfra(vm.object).kindLabel || "VM"}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {appsOn(vm.id).map((app) => <span key={app.id} className="rounded-full bg-[#f3eaff] px-2 py-0.5 text-[11px] text-[#5b4ce6]">{app.name}</span>)}
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-2 text-[11px] text-[#c4b5fd]">+ Drop an app here</p>
    </div>
  );
}

function VendorsView() {
  const catalog = useModelCatalog();
  const vendors = vendorRollup(catalog.data?.rows ?? []);
  const missing = (catalog.data?.rows ?? []).filter((row) => row.missing.vendor && (row.kind === "application" || row.kind === "platform"));
  return (
    <div>
      {missing.length > 0 && <p className="mb-3 text-[13px] text-[#b45309]">{missing.length} applications or platforms have no vendor</p>}
      <div className="grid gap-2 md:grid-cols-2">
        {vendors.map((vendor) => (
          <div key={vendor.vendor} className="flex items-center justify-between rounded-xl border border-[#e6e8ee] bg-white px-4 py-3 text-[13px]">
            <span className="font-semibold text-[#1c2230]">{vendor.vendor}</span>
            <span className="text-[#6b7280]">{vendor.items.length} · {moneyLabel(vendor.annual)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RoadmapView() {
  const impact = useImpactGraph();
  const replaces = impact.relationships.filter((rel) => rel.type === "replaces");
  const nameOf = (id: string) => impact.nodes.find((node) => node.id === id)?.name ?? id;
  return (
    <div className="space-y-2">
      {replaces.length === 0 && <p className="text-[14px] text-[#4b5163]">Nothing is recorded as replacing something else.</p>}
      {replaces.map((rel) => (
        <div key={rel.id} className="rounded-xl border border-[#e6e8ee] bg-white px-4 py-3 text-[14px] text-[#1c2230]">
          <span className="font-semibold">{nameOf(rel.from_object_id)}</span> replaces {nameOf(rel.to_object_id)}
        </div>
      ))}
    </div>
  );
}
