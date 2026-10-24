"use client";

import { useMemo, useState } from "react";
import { Handle, MarkerType, Position, type Edge, type Node, type NodeProps, type NodeTypes } from "reactflow";
import { EntityFlowCanvas, type NodeLayout } from "@/components/shared/EntityFlowCanvas";
import { renewalInfo, type VendorContract } from "@/lib/contracts";
import { moneyLabel, type CatalogRow } from "@/lib/model-catalog";
import type { CatalogTool, VendorSummary } from "@/lib/vendors";
import { cn } from "@/lib/utils";

export type MapFilter = "estate" | "catalog" | "contracts";

type CardData = { title: string; sub?: string; tone: "app" | "contract"; warn?: boolean };
type CatalogData = { tools: CatalogTool[]; total: number; onAdd: (tool: CatalogTool) => void };

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0 };

function CenterNode({ data }: NodeProps<{ title: string }>) {
  return (
    <div className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#5b4ce6] text-center text-[12.5px] font-semibold text-white shadow">
      <Handle type="source" position={Position.Top} style={{ ...hidden, top: "50%" }} />
      <Handle type="target" position={Position.Top} style={{ ...hidden, top: "50%" }} />
      {data.title}
    </div>
  );
}

function CardNode({ data }: NodeProps<CardData>) {
  return (
    <div className={cn("w-[150px] rounded-md border px-2.5 py-1.5", data.tone === "contract" ? "border-[#f5c56b] bg-[#fff8e8]" : "border-[#8b80f0] bg-[#efedff]")}>
      <Handle type="target" position={Position.Left} style={hidden} />
      <Handle type="source" position={Position.Right} style={hidden} />
      <div className="truncate text-[11.5px] font-semibold text-[#1c2230]">{data.title}</div>
      {data.sub && <div className={cn("truncate text-[10.5px]", data.warn ? "text-[#c2410c]" : "text-[#6b7289]")}>{data.sub}</div>}
    </div>
  );
}

function CatalogNode({ data }: NodeProps<CatalogData>) {
  return (
    <div className="w-[170px] rounded-md border border-dashed border-[#d5d8e0] bg-[#fafafb] px-2.5 py-2">
      <Handle type="target" position={Position.Left} style={hidden} />
      <div className="text-[10px] font-semibold tracking-[0.08em] text-[#8b90a0]">THEY ALSO SELL · {data.total}</div>
      {data.tools.slice(0, 3).map((tool) => (
        <div key={tool.name} className="mt-0.5 flex items-center gap-1 text-[11.5px] text-[#1c2230]">
          <span className="truncate">{tool.name}</span>
          <button type="button" className="nodrag shrink-0 text-[#5b4ce6]" onClick={() => data.onAdd(tool)}>+ Add</button>
        </div>
      ))}
      {data.total > 3 && <div className="mt-0.5 text-[11px] text-[#5b4ce6]">+{data.total - 3} more</div>}
    </div>
  );
}

const NODE_TYPES: NodeTypes = { center: CenterNode, card: CardNode, catalog: CatalogNode };

function ring(count: number, radius: number, start: number, end: number) {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? (start + end) / 2 : start + ((end - start) * i) / (count - 1);
    return { x: Math.cos(t) * radius, y: Math.sin(t) * radius };
  });
}

/** Vendor at the centre, its contracts, the apps we use and catalog products not in use. */
export function buildVendorGraph(input: {
  vendor: VendorSummary;
  contracts: VendorContract[];
  apps: CatalogRow[];
  other: CatalogTool[];
  show: Set<MapFilter>;
  layout?: NodeLayout;
  onAdd: (tool: CatalogTool) => void;
  idleById?: Map<string, number>;
}) {
  const { vendor, show, layout = {} } = input;
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const at = (id: string, fallback: { x: number; y: number }) => layout[id] ?? fallback;
  nodes.push({ id: "vendor", type: "center", position: at("vendor", { x: -38, y: -38 }), data: { title: vendor.name } });
  const overlapBy = new Map(vendor.overlapsWith.map((o) => [o.app, o.others]));
  const contractOf = new Map<string, string>();
  for (const c of input.contracts) for (const item of c.items) if (!contractOf.has(item.object_id)) contractOf.set(item.object_id, c.name);
  if (show.has("contracts")) {
    ring(input.contracts.length, 260, -Math.PI * 0.85, -Math.PI * 0.15).forEach((p, i) => {
      const c = input.contracts[i];
      const info = renewalInfo(c);
      const id = `contract:${c.id}`;
      const bits = [c.annual_cost_cents != null ? moneyLabel(c.annual_cost_cents / 100) : "", info ? `renews ${info.end.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}` : ""].filter(Boolean);
      nodes.push({ id, type: "card", position: at(id, { x: p.x - 75, y: p.y - 20 }), data: { title: c.name, sub: bits.join(" · "), tone: "contract", warn: info?.urgent } satisfies CardData });
      edges.push({ id: `e-${id}`, source: "vendor", target: id, style: { stroke: "#d5d8e0" } });
      if (show.has("estate")) {
        for (const item of c.items) {
          edges.push({ id: `e-${id}-${item.object_id}`, source: id, target: `app:${item.object_id}`, style: { stroke: "#f5c56b", strokeDasharray: "4 3" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#f5c56b", width: 12, height: 12 } });
        }
      }
    });
  }
  if (show.has("estate")) {
    ring(input.apps.length, 300, Math.PI * 0.1, Math.PI * 1.9).forEach((p, i) => {
      const app = input.apps[i];
      const id = `app:${app.id}`;
      const others = overlapBy.get(app.name);
      const idle = input.idleById?.get(app.id);
      const sub = others ? `overlaps ${others.slice(0, 2).join(", ")}` : [contractOf.get(app.id) ?? "no contract", idle ? `${idle} idle` : "", app.criticality === "critical" ? "critical" : ""].filter(Boolean).join(" · ");
      nodes.push({ id, type: "card", position: at(id, { x: p.x - 75, y: p.y * 0.8 - 20 }), data: { title: app.name, sub, tone: "app", warn: Boolean(others) } satisfies CardData });
      edges.push({ id: `e-${id}`, source: id, target: "vendor", style: { stroke: "#c9c6f5" }, markerEnd: { type: MarkerType.ArrowClosed, color: "#c9c6f5", width: 12, height: 12 } });
    });
  }
  if (show.has("catalog") && input.other.length) {
    nodes.push({ id: "catalog", type: "catalog", position: at("catalog", { x: 300, y: 120 }), data: { tools: input.other, total: input.other.length, onAdd: input.onAdd } satisfies CatalogData });
    edges.push({ id: "e-catalog", source: "vendor", target: "catalog", style: { stroke: "#d5d8e0", strokeDasharray: "3 4" } });
  }
  const ids = new Set(nodes.map((n) => n.id));
  return { nodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

export function VendorRelationships(props: {
  vendor: VendorSummary;
  contracts: VendorContract[];
  apps: CatalogRow[];
  other: CatalogTool[];
  layout?: NodeLayout;
  onLayoutSave?: (layout: NodeLayout) => void;
  onAdd: (tool: CatalogTool) => void;
  idleById?: Map<string, number>;
}) {
  const [show, setShow] = useState<Set<MapFilter>>(new Set(["estate", "catalog", "contracts"]));
  const graph = useMemo(
    () => buildVendorGraph({ ...props, show }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.vendor, props.contracts, props.apps, props.other, props.layout, show]
  );
  const toggle = (key: MapFilter) => setShow((cur) => {
    const next = new Set(cur);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const pills: [MapFilter, string][] = [["estate", `In our estate (${props.apps.length})`], ["catalog", `Catalog products (${props.other.length})`], ["contracts", `Contracts (${props.contracts.length})`]];
  return (
    <div>
      <div className="mb-2 flex items-center justify-end gap-1.5 text-[12px] text-[#8b90a0]">
        Show
        {pills.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={show.has(key)} onClick={() => toggle(key)} className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", show.has(key) ? "bg-[#ece9ff] text-[#4338ca]" : "bg-[#f3f4f8] text-[#8b90a0] line-through")}>
            {label}
          </button>
        ))}
      </div>
      <EntityFlowCanvas
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={NODE_TYPES}
        accentColor="#5b4ce6"
        fitKey={`${graph.nodes.length}`}
        onLayoutSave={props.onLayoutSave}
        onResetLayout={props.onLayoutSave ? () => props.onLayoutSave?.({}) : undefined}
        hasCustomLayout={Boolean(props.layout && Object.keys(props.layout).length)}
        className="h-[520px] rounded-xl border border-[#eef0f4]"
      />
    </div>
  );
}
