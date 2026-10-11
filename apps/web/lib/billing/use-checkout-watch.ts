"use client";

import { useEffect, useRef, useState } from "react";
import {
  CHECKOUT_PENDING_REPORT_MAX_MS,
  CHECKOUT_PENDING_REPORT_MS,
  CHECKOUT_POLL_MS,
  checkoutPhase,
  type CheckoutPhase,
} from "@/lib/support";

/**
 * After Stripe Checkout succeeds: re-read billing status every few seconds until the plan shows,
 * switch to "still setting up" after 60 s, and from then on report the session to the API every
 * minute (the API emails the owner once if it is still not applied after 5 minutes).
 */
export function useCheckoutWatch(opts: {
  active: boolean;
  planActive: boolean;
  refresh: () => void;
  reportPending: () => Promise<unknown>;
}): CheckoutPhase | null {
  const { active, planActive } = opts;
  const started = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const fns = useRef(opts);
  fns.current = opts;

  useEffect(() => {
    if (!active || planActive) return;
    if (started.current == null) started.current = Date.now();
    const tick = setInterval(() => {
      setElapsed(Date.now() - (started.current ?? Date.now()));
      fns.current.refresh();
    }, CHECKOUT_POLL_MS);
    return () => clearInterval(tick);
  }, [active, planActive]);

  const phase = active ? checkoutPhase(elapsed, planActive) : null;

  useEffect(() => {
    if (phase !== "still_setting_up") return;
    const report = () => {
      if (Date.now() - (started.current ?? Date.now()) > CHECKOUT_PENDING_REPORT_MAX_MS) return;
      void fns.current.reportPending().catch(() => undefined);
    };
    report();
    const timer = setInterval(report, CHECKOUT_PENDING_REPORT_MS);
    return () => clearInterval(timer);
  }, [phase]);

  return phase;
}
