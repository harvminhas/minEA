"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Loading-screen mini impact diagram: "what happens if X is down". A fixed, made-up example
 * (no customer data). Each 2.4 s loop: calm → the source pulses red ("down") → the outage
 * travels along the edges → affected apps, then processes, turn amber then red → fade, reset.
 * The next loop picks the next example. CSS/SVG only (keyframes in globals.css, bm-impact-*).
 * Under prefers-reduced-motion it shows one static impact frame and the caption doesn't rotate.
 */

export const IMPACT_LOOP_MS = 2400;

type AppId = "crm" | "billing" | "orders";
type ProcId = "sales" | "invoicing" | "shipping";

export const IMPACT_APPS: { id: AppId; label: string; y: number }[] = [
  { id: "crm", label: "CRM", y: 30 },
  { id: "billing", label: "Billing", y: 80 },
  { id: "orders", label: "Order Entry", y: 130 },
];

export const IMPACT_PROCESSES: { id: ProcId; label: string; y: number; from: AppId }[] = [
  { id: "sales", label: "Sales", y: 30, from: "crm" },
  { id: "invoicing", label: "Invoicing", y: 80, from: "billing" },
  { id: "shipping", label: "Shipping", y: 130, from: "orders" },
];

export interface ImpactExample {
  source: string;
  apps: AppId[];
}

export const IMPACT_EXAMPLES: ImpactExample[] = [
  { source: "Database", apps: ["crm", "billing", "orders"] },
  { source: "Single sign-on", apps: ["crm", "orders"] },
  { source: "Payments API", apps: ["billing"] },
];

export function impactedProcesses(example: ImpactExample): ProcId[] {
  return IMPACT_PROCESSES.filter((p) => example.apps.includes(p.from)).map((p) => p.id);
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function impactCaption(example: ImpactExample): string {
  const procs = impactedProcesses(example).length;
  return `If ${example.source} goes down → ${plural(example.apps.length, "app")}, ${procs} ${procs === 1 ? "process" : "processes"} affected`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// Geometry (viewBox 260 × 160): source | apps | processes.
const SRC = { x: 6, y: 80, w: 56 };
const APP = { x: 98, w: 66 };
const PROC = { x: 196, w: 60 };
const H = 22;

function Node({ x, y, w, label, className, style }: { x: number; y: number; w: number; label: string; className?: string; style?: React.CSSProperties }) {
  return (
    <g className={cn("bm-impact-node", className)} style={style}>
      <rect x={x} y={y - H / 2} width={w} height={H} rx={7} />
      <text x={x + w / 2} y={y + 3.6} textAnchor="middle">
        {label}
      </text>
    </g>
  );
}

export function ImpactLoop({ className, exampleIndex }: { className?: string; /** Fixed example (screenshots/tests). */ exampleIndex?: number }) {
  const [loop, setLoop] = useState(0);
  useEffect(() => {
    if (exampleIndex !== undefined || prefersReducedMotion()) return;
    const id = window.setInterval(() => setLoop((n) => n + 1), IMPACT_LOOP_MS);
    return () => window.clearInterval(id);
  }, [exampleIndex]);

  const index = (exampleIndex ?? loop) % IMPACT_EXAMPLES.length;
  const example = IMPACT_EXAMPLES[index]!;
  const procs = impactedProcesses(example);
  const stagger = (i: number) => ({ animationDelay: `${i * 70}ms` });

  return (
    <figure className={cn("bm-impact flex flex-col items-center", className)} data-testid="impact-loop" aria-hidden>
      {/* key restarts every CSS animation at the start of each loop */}
      <svg key={loop} viewBox="0 0 260 160" className="h-auto w-[220px] sm:w-[260px]" role="img">
        <defs>
          <filter id="bm-impact-shadow" x="-20%" y="-40%" width="140%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#5b4ce6" floodOpacity="0.12" />
          </filter>
        </defs>

        {/* edges: base line + an outage line that draws over it when affected */}
        {IMPACT_APPS.map((a, i) => {
          const d = `M${SRC.x + SRC.w} ${SRC.y} C ${SRC.x + SRC.w + 22} ${SRC.y}, ${APP.x - 22} ${a.y}, ${APP.x} ${a.y}`;
          const hit = example.apps.includes(a.id);
          return (
            <g key={`e1-${a.id}`}>
              <path d={d} className="bm-impact-edge" pathLength={100} />
              {hit && <path d={d} className="bm-impact-flow bm-impact-flow-1" pathLength={100} style={stagger(i)} />}
            </g>
          );
        })}
        {IMPACT_PROCESSES.map((p, i) => {
          const a = IMPACT_APPS.find((x) => x.id === p.from)!;
          const d = `M${APP.x + APP.w} ${a.y} L ${PROC.x} ${p.y}`;
          const hit = procs.includes(p.id);
          return (
            <g key={`e2-${p.id}`}>
              <path d={d} className="bm-impact-edge" pathLength={100} />
              {hit && <path d={d} className="bm-impact-flow bm-impact-flow-2" pathLength={100} style={stagger(i)} />}
            </g>
          );
        })}

        <g filter="url(#bm-impact-shadow)">
          <Node x={SRC.x} y={SRC.y} w={SRC.w} label={example.source === "Single sign-on" ? "SSO" : example.source === "Payments API" ? "Payments" : example.source} className="bm-impact-src is-hit" />
          {IMPACT_APPS.map((a, i) => (
            <Node
              key={a.id}
              x={APP.x}
              y={a.y}
              w={APP.w}
              label={a.label}
              className={example.apps.includes(a.id) ? "bm-impact-hit-1 is-hit" : undefined}
              style={stagger(i)}
            />
          ))}
          {IMPACT_PROCESSES.map((p, i) => (
            <Node
              key={p.id}
              x={PROC.x}
              y={p.y}
              w={PROC.w}
              label={p.label}
              className={procs.includes(p.id) ? "bm-impact-hit-2 is-hit" : undefined}
              style={stagger(i)}
            />
          ))}
        </g>

        {/* the source's pulse ring and "down" tag */}
        <rect x={SRC.x - 3} y={SRC.y - H / 2 - 3} width={SRC.w + 6} height={H + 6} rx={9} className="bm-impact-ring" />
        <g className="bm-impact-down">
          <rect x={SRC.x + SRC.w / 2 - 15} y={SRC.y + H / 2 + 5} width={30} height={13} rx={6.5} />
          <text x={SRC.x + SRC.w / 2} y={SRC.y + H / 2 + 14.3} textAnchor="middle">
            down
          </text>
        </g>

        {/* column labels */}
        <text x={SRC.x + SRC.w / 2} y={156} textAnchor="middle" className="bm-impact-col">source</text>
        <text x={APP.x + APP.w / 2} y={156} textAnchor="middle" className="bm-impact-col">apps</text>
        <text x={PROC.x + PROC.w / 2} y={156} textAnchor="middle" className="bm-impact-col">processes</text>
      </svg>
      <figcaption key={`c-${loop}`} className="bm-impact-caption mt-2 text-[13px] font-medium text-gray-700" data-testid="impact-caption">
        {impactCaption(example)}
      </figcaption>
    </figure>
  );
}
