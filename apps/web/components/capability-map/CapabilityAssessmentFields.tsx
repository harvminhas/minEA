"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  BUSINESS_CRITICALITIES,
  POSTURES,
  criticalityLabel,
  postureLabel,
  type BusinessCriticality,
  type CapabilityAssessment,
  type InvestmentPosture,
  type SuggestedPosture,
} from "@/lib/capability-assessment";

export type AssessmentPatch = {
  investment_posture?: InvestmentPosture | null;
  investment_posture_override_reason?: string | null;
  business_criticality?: BusinessCriticality | null;
  technology_fit?: number | null;
};

export function CapabilityAssessmentFields({
  assessment,
  suggested,
  canEdit,
  onChange,
}: {
  assessment: CapabilityAssessment;
  suggested: SuggestedPosture | null;
  canEdit: boolean;
  onChange: (patch: AssessmentPatch) => void;
}) {
  const differs = Boolean(suggested && assessment.posture && assessment.posture !== suggested.posture);
  return (
    <div className="mb-5 rounded-xl border border-[#eef0f4] px-3 py-3" data-testid="capability-assessment-fields">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Investment posture">
          <div className="flex flex-wrap gap-1">
            {POSTURES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canEdit}
                data-testid={`posture-${item}`}
                onClick={() =>
                  onChange({
                    investment_posture: item,
                    investment_posture_override_reason: suggested && item === suggested.posture ? "" : assessment.overrideReason,
                  })
                }
                className={cn(
                  "rounded-full px-2 py-0.5 text-[12px] font-medium",
                  assessment.posture === item ? "bg-[#1c2230] text-white" : "bg-[#f3f4f8] text-[#4b5163]",
                  !canEdit && "cursor-default opacity-80",
                )}
              >
                {postureLabel(item)}
              </button>
            ))}
          </div>
          {suggested ? (
            <p className="mt-1.5 text-[11.5px] text-[#6b7289]">
              Suggested: {postureLabel(suggested.posture)} ({suggested.reason})
            </p>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-[#6b7289]">No suggestion yet — set fit or dispositions first.</p>
          )}
        </Field>
        <Field label="Business criticality">
          <div className="flex flex-wrap gap-1">
            {BUSINESS_CRITICALITIES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canEdit}
                data-testid={`criticality-${item}`}
                onClick={() => onChange({ business_criticality: item })}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[12px] font-medium",
                  assessment.businessCriticality === item ? "bg-[#1c2230] text-white" : "bg-[#f3f4f8] text-[#4b5163]",
                  !canEdit && "cursor-default opacity-80",
                )}
              >
                {criticalityLabel(item)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Technology fit (1–5)">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canEdit}
                data-testid={`tech-fit-${item}`}
                onClick={() => onChange({ technology_fit: item })}
                className={cn(
                  "h-7 w-7 rounded-md text-[12.5px] font-semibold",
                  assessment.technologyFit === item ? "bg-[#1c2230] text-white" : "bg-[#f3f4f8] text-[#4b5163]",
                  !canEdit && "cursor-default opacity-80",
                )}
              >
                {item}
              </button>
            ))}
          </div>
          {assessment.technologyFitSource === "default" && assessment.technologyFitDefaultFrom === "nf" ? (
            <p className="mt-1.5 text-[11.5px] text-[#6b7289]">Based on the lowest application scores of the apps used. Click a value to override.</p>
          ) : assessment.technologyFitSource === "default" ? (
            <p className="mt-1.5 text-[11.5px] text-[#6b7289]">Based on the lowest Strong / Adequate / Weak rating of the apps used (Strong 4, Adequate 3, Weak 2).</p>
          ) : null}
        </Field>
      </div>
      {differs ? (
        <label className="mt-3 block">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">OVERRIDE REASON (required when posture differs from the suggestion)</span>
          <textarea
            data-testid="posture-override-reason"
            disabled={!canEdit}
            defaultValue={assessment.overrideReason}
            key={assessment.overrideReason}
            onBlur={(event) => onChange({ investment_posture_override_reason: event.target.value })}
            rows={2}
            className="mt-1 w-full rounded-lg border border-[#e6e8ee] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#5b4ce6]"
            placeholder="Why this posture instead of the suggestion?"
          />
        </label>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">{label.toUpperCase()}</div>
      {children}
    </div>
  );
}
