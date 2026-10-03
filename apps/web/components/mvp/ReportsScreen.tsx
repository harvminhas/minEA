"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { askPath, reportPath } from "@/lib/mvp-paths";
import { catalogStats, moneyLabel } from "@/lib/model-catalog";
import { FirstRunAsk } from "@/components/mvp/FirstRunAsk";
import { useWorkspaceSetup } from "@/lib/setup/use-setup";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { hostingMap, infraCost, popularCards, REPORT_REGISTRY, singlePoints, topHostLine } from "@/lib/reports/home";

export function ReportsScreen() {
  const { basePath } = useTenancy();
  const params = useSearchParams();
  const group = params.get("group");
  const catalog = useModelCatalog();
  const impact = useImpactGraph();
  const rows = catalog.data?.rows ?? [];
  const [saved, setSaved] = useState<{ q: string; prose: string; at: string }[]>([]);
  const [addApps, setAddApps] = useState(false);
  const setup = useWorkspaceSetup();
  const blocked = setup.enabled && Boolean(catalog.data) && !setup.state.met;

  useEffect(() => {
    try {
      setSaved(JSON.parse(window.localStorage.getItem("bubomap-saved-asks") || "[]"));
    } catch {
      setSaved([]);
    }
  }, []);

  const cards = popularCards(rows, impact.edges);
  const cost = infraCost(rows);
  const hosts = hostingMap(rows, impact.edges);
  const spof = singlePoints(rows, impact.edges);
  const shown = REPORT_REGISTRY.filter((item) => !group || item.category === group);

  const statFor = (id: string): { value: string; detail: string; alert?: boolean } => {
    if (id === "renewals") return cards.renewals;
    if (id === "spend") return { value: cards.spend.value, detail: cards.spend.detail.replace("/ yr · ", "/ yr · ") };
    if (id === "infrastructure-cost") return { value: moneyLabel(cost.total), detail: `/ yr · platforms ${moneyLabel(cost.platforms)} · servers ${moneyLabel(cost.servers)}` };
    if (id === "impact") return { value: topHostLine(rows, impact.edges), detail: "" };
    if (id === "aging") return cards.aging;
    if (id === "hosting") return { value: `${hosts.hosts} hosts`, detail: `${hosts.unlinked} app${hosts.unlinked === 1 ? "" : "s"} with no host linked` };
    if (id === "end-of-life") {
      const retiring = catalogStats(rows).endOfLife.length;
      return { value: retiring ? `${retiring} items` : "Nothing is retiring", detail: "" };
    }
    if (id === "single-points") return spof.length ? { value: String(spof.length), detail: spof.map((item) => item.name).join(", "), alert: true } : { value: "None found", detail: "" };
    if (id === "ownership-gaps") return cards.ownership;
    if (id === "sensitive-vendors") return { value: "Not tracked yet", detail: "" };
    return { value: "Open the tech debt view", detail: "" };
  };

  return (
    <div className="px-8 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">Reports <span className="text-[14px] font-normal text-[#6b7289]">Ready-made answers to the questions you get asked most</span></h1>
        </div>
        <Link href={askPath(basePath)} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3c4254]">
          Ask a new question
        </Link>
      </div>
      <div className="relative">
        <div className={blocked ? "pointer-events-none opacity-40" : ""}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {shown.map((card) => {
          const stat = statFor(card.id);
          const href = card.id === "tech-debt" ? `${basePath}/views/tech-debt` : reportPath(basePath, card.id);
          return (
            <Link key={card.id} href={href} className="rounded-xl border border-[#e6e8ee] p-4 hover:border-[#c9c6f5]">
              <div className="text-[14px] font-semibold text-[#1c2230]">{card.title}</div>
              <p className="mt-1 min-h-[40px] text-[12px] leading-5 text-[#6b7289]">{card.body}</p>
              <div className={`mt-3 text-[18px] font-semibold ${stat.alert ? "text-[#b42318]" : "text-[#1c2230]"}`}>{stat.value}</div>
              {stat.detail && <div className="text-[12px] text-[#8b90a0]">{stat.detail}</div>}
            </Link>
          );
        })}
      </div>
        </div>
        {blocked && (
          <div className="absolute inset-0 flex items-start justify-center pt-16">
            <div className="max-w-md rounded-2xl border border-[#e6e8ee] bg-white px-6 py-5 text-center shadow-lg">
              <p className="text-[15px] font-semibold text-[#1c2230]">Example data</p>
              <p className="mt-2 text-[13px] leading-5 text-[#4b5163]">{setup.gap}</p>
              <button type="button" onClick={() => setAddApps(true)} className="mt-4 inline-flex rounded-lg bg-[#5b4ce6] px-4 py-2 text-[13px] font-medium text-white">Add apps here</button>
              {addApps && <div className="mt-4 text-left"><FirstRunAsk inline /></div>}
            </div>
          </div>
        )}
      </div>
      <div className="mt-8">
        <h2 className="mb-2 text-[13px] font-semibold text-[#1c2230]">Saved from Ask · {saved.length}</h2>
        {saved.length === 0 && <p className="text-[13px] text-[#8b90a0]">Save an answer and it will show up here on this browser.</p>}
        <div className="space-y-2">
          {saved.map((item) => (
            <Link key={item.at + item.q} href={askPath(basePath, item.q)} className="block rounded-xl border border-[#e6e8ee] px-4 py-3 hover:border-[#c9c6f5]">
              <div className="text-[14px] font-medium text-[#1c2230]">{item.q}</div>
              <p className="mt-1 line-clamp-2 text-[12px] text-[#6b7289]">{item.prose}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
