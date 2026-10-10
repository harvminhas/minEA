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

/**
 * While the answer is being worked out (streaming): each real lookup line appears as it finishes,
 * then the checked answer text arrives in chunks. Nothing here is unverified: steps are built from
 * lookup results, and text only streams after the server's check passed.
 */
export function AskLiveSteps({ steps, text }: { steps: AskStep[]; text: string }) {
  if (!steps.length && !text) return null;
  return (
    <div data-testid="ask-live" className="mt-4">
      {steps.length > 0 && (
        <ol className="space-y-1.5 text-[13px] text-[#3c4254]">
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
      )}
      {text && <p data-testid="ask-live-text" className="mt-4 whitespace-pre-wrap text-[17px] leading-7 text-[#1c2230]">{text.replace(/\[\d+\]/g, "")}</p>}
    </div>
  );
}
