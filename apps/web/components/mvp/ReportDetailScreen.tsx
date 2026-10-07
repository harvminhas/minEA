"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, reportsPath, sectionForKind } from "@/lib/mvp-paths";
import { readRuntimeInfra } from "@/lib/infra/read";
import { agingSummary } from "@/lib/infra/status";
import { hostingMap, infraCost, singlePoints, withArticle } from "@/lib/reports/home";
import { countLabel } from "@/lib/labels";
import { criticalityClass } from "@/components/mvp/pills";
import { describeTypes } from "@/lib/ask/deterministic";
import { catalogStats, moneyLabel, vendorRollup, type CatalogRow } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { Pill } from "@/components/mvp/pills";
import { connectionPhrase, groupImpactHits, impactOf } from "@/lib/impact/relationship-impact";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { AiLandscapeReport } from "@/components/mvp/AiLandscapeReport";

export function ReportDetailScreen({ reportId }: { reportId: string }) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const catalog = useModelCatalog();
  const rows = catalog.data?.rows ?? [];
  const stats = catalogStats(rows);

  if (reportId === "ai-landscape") return <AiLandscapeReport />;
  if (reportId === "spend") return <SpendReport rows={rows} />;
  if (reportId === "single-points") return <SpofReport rows={rows} />;
  if (reportId === "hosting") return <HostingReport rows={rows} />;
  if (reportId === "infrastructure-cost") return <InfraCostReport rows={rows} />;
  if (reportId === "aging") return <AgingReport rows={rows} />;
  if (reportId === "impact") return <ImpactReport />;
  if (reportId === "sensitive-vendors" || reportId === "tech-debt") {
    return (
      <Shell title={reportId === "tech-debt" ? "Tech debt summary" : "Vendors holding sensitive data"} basePath={basePath}>
        <p className="text-[14px] text-[#6b7289]">
          {reportId === "tech-debt"
            ? "Tech debt is stored on each item. Open it in Model and use the Tech debt tab."
            : "Sensitivity of vendor data is not tracked yet, so this report does not list vendors."}
        </p>
      </Shell>
    );
  }

  const filtered =
    reportId === "renewals"
      ? rows.filter((row) => row.renewalSoon)
      : reportId === "ownership-gaps"
        ? stats.noOwner
        : reportId === "end-of-life" || reportId === "single-points"
          ? reportId === "single-points"
            ? rows.filter((row) => row.criticality === "tier1" || row.criticality === "critical")
            : stats.endOfLife
          : [];

  const title =
    reportId === "renewals"
      ? "Renewals next 90 days"
      : reportId === "ownership-gaps"
        ? "Ownership gaps"
        : reportId === "single-points"
          ? "Single points of failure"
          : "End of life & retiring";

  return (
    <Shell title={title} basePath={basePath}>
      <p className="mb-4 text-[14px] text-[#6b7289]">
        {filtered.length ? describeTypes(filtered.map((row) => row.typeLabel)) : "Nothing in this report"}
        {reportId === "single-points" ? ". These are marked critical. Ask what breaks if one of them goes down to see dependencies." : "."}
      </p>
      <RecordTable
        rows={filtered}
        onOpen={(row) => router.push(modelItemPath(basePath, sectionForKind(row.kind), row.id))}
      />
    </Shell>
  );
}

function SpofReport({ rows }: { rows: CatalogRow[] }) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const impact = useImpactGraph();
  const hosts = singlePoints(rows, impact.edges);
  return (
    <Shell title="Single points of failure" basePath={basePath}>
      <p className="mb-4 text-[14px] text-[#6b7289]">
        {hosts.length
          ? `${hosts.length} platforms or servers with 3 or more things running on or built on them`
          : "None found"}
      </p>
      <div className="space-y-3">
        {hosts.map((host) => (
          <div key={host.id} className="rounded-xl border border-[#e6e8ee] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <button type="button" className="text-[15px] font-semibold text-[#3f35b5]" onClick={() => router.push(modelItemPath(basePath, host.kind === "platform" ? "platforms" : "servers", host.id))}>
                  {host.name}
                </button>
                <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6b7289]">
                  <span>{host.typeLine}</span>
                  {host.statusLabel && <span className="rounded-full bg-[#fde8e8] px-2 py-0.5 text-[11px] font-semibold text-[#b42318]">{host.statusLabel}</span>}
                </div>
              </div>
              <div className="text-right text-[13px] text-[#6b7289]"><span className="text-[18px] font-semibold text-[#1c2230]">{host.count}</span> things run on or are built on it</div>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {host.dependents.map((item) => (
                <button key={item.id} type="button" onClick={() => router.push(modelItemPath(basePath, sectionForKind(rows.find((row) => row.id === item.id)?.kind ?? "application"), item.id))} className={`rounded-full px-2 py-0.5 text-[12px] font-medium ${criticalityClass(item.criticalityLabel)}`}>
                  {item.name}{item.criticalityLabel ? ` · ${item.criticalityLabel}` : ""}
                </button>
              ))}
            </div>
            <p className="mt-3 text-[13px] text-[#6b7289]">
              No backup or failover recorded for {withArticle(host.name, host.kind === "runtime")}.{" "}
              <Link href={askPath(basePath, `What breaks if ${withArticle(host.name, host.kind === "runtime")} goes down?`)} className="font-medium text-[#5b4ce6]">
                Ask what breaks if it goes down →
              </Link>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12px] text-[#8b90a0]">Counted from runs-on and built-on links only (hosting labels aren't used).</p>
    </Shell>
  );
}

function HostingReport({ rows }: { rows: CatalogRow[] }) {
  const { basePath } = useTenancy();
  const impact = useImpactGraph();
  const map = hostingMap(rows, impact.edges);
  return (
    <Shell title="Hosting map" basePath={basePath}>
      <p className="text-[14px] text-[#6b7289]">{countLabel(map.hosts, "host", "hosts")} · {map.unlinked} app{map.unlinked === 1 ? "" : "s"} with no host linked. Hosts come from runs-on and built-on links.</p>
    </Shell>
  );
}

function InfraCostReport({ rows }: { rows: CatalogRow[] }) {
  const { basePath } = useTenancy();
  const cost = infraCost(rows);
  return (
    <Shell title="Infrastructure cost" basePath={basePath}>
      <p className="text-[14px] text-[#1c2230]">
        {moneyLabel(cost.total)} a year. Platforms {moneyLabel(cost.platforms)}. Servers and devices {moneyLabel(cost.servers)}.
      </p>
    </Shell>
  );
}

function AgingReport({ rows }: { rows: CatalogRow[] }) {
  const { basePath } = useTenancy();
  const router = useRouter();
  const summary = agingSummary(rows.filter((row) => row.kind === "runtime").map((row) => readRuntimeInfra(row.object)), new Date());
  const groups = [
    ["Out of support", summary.items.filter((item) => item.status.status === "out_of_support")],
    ["Unsupported OS", summary.items.filter((item) => item.status.status === "unsupported_os")],
    ["Ends in 90 days", summary.items.filter((item) => item.status.status === "ends_soon")],
    ["Not set", summary.items.filter((item) => item.status.status === "unknown")],
  ] as const;
  const byId = new Map(rows.map((row) => [row.id, row]));
  return (
    <Shell title="Aging infrastructure" basePath={basePath}>
      <p className="mb-4 text-[14px] text-[#6b7289]">
        {summary.outOfSupportOrOs} out of support or on an unsupported OS · {summary.endsSoon} ending in 90 days.
      </p>
      {groups.map(([title, items]) => items.length === 0 ? null : (
        <div key={title} className="mb-4">
          <h2 className="mb-2 text-[13px] font-semibold text-[#1c2230]">{title}</h2>
          <div className="divide-y divide-[#f0f1f5] rounded-xl border border-[#e6e8ee]">
            {items.map((item) => {
              const row = item.runtime.id ? byId.get(item.runtime.id) : undefined;
              if (!row) return null;
              return (
                <button key={row.id} type="button" onClick={() => router.push(modelItemPath(basePath, "servers", row.id))} className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] hover:bg-[#fafafb]">
                  <span>
                    <span className="font-medium text-[#1c2230]">{row.name}</span>
                    <span className="mt-0.5 block text-[12px] text-[#8b90a0]">{item.status.reason}</span>
                  </span>
                  <span className="text-[#6b7289]">{item.status.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </Shell>
  );
}

function ImpactReport() {
  const { basePath } = useTenancy();
  const graph = useImpactGraph();
  const groups = useMemo(
    () =>
      graph.nodes
        .map((node) => ({ node, hits: impactOf(graph.nodes, graph.edges, node.id) }))
        .filter((item) => item.hits.length > 0)
        .sort((a, b) => b.hits.length - a.hits.length || a.node.name.localeCompare(b.node.name)),
    [graph.nodes, graph.edges]
  );

  return (
    <Shell title="Impact analysis" basePath={basePath}>
      <p className="mb-4 text-[14px] text-[#6b7289]">
        What is affected if an application, capability, or infrastructure item fails. This uses the same links as Ask and Depends on this.
      </p>
      {graph.isLoading && <p className="text-[13px] text-[#8b90a0]">Looking up relationships…</p>}
      {!graph.isLoading && groups.length === 0 && (
        <p className="text-[13px] text-[#8b90a0]">No failure links yet.</p>
      )}
      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.node.id}>
            <h2 className="text-[15px] font-semibold text-[#1c2230]">If {group.node.name} fails</h2>
            {groupImpactHits(group.hits).map((section) => (
              <div key={section.title} className="mt-2">
                <p className="text-[12px] font-semibold text-[#3c4254]">
                  {section.title} · {section.hits.length}
                </p>
                {section.hits.map((hit) => (
                  <div key={hit.id} className="border-b border-[#f3f4f8] py-2 text-[13px]">
                    <div className="font-medium text-[#1c2230]">{hit.name}</div>
                    <p className="text-[12px] text-[#8b90a0]">{connectionPhrase(hit, graph.nodes)}</p>
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
    </Shell>
  );
}

function SpendReport({ rows }: { rows: CatalogRow[] }) {
  const { basePath } = useTenancy();
  const vendors = vendorRollup(rows);
  const total = vendors.reduce((sum, vendor) => sum + vendor.annual, 0);
  const top = vendors.slice(0, 3).reduce((sum, vendor) => sum + vendor.annual, 0);
  const topShare = total ? Math.round((top / total) * 100) : 0;
  const largest = vendors[0];
  const renewing = rows.filter((row) => row.renewalSoon);
  const renewingSpend = renewing.reduce((sum, row) => sum + (row.annualCostNumber ?? 0), 0);
  const uncounted = rows.filter((row) => row.vendor && row.annualCostNumber == null);
  const max = vendors[0]?.annual || 1;

  const exportCsv = () => {
    const lines = [
      ["Vendor", "Annual cost", "Renewal", "Owner", "Items"].join(","),
      ...vendors.map((vendor) =>
        [vendor.vendor, String(vendor.annual), vendor.renewal?.renewalLabel ?? "", [...vendor.owners].join("; "), String(vendor.items.length)]
          .map((cell) => `"${cell.replace(/"/g, '""')}"`)
          .join(",")
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "spend-by-vendor.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Shell title="Spend by vendor & category" basePath={basePath} onExport={exportCsv}>
      <p className="text-[15px] text-[#1c2230]">
        You spend <strong>{total ? moneyLabel(total) : "—"}</strong> a year across {vendors.length} vendors.
        {largest && topShare ? ` ${vendors.slice(0, 3).map((vendor) => vendor.vendor).join(", ")} make up ${topShare}% of it.` : ""}
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kpi label="Annual spend tracked" value={total ? moneyLabel(total) : "—"} detail={total ? `about ${moneyLabel(Math.round(total / 12))} a month` : ""} />
        <Kpi label="Largest vendor" value={largest?.vendor ?? "—"} detail={largest ? `${moneyLabel(largest.annual)} · ${total ? Math.round((largest.annual / total) * 100) : 0}%` : ""} />
        <Kpi label="Renewing in 90 days" value={renewingSpend ? moneyLabel(renewingSpend) : "—"} detail={`${renewing.length} contracts`} />
        <Kpi label="Not counted yet" value={`${uncounted.length} items`} detail={uncounted.slice(0, 2).map((row) => row.name).join(", ") || "Costs without a number"} warn />
      </div>
      <div className="mt-6 space-y-2">
        {vendors.map((vendor) => (
          <div key={vendor.vendor} className="flex items-center gap-3 text-[13px]">
            <div className="w-40 truncate text-[#1c2230]">{vendor.vendor}</div>
            <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#f3f4f8]">
              <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${Math.max(4, (vendor.annual / max) * 100)}%` }} />
            </div>
            <div className="w-28 text-right text-[#3c4254]">{vendor.annual ? moneyLabel(vendor.annual) : "—"}</div>
          </div>
        ))}
        {vendors.length === 0 && <p className="text-[13px] text-[#8b90a0]">No vendor spend yet.</p>}
      </div>
      <table className="mt-6 w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
            {["Vendor", "Annual cost", "Renewal date", "Owner", "Items covered"].map((heading) => (
              <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {vendors.map((vendor) => (
            <tr key={vendor.vendor} className="border-b border-[#f3f4f8]">
              <td className="px-2 py-3 font-medium">{vendor.vendor}</td>
              <td className="px-2 py-3">{vendor.annual ? moneyLabel(vendor.annual) : "—"}</td>
              <td className="px-2 py-3">
                {vendor.renewal?.renewalLabel || "—"}
                {vendor.renewal?.renewalSoon && <span className="ml-2 rounded-full bg-[#fff7ed] px-1.5 py-0.5 text-[10px] font-semibold text-[#c2410c]">within 90 days</span>}
              </td>
              <td className="px-2 py-3">{[...vendor.owners].join(", ") || "—"}</td>
              <td className="px-2 py-3">{vendor.items.length} · {vendor.items.map((item) => item.name).slice(0, 3).join(", ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}

function Shell({
  title,
  basePath,
  children,
  onExport,
}: {
  title: string;
  basePath: string;
  children: React.ReactNode;
  onExport?: () => void;
}) {
  return (
    <div className="px-8 py-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13px] text-[#6b7289]">
          <Link href={reportsPath(basePath)} className="hover:text-[#1c2230]">Reports</Link>
          <span> / </span>
          <span className="text-[#1c2230]">{title}</span>
        </div>
        {onExport && (
          <button type="button" onClick={onExport} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
            Export
          </button>
        )}
      </div>
      <h1 className="mb-3 text-[22px] font-semibold text-[#1c2230]">{title}</h1>
      {children}
    </div>
  );
}

function Kpi({ label, value, detail, warn }: { label: string; value: string; detail: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${warn ? "border-[#f3e3c0] bg-[#fff8eb]" : "border-[#e6e8ee]"}`}>
      <div className="text-[12px] text-[#6b7289]">{label}</div>
      <div className="mt-1 text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="text-[12px] text-[#8b90a0]">{detail}</div>
    </div>
  );
}

function RecordTable({ rows, onOpen }: { rows: CatalogRow[]; onOpen: (row: CatalogRow) => void }) {
  if (rows.length === 0) return <p className="text-[13px] text-[#8b90a0]">Nothing matches this report.</p>;
  return (
    <table className="w-full text-left text-[13px]">
      <thead>
        <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
          {["Name", "Type", "Owner", "Vendor", "Annual cost", "Renewal", "Lifecycle"].map((heading) => (
            <th key={heading} className="h-11 px-2 font-medium">{heading}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} onClick={() => onOpen(row)} className="cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]">
            <td className="px-2 py-3 font-medium">{row.name}</td>
            <td className="px-2 py-3">{row.typeLabel}</td>
            <td className="px-2 py-3">{row.ownerTeam || row.ownerPerson || "—"}</td>
            <td className="px-2 py-3">{row.vendor || "—"}</td>
            <td className="px-2 py-3">{row.annualCostLabel}</td>
            <td className="px-2 py-3">{row.renewalLabel || "—"}</td>
            <td className="px-2 py-3">{row.lifecycleLabel ? <Pill label={row.lifecycleLabel} tone="lifecycle" /> : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
