"use client";

import { useState } from "react";
import Link from "next/link";
import { adminTabHref } from "@/lib/billing/admin-centre";
import { starterBillingHref } from "@/lib/billing/plan-intent";
import { CATALOG, formatUsd } from "@/lib/billing/plans";
import { limitLink, limitPanelCopy, roomHintText, type LimitState } from "@/lib/object-limit";

/** "50 left on Free" / "Free is full (50 of 50)" next to the cards' title. */
export function RoomHint({ limit }: { limit: LimitState }) {
  const tone = limit.over
    ? "border-[#f5d0a9] bg-[#fff7ed] text-[#9a3412]"
    : limit.room <= 10
      ? "border-[#e6e8ee] bg-[#fafafb] text-[#4b5163]"
      : "border-[#e6e8ee] bg-white text-[#6b7289]";
  return (
    <span data-testid="room-hint" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12px] font-medium ${tone}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {roomHintText(limit)}
    </span>
  );
}

function LimitMeter({ limit }: { limit: LimitState }) {
  const fits = Math.min(limit.adding, limit.room);
  const over = Math.max(0, limit.adding - limit.room);
  const total = Math.max(limit.max, limit.used + limit.adding, 1);
  const pct = (n: number) => `${(n / total) * 100}%`;
  const capAt = (limit.max / total) * 100;
  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#ece9fb]">
        <div className="absolute inset-y-0 left-0 bg-[#3f35b5]" style={{ width: pct(Math.min(limit.used, total)) }} />
        <div className="absolute inset-y-0 bg-[#8f84f0]" style={{ left: pct(limit.used), width: pct(fits) }} />
        {over > 0 && <div className="absolute inset-y-0 bg-[repeating-linear-gradient(45deg,#fdba74_0,#fdba74_4px,#fed7aa_4px,#fed7aa_8px)]" style={{ left: pct(limit.used + fits), width: pct(over) }} />}
        {capAt < 100 && <div className="absolute inset-y-[-2px] w-[2px] bg-[#1c2230]" style={{ left: `calc(${capAt}% - 1px)` }} />}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[#4b5163]">
        <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#3f35b5]" />{limit.used} in your map</span>
        {fits > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#8f84f0]" />{fits} fit on {limit.label}</span>}
        {over > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[#fdba74]" />{over} over</span>}
        <span className="ml-auto text-[#8b90a0]">{limit.label} limit: {limit.max}</span>
      </div>
    </div>
  );
}

function CopyAdminLink({ orgSlug }: { orgSlug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      data-testid="limit-copy-link"
      className="rounded-xl border border-[#c9c3f7] bg-white px-4 py-2 text-[14px] font-semibold text-[#3f35b5]"
      onClick={() => {
        const url = `${window.location.origin}${starterBillingHref(orgSlug)}`;
        void navigator.clipboard?.writeText(url).then(() => setCopied(true), () => setCopied(false));
        setCopied(true);
      }}
    >
      {copied ? "Link copied" : "Copy link for your admin"}
    </button>
  );
}

/**
 * Shown on the cards when the list is bigger than the room left on the plan, and when the server
 * refuses a save with 403 limit_exceeded. Nothing is saved until the person chooses.
 */
export function LimitPanel({
  limit,
  busy,
  onAddFirst,
  onLeave,
}: {
  limit: LimitState;
  busy: boolean;
  onAddFirst: (count: number) => void;
  /** Just before following an upgrade link: keep the list for the way back. */
  onLeave: () => void;
}) {
  const fits = limit.fitCards;
  const copy = limitPanelCopy(limit, `${formatUsd(CATALOG.starter.monthlyUsd)}/month`);
  const link = limitLink(limit.offer, limit.orgSlug);
  const addFirst = fits > 0 && (
    <button
      type="button"
      data-testid="limit-add-first"
      disabled={busy}
      onClick={() => onAddFirst(fits)}
      className={limit.offer === "ask-admin"
        ? "rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white disabled:opacity-60"
        : "rounded-xl border border-[#c9c3f7] bg-white px-4 py-2 text-[14px] font-semibold text-[#3f35b5] disabled:opacity-60"}
    >
      Add the first {fits} for now
    </button>
  );
  return (
    <div data-testid="limit-panel" data-offer={limit.offer} role="status" className="mt-3 rounded-2xl border border-[#d9d4fb] bg-[#f7f5ff] p-4">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#5b4ce6] shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 2l3 6 6 .9-4.5 4.3 1 6.3L12 16.6 6.5 19.5l1-6.3L3 8.9 9 8z" /></svg>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-[#1c2230]">{copy.title}</p>
          <p className="mt-0.5 text-[13px] text-[#4b5163]">{copy.body}</p>
          <LimitMeter limit={limit} />
          {limit.offer === "ask-admin" ? (
            <div className="mt-4">
              <p className="text-[13px] text-[#4b5163]">Only an owner or admin can change the plan. Ask one of them to upgrade in Settings → Plan &amp; billing.</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {addFirst}
                <CopyAdminLink orgSlug={limit.orgSlug} />
              </div>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {limit.offer === "upgrade" && link && (
                <Link href={link.href} onClick={onLeave} data-testid="limit-upgrade" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">{link.label}</Link>
              )}
              {limit.offer === "checkout-closed" && (
                <span data-testid="limit-coming-soon" className="cursor-not-allowed rounded-xl bg-[#c9c3f7] px-4 py-2 text-[14px] font-semibold text-white" title="Card checkout isn't open for this organisation yet">Starter: coming soon</span>
              )}
              {limit.offer === "business" && link && (
                <Link href={link.href} onClick={onLeave} data-testid="limit-business" className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">{link.label}</Link>
              )}
              {addFirst}
              {limit.offer === "upgrade" && (
                <Link href={adminTabHref(limit.orgSlug, "billing")} onClick={onLeave} className="px-1 text-[13px] font-medium text-[#3f35b5]">Compare plans</Link>
              )}
              {limit.offer === "checkout-closed" && link && (
                <Link href={link.href} onClick={onLeave} data-testid="limit-quote" className="px-1 text-[13px] font-medium text-[#3f35b5]">{link.label}</Link>
              )}
            </div>
          )}
          {copy.footnote && <p className="mt-3 text-[12px] text-[#6b7289]">{copy.footnote}</p>}
        </div>
      </div>
    </div>
  );
}

/** The cards' bottom row while over: the same actions, closer to where the eye ends up. */
export function LimitActions({ limit, busy, onAddFirst, onLeave }: { limit: LimitState; busy: boolean; onAddFirst: (count: number) => void; onLeave: () => void }) {
  const fits = limit.fitCards;
  const link = limitLink(limit.offer, limit.orgSlug);
  return (
    <>
      {link && limit.offer !== "checkout-closed" && (
        <Link href={link.href} onClick={onLeave} className="rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white">{link.label}</Link>
      )}
      {fits > 0 && (
        <button type="button" disabled={busy} className="rounded-xl border border-[#c9c3f7] bg-white px-4 py-2 text-[14px] font-semibold text-[#3f35b5] disabled:opacity-60" onClick={() => onAddFirst(fits)}>
          Add the first {fits} for now
        </button>
      )}
    </>
  );
}

/** "Free fits the cards above · these 70 wait for an upgrade" */
export function LimitDivider({ fits, waiting, label }: { fits: number; waiting: number; label: string }) {
  return (
    <div data-testid="limit-divider" className="col-span-full flex items-center gap-3 py-1 text-[12px] font-medium text-[#9a3412]">
      <span className="h-px flex-1 bg-[#fed7aa]" />
      {fits > 0 ? `${label} fits the cards above · these ${waiting} wait for an upgrade` : `These ${waiting} wait for an upgrade`}
      <span className="h-px flex-1 bg-[#fed7aa]" />
    </div>
  );
}
