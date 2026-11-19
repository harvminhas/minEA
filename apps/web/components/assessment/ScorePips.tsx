"use client";

import { cn } from "@/lib/utils";
import type { AssessmentScore } from "@minea/types";

const TONE: Record<AssessmentScore, string> = {
  1: "bg-[#991b1b] text-white",
  2: "bg-[#dc2626] text-white",
  3: "bg-[#d97706] text-white",
  4: "bg-[#15803d] text-white",
  5: "bg-[#166534] text-white",
};

export function scoreTone(score: number): string {
  return TONE[(score as AssessmentScore)] ?? "bg-[#f3f4f8] text-[#8b90a0]";
}

export function ScorePips({
  score,
  size = "md",
}: {
  score: number | null | undefined;
  size?: "sm" | "md";
}) {
  const box = size === "sm" ? "h-6 w-6 text-[11px]" : "h-[22px] w-[22px] text-[11px]";
  return (
    <span className="inline-flex gap-[3px]" data-testid="score-pips">
      {[1, 2, 3, 4, 5].map((item) => (
        <span
          key={item}
          className={cn(
            "inline-flex items-center justify-center rounded-md font-semibold",
            box,
            score === item ? scoreTone(item) : "bg-[#f3f4f8] text-[#8b90a0]",
          )}
        >
          {item}
        </span>
      ))}
    </span>
  );
}

export function ScoreCell({ score }: { score: number | null | undefined }) {
  if (score == null) {
    return (
      <div className="mx-auto flex h-8 w-[54px] items-center justify-center rounded-md bg-[#f3f4f8] text-[12.5px] font-medium text-[#b0b4c0]">
        —
      </div>
    );
  }
  return (
    <div
      className={cn(
        "mx-auto flex h-8 w-[54px] items-center justify-center rounded-md text-[12.5px] font-bold",
        scoreTone(score),
      )}
    >
      {score}
    </div>
  );
}

export function ConfidenceMark({ value }: { value: "H" | "M" | "L" | null | undefined }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "inline-flex h-[18px] w-5 items-center justify-center rounded text-[9px] font-bold tracking-wide",
        value === "H" && "bg-[#ecfdf3] text-[#15803d]",
        value === "M" && "bg-[#fff7ed] text-[#c2410c]",
        value === "L" && "bg-[#f3f4f8] text-[#6b7289]",
      )}
    >
      {value}
    </span>
  );
}
