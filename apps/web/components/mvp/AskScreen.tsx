"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { aiApi } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { useTenancy } from "@/lib/tenancy";
import { askPath, modelItemPath, reportPath } from "@/lib/mvp-paths";
import { catalogStats, moneyLabel } from "@/lib/model-catalog";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { answerFromModel, answerFromRecords, type AskAnswer } from "@/lib/ask/deterministic";
import { useImpactGraph } from "@/lib/impact/use-impact-graph";
import { Pill } from "@/components/mvp/pills";
import { ChevronRight } from "lucide-react";

const THINKING_STEPS = [
  "Reading your question",
  "Looking up records in this workspace",
  "Checking the answer against those records",
];

export function AskScreen({ mode }: { mode: "home" | "answer" }) {
  const params = useSearchParams();
  const initial = mode === "answer" ? params.get("q") ?? "" : "";
  const [draft, setDraft] = useState(initial);
  const [note, setNote] = useState("");
  const router = useRouter();
  const { basePath, orgSlug, workspaceSlug } = useTenancy();
  const { getToken } = useAuth();
  const catalog = useModelCatalog();
  const rows = catalog.data?.rows ?? [];
  const stats = catalogStats(rows);
  const question = initial.trim();

  const impactQuery = /break|fail|goes down|outage|depend|impact/i.test(question);
  const impact = useImpactGraph();

  const remote = useQuery({
    queryKey: ["ask-model", orgSlug, workspaceSlug, question],
    enabled: mode === "answer" && question.length > 0 && Boolean(orgSlug && workspaceSlug),
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      if (!token || !orgSlug || !workspaceSlug) throw new Error("Not signed in");
      return aiApi.ask(orgSlug, workspaceSlug, question, token);
    },
  });

  const local = useMemo(
    () =>
      answerFromRecords({
        question,
        rows,
        graph: { nodes: impact.nodes, edges: impact.edges },
        basePath,
        loading: impactQuery && impact.isLoading,
      }),
    [question, rows, impact.nodes, impact.edges, impact.isLoading, impactQuery, basePath]
  );

  const thinking = mode === "answer" && question.length > 0 && remote.isPending;
  const [thinkStep, setThinkStep] = useState(0);
  useEffect(() => {
    setDraft(question);
  }, [question]);
  useEffect(() => {
    if (!thinking) {
      setThinkStep(0);
      return;
    }
    const timer = window.setInterval(() => setThinkStep((step) => (step + 1) % THINKING_STEPS.length), 1400);
    return () => window.clearInterval(timer);
  }, [thinking]);

  const answer = useMemo(() => {
    if (mode !== "answer" || !question) return local;
    return (remote.data && answerFromModel(remote.data, rows, basePath)) || local;
  }, [mode, question, remote.data, local, rows, basePath]);

  const topInfra = rows
    .filter((row) => row.kind !== "application")
    .sort((a, b) => criticalityRank(b.criticality) - criticalityRank(a.criticality))[0];
  const chips = [
    "What renews in the next 90 days?",
    topInfra ? `What breaks if the ${topInfra.name} goes down?` : "What breaks if a critical system goes down?",
    "Where is our money going?",
    "What has no owner?",
    "Which vendors hold customer data?",
    "What goes end of life next year?",
  ];

  const submit = (value: string) => {
    const q = value.trim();
    if (!q) return;
    setDraft(q);
    router.push(askPath(basePath, q));
  };

  if (mode === "home") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 pb-16 pt-16">
        <p className="rounded-full bg-[#f4f3ff] px-3 py-1 text-[12px] text-[#5b4ce6]">Answers come from your own records, with sources</p>
        <h1 className="mt-6 text-center text-[36px] font-semibold tracking-tight text-[#1c2230]">What do you want to know?</h1>
        <p className="mt-2 text-center text-[14px] text-[#6b7289]">
          {stats.systems} applications · {stats.infrastructure} infrastructure
          {stats.vendorCount ? ` · ${stats.vendorCount} vendors` : ""}
          {stats.spend ? ` · ${moneyLabel(stats.spend)} a year in tracked spend` : ""}
        </p>
        <form
          className="mt-6 flex w-full items-center gap-2 rounded-2xl border border-[#e6e8ee] bg-white px-3 py-2 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            submit(draft);
          }}
        >
          <Sparkles size={16} className="ml-1 text-[#5b4ce6]" />
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask anything about your systems, vendors, costs, or risks"
            className="h-11 flex-1 bg-transparent text-[15px] outline-none"
          />
          <button type="submit" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">
            Ask →
          </button>
        </form>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => submit(chip)}
              className="rounded-full border border-[#e6e8ee] bg-white px-3 py-1.5 text-[13px] text-[#3c4254] hover:border-[#c9c6f5]"
            >
              {chip}
            </button>
          ))}
        </div>
        <div className="mt-12 w-full">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-semibold text-[#1c2230]">Popular reports</h2>
            <Link href={`${basePath}/reports`} className="text-[13px] text-[#5b4ce6]">All reports →</Link>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ReportTile href={reportPath(basePath, "renewals")} title="Renewals next 90 days" value={`${stats.renewals.length} renewals`} detail={stats.renewalSpend ? moneyLabel(stats.renewalSpend) : "—"} />
            <ReportTile href={reportPath(basePath, "spend")} title="Spend by vendor & category" value={stats.spend ? moneyLabel(stats.spend) : "—"} detail="/ yr" />
            <ReportTile href={reportPath(basePath, "ownership-gaps")} title="Ownership gaps" value={`${stats.noOwner.length}`} detail="with no owner" />
            <ReportTile href={reportPath(basePath, "end-of-life")} title="End of life & retiring" value={`${stats.endOfLife.length}`} detail="items" />
          </div>
          <div className="mt-4 flex items-center justify-between rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-4 py-3">
            <div>
              <div className="text-[14px] font-medium text-[#1c2230]">Model health: {stats.completeness}% complete, {stats.missing} fields missing</div>
              <p className="text-[12px] text-[#6b7289]">Answers get better as you fill gaps.</p>
            </div>
            <Link href={`${basePath}/model/infrastructure`} className="rounded-lg bg-[#fff4d6] px-3 py-1.5 text-[13px] font-medium text-[#92400e]">
              Fill missing →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6">
      <form
        className="mb-6 flex items-center gap-2 rounded-2xl border border-[#e6e8ee] px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Sparkles size={16} className="text-[#5b4ce6]" />
        <input value={draft} onChange={(event) => setDraft(event.target.value)} className="h-10 flex-1 bg-transparent text-[15px] outline-none" />
        <button type="submit" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">Ask →</button>
      </form>
      <section className="overflow-hidden rounded-2xl border border-[#e4e0ff] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#efeaff] bg-[#f7f6ff] px-5 py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#5b4ce6]">
            <Sparkles size={12} /> ANSWER
          </p>
          {thinking && <span className="max-w-[70%] truncate text-[12px] font-medium text-[#5b4ce6]">Working on “{question}”</span>}
        </div>
        {thinking ? (
          <div className="px-5 py-6">
            <div className="h-1.5 overflow-hidden rounded-full bg-[#ece9ff]">
              <div className="diagram-saving-bar-indeterminate h-full w-2/5 rounded-full bg-[#5b4ce6]" />
            </div>
            <p className="mt-4 text-[15px] font-medium text-[#1c2230]">{THINKING_STEPS[thinkStep]}</p>
            <ol className="mt-3 space-y-1.5 text-[13px] text-[#6b7289]">
              {THINKING_STEPS.map((step, index) => (
                <li key={step} className={index === thinkStep ? "font-medium text-[#3f35b5]" : index < thinkStep ? "text-[#1c2230]" : ""}>
                  {index < thinkStep ? "Done" : index === thinkStep ? "Now" : "Next"} · {step}
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="px-5 py-5">
            <p className="text-[17px] leading-7 text-[#1c2230]">
              <AnswerText
                text={answer.answerText}
                onCite={(n) => {
                  const citation = answer.citations.find((item) => item.n === n);
                  if (!citation) return;
                  router.push(recordHref(basePath, citation.row));
                }}
              />
            </p>
            <p className="mt-2 text-[12.5px] text-[#94a3b8]">
              Answer generated from your model on {answer.caption.generatedAt} · {answer.caption.recordCount} records · {answer.caption.gapCount} gaps
              {answer.caption.extra ? ` · ${answer.caption.extra}` : ""}
            </p>

            {answer.citations.length > 0 && (
              <>
                <p className="mb-2 mt-6 text-[13px] text-[#6b7289]">Based on these records · click a row to open it in Model</p>
                <table className="w-full text-left text-[13px]">
                  <thead>
                    <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
                      <th className="h-10 w-10" />
                      {["Name", "Type", "Owner", "Criticality", "Relationship"].map((heading) => (
                        <th key={heading} className="h-10 px-2 font-medium">{heading}</th>
                      ))}
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {answer.citations.map((item) => (
                      <tr
                        key={item.recordId}
                        className="cursor-pointer border-b border-[#f3f4f8] hover:bg-[#fafafb]"
                        onClick={() => router.push(recordHref(basePath, item.row))}
                      >
                        <td className="px-2 py-2.5">
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-[#e4e0ff] text-[11px] font-semibold text-[#4c3fd1]">{item.n}</span>
                        </td>
                        <td className="px-2 py-2.5 font-medium">{item.row.name}</td>
                        <td className="px-2 py-2.5">
                          {item.row.kind === "application" ? "Application" : "Infrastructure"}
                          <div className="text-[12px] text-[#8b90a0]">{item.row.typeLabel}</div>
                        </td>
                        <td className="px-2 py-2.5">{item.row.ownerTeam || item.row.ownerPerson || <span className="rounded bg-[#fff7ed] px-1.5 py-0.5 text-[#c2410c]">No owner · Add</span>}</td>
                        <td className="px-2 py-2.5">{item.row.criticalityLabel ? <Pill label={item.row.criticalityLabel} tone="criticality" /> : <span className="text-[#c2410c]">Add</span>}</td>
                        <td className="px-2 py-2.5 text-[#6b7289]">
                          {item.relationship}
                          {item.badge ? <span className="ml-2 rounded-full bg-[#f3f4f8] px-1.5 py-0.5 text-[10px]">{item.badge}</span> : null}
                        </td>
                        <td className="text-[#94a3b8]"><ChevronRight size={14} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {answer.gaps.length > 0 && (
              <div className="mt-4 rounded-xl border border-[#fde7b8] bg-[#fff8eb] px-4 py-3 text-[13px] text-[#78350f]">
                <div className="font-semibold text-[#92400e]">Gaps</div>
                {answer.gaps.map((gap) => (
                  <p key={gap.text} className="mt-1">
                    {gap.text}{" "}
                    <Link href={gap.fillHref} className="font-medium text-[#5b4ce6]">Fill in</Link>
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eef0f4] pt-4">
              <button type="button" onClick={() => { saveAsk(question, answer.answerText); setNote("Saved to Reports › Saved from Ask"); }} className="rounded-lg bg-[#5b4ce6] px-3 py-1.5 text-[13px] font-semibold text-white">
                Save as report
              </button>
              <button type="button" onClick={() => { downloadCsv(answer); setNote("Exported answer and records to CSV"); }} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                Export
              </button>
              <button type="button" onClick={() => { navigator.clipboard.writeText(window.location.href); setNote("Share link copied"); }} className="rounded-lg border border-[#e6e8ee] px-3 py-1.5 text-[13px]">
                Share
              </button>
              <span className="ml-auto text-[13px] text-[#6b7289]">Was this right?</span>
              <button type="button" onClick={() => setNote("Thanks for the feedback")} className="rounded-lg border border-[#e6e8ee] px-2.5 py-1 text-[13px]">Yes</button>
              <button type="button" onClick={() => setNote("Thanks. Tell us what was wrong.")} className="rounded-lg border border-[#e6e8ee] px-2.5 py-1 text-[13px]">No</button>
            </div>
            {note && <p className="mt-2 text-[12px] text-[#5b4ce6]">{note}</p>}
          </div>
        )}
      </section>

      {!thinking && answer.followUps.length > 0 && (
        <div className="mt-5 rounded-2xl border border-[#e6e8ee] bg-[#fafafb] px-5 py-4">
          <p className="mb-2 text-[13px] font-medium text-[#1c2230]">Ask next</p>
          <div className="flex flex-wrap gap-2">
            {answer.followUps.map((follow) => (
              <button key={follow} type="button" onClick={() => submit(follow)} className="rounded-full border border-[#e6e8ee] bg-white px-3 py-1.5 text-[13px] text-[#3c4254] hover:border-[#c9c6f5]">
                {follow}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTile({ href, title, value, detail }: { href: string; title: string; value: string; detail: string }) {
  return (
    <Link href={href} className="rounded-xl border border-[#e6e8ee] p-3 hover:border-[#c9c6f5]">
      <div className="text-[12px] text-[#6b7289]">{title}</div>
      <div className="mt-2 text-[20px] font-semibold text-[#1c2230]">{value}</div>
      <div className="text-[12px] text-[#8b90a0]">{detail}</div>
    </Link>
  );
}

function criticalityRank(value: string): number {
  if (value === "tier1" || value === "critical") return 4;
  if (value === "high") return 3;
  if (value === "medium") return 2;
  if (value === "low") return 1;
  return 0;
}

function recordHref(basePath: string, row: { id: string; kind: string }): string {
  return modelItemPath(basePath, row.kind === "application" ? "applications" : "infrastructure", row.id);
}

function AnswerText({ text, onCite }: { text: string; onCite: (n: number) => void }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        const cite = part.match(/^\[(\d+)\]$/);
        if (cite) {
          const n = Number(cite[1]);
          return (
            <button
              key={index}
              type="button"
              onClick={() => onCite(n)}
              className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-[#e4e0ff] px-1 text-[11px] font-semibold text-[#4c3fd1]"
            >
              {n}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

function saveAsk(question: string, prose: string) {
  const key = "bubomap-saved-asks";
  const current = JSON.parse(window.localStorage.getItem(key) || "[]") as { q: string; prose: string; at: string }[];
  current.unshift({ q: question, prose, at: new Date().toISOString() });
  window.localStorage.setItem(key, JSON.stringify(current.slice(0, 20)));
}

function downloadCsv(answer: AskAnswer) {
  const header = ["Name", "Type", "Owner", "Criticality", "Relationship"];
  const lines = answer.citations.map((item) =>
    [item.row.name, item.row.typeLabel, item.row.ownerTeam || item.row.ownerPerson, item.row.criticalityLabel, item.relationship]
      .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
      .join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "ask-answer.csv";
  link.click();
  URL.revokeObjectURL(url);
}
