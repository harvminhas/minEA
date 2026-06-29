"use client";

import { useEffect, useState } from "react";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";
import { cn } from "@/lib/utils";

export interface StartupStep {
  label: string;
  /** Target progress (0–100) when this step is active. */
  progress: number;
}

export const STARTUP_AUTH_STEPS: StartupStep[] = [
  { label: "Starting BuboMap", progress: 18 },
  { label: "Verifying your session", progress: 48 },
  { label: "Preparing your workspace", progress: 78 },
];

export const STARTUP_HOME_STEPS: StartupStep[] = [
  { label: "Loading your organizations", progress: 52 },
  { label: "Loading your workspace", progress: 76 },
  { label: "Opening your workspace", progress: 92 },
];

interface Props {
  stepIndex: number;
  steps?: StartupStep[];
  subtitle?: string;
  className?: string;
}

export function StartupLoader({
  stepIndex,
  steps = STARTUP_AUTH_STEPS,
  subtitle,
  className,
}: Props) {
  const safeIndex = Math.max(0, Math.min(stepIndex, steps.length - 1));
  const step = steps[safeIndex]!;
  const target = step.progress;
  const [displayProgress, setDisplayProgress] = useState(8);

  useEffect(() => {
    setDisplayProgress((prev) => Math.max(prev, target));
  }, [target]);

  // Gentle creep while waiting so the bar never feels frozen.
  useEffect(() => {
    const id = window.setInterval(() => {
      setDisplayProgress((prev) => {
        const ceiling = Math.min(target + 12, 96);
        if (prev >= ceiling) return prev;
        return Math.min(prev + 1.5, ceiling);
      });
    }, 400);
    return () => window.clearInterval(id);
  }, [target]);

  return (
    <div
      className={cn(
        "min-h-screen flex flex-col items-center justify-center bg-gray-50 px-6",
        className
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={step.label}
    >
      <div className="w-full max-w-sm">
        <BuboMapWordmark size="md" beta theme="light" />

        <p className="mt-8 text-sm font-medium text-gray-800">{step.label}…</p>
        {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}

        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-violet-100">
          <div
            className="h-full rounded-full bg-violet-600 transition-[width] duration-500 ease-out"
            style={{ width: `${displayProgress}%` }}
          />
        </div>

        <p className="mt-2 text-[11px] text-gray-400 tabular-nums">
          Step {safeIndex + 1} of {steps.length}
        </p>
      </div>
    </div>
  );
}
