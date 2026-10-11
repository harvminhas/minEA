"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { FirstRunAsk } from "@/components/mvp/FirstRunAsk";
import { setupCardHeader, type SetupState } from "@/lib/setup/setupMin";

/**
 * The card over sample screens (Model, Reports, Views). Closed with 0 real apps it says
 * "Example data"; once the wizard is open or any real app exists it shows the person's own
 * saved progress. "Add apps here" toggles to "Close" and focuses the paste box.
 */
export function SetupProgressCard({
  state,
  gap,
  sampleText,
  addLabel = "Add apps here",
  action,
}: {
  state: Pick<SetupState, "apps" | "hostingLinks">;
  gap?: string;
  /** Sample wording, shown only in the "Example data" state. */
  sampleText: string;
  addLabel?: string;
  /** Replaces the Add apps button + wizard (e.g. a link to Hosting). */
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      card.current?.querySelector("textarea")?.focus({ preventScroll: true });
      card.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);
  const header = setupCardHeader(state, open);
  return (
    <div ref={card} data-testid="example-card" className={`w-full ${open ? "max-w-3xl" : "max-w-md"} rounded-2xl border border-[#e6e8ee] bg-white px-4 py-5 text-center shadow-lg sm:px-6`}>
      {header.mode === "example" ? (
        <>
          <p className="flex items-center justify-center gap-2 text-[15px] font-semibold text-[#1c2230]"><Info size={16} className="text-[#5b4ce6]" /> Example data</p>
          {gap && <p className="mt-2 text-[13px] font-semibold leading-5 text-[#1c2230]">{gap}</p>}
          <p className="mt-2 text-[13px] leading-5 text-[#4b5163]">{sampleText}</p>
        </>
      ) : (
        <div data-testid="setup-progress">
          <p className="text-[15px] font-semibold text-[#1c2230]">{header.title}</p>
          <p className="mt-2 text-[13px] font-medium text-[#1c2230]">{header.progressLine}</p>
          <div className="mx-auto mt-2 h-1.5 max-w-xs overflow-hidden rounded-full bg-[#eef0f4]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={header.percent} aria-label="Setup progress">
            <div className="h-full rounded-full bg-[#5b4ce6] transition-[width] duration-500" style={{ width: `${header.percent}%` }} />
          </div>
          <p className="mt-2 text-[12px] leading-5 text-[#6b7289]">{header.savedLine}</p>
        </div>
      )}
      {action ?? (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={open ? "mt-4 inline-flex rounded-lg border border-[#e6e8ee] px-4 py-2 text-[13px] font-medium text-[#4b5163]" : "mt-4 inline-flex rounded-lg bg-[#5b4ce6] px-4 py-2 text-[13px] font-medium text-white"}
          >
            {open ? "Close" : addLabel}
          </button>
          {open && <div data-testid="example-wizard" className="mt-4 text-left"><FirstRunAsk inline /></div>}
        </>
      )}
    </div>
  );
}
