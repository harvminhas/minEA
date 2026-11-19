"use client";

import { useMemo, useState } from "react";
import {
  NONFUNCTIONAL_DIMENSIONS,
  emptyNonfunctionalAssessment,
  nonfunctionalDescriptor,
  parseNonfunctionalAssessment,
  serializeNonfunctionalAssessment,
  type DimensionScore,
  type NonfunctionalAssessment,
  type NonfunctionalDimension,
} from "@minea/types";
import { ConfidenceMark, ScorePips } from "@/components/assessment/ScorePips";
import { ScoreEditorPanel, type ScoreEditorTarget } from "@/components/assessment/ScoreEditorPanel";
import { cn } from "@/lib/utils";

export function ApplicationAssessmentTab({
  appName,
  properties,
  canEdit,
  onChange,
  pending,
  error,
  className,
}: {
  appName: string;
  properties: Record<string, unknown> | null | undefined;
  canEdit: boolean;
  onChange: (next: NonfunctionalAssessment) => void | Promise<void>;
  pending?: boolean;
  error?: string | null;
  className?: string;
}) {
  const assessment = parseNonfunctionalAssessment(properties?.nonfunctional_assessment) ?? emptyNonfunctionalAssessment();
  const [dimension, setDimension] = useState<NonfunctionalDimension | null>(null);
  const target: ScoreEditorTarget | null = useMemo(() => {
    if (!dimension) return null;
    return {
      title: nonfunctionalDescriptor(dimension).label,
      subtitle: appName,
      descriptor: nonfunctionalDescriptor(dimension),
      value: assessment.scores[dimension] ?? null,
    };
  }, [dimension, appName, assessment]);

  return (
    <div className={cn("px-6 py-4", className)} data-testid="application-assessment">
      <p className="mb-3 max-w-[520px] text-[13px] text-[#5b6170]">
        Rate this application once. A summary appears on every capability that uses it. Vendor, cost, lifecycle, SLA, and criticality stay on the Details tab.
      </p>
      <div className="divide-y divide-[#f3f4f8]">
        {NONFUNCTIONAL_DIMENSIONS.map((key) => {
          const item = assessment.scores[key];
          return (
            <button
              key={key}
              type="button"
              disabled={!canEdit}
              data-testid={`nf-dimension-${key}`}
              onClick={() => setDimension(key)}
              className={cn(
                "flex w-full items-start gap-2.5 py-2 text-left",
                canEdit && "hover:bg-[#f6f5ff]",
                !canEdit && "cursor-default",
              )}
            >
              <span className="w-[148px] shrink-0 pt-0.5 text-[13px] font-medium text-[#1c2230]">{nonfunctionalDescriptor(key).label}</span>
              <ScorePips score={item?.score} />
              <ConfidenceMark value={item?.confidence} />
              <span className={cn("text-[11px] font-medium", evidenceLabel(item) ? "text-[#5b4ce6]" : "text-[#b0b4c0]")}>
                {evidenceLabel(item) || "Add evidence"}
              </span>
            </button>
          );
        })}
      </div>
      {error ? <p className="mt-3 text-[12.5px] text-red-600">{error}</p> : null}
      {dimension && target ? (
        <ScoreEditorPanel
          target={target}
          canEdit={canEdit}
          pending={pending}
          error={error}
          onClose={() => setDimension(null)}
          onSave={(value) => {
            const next: NonfunctionalAssessment = { scores: { ...assessment.scores, [dimension]: value } };
            void onChange(next);
            setDimension(null);
          }}
        />
      ) : null}
    </div>
  );
}

function evidenceLabel(item: DimensionScore | null | undefined): string | undefined {
  const first = item?.evidence?.[0];
  if (!first) return undefined;
  if (first.kind === "link") return "1 link";
  const text = first.text ?? "";
  if (/survey/i.test(text)) return text.length > 22 ? "Survey" : text;
  if (item && item.evidence.length > 1) return `${item.evidence.length} notes`;
  return "1 note";
}

export function nonfunctionalPayload(assessment: NonfunctionalAssessment): Record<string, unknown> {
  return serializeNonfunctionalAssessment(assessment);
}
