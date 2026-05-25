"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles, Trash2, X } from "lucide-react";
import type { Process } from "@minea/types";
import type { MinEAObject } from "@minea/types";
import { formFieldClass } from "@/components/ui/FormDrawer";
import type { StepDraft } from "@/components/views/JourneyFlowCanvas";
import { cn } from "@/lib/utils";

interface DerivedSystem {
  id: string;
  name: string;
}

interface Props {
  step: StepDraft;
  processes: Process[];
  systems: MinEAObject[];
  derivedSystems: DerivedSystem[];
  onSave: (step: StepDraft) => void;
  onRequestDelete: (stepId: string, stepTitle: string) => void;
  onClose: () => void;
}

export function StepDetailPanel({
  step,
  processes,
  systems,
  derivedSystems,
  onSave,
  onRequestDelete,
  onClose,
}: Props) {
  const [draft, setDraft] = useState(step);

  useEffect(() => {
    setDraft(step);
  }, [step.id]);

  const derivedIds = useMemo(() => new Set(derivedSystems.map((s) => s.id)), [derivedSystems]);
  const inferredSystems = systems.filter((s) => derivedIds.has(s.id));
  const otherSystems = systems.filter((s) => !derivedIds.has(s.id));

  const toggleProcess = (id: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      process_ids: checked ? [...prev.process_ids, id] : prev.process_ids.filter((x) => x !== id),
    }));
  };

  const toggleSystem = (id: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      system_ids: checked ? [...prev.system_ids, id] : prev.system_ids.filter((x) => x !== id),
    }));
  };

  const canSave = draft.title.trim().length > 0;
  const stepLabel = draft.title.trim() || "Untitled step";

  return (
    <div className="w-[400px] border-l border-gray-200 bg-white flex flex-col h-full flex-shrink-0">
      <div className="group flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Journey step</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Remove step"
            onClick={() => onRequestDelete(step.id, stepLabel)}
            className="p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50"
          >
            <Trash2 size={14} />
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Title</span>
          <input
            value={draft.title}
            onChange={(e) => setDraft((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. Submit application"
            className={formFieldClass}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Channel</span>
          <input
            value={draft.channel}
            onChange={(e) => setDraft((p) => ({ ...p, channel: e.target.value }))}
            placeholder="e.g. Mobile app, Email"
            className={formFieldClass}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Goal / intention</span>
          <textarea
            value={draft.goal}
            onChange={(e) => setDraft((p) => ({ ...p, goal: e.target.value }))}
            placeholder="What is the customer trying to accomplish?"
            rows={2}
            className={cn(formFieldClass, "resize-none")}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Pain points</span>
          <textarea
            value={draft.pain_points}
            onChange={(e) => setDraft((p) => ({ ...p, pain_points: e.target.value }))}
            placeholder="Friction, confusion, delays…"
            rows={2}
            className={cn(formFieldClass, "resize-none")}
          />
        </label>

        <div>
          <span className="text-xs font-medium text-gray-600 mb-2 block">Linked processes</span>
          <div className="space-y-1.5 max-h-32 overflow-y-auto border border-gray-100 rounded-lg p-2">
            {processes.length === 0 ? (
              <p className="text-xs text-gray-400 px-1">No processes yet. Add some under Repository → Business.</p>
            ) : (
              processes.map((process) => (
                <label key={process.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer px-1">
                  <input
                    type="checkbox"
                    checked={draft.process_ids.includes(process.id)}
                    onChange={(e) => toggleProcess(process.id, e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <span className="truncate">{process.name}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-medium text-gray-600">Systems involved</span>
            {derivedSystems.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                <Sparkles size={10} />
                Inferred from processes
              </span>
            )}
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto border border-gray-100 rounded-lg p-2">
            {inferredSystems.map((system) => (
              <label key={system.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={draft.system_ids.includes(system.id)}
                  onChange={(e) => toggleSystem(system.id, e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="truncate">{system.name}</span>
              </label>
            ))}
            {otherSystems.length > 0 && inferredSystems.length > 0 && (
              <p className="text-[10px] text-gray-400 px-1 pt-1 border-t border-gray-50">Other systems</p>
            )}
            {otherSystems.map((system) => (
              <label key={system.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={draft.system_ids.includes(system.id)}
                  onChange={(e) => toggleSystem(system.id, e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="truncate">{system.name}</span>
              </label>
            ))}
            {systems.length === 0 && (
              <p className="text-xs text-gray-400 px-1">Add applications in the repository to tag systems.</p>
            )}
          </div>
        </div>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Owner / team</span>
          <input
            value={draft.owner}
            onChange={(e) => setDraft((p) => ({ ...p, owner: e.target.value }))}
            placeholder="e.g. Customer success team"
            className={formFieldClass}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">AI opportunities</span>
          <textarea
            value={draft.ai_opportunities}
            onChange={(e) => setDraft((p) => ({ ...p, ai_opportunities: e.target.value }))}
            placeholder="Where could AI reduce friction or wait time?"
            rows={2}
            className={cn(formFieldClass, "resize-none")}
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-gray-600 mb-1 block">Sentiment / friction (optional)</span>
          <input
            value={draft.sentiment_friction}
            onChange={(e) => setDraft((p) => ({ ...p, sentiment_friction: e.target.value }))}
            placeholder="e.g. anxious, frustrated, neutral"
            className={formFieldClass}
          />
        </label>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!canSave) return;
            onSave(draft);
            onClose();
          }}
          disabled={!canSave}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium"
        >
          Save step
        </button>
      </div>
    </div>
  );
}
