import React from "react";
import { AlertCircle, Check } from "lucide-react";
import type { AskStep } from "@/lib/api-client";
import type { AskTimingDetails } from "@/lib/ask/deterministic";
import { stepKey } from "@/lib/ask/route";

/**
 * "How this was worked out": the server's real working steps for a model answer, each built from
 * a lookup result ("6 Applications renew in the next 90 days, $210,000 a year"). Collapsed by default.
 */
export function AskSteps({ steps, timing, details }: { steps: AskStep[]; timing?: string; details?: AskTimingDetails }) {
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
      <AskTimingBlock timing={timing} details={details} />
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

const secs = (value: number | undefined) => `${(value ?? 0).toFixed(1)}s`;

/** Each AI call (why it was made, time, tokens, finish reason), the workspace cache result and any repairs. */
export function TimingDetails({ details }: { details: AskTimingDetails }) {
  const cache = details.cache;
  return (
    <details data-testid="ask-timing-details" className="mt-1 text-[11px] text-[#6b7289]">
      <summary className="cursor-pointer select-none font-medium text-[#5b4ce6]">Timing details</summary>
      <table className="mt-1.5 w-full text-left tabular-nums">
        <thead>
          <tr className="text-[#8b90a0]">
            <th className="pr-2 font-medium">#</th>
            <th className="pr-2 font-medium">Time</th>
            <th className="pr-2 font-medium">Tokens in / out / thinking</th>
            <th className="pr-2 font-medium">Finish</th>
            <th className="font-medium">Why</th>
          </tr>
        </thead>
        <tbody>
          {details.calls.map((call, index) => (
            <tr key={index} data-testid="ask-timing-call" className="align-top text-[#3c4254]">
              <td className="pr-2">{index + 1}</td>
              <td className="pr-2">{secs(call.s)}{call.streamed ? " (streamed)" : ""}</td>
              <td className="pr-2">{call.in.toLocaleString("en-US")} / {call.out.toLocaleString("en-US")} / {call.think.toLocaleString("en-US")}</td>
              <td className="pr-2">{call.finish}</td>
              <td>{call.why ?? "first"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {cache && cache.hit !== undefined && (
        <p data-testid="ask-timing-cache" className="mt-1.5">
          Workspace cache: {cache.hit ? "hit" : "miss"}{cache.why ? ` (${cache.why})` : ""}{cache.fingerprint_s !== undefined ? `, fingerprint ${secs(cache.fingerprint_s)}` : ""}
        </p>
      )}
      {details.repairs && details.repairs.length > 0 && (
        <p data-testid="ask-timing-repairs" className="mt-1">Fixed without a correction: {details.repairs.join("; ")}</p>
      )}
      {details.bad_reply && (
        <div data-testid="ask-timing-bad-reply" className="mt-1">
          Reply that wasn't JSON (first 300 characters; ids, emails and numbers masked):
          <pre className="mt-0.5 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-1.5 font-mono text-[10px] text-[#3c4254]">{details.bad_reply}</pre>
        </div>
      )}
    </details>
  );
}

/** The timing line and Timing details: shown under every AI answer's working steps (item card, prose, or the short "No" card). */
export function AskTimingBlock({ timing, details }: { timing?: string; details?: AskTimingDetails }) {
  if (!timing && !(details && details.calls.length)) return null;
  return (
    <>
      {timing && <p data-testid="ask-timing" className="mt-2 border-t border-[#eef0f4] pt-1.5 text-[11px] tabular-nums text-[#8b90a0]">{timing}</p>}
      {details && details.calls.length > 0 && <TimingDetails details={details} />}
    </>
  );
}
