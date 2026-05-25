"use client";

import { GitBranch, Plus } from "lucide-react";
import { normalizeStepTitle } from "@/lib/journey-state";
import type { StepDraft } from "@/components/views/JourneyFlowCanvas";
import { cn } from "@/lib/utils";

interface Props {
  sourceStep: StepDraft;
  sourceIndex: number;
  steps: StepDraft[];
  connectedTargetIds: Set<string>;
  onSelectExisting: (targetId: string) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export function AddJourneyPathDialog({
  sourceStep,
  sourceIndex,
  steps,
  connectedTargetIds,
  onSelectExisting,
  onCreateNew,
  onCancel,
}: Props) {
  const sourceLabel = normalizeStepTitle(sourceStep.title, sourceIndex);
  const candidates = steps.filter(
    (step) => step.id !== sourceStep.id && !connectedTargetIds.has(step.id)
  );

  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/30" onClick={onCancel} />
      <div
        role="dialog"
        aria-labelledby="add-journey-path-title"
        className="fixed left-1/2 top-1/2 z-[90] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-1">
          <GitBranch size={16} className="text-amber-700 mt-0.5 flex-shrink-0" />
          <h3 id="add-journey-path-title" className="font-semibold text-gray-900">
            Where does this path lead?
          </h3>
        </div>
        <p className="text-sm text-gray-500 ml-6 mb-4">
          Add another outgoing path from{" "}
          <span className="font-medium text-gray-700">{sourceLabel}</span>.
        </p>

        {candidates.length > 0 ? (
          <div className="space-y-1.5 max-h-52 overflow-y-auto mb-4">
            {candidates.map((step) => {
              const index = steps.indexOf(step);
              const label = normalizeStepTitle(step.title, index);
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => onSelectExisting(step.id)}
                  className={cn(
                    "w-full text-left rounded-lg border border-gray-200 px-3 py-2.5",
                    "hover:border-indigo-300 hover:bg-indigo-50/40 transition-colors"
                  )}
                >
                  <p className="text-sm font-medium text-gray-900">{label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Step {index + 1}</p>
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400 mb-4 ml-6">No other steps available yet.</p>
        )}

        <button
          type="button"
          onClick={onCreateNew}
          className={cn(
            "w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed",
            "border-gray-300 px-3 py-3 text-sm font-medium text-gray-600",
            "hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors"
          )}
        >
          <Plus size={16} />
          Create new step
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="mt-4 w-full border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </>
  );
}
