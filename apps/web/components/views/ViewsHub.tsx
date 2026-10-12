"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarClock, Cloud, HelpCircle, Monitor, Server, Sparkles, UserX, Waypoints } from "lucide-react";
import { useTenancy } from "@/lib/tenancy";
import { modelPath, reportPath, viewsImpactPath, type ModelSection } from "@/lib/mvp-paths";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { attentionCount, viewsHub, type HubCard, type HubTone } from "@/lib/views-hub/hub";

const ACCENT: Record<HubTone, string> = {
  red: "border-[#fecaca] before:bg-[#ef4444]",
  amber: "border-[#fde68a] before:bg-[#f59e0b]",
  ok: "border-[#e6e8ee] before:bg-transparent",
  empty: "border-dashed border-[#e6e8ee] before:bg-transparent",
};
const PILL: Record<HubTone, string> = {
  red: "bg-[#fef2f2] text-[#b42318]",
  amber: "bg-[#fff7ed] text-[#b45309]",
  ok: "bg-[#ecfdf3] text-[#047857]",
  empty: "bg-[#f3f4f8] text-[#6b7289]",
};
const ICON: Record<HubCard["id"], React.ReactNode> = {
  ai: <Sparkles size={16} />,
  spof: <Waypoints size={16} />,
  owners: <UserX size={16} />,
  hosting: <Cloud size={16} />,
  impact: <AlertTriangle size={16} />,
  renewals: <CalendarClock size={16} />,
};

export function ViewsHub() {
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const rows = catalog.data?.rows;
  const objects = catalog.data?.objects;
  const relationships = catalog.data?.relationships;
  const cards = useMemo(
    () => viewsHub({ rows: rows ?? [], edges: impact.edges, objects: objects ?? [], relationships: relationships ?? [] }),
    [rows, impact.edges, objects, relationships],
  );
  const attention = attentionCount(cards);
  const apps = (rows ?? []).filter((row) => row.kind === "application").length;
  const servers = (rows ?? []).filter((row) => row.kind === "runtime").length;
  const agents = (objects ?? []).filter((item) => item.type === "agent").length;

  const hrefOf = (card: HubCard) => {
    const open = card.open;
    if (open.kind === "report") return reportPath(basePath, open.reportId);
    if (open.kind === "model") return modelPath(basePath, open.section as ModelSection);
    return viewsImpactPath(basePath, open.sel);
  };

  return (
    <div className="mx-auto max-w-[1180px] px-8 py-7" data-testid="views-hub">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">VIEWS</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold text-[#1c2230]">{attention ? "What needs your attention" : "Your map at a glance"}</h1>
          <p className="mt-1 text-[14px] text-[#6b7289]">
            {catalog.isLoading && !catalog.data
              ? "Loading your map…"
              : `${apps} app${apps === 1 ? "" : "s"} · ${servers} server${servers === 1 ? "" : "s"} · ${agents} AI agent${agents === 1 ? "" : "s"}. Live from your map; open any card for the full view.`}
          </p>
        </div>
        {attention > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-[#fff7ed] px-3 py-1 text-[12px] font-medium text-[#b45309]">
            <AlertTriangle size={13} /> {attention} need{attention === 1 ? "s" : ""} attention
          </span>
        )}
      </div>
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.id}
            href={hrefOf(card)}
            data-card={card.id}
            data-tone={card.tone}
            className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition hover:-translate-y-0.5 hover:shadow-md before:absolute before:inset-x-0 before:top-0 before:h-1 ${ACCENT[card.tone]}`}
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f4f3ff] text-[#5b4ce6]">{ICON[card.id]}</span>
              <h2 className="text-[14px] font-semibold text-[#1c2230]">{card.title}</h2>
              <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${PILL[card.tone]}`}>{card.pill}</span>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span data-big className={`${card.big.length > 8 ? "text-[22px]" : "text-[34px]"} font-semibold leading-none tracking-tight text-[#1c2230]`}>{card.big}</span>
              {card.unit && <span className="text-[13px] text-[#6b7289]">{card.unit}</span>}
            </div>
            <p className="mt-1.5 text-[13px] text-[#4b5163]">{card.line}</p>
            <div className="mt-4 flex-1">
              <Preview card={card} />
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-[#f3f4f8] pt-3 text-[13px] font-medium text-[#5b4ce6]">
              <span>{card.open.label}</span>
              <ArrowRight size={15} className="transition group-hover:translate-x-0.5" />
            </div>
          </Link>
        ))}
      </div>
      <p className="mt-6 text-[12px] text-[#8b90a0]">
        Cards with something to fix come first; red is high risk, amber is worth checking. Counts match the reports they open.
      </p>
    </div>
  );
}

function Tag({ text, tone }: { text: string; tone?: "red" | "amber" }) {
  if (!text) return null;
  const cls = tone === "red" ? "bg-[#fef2f2] text-[#b42318]" : tone === "amber" ? "bg-[#fff7ed] text-[#b45309]" : "bg-[#f3f4f8] text-[#4b5163]";
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{text}</span>;
}

function MiniList({ rows }: { rows: { name: string; tag: string; tone?: "red" | "amber" }[] }) {
  return (
    <ul className="space-y-1.5 text-[12.5px]">
      {rows.map((row, index) => (
        <li key={`${row.name}-${index}`} className="flex items-center justify-between gap-2">
          <span className="truncate text-[#1c2230]" title={row.name}>{row.name}</span>
          <Tag text={row.tag} tone={row.tone} />
        </li>
      ))}
    </ul>
  );
}

function Preview({ card }: { card: HubCard }) {
  switch (card.id) {
    case "ai": {
      const p = card.preview;
      if (card.tone === "empty") return null;
      return (
        <div>
          <div className="flex gap-1.5">
            {p.flags.map((flag) => (
              <span
                key={flag.id}
                title={`${flag.id} · ${flag.title}`}
                className={`flex-1 rounded-md py-1.5 text-center text-[11px] font-semibold ${flag.count === 0 ? "bg-[#f3f4f8] text-[#8b90a0]" : flag.high ? "bg-[#fef2f2] text-[#b42318]" : "bg-[#fff7ed] text-[#b45309]"}`}
              >
                {flag.id}
                <span className="block text-[13px]">{flag.count}</span>
              </span>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-[#6b7289]">
            {p.agents} agent{p.agents === 1 ? "" : "s"} · {p.models} model{p.models === 1 ? "" : "s"} · {p.features} AI feature{p.features === 1 ? "" : "s"} in your tools
          </p>
        </div>
      );
    }
    case "spof":
      return card.preview.length ? (
        <MiniList rows={card.preview.map((host) => ({ name: host.name, tag: `${host.count} depend`, tone: host.count >= 5 ? "red" : "amber" }))} />
      ) : null;
    case "owners":
      return card.preview.length ? (
        <MiniList rows={[...card.preview.map((row) => ({ name: row.name, tag: row.type })), ...(card.more ? [{ name: `+ ${card.more} more`, tag: "" }] : [])]} />
      ) : null;
    case "hosting": {
      const p = card.preview;
      const parts = [
        { label: "Cloud (SaaS)", n: p.cloud, color: "#5b4ce6", icon: <Cloud size={12} /> },
        { label: "Our servers", n: p.servers, color: "#0ea5e9", icon: <Server size={12} /> },
        { label: "On people's computers", n: p.desktop, color: "#14b8a6", icon: <Monitor size={12} /> },
        { label: "Don't know", n: p.unknown, color: "#f59e0b", icon: <HelpCircle size={12} /> },
      ];
      const total = parts.reduce((sum, part) => sum + part.n, 0);
      if (!total) return null;
      return (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-[#f3f4f8]">
            {parts.map((part) => <span key={part.label} style={{ width: `${(part.n / total) * 100}%`, background: part.color }} />)}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px] text-[#4b5163]">
            {parts.map((part) => (
              <li key={part.label} className="flex items-center gap-1.5">
                <span style={{ color: part.color }}>{part.icon}</span>
                <span className="truncate">{part.label}</span>
                <span className="ml-auto font-semibold text-[#1c2230]">{part.n}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "impact": {
      const p = card.preview;
      if (!p || !p.dependents.length) return null;
      return (
        <div>
          <svg viewBox="0 0 260 96" className="h-[96px] w-full" aria-hidden>
            {p.dependents.map((_, i) => (
              <path key={i} d={`M70 48 C 120 48, 130 ${14 + i * 23}, 170 ${14 + i * 23}`} fill="none" stroke={i < 2 ? "#ef4444" : "#f59e0b"} strokeWidth="1.5" strokeDasharray="4 3" />
            ))}
            <rect x="6" y="34" width="64" height="28" rx="7" fill="#fef2f2" stroke="#ef4444" />
            <text x="38" y="52" textAnchor="middle" fontSize="10" fontWeight="600" fill="#b42318">{short(p.source, 11)}</text>
            {p.dependents.map((name, i) => (
              <g key={`${name}-${i}`}>
                <rect x="170" y={4 + i * 23} width="86" height="20" rx="5" fill={i < 2 ? "#fef2f2" : "#fff7ed"} stroke={i < 2 ? "#fca5a5" : "#fcd34d"} />
                <text x="213" y={17.5 + i * 23} textAnchor="middle" fontSize="9" fill="#1c2230">{short(name, 16)}</text>
              </g>
            ))}
          </svg>
          <p className="text-[12px] text-[#6b7289]">If {p.source} goes down, these stop or slow down.</p>
        </div>
      );
    }
    case "renewals":
      return card.preview.length ? (
        <MiniList rows={card.preview.map((row) => ({ name: row.name, tag: [row.date, row.cost && row.cost !== "—" ? row.cost : ""].filter(Boolean).join(" · ") }))} />
      ) : null;
  }
}

function short(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
