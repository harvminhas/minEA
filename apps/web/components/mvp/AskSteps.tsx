import { AlertCircle, Check } from "lucide-react";
import type { AskStep } from "@/lib/api-client";
import { stepKey } from "@/lib/ask/route";

/**
 * "How this was worked out": the server's real working steps for a model answer, each built from
 * a lookup result ("6 Applications renew in the next 90 days, $210,000 a year"). Collapsed by default.
 */
export function AskSteps({ steps }: { steps: AskStep[] }) {
  return (
    <details data-testid="ask-steps" className="mt-4 rounded-lg border border-[#eef0f4] bg-[#fafafb] px-3 py-2 text-[13px] text-[#3c4254]">
      <summary className="cursor-pointer select-none text-[12px] font-medium text-[#6b7289]">
        How this was worked out · {steps.length} {steps.length === 1 ? "step" : "steps"}
      </summary>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step, index) => (
          <li key={stepKey(step, index)} data-step={step.id} data-status={step.status} className="flex items-start gap-2">
            {step.status === "error" ? (
              <AlertCircle size={13} className="mt-0.5 flex-shrink-0 text-[#c2410c]" />
            ) : (
              <Check size={13} className="mt-0.5 flex-shrink-0 text-[#5b4ce6]" />
            )}
            <span>{step.label}</span>
          </li>
        ))}
      </ol>
    </details>
  );
}
