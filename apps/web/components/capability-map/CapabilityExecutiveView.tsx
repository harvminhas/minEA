"use client";

import Link from "next/link";
import type { MinEAObject, Relationship } from "@minea/types";
import type { CatalogRow } from "@/lib/model-catalog";
import { cn } from "@/lib/utils";
import { buildCapabilityTree, moneyLabel, type TreeNode } from "@/lib/capability-tree";
import { capabilityDetailPath } from "@/lib/capability-detail";
import {
  assessCapability,
  criticalityLabel,
  dispositionLabel,
  domainIdentityColor,
  domainLensRollup,
  executiveKpis,
  isExecutiveTileMuted,
  orderedDomainIdsFromTree,
  parseDisposition,
  postureLabel,
  retireSavings,
  technologyFitLabel,
  type BusinessCriticality,
  type CapabilityRecord,
  type Disposition,
  type InvestmentPosture,
} from "@/lib/capability-assessment";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

export type ExecutiveLens = "posture" | "spend" | "risk" | "coverage";

const LENSES: { id: ExecutiveLens; label: string }[] = [
  { id: "posture", label: "Investment posture" },
  { id: "spend", label: "Spend" },
  { id: "risk", label: "Risk" },
  { id: "coverage", label: "Coverage" },
];

const POSTURE_LEGEND: { id: InvestmentPosture | "none"; label: string; swatch: string; dashed?: boolean }[] = [
  { id: "invest", label: "Invest", swatch: "#dbeafe" },
  { id: "tolerate", label: "Tolerate", swatch: "#e5e7eb" },
  { id: "migrate", label: "Migrate", swatch: "#ffedd5" },
  { id: "eliminate", label: "Eliminate", swatch: "#fee2e2" },
  { id: "none", label: "Not assessed", swatch: "#fafafb", dashed: true },
];

const LENS_LEGEND: Record<ExecutiveLens, { label: string; swatch: string; dashed?: boolean }[]> = {
  posture: POSTURE_LEGEND.map(({ label, swatch, dashed }) => ({ label, swatch, dashed })),
  spend: [
    { label: "None", swatch: "#fafafb", dashed: true },
    { label: "Low", swatch: "#d1fae5" },
    { label: "Medium", swatch: "#6ee7b7" },
    { label: "High", swatch: "#059669" },
  ],
  risk: [
    { label: "Low", swatch: "#ecfdf5" },
    { label: "Medium", swatch: "#ffedd5" },
    { label: "High / Critical", swatch: "#fee2e2" },
    { label: "Not assessed", swatch: "#fafafb", dashed: true },
  ],
  coverage: [
    { label: "Gap", swatch: "#fef2f2" },
    { label: "Partial", swatch: "#fff7ed" },
    { label: "Mostly covered", swatch: "#f7fee7" },
    { label: "Covered", swatch: "#ecfdf5" },
  ],
};

const POSTURE_TILE: Record<InvestmentPosture | "none", string> = {
  invest: "bg-blue-50 border-blue-200 text-blue-900",
  tolerate: "bg-slate-50 border-slate-200 text-slate-800",
  migrate: "bg-orange-50 border-orange-200 text-orange-900",
  eliminate: "bg-rose-50 border-rose-200 text-rose-900",
  none: "border-dashed border-[#e6e8ee] bg-[#fafafb] text-[#4b5163]",
};

const POSTURE_PILL: Record<InvestmentPosture | "none", string> = {
  invest: "bg-blue-600 text-white",
  tolerate: "bg-slate-600 text-white",
  migrate: "bg-orange-500 text-white",
  eliminate: "bg-rose-600 text-white",
  none: "bg-white text-[#6b7289] ring-1 ring-inset ring-[#d1d5db]",
};

const RISK_TILE: Record<BusinessCriticality | "none", string> = {
  low: "bg-emerald-50 border-emerald-200 text-emerald-900",
  medium: "bg-orange-50 border-orange-200 text-orange-900",
  high: "bg-rose-50 border-rose-200 text-rose-900",
  critical: "bg-rose-100 border-rose-300 text-rose-950",
  none: "border-dashed border-[#e6e8ee] bg-[#fafafb] text-[#4b5163]",
};

const COVERAGE_TILE: Record<string, string> = {
  covered: "bg-emerald-50 border-emerald-200 text-emerald-900",
  mostly: "bg-lime-50 border-lime-200 text-lime-900",
  partial: "bg-orange-50 border-orange-200 text-orange-900",
  gap: "bg-rose-50 border-rose-200 text-rose-900",
};

function spendTile(cost: number, max: number): string {
  if (!cost) return "border-dashed border-[#e6e8ee] bg-[#fafafb] text-[#4b5163]";
  if (max <= 0 || cost <= max * 0.33) return "bg-emerald-100 border-emerald-200 text-emerald-900";
  if (cost <= max * 0.66) return "bg-emerald-300 border-emerald-400 text-emerald-950";
  return "bg-emerald-600 border-emerald-700 text-emerald-50";
}

function tileClass(lens: ExecutiveLens, node: TreeNode, posture: InvestmentPosture | null, criticality: BusinessCriticality | null, maxSpend: number): string {
  if (lens === "posture") return POSTURE_TILE[posture ?? "none"];
  if (lens === "spend") return spendTile(node.cost, maxSpend);
  if (lens === "risk") return RISK_TILE[criticality ?? "none"];
  return COVERAGE_TILE[node.coverage] ?? COVERAGE_TILE.gap;
}

export function CapabilityExecutiveView({
  objects,
  edges,
  rows,
  basePath,
  focusDomainId,
  selectedId,
  lens,
  onLens,
  onOpenCap,
  onOpenDomain,
  onClosePanel,
}: {
  objects: readonly MinEAObject[];
  edges: readonly Relationship[];
  rows: readonly CatalogRow[];
  basePath: string;
  focusDomainId?: string | null;
  selectedId?: string | null;
  lens: ExecutiveLens;
  onLens: (lens: ExecutiveLens) => void;
  onOpenCap: (id: string, domainId: string | null) => void;
  onOpenDomain: (id: string) => void;
  onClosePanel: () => void;
}) {
  const records = objects as unknown as CapabilityRecord[];
  const tree = useMemo(() => buildCapabilityTree(objects, edges, rows), [objects, edges, rows]);
  const kpis = useMemo(() => {
    const domainName = focusDomainId ? (objects.find((item) => item.id === focusDomainId)?.name ?? null) : null;
    return executiveKpis(records, edges, rows, tree, focusDomainId ? { domainId: focusDomainId, domainName } : undefined);
  }, [records, edges, rows, tree, objects, focusDomainId]);
  const domains = focusDomainId ? tree.filter((node) => node.id === focusDomainId) : tree;
  const sections = (domains.length ? domains : tree).filter((node) => node.children.length > 0 || node.id !== "no-domain");
  const maxSpend = Math.max(0, ...tree.flatMap((domain) => domain.children.map((child) => child.cost)));
  const estateSpend = tree.reduce((sum, domain) => sum + domain.cost, 0);
  const estateDomainIds = useMemo(() => orderedDomainIdsFromTree(tree), [tree]);
  const byId = useMemo(() => new Map(objects.map((object) => [object.id, object])), [objects]);
  const selected = selectedId
    ? sections.flatMap((domain) => domain.children).find((node) => node.id === selectedId) ??
      tree.flatMap((domain) => domain.children).find((node) => node.id === selectedId)
    : undefined;

  return (
    <div data-testid="capability-executive-view">
      <div>
        {kpis.scopeLabel ? (
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-[#8b90a0]" data-testid="exec-kpi-scope">
            {kpis.scopeLabel}
          </div>
        ) : null}
      <div className="grid grid-cols-4 items-start gap-5">
        <Kpi
          testId="exec-kpi-cost"
          value={kpis.runCost.empty ? "—" : kpis.runCost.label}
          label="Annual IT run cost"
          hint={kpis.runCost.hint}
        />
        <Kpi
          testId="exec-kpi-exposure"
          value={kpis.exposure.label}
          label="Exposure"
          hint={kpis.exposure.hint}
          tone={kpis.exposure.empty || kpis.exposure.value === 0 ? undefined : "red"}
        />
        <Kpi
          testId="exec-kpi-savings"
          value={kpis.savings.empty ? "—" : kpis.savings.label}
          label="Rationalisation savings"
          hint={kpis.savings.hint}
          tone={kpis.savings.empty ? undefined : "blue"}
          emphasize={!kpis.savings.empty}
        />
        <Kpi
          testId="exec-kpi-complete"
          value={kpis.completeness.total ? `${kpis.completeness.assessed} / ${kpis.completeness.total}` : "—"}
          label="Map completeness"
          hint={kpis.completeness.hint}
        />
      </div>
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-[#eef0f4] pb-3">
        <div>
          <div className="mb-1 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">VIEW BY</div>
          <div className="flex flex-wrap gap-1" role="tablist" aria-label="View by">
            {LENSES.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={lens === item.id}
                data-testid={`exec-lens-${item.id}`}
                onClick={() => onLens(item.id)}
                className={cn(
                  "border-b-2 px-2 pb-1 text-[13px]",
                  lens === item.id ? "border-[#1c2230] font-semibold text-[#1c2230]" : "border-transparent text-[#5b6170]",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 pb-1 text-[12.5px] text-[#3d4354]" data-testid="exec-legend">
          {LENS_LEGEND[lens].map((item) => (
            <span key={item.label} className="inline-flex items-center gap-1.5">
              <span
                className={cn("inline-block h-3.5 w-3.5 rounded-[3px] border border-black/10", item.dashed && "border-dashed bg-[#fafafb]")}
                style={item.dashed ? undefined : { background: item.swatch }}
              />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className={cn("grid items-start gap-4", selected ? "lg:grid-cols-[minmax(0,1fr)_320px]" : "")}>
        <div className="flex min-w-0 flex-col gap-6">
          {sections.map((domain) => {
            const identity = domainIdentityColor(domain.id, estateDomainIds);
            const rollup = domainLensRollup(domain, records, edges, lens, estateSpend);
            return (
            <section
              key={domain.id}
              data-testid={`exec-domain-${domain.id}`}
              className="rounded-xl py-3 pr-3.5 pl-4"
              style={{
                background: `rgba(${identity.rgb}, 0.045)`,
                boxShadow: `inset 3px 0 0 rgb(${identity.rgb})`,
              }}
            >
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <button
                  type="button"
                  data-testid={`exec-domain-pill-${domain.id}`}
                  className="inline-flex max-w-full shrink-0 rounded-full px-2.5 py-[3px] text-left text-[13px] font-semibold tracking-[-0.01em] disabled:cursor-default"
                  style={{ background: `rgba(${identity.rgb}, 0.14)`, color: `rgb(${identity.ink})` }}
                  disabled={domain.id === "no-domain"}
                  onClick={() => domain.id !== "no-domain" && onOpenDomain(domain.id)}
                >
                  {domain.name}
                </button>
                <DomainRollupBar rollup={rollup} />
              </div>
              <div className={cn("grid gap-2.5", selected || focusDomainId ? "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3" : "grid-cols-2 md:grid-cols-3 xl:grid-cols-4")}>
                {domain.children.map((node) => {
                  const cap = byId.get(node.id) as CapabilityRecord | undefined;
                  const assessment = assessCapability(cap, records, edges);
                  const muted = isExecutiveTileMuted(lens, node.cost, assessment.posture, assessment.businessCriticality);
                  return (
                    <button
                      key={node.id}
                      type="button"
                      id={`exec-cap-${node.id}`}
                      data-testid={`exec-tile-${node.id}`}
                      data-muted={muted ? "true" : "false"}
                      aria-pressed={selectedId === node.id}
                      onClick={() => onOpenCap(node.id, node.domainId)}
                      className={cn(
                        "flex min-h-[92px] flex-col rounded-[10px] border p-3 text-left",
                        muted
                          ? "border-dashed border-[#eceef3] bg-[#fcfcfd] text-[#8b90a0]"
                          : tileClass(lens, node, assessment.posture, assessment.businessCriticality, maxSpend),
                        selectedId === node.id && "ring-2 ring-[#5b4ce6] ring-offset-2",
                      )}
                    >
                      <div className={cn("text-[13px] leading-snug tracking-[-0.01em]", muted ? "font-medium text-[#6b7289]" : "font-semibold")}>{node.name}</div>
                      <span
                        className={cn(
                          "mt-2 inline-flex w-fit rounded-full px-1.5 py-0.5 text-[10.5px]",
                          assessment.posture
                            ? cn("font-semibold", POSTURE_PILL[assessment.posture])
                            : "bg-transparent font-medium text-[#9aa0ae] ring-1 ring-inset ring-[#e6e8ee]",
                        )}
                      >
                        {postureLabel(assessment.posture)}
                      </span>
                      <div className={cn("mt-auto pt-2 text-[11.5px]", muted ? "text-[#9aa0ae] opacity-70" : "opacity-80")}>
                        {moneyLabel(node.cost)} · {node.uniqueAppIds.length} app{node.uniqueAppIds.length === 1 ? "" : "s"}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
            );
          })}
        </div>

        {selected ? (
          <ExecutivePanel
            node={selected}
            object={byId.get(selected.id) as CapabilityRecord | undefined}
            objects={records}
            edges={edges}
            rows={rows}
            domainName={byId.get(selected.domainId ?? "")?.name ?? ""}
            architectHref={capabilityDetailPath(basePath, selected.id)}
            onClose={onClosePanel}
          />
        ) : null}
      </div>
    </div>
  );
}

function Kpi({
  value,
  label,
  hint,
  tone,
  emphasize,
  testId,
}: {
  value: string;
  label: string;
  hint: string;
  tone?: "red" | "blue";
  emphasize?: boolean;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        "rounded-2xl bg-white px-[22px] pb-4 pt-[18px]",
        emphasize ? "border-2 border-[#4f46e5]" : "border border-[#e2e8f0]",
      )}
      data-testid={testId}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={testId ? `${testId}-hint` : undefined}
        data-testid={testId ? `${testId}-hint-toggle` : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <span className="text-[16px] font-semibold leading-5 text-[#475569]">{label}</span>
        <span
          className={cn(
            "inline-flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-md text-[#64748b]",
            open && "bg-[#eef2ff] text-[#4f46e5]",
          )}
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      <div
        className={cn(
          "mt-2.5 text-[36px] font-bold leading-none tracking-[-0.02em] text-[#0f172a]",
          tone === "red" && "text-[#b91c1c]",
          tone === "blue" && "text-[#1d4ed8]",
        )}
      >
        {value}
      </div>
      {open ? (
        <div id={testId ? `${testId}-hint` : undefined} className="mt-3.5 text-[15px] font-normal leading-6 text-[#334155]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ExecutivePanel({
  node,
  object,
  objects,
  edges,
  rows,
  domainName,
  architectHref,
  onClose,
}: {
  node: TreeNode;
  object?: CapabilityRecord;
  objects: readonly CapabilityRecord[];
  edges: readonly Relationship[];
  rows: readonly CatalogRow[];
  domainName: string;
  architectHref: string;
  onClose: () => void;
}) {
  const assessment = assessCapability(object, objects, edges);
  const fromIds = new Set([node.id, ...node.children.map((child) => child.id)]);
  const savings = retireSavings(objects, edges, rows, fromIds);
  const links = edges.filter((edge) => edge.type === "supported_by" && fromIds.has(edge.from_object_id));
  const apps: { id: string; name: string; disposition: Disposition | null }[] = [];
  const seen = new Set<string>();
  const byId = new Map(objects.map((item) => [item.id, item]));
  for (const link of links) {
    if (seen.has(link.to_object_id)) continue;
    const app = byId.get(link.to_object_id);
    if (!app) continue;
    seen.add(app.id);
    const dispositions = links
      .filter((item) => item.to_object_id === app.id)
      .map((item) => parseDisposition(item.attributes?.disposition))
      .filter((item): item is Disposition => Boolean(item));
    apps.push({ id: app.id, name: app.name, disposition: dispositions[0] ?? null });
  }
  apps.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <aside className="rounded-xl border border-[#e6e8ee] bg-white p-4 shadow-[0_1px_2px_rgba(28,34,48,0.04)]" data-testid="exec-detail-panel">
      <div className="flex items-start justify-between gap-2">
        <div>
          {domainName ? <p className="text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">{domainName.toUpperCase()}</p> : null}
          <h2 className="mt-0.5 text-[18px] font-semibold tracking-[-0.02em] text-[#1c2230]">{node.name}</h2>
          {object && (object.owner || object.point_of_contact_name) ? (
            <p className="mt-0.5 text-[12.5px] text-[#6b7289]">Business owner: {object.owner || object.point_of_contact_name}</p>
          ) : (
            <p className="mt-0.5 text-[12.5px] text-[#6b7289]">Business owner not set</p>
          )}
        </div>
        <button type="button" onClick={onClose} className="text-[18px] leading-none text-[#8b90a0]" aria-label="Close panel">
          ×
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Mini label="Annual spend" value={moneyLabel(node.cost)} />
        <Mini label="Investment posture" value={postureLabel(assessment.posture)} tone={assessment.posture ?? undefined} />
        <Mini label="Est. savings" value={savings.appIds.length ? moneyLabel(savings.amount) : "—"} />
        <Mini label="Business criticality" value={criticalityLabel(assessment.businessCriticality)} />
        <Mini label="Technology fit" value={assessment.technologyFit != null ? `${assessment.technologyFit} of 5` : "Not assessed"} className="col-span-2" />
      </div>
      {assessment.technologyFitSource === "default" ? (
        <p className="mt-1 text-[11px] text-[#8b90a0]">{technologyFitLabel(assessment.technologyFit, "default")}</p>
      ) : null}

      <h3 className="mt-4 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">APPLICATIONS</h3>
      {apps.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#6b7289]">No applications linked</p>
      ) : (
        <ul className="mt-1 divide-y divide-[#f3f4f8]">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center justify-between gap-2 py-1.5 text-[13px]">
              <span className="text-[#1c2230]">{app.name}</span>
              <span className={cn("text-[12px]", app.disposition === "retire" ? "font-medium text-rose-700" : "text-[#6b7289]")}>
                {dispositionLabel(app.disposition)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h3 className="mt-4 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">
        ACTIVITIES · {node.coveredLeaves} of {node.leafCount} supported
      </h3>
      {node.children.length === 0 ? (
        <p className="mt-1 text-[13px] text-[#6b7289]">No activities</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {node.children.map((activity) => (
            <li key={activity.id} className="flex items-center justify-between gap-2 text-[13px]">
              <span className="text-[#1c2230]">{activity.name}</span>
              <span className={cn("text-[12px]", activity.uniqueAppIds.length ? "text-emerald-700" : "text-rose-700")}>
                {activity.uniqueAppIds.length ? "Supported" : "No system"}
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href={architectHref}
        data-testid="exec-open-architect"
        className="mt-4 inline-flex text-[13px] font-medium text-[#4a43c9]"
      >
        Open in Architect workspace
      </Link>
    </aside>
  );
}

function DomainRollupBar({ rollup }: { rollup: ReturnType<typeof domainLensRollup> }) {
  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3" data-testid="exec-domain-rollup">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-2 w-[148px] shrink-0 overflow-hidden rounded-full bg-[#eef0f4]" aria-hidden="true">
          {rollup.segments.map((segment) => (
            <span key={segment.key} className="block h-full" style={{ width: `${segment.fraction * 100}%`, background: segment.color }} />
          ))}
        </div>
        <span className="whitespace-nowrap text-[12px] text-[#5b6170]">
          <strong className="font-semibold text-[#1c2230]">
            {rollup.assessed} of {rollup.total} assessed
          </strong>
        </span>
      </div>
      <span className="whitespace-nowrap text-[12.5px] font-semibold text-[#1c2230]">{rollup.spendLabel}</span>
    </div>
  );
}

function Mini({ label, value, tone, className }: { label: string; value: string; tone?: string; className?: string }) {
  return (
    <div className={cn("rounded-lg bg-[#fafafb] px-2.5 py-2", className)}>
      <div className="text-[10.5px] font-semibold tracking-[0.06em] text-[#8b90a0]">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-[#1c2230]">{value}</div>
    </div>
  );
}
