"use client";

/**
 * Ask while the answer is being built: live steps (spinner -> check) from the real stream events,
 * a skeleton of the lean card (headline bar + text lines; table rows only once a lookup returned
 * items), a blinking owl and a status line. Without streaming, the same skeleton with a generic
 * step progression. prefers-reduced-motion turns the animations off (globals.css).
 */
import React, { useEffect, useState } from "react";
import { AlertCircle, Check } from "lucide-react";
import type { AskStep } from "@/lib/api-client";

export type BuildingStep = { id: string; label: string; status: "running" | "done" | "error" };
export type BuildingView = { steps: BuildingStep[]; status: string; tableRows: number };

/** After a step arrives, what the server is doing next (until the next event). */
function nextAfter(step: AskStep | undefined, estateCount: number | null): string {
  if (!step) return estateCount != null ? `Reading ${estateCount} items in your workspace…` : "Reading your workspace…";
  if (step.id === "estate") return "Asking the AI…";
  if (step.id.startsWith("check")) return step.status === "error" ? "Correcting the answer…" : "Writing the answer…";
  if (step.tool || step.id.startsWith("tool")) return "Looking at the results…";
  return "Working it out…";
}

/** Rows a lookup said it found ("6 Applications renew…"): the table skeleton appears only then. */
export function rowsHinted(steps: AskStep[]): number {
  for (const step of [...steps].reverse()) {
    if (step.id === "estate" || !step.counts) continue;
    const n = Number(step.counts.total ?? step.counts.items ?? step.counts.count ?? Object.values(step.counts).find((v) => v > 0) ?? 0);
    if (n > 0) return Math.min(5, Math.max(1, Math.round(n)));
  }
  return 0;
}

/**
 * What the building card shows. Live: every received event is a done (or error) step, plus one running
 * step naming what comes next; after `quietMs` without an event that step says it's still going
 * (heartbeat). Not streaming: a generic progression by elapsed time.
 */
export function buildingView(input: { steps: AskStep[]; streaming: boolean; elapsedMs: number; quietMs: number; estateCount: number | null }): BuildingView {
  const { steps, streaming, elapsedMs, quietMs, estateCount } = input;
  if (!streaming) {
    const generic: [string, string][] = [
      [estateCount != null ? `Reading ${estateCount} items in your workspace…` : "Reading your workspace…", estateCount != null ? `Read ${estateCount} items` : "Read your workspace"],
      ["Asking the AI…", "Asked the AI"],
      ["Checking the numbers…", "Checked the numbers"],
    ];
    const at = elapsedMs < 1200 ? 0 : elapsedMs < 4000 ? 1 : 2;
    return {
      steps: generic.slice(0, at + 1).map(([running, done], i) => ({ id: `g${i}`, label: i < at ? done : running, status: i < at ? "done" : "running" })),
      status: at === 0 ? "Working it out…" : at === 1 ? "Asking the AI…" : "Checking the answer…",
      tableRows: 0,
    };
  }
  const seen: BuildingStep[] = steps.map((step) => ({ id: step.id, label: step.id === "estate" && step.counts?.items != null ? `Read ${step.counts.items} items` : step.label, status: step.status === "error" ? "error" : "done" }));
  const last = steps[steps.length - 1];
  const next = quietMs > 6000 ? "Still working — the AI is thinking…" : nextAfter(last, estateCount);
  const lookups = steps.filter((step) => step.tool || step.id.startsWith("tool")).length;
  return {
    steps: [...seen, { id: "next", label: next, status: "running" }],
    status: last?.id.startsWith("check") ? "Writing the answer…" : lookups ? `${lookups} lookup${lookups === 1 ? "" : "s"} done` : elapsedMs > 1500 ? "Asking the AI…" : "Working it out…",
    tableRows: rowsHinted(steps),
  };
}

export function AskOwl({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden data-testid="ask-owl">
      <path d="M4 6l3 2h10l3-2v9a8 8 0 01-16 0z" fill="#5b4ce6" />
      <g className="ask-owl-eyes">
        <circle cx="9" cy="12" r="2.6" fill="#fff" />
        <circle cx="15" cy="12" r="2.6" fill="#fff" />
        <circle cx="9" cy="12" r="1.1" fill="#1c2230" />
        <circle cx="15" cy="12" r="1.1" fill="#1c2230" />
      </g>
      <path d="M11 15l1 1.4 1-1.4z" fill="#f5b544" />
    </svg>
  );
}

/** Re-renders every 500 ms while mounted, with ms since mount and since the last event. */
function useClock(eventCount: number) {
  const [start] = useState(() => Date.now());
  const [lastEvent, setLastEvent] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => setLastEvent(Date.now()), [eventCount]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  return { elapsedMs: now - start, quietMs: now - lastEvent };
}

export function AskBuilding({ steps, streaming, estateCount, onStatus }: { steps: AskStep[]; streaming: boolean; estateCount: number | null; onStatus?: (text: string) => void }) {
  const { elapsedMs, quietMs } = useClock(steps.length);
  const view = buildingView({ steps, streaming, elapsedMs, quietMs, estateCount });
  useEffect(() => onStatus?.(view.status), [view.status, onStatus]);
  return <AskBuildingView view={view} />;
}

export function AskBuildingView({ view }: { view: BuildingView }) {
  return (
    <div data-testid="ask-building" className="px-5 py-5" aria-busy="true" aria-live="polite">
      <div className="ask-shimmer h-[22px] w-[58%] rounded-md" data-testid="ask-skel-headline" />
      <div className="mt-3 space-y-2" data-testid="ask-skel-lines">
        <div className="ask-shimmer h-3 w-[92%] rounded" />
        <div className="ask-shimmer h-3 w-[80%] rounded" />
        <div className="ask-shimmer h-3 w-[46%] rounded" />
      </div>
      {view.tableRows > 0 && (
        <table className="ask-in mt-4 w-full text-left text-[13px]" data-testid="ask-skel-table">
          <thead>
            <tr className="border-b border-[#eef0f4] text-[12px] text-[#8b90a0]">
              {["Name", "Kind", "Owner", "Annual cost", "Where it runs"].map((heading) => <th key={heading} className="h-10 px-2 font-medium">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: view.tableRows }, (_, i) => (
              <tr key={i} className="border-b border-[#f3f4f8]" data-testid="ask-skel-row">
                {["70%", "50%", "60%", "45%", "40%"].map((w, j) => <td key={j} className="px-2 py-3.5"><div className="ask-shimmer h-3 rounded" style={{ width: w }} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ol className="mt-4 space-y-1 rounded-xl border border-[#eef0f4] bg-[#fbfbfd] px-3.5 py-2.5 text-[13px]" data-testid="ask-building-steps">
        {view.steps.map((step) => (
          <li key={`${step.id}-${step.status}-${step.label}`} data-status={step.status} className="ask-in flex h-[26px] items-center gap-2.5 text-[#4a5068] data-[status=done]:text-[#1c2230]">
            <span className="grid h-4 w-4 flex-none place-items-center">
              {step.status === "running" ? (
                <span className="ask-spin block h-[13px] w-[13px] rounded-full border-2 border-[#d9d4ff] border-t-[#5b4ce6]" />
              ) : step.status === "error" ? (
                <AlertCircle size={14} className="ask-pop text-[#c2410c]" />
              ) : (
                <span className="ask-pop grid h-4 w-4 place-items-center rounded-full bg-[#5b4ce6] text-white"><Check size={10} strokeWidth={3} /></span>
              )}
            </span>
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
