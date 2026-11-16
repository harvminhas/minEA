"use client";

import { useMemo, useState } from "react";
import type { MinEAObject, Relationship } from "@minea/types";
import type { CatalogRow } from "@/lib/model-catalog";
import {
  buildCapabilityTree,
  flatten,
  heatClass,
  heatMeta,
  moneyLabel,
  type HeatDepth,
  type HeatMetric,
  type TreeNode,
} from "@/lib/capability-tree";
import { cn } from "@/lib/utils";

const DEPTHS: { id: HeatDepth; label: string }[] = [
  { id: "l1", label: "Domains" },
  { id: "l2", label: "Capabilities" },
  { id: "l3", label: "Activities" },
];
const METRICS: { id: HeatMetric; label: string }[] = [
  { id: "coverage", label: "Coverage" },
  { id: "apps", label: "Apps" },
  { id: "cost", label: "Cost" },
  { id: "risk", label: "Criticality" },
  { id: "fitness", label: "Fitness" },
  { id: "redundancy", label: "Redundancy" },
];
const LEGEND: Record<HeatMetric, [string, string][]> = {
  coverage: [
    ["#fef2f2", "Gap"],
    ["#fff7ed", "Partial"],
    ["#f0fdf4", "Mostly covered"],
    ["#ecfdf3", "Covered"],
  ],
  apps: [
    ["#fafafb", "None"],
    ["#f5f3ff", "1–2"],
    ["#ede9fe", "3–5"],
    ["#ddd6fe", "6+"],
  ],
  cost: [
    ["#fafafb", "None"],
    ["#d1fae5", "Low"],
    ["#6ee7b7", "Medium"],
    ["#059669", "High"],
  ],
  risk: [
    ["#ecfdf3", "Low"],
    ["#fff7ed", "Medium"],
    ["#fef2f2", "Has a critical app"],
  ],
  fitness: [
    ["#fef2f2", "Weak"],
    ["#fff7ed", "Adequate"],
    ["#ecfdf5", "Strong"],
    ["#fafafb", "No app"],
  ],
  redundancy: [
    ["#ecfdf5", "No overlap"],
    ["#fff7ed", "2 apps"],
    ["#fef2f2", "3+ apps"],
    ["#fafafb", "No app"],
  ],
};

const FOOTNOTE: Record<HeatMetric, string> = {
  coverage:
    "Each tile is rolled up from the activities under it. An app linked to a lower level also counts in its parents — once, not three times. Rename, add, or move anything later with Edit structure.",
  apps:
    "Each tile is rolled up from the activities under it. An app linked to a lower level also counts in its parents — once, not three times. Rename, add, or move anything later with Edit structure.",
  cost:
    "Each tile is rolled up from the activities under it. An app linked to a lower level also counts in its parents — once, not three times. Rename, add, or move anything later with Edit structure.",
  risk:
    "Each tile is rolled up from the activities under it. An app linked to a lower level also counts in its parents — once, not three times. Rename, add, or move anything later with Edit structure.",
  fitness:
    "Fitness is the weakest app link under the tile. Activities with no app stay a coverage gap — they are not scored as weak fitness.",
  redundancy:
    "An activity is flagged when two or more apps support it directly. Capabilities and domains inherit that flag. Two activities with one app each is not overlap — and the same app linked at two levels still counts once.",
};

const TILE: Record<string, string> = {
  "c-good": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "c-ok": "bg-lime-50 border-lime-200 text-lime-800",
  "c-fair": "bg-orange-50 border-orange-200 text-orange-900",
  "c-gap": "bg-red-50 border-red-200 text-red-800",
  "a-0": "border-dashed border-[#e6e8ee] bg-[#fafafb] text-[#6b7289]",
  "a-1": "bg-violet-50 border-violet-200 text-violet-900",
  "a-2": "bg-violet-100 border-violet-300 text-violet-950",
  "a-3": "bg-violet-200 border-violet-400 text-violet-950",
  "cost-0": "border-dashed border-[#e6e8ee] bg-[#fafafb] text-[#6b7289]",
  "cost-1": "bg-emerald-100 border-emerald-200 text-emerald-900",
  "cost-2": "bg-emerald-300 border-emerald-400 text-emerald-950",
  "cost-3": "bg-emerald-600 border-emerald-700 text-emerald-50",
  "r-low": "bg-emerald-50 border-emerald-200 text-emerald-800",
  "r-med": "bg-orange-50 border-orange-200 text-orange-900",
  "r-high": "bg-red-50 border-red-200 text-red-800",
};

export function CapabilityHeatMap({
  objects,
  edges,
  rows,
  onOpen,
  initialDepth = "l2",
  initialMetric = "coverage",
}: {
  objects: readonly MinEAObject[];
  edges: readonly Relationship[];
  rows: readonly CatalogRow[];
  onOpen?: (id: string) => void;
  initialDepth?: HeatDepth;
  initialMetric?: HeatMetric;
}) {
  const [depth, setDepth] = useState<HeatDepth>(initialDepth);
  const [metric, setMetric] = useState<HeatMetric>(initialMetric);
  const tree = useMemo(
    () => buildCapabilityTree(objects, edges, rows),
    [objects, edges, rows],
  );
  const tiles = flatten(tree, depth);
  const appIds = new Set(objects.filter((o) => o.type === "application" || o.type === "cloud_service").map((o) => o.id));
  const linked = new Set(
    edges.filter((e) => e.type === "supported_by" && appIds.has(e.to_object_id)).map((e) => e.to_object_id),
  );
  const leaves = flatten(tree, "l3");
  const gaps = leaves.filter((n) => n.uniqueAppIds.length === 0).length;
  const spend = rows.filter((row) => linked.has(row.id)).reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);

  return (
    <div data-testid="capability-heat-map">
      <div className="mb-4 grid grid-cols-4 gap-2.5">
        <Kpi value={String(leaves.length)} label={`Activities · ${flatten(tree, "l2").length} capabilities`} />
        <Kpi value={`${linked.size} / ${appIds.size}`} label="Apps linked to a capability" />
        <Kpi value={moneyLabel(spend)} label="Annual spend rolled up" />
        <Kpi value={String(gaps)} label="Activities with no app" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-4">
        <Tabs label="Show" value={depth} options={DEPTHS} onChange={setDepth} testIdPrefix="heat-depth" />
        <Tabs label="Colour by" value={metric} options={METRICS} onChange={setMetric} testIdPrefix="heat-metric" />
        <div className="ml-auto flex items-center gap-2 text-[11.5px] text-[#6b7289]">
          {LEGEND[metric].map(([color, label], i) => (
            <span key={label} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-[#c0c3cc]">·</span>}
              <span
                className={cn(
                  "inline-block h-3.5 w-3.5 rounded-sm border border-black/5",
                  label === "No app" && "border-dashed bg-[#fafafb]",
                )}
                style={label === "No app" ? undefined : { background: color }}
              />
              {label}
            </span>
          ))}
        </div>
      </div>
      <div className={cn("grid gap-2.5", depth === "l1" ? "grid-cols-2 xl:grid-cols-4" : depth === "l3" ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")}>
        {tiles.map((node) => (
          <Tile key={node.id} node={node} metric={metric} depth={depth} onOpen={onOpen} />
        ))}
      </div>
      <p className="mt-4 max-w-[820px] text-[12px] text-[#8b90a0]">{FOOTNOTE[metric]}</p>
    </div>
  );
}

function Kpi({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#eef0f4] px-3.5 py-3">
      <div className="text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="mt-0.5 text-[12px] text-[#6b7289]">{label}</div>
    </div>
  );
}

function Tabs<T extends string>({ label, value, options, onChange, testIdPrefix }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; testIdPrefix?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[#8b90a0]">{label}</span>
      <div className="flex flex-wrap gap-0.5 rounded-lg bg-[#f3f4f8] p-0.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            data-testid={testIdPrefix ? `${testIdPrefix}-${option.id}` : undefined}
            className={cn("h-[26px] rounded-md px-2.5 text-[12.5px]", value === option.id ? "bg-white font-semibold text-[#1c2230] shadow-sm" : "text-[#4b5163]")}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Tile({ node, metric, depth, onOpen }: { node: TreeNode; metric: HeatMetric; depth: HeatDepth; onOpen?: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => node.id !== "no-domain" && onOpen?.(node.id)}
      className={cn("flex min-h-[88px] flex-col rounded-xl border p-3 text-left", TILE[heatClass(node, metric)])}
    >
      <div className="text-[13.5px] font-semibold">{node.name}</div>
      {node.level > 1 && node.domainId && depth !== "l1" && (
        <div className="text-[11px] opacity-70">{node.level === 3 ? "Activity" : "Capability"}</div>
      )}
      <div className="mt-0.5 text-[11.5px]">{heatMeta(node, metric)}</div>
      {depth !== "l3" && node.children.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {node.children.slice(0, 6).map((child) => (
            <span key={child.id} className="rounded bg-white/55 px-1.5 py-0.5 text-[11px] ring-1 ring-black/5">
              {child.name}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
