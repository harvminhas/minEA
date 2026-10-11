"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BuboMapMark } from "@/components/brand/BuboMapLogo";
import { ImpactLoop } from "@/components/ui/ImpactLoop";
import { cn } from "@/lib/utils";

/**
 * App loading screen: small owl + wordmark, an animated "what if X is down" impact diagram
 * (ImpactLoop) on a soft brand gradient, one calm status line that
 * crossfades through the real boot steps, and an indeterminate shimmer bar (no fake percentage).
 *
 * - Nothing but the background shows for the first ~300 ms (CSS delay), so fast loads don't flash.
 * - `leaving` fades the whole screen out into the app.
 * - After SLOW_AFTER_MS a quiet "Taking longer than usual… Retry" appears.
 * Animations live in globals.css (bm-*) and stop under prefers-reduced-motion.
 */

export interface StartupStep {
  label: string;
}

export const STARTUP_AUTH_STEPS: StartupStep[] = [
  { label: "Starting BuboMap" },
  { label: "Signing you in" },
  { label: "Preparing your workspace" },
];

export const STARTUP_HOME_STEPS: StartupStep[] = [
  { label: "Loading your organisations" },
  { label: "Finding your workspace" },
  { label: "Opening your workspace" },
];

export const STARTUP_SHELL_STEPS: StartupStep[] = [
  { label: "Loading your organisation" },
  { label: "Opening your workspace" },
  { label: "Almost ready" },
];

/** Show the "taking longer" note after this long on the loading screen. */
export const SLOW_AFTER_MS = 10_000;
/** Status line crossfade and screen fade-out duration (keep in sync with globals.css). */
export const LOADER_FADE_MS = 300;

export function stepLabel(steps: StartupStep[], stepIndex: number): string {
  const safe = Math.max(0, Math.min(stepIndex, steps.length - 1));
  return steps[safe]?.label ?? "";
}

interface Props {
  stepIndex: number;
  steps?: StartupStep[];
  subtitle?: string;
  className?: string;
  /** Fixed full-screen overlay — used during app boot so nothing flashes underneath. */
  overlay?: boolean;
  /** Fade out (the app is ready); the parent unmounts after LOADER_FADE_MS. */
  leaving?: boolean;
  /** Force the slow state (screenshots/tests). */
  slow?: boolean;
  onRetry?: () => void;
}

export function StartupLoader({
  stepIndex,
  steps = STARTUP_AUTH_STEPS,
  subtitle,
  className,
  overlay = false,
  leaving = false,
  slow: forceSlow = false,
  onRetry,
}: Props) {
  const label = stepLabel(steps, stepIndex);
  const [mounted, setMounted] = useState(false);
  const [slow, setSlow] = useState(forceSlow);
  // Crossfade: the previous label fades out while the new one fades in.
  const [shown, setShown] = useState<{ current: string; previous: string | null }>({ current: label, previous: null });
  const fadeTimer = useRef<number | null>(null);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (forceSlow) return;
    const id = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(id);
  }, [forceSlow]);

  useEffect(() => {
    setShown((s) => (s.current === label ? s : { current: label, previous: s.current }));
    if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    fadeTimer.current = window.setTimeout(() => setShown((s) => ({ ...s, previous: null })), LOADER_FADE_MS);
    return () => {
      if (fadeTimer.current) window.clearTimeout(fadeTimer.current);
    };
  }, [label]);

  const retry = onRetry ?? (() => window.location.reload());

  const content = (
    <div
      className={cn(
        "bm-loader flex flex-col items-center justify-center px-6",
        overlay ? "fixed inset-0 z-[10000]" : "min-h-screen",
        leaving && "bm-loader-leaving",
        className
      )}
      data-startup-loader
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      aria-label={label}
    >
      <div className="bm-loader-content flex flex-col items-center text-center">
        <div className="flex items-center gap-2.5">
          <span className="relative">
            <span aria-hidden className="bm-owl-glow absolute -inset-3 rounded-full" />
            <BuboMapMark size={34} blink className="relative" />
          </span>
          <span className="text-lg font-bold tracking-tight text-gray-900">BuboMap</span>
        </div>

        <div className="mt-6 rounded-2xl border border-violet-100 bg-white/70 px-5 pb-3 pt-4 shadow-[0_12px_40px_-12px_rgba(91,76,230,0.25)] backdrop-blur-sm">
          <ImpactLoop />
        </div>

        <div className="relative mt-6 h-5 w-72 text-sm font-medium text-gray-600" data-testid="startup-status">
          {shown.previous && (
            <span key={`p-${shown.previous}`} className="bm-status-out absolute inset-0" aria-hidden>
              {shown.previous}…
            </span>
          )}
          <span key={`c-${shown.current}`} className={cn("absolute inset-0", shown.previous && "bm-status-in")}>
            {shown.current}…
          </span>
        </div>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}

        <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-violet-200/60" aria-hidden>
          <div className="bm-shimmer h-full w-2/5 rounded-full bg-gradient-to-r from-transparent via-[#5b4ce6] to-transparent" />
        </div>

        <p
          className={cn("mt-8 h-5 text-xs text-gray-500 transition-opacity duration-500", slow ? "opacity-100" : "opacity-0")}
          data-testid="startup-slow"
          aria-hidden={!slow}
        >
          {slow && (
            <>
              Taking longer than usual…{" "}
              <button type="button" onClick={retry} className="font-medium text-[#5b4ce6] underline-offset-2 hover:underline">
                Retry
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );

  if (overlay) {
    if (!mounted) return null;
    return createPortal(content, document.body);
  }

  return content;
}
