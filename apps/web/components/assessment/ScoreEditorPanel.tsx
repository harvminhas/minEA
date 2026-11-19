"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ASSESSMENT_SCORES,
  CONFIDENCES,
  confidenceLabel,
  type AssessmentEvidence,
  type AssessmentScore,
  type Confidence,
  type DimensionDescriptor,
  type DimensionScore,
} from "@minea/types";
import { scoreTone } from "@/components/assessment/ScorePips";

export type ScoreEditorTarget = {
  title: string;
  subtitle: string;
  descriptor: DimensionDescriptor;
  value: DimensionScore | null;
};

export function ScoreEditorPanel({
  target,
  canEdit,
  onClose,
  onSave,
  pending,
  error,
}: {
  target: ScoreEditorTarget;
  canEdit: boolean;
  onClose: () => void;
  onSave: (value: DimensionScore) => void;
  pending?: boolean;
  error?: string | null;
}) {
  const [score, setScore] = useState<AssessmentScore | null>(target.value?.score ?? null);
  const [confidence, setConfidence] = useState<Confidence>(target.value?.confidence ?? "M");
  const [evidence, setEvidence] = useState<AssessmentEvidence[]>(target.value?.evidence ?? []);
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [adding, setAdding] = useState<"note" | "link" | null>(null);

  const canSave = canEdit && score != null && !pending;

  const addEvidence = () => {
    if (adding === "note") {
      const text = note.trim();
      if (!text) return;
      setEvidence((current) => [...current, { kind: "note", text }]);
      setNote("");
      setAdding(null);
      return;
    }
    if (adding === "link") {
      const url = link.trim();
      if (!url) return;
      setEvidence((current) => [...current, { kind: "link", url }]);
      setLink("");
      setAdding(null);
    }
  };

  const anchors = useMemo(() => ASSESSMENT_SCORES.map((item) => ({ score: item, text: target.descriptor.anchors[item] })), [target.descriptor]);

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/20" onClick={onClose} />
      <aside
        className="fixed right-0 top-0 z-[90] flex h-full w-[440px] flex-col bg-white shadow-xl"
        data-testid="score-editor"
        aria-label={`Edit ${target.descriptor.label}`}
      >
        <div className="flex items-start justify-between border-b border-[#eef0f4] px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-[#1c2230]">{target.descriptor.label}</h2>
            <p className="mt-0.5 text-[12.5px] text-[#6b7289]">{target.subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-1.5 text-[#6b7289] hover:bg-gray-100" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">SCORE</div>
          <div className="flex flex-col gap-1.5">
            {anchors.map((item) => (
              <button
                key={item.score}
                type="button"
                disabled={!canEdit}
                data-testid={`score-anchor-${item.score}`}
                onClick={() => setScore(item.score)}
                className={cn(
                  "flex items-start gap-2.5 rounded-[10px] border px-2.5 py-2 text-left",
                  score === item.score ? "border-[#c4b5fd] bg-[#f6f5ff] shadow-[0_0_0_2px_rgba(91,76,230,0.12)]" : "border-[#eef0f4]",
                  !canEdit && "cursor-default",
                )}
              >
                <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-bold text-white", scoreTone(item.score))}>
                  {item.score}
                </span>
                <span className="pt-0.5 text-[12.5px] leading-snug text-[#1c2230]">{item.text}</span>
              </button>
            ))}
          </div>

          <div className="mb-1.5 mt-4 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">CONFIDENCE</div>
          <div className="flex flex-wrap gap-1">
            {CONFIDENCES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={!canEdit}
                data-testid={`score-confidence-${item}`}
                onClick={() => setConfidence(item)}
                className={cn(
                  "rounded-full px-2 py-0.5 text-[12px] font-medium",
                  confidence === item ? "bg-[#1c2230] text-white" : "bg-[#f3f4f8] text-[#4b5163]",
                )}
              >
                {confidenceLabel(item)}
              </button>
            ))}
          </div>

          <div className="mb-1.5 mt-4 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">EVIDENCE</div>
          <div className="rounded-[10px] border border-[#e6e8ee] p-2.5">
            {evidence.length ? (
              <ul className="mb-1.5 space-y-1.5">
                {evidence.map((item, index) => (
                  <li key={`${item.kind}-${index}`} className="flex items-start gap-2 text-[12.5px] text-[#1c2230]">
                    <span className="w-11 shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#5b4ce6]">{item.kind}</span>
                    <span className="flex-1 break-words">{item.kind === "link" ? item.url : item.text}</span>
                    {canEdit ? (
                      <button
                        type="button"
                        className="text-[11px] text-[#8b90a0] hover:text-[#1c2230]"
                        onClick={() => setEvidence((current) => current.filter((_, i) => i !== index))}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-1.5 text-[12.5px] text-[#8b90a0]">No evidence yet. Add a note or a link.</p>
            )}
            {canEdit && adding === "note" ? (
              <div className="mt-1 space-y-1.5">
                <textarea
                  data-testid="score-evidence-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="What did you see?"
                  className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#5b4ce6]"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={addEvidence} className="text-[12px] font-medium text-[#5b4ce6]">Add note</button>
                  <button type="button" onClick={() => { setAdding(null); setNote(""); }} className="text-[12px] text-[#8b90a0]">Cancel</button>
                </div>
              </div>
            ) : canEdit && adding === "link" ? (
              <div className="mt-1 space-y-1.5">
                <input
                  data-testid="score-evidence-link"
                  value={link}
                  onChange={(event) => setLink(event.target.value)}
                  placeholder="https://"
                  className="w-full rounded-lg border border-[#e6e8ee] px-2.5 py-1.5 text-[13px] outline-none focus:border-[#5b4ce6]"
                />
                <div className="flex gap-2">
                  <button type="button" onClick={addEvidence} className="text-[12px] font-medium text-[#5b4ce6]">Add link</button>
                  <button type="button" onClick={() => { setAdding(null); setLink(""); }} className="text-[12px] text-[#8b90a0]">Cancel</button>
                </div>
              </div>
            ) : canEdit ? (
              <div className="mt-1 flex gap-3">
                <button type="button" onClick={() => setAdding("note")} className="text-[12px] font-medium text-[#5b4ce6]">+ Add a note</button>
                <button type="button" onClick={() => setAdding("link")} className="text-[12px] font-medium text-[#5b4ce6]">+ Add a link</button>
              </div>
            ) : null}
          </div>
          {error ? <p className="mt-3 text-[12.5px] text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#eef0f4] px-5 py-3">
          <button type="button" onClick={onClose} className="h-8 rounded-lg border border-[#e6e8ee] px-3 text-[13px] font-medium text-[#4b5163]">
            Cancel
          </button>
          <button
            type="button"
            data-testid="score-editor-save"
            disabled={!canSave}
            onClick={() => {
              if (score == null) return;
              onSave({ score, confidence, evidence });
            }}
            className="h-8 rounded-lg bg-[#5b4ce6] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </aside>
    </>
  );
}
