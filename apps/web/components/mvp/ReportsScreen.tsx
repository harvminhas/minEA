"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTenancy } from "@/lib/tenancy";
import { askPath, reportPath } from "@/lib/mvp-paths";
import { catalogStats, moneyLabel } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";

export function ReportsScreen() {
  const { basePath } = useTenancy();
  const catalog = useModelCatalog();
  const stats = catalogStats(catalog.data?.rows ?? []);
  const [saved, setSaved] = useState<{ q: string; prose: string; at: string }[]>([]);

  useEffect(() => {
    try {
      setSaved(JSON.parse(window.localStorage.getItem("bubomap-saved-asks") || "[]"));
    } catch {
      setSaved([]);
    }
  }, []);

  const cards = [
    { id: "renewals", title: "Renewals next 90 days", body: "What contracts come up soon, and what do they cost?", stat: `${stats.renewals.length} renewals${stats.renewalSpend ? ` · ${moneyLabel(stats.renewalSpend)}` : ""}` },
    { id: "spend", title: "Spend by vendor & category", body: "Where is our money going, and to whom?", stat: stats.spend ? `${moneyLabel(stats.spend)} / yr` : "No costs tracked yet" },
    { id: "impact", title: "Impact analysis", body: "What breaks if a system or vendor fails?", stat: "From your relationships" },
    { id: "end-of-life", title: "End of life & retiring", body: "What is being phased out or losing support?", stat: `${stats.endOfLife.length} items` },
    { id: "ownership-gaps", title: "Ownership gaps", body: "Which systems have nobody accountable for them?", stat: `${stats.noOwner.length} with no owner` },
    { id: "sensitive-vendors", title: "Vendors holding sensitive data", body: "Which vendors store customer, employee, or financial data?", stat: "Not tracked yet" },
    { id: "single-points", title: "Single points of failure", body: "Where would one failure stop critical work?", stat: "Open Ask" },
    { id: "tech-debt", title: "Tech debt summary", body: "What known problems are we carrying, and where?", stat: "Open the tech debt view" },
  ];

  return (
    <div className="px-8 py-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-semibold text-[#1c2230]">Reports</h1>
          <p className="text-[13px] text-[#6b7289]">Ready-made answers to the questions you get asked most</p>
        </div>
        <Link href={askPath(basePath)} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px] font-medium text-[#3c4254]">
          Ask a new question
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.id} href={card.id === "tech-debt" ? `${basePath}/views/tech-debt` : card.id === "single-points" ? askPath(basePath, "What are the single points of failure?") : reportPath(basePath, card.id)} className="rounded-xl border border-[#e6e8ee] p-4 hover:border-[#c9c6f5]">
            <div className="text-[14px] font-semibold text-[#1c2230]">{card.title}</div>
            <p className="mt-1 min-h-[40px] text-[12px] leading-5 text-[#6b7289]">{card.body}</p>
            <div className="mt-3 text-[16px] font-semibold text-[#1c2230]">{card.stat}</div>
          </Link>
        ))}
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
