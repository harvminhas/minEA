"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Cloud, Database, Server } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { MinEAObject, Relationship } from "@minea/types";
import { objectsApi, relationshipsApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, modelPath } from "@/lib/mvp-paths";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { applyCatalogWrite, useModelCatalog } from "@/lib/use-model-catalog";
import { AddFlow } from "@/components/add/AddFlow";
import { FirstRunAsk } from "@/components/mvp/FirstRunAsk";
import { addAnywhereEnabled } from "@/lib/flags";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { connectionPhrase, impactOf, type ImpactHit, type ImpactNode } from "@/lib/impact/relationship-impact";
import { moneyLabel, vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { singlePoints, hostingMap } from "@/lib/reports/home";
import {
  backupGapCount,
  chainRunDollars,
  chainTodos,
  collapsedCopy,
  groupChain,
  impactCandidates,
  laneDelayMs,
  manualFlowCount,
  openingCards,
  replaceLoneLocation,
  resolveSelection,
  showExampleEstate,
  spofCaption,
  viewBadges,
  viewsMotionCss,
  type ChainItem,
  type ChainTodo,
} from "@/lib/views/opening";
import { sampleEdges, sampleItems, sampleNodes } from "@/lib/views/sample-estate";
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

type Line = { x1: number; y1: number; x2: number; y2: number; stroke: string; dash?: string; delay: number };

export function EstateViews() {
  const params = useSearchParams();
  const tab = params.get("tab") || "impact";
  const { basePath } = useTenancy();
  const opening = useOpeningModel();
  const sel = opening.example ? "" : (params.get("sel") ?? "");

  return (
    <div className="px-8 py-6">
      <style>{viewsMotionCss}</style>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-[11px] font-semibold tracking-[0.16em] text-[#8b90a0]">VIEWS</span>
          <ViewTitle tab={tab} opening={opening} />
        </div>
        {tab === "flow" ? <DrawFlowButton /> : tab === "hosting" ? (
          <Link href={modelPath(basePath, "locations")} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] text-[#1c2230]">Locations</Link>
        ) : tab === "impact" ? (
          <AskAbout name={opening.items.find((item) => item.id === opening.selectedId)?.name ?? ""} />
        ) : null}
      </div>
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-[#eef0f4]">
        <div className="flex gap-5 text-[14px]">
          {TABS.map(([id, label]) => {
            const badge = opening.badges.find((item) => item.tab === id);
            const warm = id === "flow" || id === "hosting";
            return (
              <Link
                key={id}
                href={`${basePath}/views?tab=${id}${sel ? `&sel=${sel}` : ""}`}
                className={cn("-mb-px flex items-center pb-2.5", tab === id ? "border-b-2 border-[#5b4ce6] font-semibold text-[#1c2230]" : "text-[#6b7280]")}
              >
                {label}
                {badge && (
                  <span className={cn("ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium", warm ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#fff1f2] text-[#e11d48]")}>
                    {badge.label}
                  </span>
                )}
                {id === "protection" && <span className="ml-1.5 rounded bg-[#f3f4f8] px-1.5 py-0.5 text-[10px] font-medium text-[#8b90a0]">phase 2</span>}
              </Link>
            );
          })}
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
      {(tab === "impact" || !TABS.some(([id]) => id === tab)) && <ImpactView opening={opening} />}
    </div>
  );
}

function AskAbout({ name }: { name: string }) {
  const { basePath } = useTenancy();
  if (!name) return null;
  return <Link href={askPath(basePath, `What happens if ${name} goes down?`)} className="shrink-0 text-[13px] text-[#5b4ce6]">Ask about this →</Link>;
}

function ViewTitle({ tab, opening }: { tab: string; opening: OpeningModel }) {
  const router = useRouter();
  const { basePath } = useTenancy();
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
        value={opening.selectedId}
        onChange={(event) => router.replace(`${basePath}/views?tab=impact&sel=${event.target.value}`)}
        className="h-10 max-w-[280px] rounded-lg border border-[#e6e8ee] bg-white px-3 text-[16px] font-semibold text-[#1c2230] shadow-sm"
      >
        {!opening.selectedId && <option value="">Choose…</option>}
        {opening.nodes.map((node) => (
          <option key={node.id} value={node.id}>{node.name}</option>
        ))}
      </select>
      goes down?
    </h1>
  );
}

type OpeningModel = ReturnType<typeof useOpeningModel>;

function useOpeningModel() {
  const params = useSearchParams();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const dev = process.env.NODE_ENV !== "production";
  const ready = !impact.isLoading && !catalog.isLoading;
  const rows = catalog.data?.rows ?? [];
  const locations = catalog.data?.locations ?? [];
  const setup = useWorkspaceSetup();
  const hostEdges = impact.edges.filter((edge) => edge.type === "runs_on" || edge.type === "built_on").length;
  const blocked = setup.enabled && Boolean(catalog.data) && !setup.state.met;
  const example = blocked || (ready && showExampleEstate(hostEdges, params.get("demo") === "empty", dev));

  const liveItems = useMemo(() => {
    const items: ChainItem[] = [
      ...rows.map(rowToItem),
      ...locations.map((object) => ({
        id: object.id,
        name: object.name,
        kind: "location" as const,
        ownerTeam: object.owner_team_name || object.point_of_contact_name || object.owner || "",
        criticality: "",
        description: object.description ?? "",
        properties: (object.properties ?? {}) as Record<string, unknown>,
      })),
    ];
    const known = new Set(items.map((item) => item.id));
    for (const node of impact.nodes) {
      if (known.has(node.id)) continue;
      items.push({
        id: node.id,
        name: node.name,
        kind: /capability/i.test(node.typeLabel ?? "") ? "capability" : "other",
        ownerTeam: "",
        criticality: "",
        description: "",
        properties: {},
      });
    }
    return items;
  }, [rows, locations, impact.nodes]);

  const items = example ? sampleItems : liveItems;
  const nodes = example ? sampleNodes : impact.nodes;
  const edges = example ? sampleEdges : impact.edges;
  const candidates = useMemo(() => (ready || example ? impactCandidates(items, nodes, edges) : []), [items, nodes, edges, ready, example]);
  const knownIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const explicit = params.get("sel");
  const selectedId = replaceLoneLocation(resolveSelection(explicit, candidates, knownIds), Boolean(explicit), edges);
  const badges = viewBadges(
    {
      spof: singlePoints(rows, impact.edges).length,
      manual: manualFlowCount(impact.relationships.map((rel) => ({ type: rel.type, how: String(rel.attributes?.how ?? "") }))),
      noHome: hostingMap(rows, impact.edges).unlinked,
      noBackup: backupGapCount(liveItems, impact.edges),
    },
    example || !ready,
  );
  const reduced = useReducedMotion();
  return {
    example,
    blocked,
    gap: setup.gap,
    counts: setup.state,
    ready,
    items,
    nodes,
    edges,
    candidates,
    selectedId,
    showingDefault: Boolean(selectedId) && selectedId === candidates[0]?.id,
    badges,
    reduced,
    rows,
    locations,
    parties: catalog.data?.parties ?? [],
  };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(media.matches);
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, []);
  return reduced;
}

function rowToItem(row: CatalogRow): ChainItem {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    ownerTeam: row.ownerTeam || row.ownerPerson,
    criticality: row.criticalityLabel,
    description: row.object.description ?? "",
    properties: (row.object.properties ?? {}) as Record<string, unknown>,
  };
}

function ImpactView({ opening }: { opening: OpeningModel }) {
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState<"app" | "calls" | "capability" | "server" | null>(null);
  const [addApps, setAddApps] = useState(false);
  const [serverAdd, setServerAdd] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);
  const anywhere = addAnywhereEnabled();
  const setup = useWorkspaceSetup();
  const stamped = useRef(false);
  const params = useSearchParams();
  const [error, setError] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(opening.items.map((item) => [item.id, item])), [opening.items]);
  const selected = byId.get(opening.selectedId);
  const hits = opening.selectedId ? impactOf(opening.nodes, opening.edges, opening.selectedId) : [];
  const bands = groupChain(hits, (id) => byId.get(id)?.kind ?? "other");
  const dollars = chainRunDollars(selected, hits, opening.items);
  const caption = spofCaption(opening.candidates[0], opening.showingDefault);
  const todos = chainTodos(selected, hits, opening.items, opening.edges);
  const cards = openingCards(opening.candidates);
  const confirmed = String(selected?.properties.impact_confirmed_at ?? "");
  const openCount = todos.filter((todo) => todo.id !== "confirm").length + (confirmed ? 0 : 1);
  const teams = teamBoxes([...bands.stop, ...bands.slow].map((hit) => byId.get(hit.id)).filter((item): item is ChainItem => Boolean(item)));
  const lines = useConnectors(canvasRef, `${opening.selectedId}:${hits.map((hit) => hit.id).join(",")}:${picker ?? ""}:${teams.length}`);
  const delay = (fromBottom: number) => laneDelayMs(fromBottom, opening.reduced);
  const backfilled = useRef(false);
  useEffect(() => {
    if (!setup.ready) return;
    const asked = params.get("ready") === "1";
    if (!setup.enabled) {
      if (asked) setReadyOpen(true);
      return;
    }
    if (setup.state.met && !setup.mapReadyShownAt && !asked) {
      if (backfilled.current) return;
      backfilled.current = true;
      void setup.save({ mapReadyShownAt: new Date().toISOString() });
      return;
    }
    if (asked && !opening.example && !setup.mapReadyShownAt && !stamped.current) {
      stamped.current = true;
      setReadyOpen(true);
      void setup.save({ mapReadyShownAt: new Date().toISOString() });
    }
  }, [setup, opening.example, params]);

  const objectTypeOf = (id: string) => {
    const row = opening.rows.find((item) => item.id === id);
    if (row) return row.object.type;
    if (opening.locations.some((item) => item.id === id)) return "location";
    if (opening.parties.some((item) => item.id === id)) return "external_party";
    const node = opening.nodes.find((item) => item.id === id);
    if (node?.typeLabel === "Capability") return "capability";
    if (node?.typeLabel === "Location") return "location";
    if (byId.get(id)?.kind === "platform") return "cloud_service";
    if (byId.get(id)?.kind === "runtime") return "model";
    return "application";
  };

  const link = useMutation({
    mutationFn: async (otherId: string) => {
      if (opening.example) return;
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug || !selected) throw new Error("Not signed in");
      const otherType = objectTypeOf(otherId);
      if (picker === "capability") {
        const app = bands.stop[0] ?? bands.slow[0];
        const targetId = app?.id ?? (selected.kind === "application" ? selected.id : "");
        if (!targetId) throw new Error("Link an application in this chain first");
        return relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "supported_by",
          from_object_id: otherId,
          from_type: otherType,
          to_object_id: targetId,
          to_type: objectTypeOf(targetId),
        }, token);
      }
      if (picker === "server") {
        if (selected.kind === "location") {
          return relationshipsApi.create(orgSlug, workspaceSlug, {
            type: "located_at",
            from_object_id: otherId,
            from_type: otherType,
            to_object_id: selected.id,
            to_type: "location",
          }, token);
        }
        return relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "runs_on",
          from_object_id: otherId,
          from_type: otherType,
          to_object_id: selected.id,
          to_type: objectTypeOf(selected.id),
        }, token);
      }
      if (picker === "calls") {
        const target = bands.stop[0];
        const targetId = target?.id ?? (selected.kind === "application" ? selected.id : "");
        if (!targetId) throw new Error("Link an application that stops first");
        return relationshipsApi.create(orgSlug, workspaceSlug, {
          type: "calls",
          from_object_id: otherId,
          from_type: otherType,
          to_object_id: targetId,
          to_type: objectTypeOf(targetId),
        }, token);
      }
      const hostId = selected.kind === "location" ? (bands.infra.find((hit) => byId.get(hit.id)?.kind === "runtime")?.id ?? "") : selected.id;
      if (!hostId) throw new Error("Add a server in this chain first");
      const hostKind = byId.get(hostId)?.kind;
      return relationshipsApi.create(orgSlug, workspaceSlug, {
        type: hostKind === "platform" ? "built_on" : "runs_on",
        from_object_id: otherId,
        from_type: otherType,
        to_object_id: hostId,
        to_type: objectTypeOf(hostId),
      }, token);
    },
    onSuccess: (created) => {
      setPicker(null);
      setError("");
      if (created && orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (opening.example || !selected) return;
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return objectsApi.update(orgSlug, workspaceSlug, selected.id, {
        properties: { impact_confirmed_at: new Date().toISOString().slice(0, 10) },
      }, token);
    },
    onSuccess: (saved) => {
      if (saved && orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { object: saved });
    },
  });

  const select = (id: string) => router.replace(`${basePath}/views?tab=impact&sel=${id}`);
  const stopAdd = selected?.kind === "platform" ? "+ Add an app" : "+ Something else runs on it";

  if (!opening.ready && !opening.example) {
    return <p className="text-[13px] text-[#8b90a0]">Loading the estate…</p>;
  }

  const selectedName = selected?.name ?? "this server";
  return (
    <div className="relative">
      {!opening.example && readyOpen && params.get("ready") === "1" && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#c9c6f5] bg-[#f7f6ff] px-4 py-3">
          <div>
            <p className="text-[14px] font-semibold text-[#1c2230]">Your map is ready</p>
            <p className="mt-1 text-[13px] text-[#4b5163]">{opening.counts.apps} apps · {opening.counts.hostingLinks} linked to a server</p>
            <Link href={askPath(basePath, `What breaks if our ${selectedName} goes down?`, opening.selectedId)} className="mt-2 inline-flex rounded-full border border-[#c9c6f5] bg-white px-3 py-1 text-[13px] text-[#3f35b5]">
              What breaks if our {selectedName} goes down?
            </Link>
          </div>
          <button type="button" onClick={() => setReadyOpen(false)} className="text-[12px] text-[#6b7289]">Dismiss</button>
        </div>
      )}
      <div className={opening.example ? "pointer-events-none select-none opacity-40" : ""}>
        {cards.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map((card) => {
              const item = byId.get(card.id);
              const on = card.id === opening.selectedId;
              return (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => select(card.id)}
                  className={cn("min-w-0 rounded-xl border bg-white p-3 text-left", on ? "border-[#5b4ce6] ring-1 ring-[#5b4ce6]" : "border-[#e6e8ee]")}
                >
                  <div className="flex items-center gap-2">
                    <KindIcon kind={card.kind} runtimeKind={String(item?.properties.runtime_kind ?? "")} />
                    <span className="truncate text-[13px] font-semibold text-[#1c2230]">{card.name}</span>
                  </div>
                  <p className="mt-2 text-[13px] text-[#4b5163]"><span className="font-semibold text-[#1c2230]">{card.reached}</span> depend on it</p>
                  <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[#eef0f4]">
                    {card.reached > 0 && (
                      <>
                        <span className="bg-[#e11d48]" style={{ flexGrow: card.direct }} />
                        <span className="bg-[#f5b942]" style={{ flexGrow: card.degraded }} />
                        <span className="bg-[#7c3aed]" style={{ flexGrow: card.losesSupport }} />
                      </>
                    )}
                  </div>
                </button>
              );
            })}
            {!opening.example && opening.candidates.length < 4 && (
              anywhere ? (
                <button type="button" onClick={() => setServerAdd((value) => !value)} className="flex min-w-0 items-center justify-center rounded-xl border border-dashed border-[#c9c6f5] p-3 text-center text-[13px] text-[#5b4ce6]">
                  Add your other servers
                </button>
              ) : (
                <Link href={modelPath(basePath, "servers")} className="flex min-w-0 items-center justify-center rounded-xl border border-dashed border-[#c9c6f5] p-3 text-center text-[13px] text-[#5b4ce6]">
                  Add your other servers
                </Link>
              )
            )}
          </div>
        )}
        {serverAdd && <div className="mb-4"><AddFlow origin="views" kind="server" compact /></div>}
        {caption && <p className="mb-3 rounded-lg bg-[#fff7ed] px-3 py-2 text-[13px] text-[#9a3412]">{caption}</p>}
        <p className="mb-3 flex flex-wrap gap-x-2 text-[13px]">
          <Count n={bands.stop.length} text="apps stop" color="text-[#e11d48]" />
          <Dot />
          <Count n={bands.slow.length} text="slow down" color="text-[#b45309]" />
          <Dot />
          <Count n={bands.capabilities.length} text="capabilities hit" color="text-[#7c3aed]" />
          <Dot />
          <Count n={teams.length} text={teams.length === 1 ? "team to call" : "teams to call"} color="text-[#4b5163]" />
          <Dot />
          <span className={dollars > 0 ? "font-medium text-[#1c2230]" : "text-[#8b90a0]"}>{moneyLabel(dollars)}/yr of systems affected</span>
        </p>
        <div className="flex items-start gap-5">
          <div className="min-w-0 flex-1">
            <div key={opening.selectedId} ref={canvasRef} className="relative overflow-hidden rounded-xl border border-[#e6e8ee] bg-white">
              <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
                {lines.map((line, index) => (
                  <path
                    key={index}
                    className="views-edge-in"
                    style={{ animationDelay: `${line.delay}ms` }}
                    d={`M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`}
                    fill="none"
                    stroke={line.stroke}
                    strokeWidth="1.4"
                    strokeDasharray={line.dash}
                  />
                ))}
              </svg>
              <Lane label="Teams to call" delay={delay(5)} thin={teams.length === 0}>
                {teams.map((team) => (
                  <Box key={team.name} node={`team:${team.name}`} delay={delay(5)} tone="team" title={team.name} subtitle={team.apps} />
                ))}
              </Lane>
              <Lane label="Capabilities hit" delay={delay(4)} thin={bands.capabilities.length === 0}>
                {bands.capabilities.length === 0 ? (
                  <CollapsedLine text={collapsedCopy("capabilities", 0)} action="Link one" onClick={() => setPicker(picker === "capability" ? null : "capability")} />
                ) : bands.capabilities.map((hit) => (
                  <HitBox key={hit.id} hit={hit} nodes={opening.nodes} item={byId.get(hit.id)} tone="capability" delay={delay(4)} />
                ))}
              </Lane>
              <Lane label="Apps that slow down" delay={delay(3)} thin={bands.slow.length === 0}>
                {bands.slow.map((hit) => (
                  <HitBox key={hit.id} hit={hit} nodes={opening.nodes} item={byId.get(hit.id)} tone="slow" delay={delay(3)} />
                ))}
                {bands.slow.length === 0 ? (
                  <CollapsedLine text={collapsedCopy("slow", 0)} action="Add one" onClick={() => setPicker(picker === "calls" ? null : "calls")} />
                ) : (
                  <AddButton label="+ Another app needs one" onClick={() => setPicker(picker === "calls" ? null : "calls")} />
                )}
              </Lane>
              <Lane label="Apps that stop" delay={delay(2)} thin={bands.stop.length === 0}>
                {bands.stop.map((hit) => (
                  <HitBox key={hit.id} hit={hit} nodes={opening.nodes} item={byId.get(hit.id)} tone="stop" delay={delay(2)} />
                ))}
                {bands.stop.length === 0 ? (
                  <CollapsedLine text={collapsedCopy("stop", 0)} action="Link an app" onClick={() => setPicker(picker === "app" ? null : "app")} />
                ) : (
                  <AddButton label={stopAdd} onClick={() => setPicker(picker === "app" ? null : "app")} />
                )}
              </Lane>
              <Lane label="Goes down with it" delay={delay(1)} thin={bands.infra.length === 0}>
                {bands.infra.length === 0 ? (
                  <CollapsedLine text={collapsedCopy("infra", 0)} action="Add a server" onClick={() => setPicker(picker === "server" ? null : "server")} />
                ) : bands.infra.map((hit) => (
                  <HitBox key={hit.id} hit={hit} nodes={opening.nodes} item={byId.get(hit.id)} tone="infra" delay={delay(1)} />
                ))}
              </Lane>
              <Lane label="Goes down" delay={delay(0)}>
                {selected && <Box node={selected.id} delay={delay(0)} tone="down" title={selected.name} subtitle={sourceSubtitle(selected, opening.rows)} />}
              </Lane>
            </div>
            <p className="mt-2 text-[12px] text-[#8b90a0]">Read bottom to top. Lines show why each item is hit; hover a box for the full path.</p>
            {picker && (
              <div className="mt-3 max-w-md rounded-xl border border-[#e6e8ee] bg-white p-3 shadow-sm">
                <p className="mb-2 text-[13px] font-medium text-[#1c2230]">
                  {picker === "server" ? "Which server?" : picker === "capability" ? "Which capability?" : picker === "calls" ? "Which app needs it?" : "Which app?"}
                </p>
                <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                  {pickerChoices(picker, opening, bands.stop.map((hit) => hit.id)).map((choice) => (
                    <button key={choice.id} type="button" onClick={() => link.mutate(choice.id)} className="rounded-full border border-[#e6e8ee] bg-white px-2.5 py-1 text-[12px] text-[#1c2230] hover:border-[#c4b5fd]">{choice.name}</button>
                  ))}
                </div>
                {error && <p className="mt-2 text-[12px] text-[#b42318]">{error}</p>}
              </div>
            )}
          </div>
          <aside className="w-[300px] shrink-0 rounded-xl border border-[#e6e8ee] bg-white p-4">
            <p className="mb-3 flex items-center gap-2 text-[11px] font-semibold tracking-[0.12em] text-[#8b90a0]">
              <span className="text-[#16a34a]">✓</span> TO DO FOR THIS CHAIN <span className="text-[#1c2230]">{openCount}</span>
            </p>
            {todos.map((todo) => todo.id === "confirm" ? (
              <label key={todo.id} className="mt-1 flex items-start gap-2 text-[13px]">
                <input type="checkbox" className="mt-1" checked={Boolean(confirmed)} onChange={() => { if (!confirmed) confirm.mutate(); }} />
                <span>
                  <span className="font-medium text-[#1c2230]">{todo.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-5 text-[#8b90a0]">{todo.body}</span>
                  {confirmed && <span className="mt-0.5 block text-[12px] text-[#16a34a]">Confirmed {confirmed}</span>}
                </span>
              </label>
            ) : (
              <TodoItem key={todo.id} title={todo.title} body={todo.body} action={todo.action} href={todoHref(basePath, todo)} />
            ))}
          </aside>
        </div>
      </div>
      {opening.example && (
        <div className="absolute inset-0 flex items-start justify-center pt-24">
          <div className="max-w-md rounded-2xl border border-[#e6e8ee] bg-white px-6 py-5 text-center shadow-lg">
            {opening.blocked ? (
              <>
                <p className="text-[15px] font-semibold text-[#1c2230]">Example data</p>
                <p className="mt-2 text-[13px] leading-5 text-[#4b5163]">{opening.gap}</p>
                <button type="button" onClick={() => setAddApps(true)} className="mt-4 inline-flex rounded-lg bg-[#5b4ce6] px-4 py-2 text-[13px] font-medium text-white">Add apps here</button>
                {addApps && <div className="mt-4 text-left"><FirstRunAsk inline /></div>}
              </>
            ) : (
              <>
                <p className="text-[15px] font-semibold text-[#1c2230]">Example data</p>
                <p className="mt-2 text-[13px] leading-5 text-[#4b5163]">Link your first app to a server to see yours. Until then this is a sample estate; nothing here is saved to your workspace.</p>
                <Link href={`${basePath}/views?tab=hosting`} className="mt-4 inline-flex rounded-lg bg-[#5b4ce6] px-4 py-2 text-[13px] font-medium text-white">Open Hosting & location</Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function pickerChoices(picker: "app" | "calls" | "capability" | "server", opening: OpeningModel, stopIds: string[]) {
  if (picker === "capability") {
    return opening.nodes.filter((node) => node.typeLabel === "Capability").map((node) => ({ id: node.id, name: node.name }));
  }
  if (picker === "server") {
    return opening.rows.filter((row) => row.kind === "runtime").map((row) => ({ id: row.id, name: row.name }));
  }
  return opening.rows
    .filter((row) => row.kind === "application" && !stopIds.includes(row.id))
    .map((row) => ({ id: row.id, name: row.name }));
}

function todoHref(basePath: string, todo: ChainTodo): string {
  const section = todo.action === "Plan replacement" || todo.action === "Plan upgrade" || todo.action === "Add backup" ? "servers" : "applications";
  return modelItemPath(basePath, section, todo.recordId);
}

function sourceSubtitle(item: ChainItem, rows: CatalogRow[]): string {
  const row = rows.find((entry) => entry.id === item.id);
  if (item.kind === "runtime" && row) {
    const runtime = readRuntimeInfra(row.object);
    const status = infraStatus(runtime, new Date());
    return [runtime.kindLabel || row.typeLabel, status.severity === "bad" ? "out of support" : ""].filter(Boolean).join(" · ");
  }
  if (item.kind === "platform" && row) return readPlatformInfra(row.object).kindLabel || row.typeLabel;
  if (item.kind === "location") {
    const type = String(item.properties.location_type ?? "");
    if (type === "office") return "Office";
    if (type === "data_center") return "Data center";
    if (type === "colo") return "Colo";
    if (type === "cloud_region") return "Cloud region";
    return "Location";
  }
  return row?.typeLabel ?? "";
}

function teamBoxes(apps: ChainItem[]): { name: string; apps: string }[] {
  const map = new Map<string, string[]>();
  for (const app of apps) {
    if (!app.ownerTeam) continue;
    map.set(app.ownerTeam, [...(map.get(app.ownerTeam) ?? []), app.name]);
  }
  return [...map.entries()].map(([name, names]) => ({ name, apps: names.join(", ") }));
}

function Count({ n, text, color }: { n: number; text: string; color: string }) {
  return <span className={n > 0 ? `font-medium ${color}` : "text-[#8b90a0]"}>{n} {text}</span>;
}

function Dot() {
  return <span className="text-[#c5c8d4]">·</span>;
}

function KindIcon({ kind, runtimeKind }: { kind: ChainItem["kind"]; runtimeKind: string }) {
  const className = "h-4 w-4 shrink-0 text-[#6b7280]";
  if (kind === "location") return <Building2 className={className} />;
  if (kind === "platform") return <Cloud className={className} />;
  if (runtimeKind === "database") return <Database className={className} />;
  return <Server className={className} />;
}

function CollapsedLine({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="text-[13px] text-[#8b90a0]">
      {text} <span className="text-[#5b4ce6]">· {action}</span>
    </button>
  );
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
          delay: Number(el.dataset.delay ?? 0),
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
    return other && line.x1 === other.x1 && line.y1 === other.y1 && line.x2 === other.x2 && line.y2 === other.y2 && line.stroke === other.stroke && line.delay === other.delay;
  });
}

function Lane({ label, delay, thin, children }: { label: string; delay: number; thin?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("views-lane-in relative flex items-center border-b border-[#f3f4f8] last:border-b-0", thin ? "min-h-[48px]" : "min-h-[76px]")} style={{ animationDelay: `${delay}ms` }}>
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
  delay = 0,
}: {
  node: string;
  parent?: string;
  tone: "team" | "gap" | "capability" | "slow" | "stop" | "infra" | "down";
  title: string;
  subtitle?: string;
  hover?: string;
  delay?: number;
}) {
  const stroke = tone === "stop" ? "#e11d48" : tone === "slow" || tone === "gap" ? "#d97706" : tone === "capability" ? "#7c3aed" : "#94a3b8";
  const dash = tone === "stop" ? undefined : "4 4";
  return (
    <div
      data-node={node}
      data-parent={parent}
      data-stroke={parent ? stroke : undefined}
      data-dash={parent ? dash : undefined}
      data-delay={delay}
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

function HitBox({ hit, nodes, item, tone, delay }: { hit: ImpactHit; nodes: ImpactNode[]; item?: ChainItem; tone: "capability" | "slow" | "stop" | "infra"; delay: number }) {
  const phrase = connectionPhrase(hit, nodes);
  const last = hit.path[hit.path.length - 1];
  const parent = last ? (last.fromId === hit.id ? last.toId : last.fromId) : undefined;
  const detail = [item?.criticality ?? "", phrase ? phrase.charAt(0).toLowerCase() + phrase.slice(1) : ""].filter(Boolean).join(" · ");
  return (
    <Box
      node={hit.id}
      parent={parent}
      tone={tone}
      title={hit.name}
      subtitle={detail}
      hover={hit.path.map((step) => step.label).join(" → ")}
      delay={delay}
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
      return relationshipsApi.create(orgSlug, workspaceSlug, {
        type: "sends_data_to",
        from_object_id: from.id,
        from_type: from.object.type,
        to_object_id: to.id,
        to_type: to.object.type,
        attributes: { what, how, frequency: often },
      }, token);
    },
    onSuccess: (created) => {
      setDraw(false);
      setWhat("");
      if (created && orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const remove = useMutation({
    mutationFn: async (rel: Relationship) => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      await relationshipsApi.delete(orgSlug, workspaceSlug, rel.id, token);
      return rel.id;
    },
    onSuccess: (id) => {
      if (orgSlug && workspaceSlug) applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { removeRelationshipId: id });
    },
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
      return relationshipsApi.create(orgSlug, workspaceSlug, {
        type: host.kind === "platform" ? "built_on" : "runs_on",
        from_object_id: app.id,
        from_type: app.object.type,
        to_object_id: host.id,
        to_type: host.object.type,
      }, token);
    },
    onSuccess: (created) => {
      if (created && orgSlug && workspaceSlug) {
        applyCatalogWrite(queryClient, orgSlug, workspaceSlug, { relationship: created });
      }
    },
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
