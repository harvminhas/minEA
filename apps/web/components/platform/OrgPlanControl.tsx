"use client";

import { useEffect, useRef, useState } from "react";
import { platformAdminApi, type AdminUserOrg } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { HAND_PLANS, STRIPE_BLOCK, changeSummary, planLabel, planSummary, type HandPlan } from "@/lib/platform/manual-plan";

/** Plan button on a /platform/users org line: pick Free / Starter / Business, add a reason, confirm. */
export function OrgPlanControl({ org, onChanged }: { org: AdminUserOrg; onChanged: (message: string) => void }) {
  const { getToken } = useAuth();
  const [open, setOpen] = useState(false);
  const current = org.plan;
  const first = HAND_PLANS.find((plan) => plan !== current) ?? "business";
  const [pick, setPick] = useState<HandPlan>(first);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  // Fixed position: the users table scrolls sideways, which would clip an absolute popover.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    const hide = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await platformAdminApi.setPlan(org.slug, { plan: pick, reason: reason.trim() }, (await getToken())!);
      setOpen(false);
      setReason("");
      onChanged(`${org.name} is now on ${planLabel(pick)}.`);
    } catch (err) {
      setError((err as Error).message || "Couldn't change the plan.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <span className="inline-block" ref={box}>
      <button
        type="button"
        data-plan-button={org.slug}
        aria-expanded={open}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAt({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - 348)) });
          setOpen((value) => !value);
          setError("");
          setPick(first);
        }}
        className={`rounded-md border px-1.5 py-0.5 font-medium ${open ? "border-[#5b4ce6] text-[#5b4ce6]" : "border-[#e6e8ee] text-[#1c2230] hover:border-[#5b4ce6]"}`}
      >
        {planLabel(current)} ▾
      </button>
      {open && at && (
        <div role="dialog" aria-label={`Change plan · ${org.name}`} style={{ top: at.top, left: at.left }} className="fixed z-50 w-[340px] rounded-xl border border-[#e6e8ee] bg-white p-3 text-[12.5px] shadow-lg" data-testid="plan-popover">
          <p className="font-semibold text-[#1c2230]">Change plan · {org.name}</p>
          {org.subscription ? (
            <>
              <p className="mt-2 rounded-lg bg-[#fff7ed] px-2.5 py-1.5 text-[11.5px] text-[#b45309]" data-testid="stripe-block">{STRIPE_BLOCK}</p>
              <div className="mt-2.5 flex justify-end">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1 text-[12px] text-[#6b7289]">Close</button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 space-y-1">
                {HAND_PLANS.map((plan) => (
                  <label key={plan} className={`flex items-start gap-2 rounded-lg border px-2.5 py-1.5 ${plan === current ? "cursor-default opacity-60" : "cursor-pointer"} ${plan === pick ? "border-[#5b4ce6] bg-[#f4f3ff]" : "border-[#eef0f4]"}`}>
                    <input type="radio" name={`plan-${org.slug}`} value={plan} checked={plan === pick} disabled={plan === current} onChange={() => setPick(plan)} className="mt-0.5 accent-[#5b4ce6]" />
                    <span>
                      <span className="font-medium text-[#1c2230]">{planLabel(plan)}</span>
                      {plan === current && <span className="ml-1 text-[#8b90a0]">(current)</span>}
                      <span className="block text-[11.5px] text-[#6b7289]">{planSummary(plan)}</span>
                    </span>
                  </label>
                ))}
              </div>
              <input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Reason (shown in the audit log)" aria-label="Reason" className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[12.5px] text-[#1c2230] outline-none focus:border-[#5b4ce6]" />
              <p className="mt-1.5 text-[11.5px] text-[#6b7289]">{changeSummary(current, pick)}</p>
              {error && <p className="mt-1.5 text-[11.5px] text-[#b42318]" role="alert">{error}</p>}
              <div className="mt-2.5 flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2.5 py-1 text-[12px] text-[#6b7289]">Cancel</button>
                <button type="button" disabled={saving || pick === current} onClick={() => void save()} data-testid="plan-confirm" className="rounded-md bg-[#5b4ce6] px-2.5 py-1 text-[12px] font-medium text-white disabled:opacity-60">
                  {saving ? "Saving…" : `Set to ${planLabel(pick)}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </span>
  );
}
