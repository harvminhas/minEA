"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, Trash2, X } from "lucide-react";
import type { MinEAObject } from "@minea/types";
import { formFieldClass } from "@/components/ui/FormDrawer";
import { OwnershipFields } from "@/components/ownership/OwnershipFields";
import { useOwnershipForm } from "@/hooks/use-ownership-form";
import type { StageDraft } from "@/components/views/ProcessFlowCanvas";
import { cn } from "@/lib/utils";

interface Props {
  stage: StageDraft;
  capabilities: MinEAObject[];
  onSave: (stage: StageDraft) => void;
  onRequestDelete: (stageId: string, stageName: string) => void;
  onClose: () => void;
}

export function StageDetailPanel({ stage, capabilities, onSave, onRequestDelete, onClose }: Props) {
  const [draft, setDraft] = useState(stage);
  const [capSearch, setCapSearch] = useState("");
  const ownership = useOwnershipForm(stage);

  useEffect(() => {
    setDraft(stage);
    setCapSearch("");
    ownership.reset(stage);
  }, [stage.id]);

  const filteredCaps = capSearch
    ? capabilities.filter((c) => c.name.toLowerCase().includes(capSearch.toLowerCase()))
    : capabilities;

  const grouped = useMemo(() => {
    const groups: Record<string, MinEAObject[]> = {};
    for (const cap of filteredCaps) {
      const group = cap.owner || cap.tags?.[0] || "Other";
      (groups[group] ??= []).push(cap);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredCaps]);

  const toggleCap = (id: string, checked: boolean) => {
    setDraft((prev) => ({
      ...prev,
      capability_ids: checked
        ? [...prev.capability_ids, id]
        : prev.capability_ids.filter((x) => x !== id),
    }));
  };

  const selectedCapNames = capabilities
    .filter((c) => draft.capability_ids.includes(c.id))
    .map((c) => c.name);

  const canSave = draft.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const ownershipPayload = ownership.toPayload();
    onSave({
      ...draft,
      ...ownershipPayload,
      owner: ownershipPayload.owner ?? "",
    });
    onClose();
  };

  const stageLabel = draft.name.trim() || "Untitled stage";

  return (
    <div className="w-[380px] border-l border-gray-200 bg-white flex flex-col h-full flex-shrink-0">
      <div className="group flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Stage detail</h3>
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Remove stage"
            aria-label={`Remove ${stageLabel}`}
            onClick={() => onRequestDelete(stage.id, stageLabel)}
            className="p-1 rounded text-gray-400 opacity-0 group-hover:opacity-100 hover:text-red-600 hover:bg-red-50 transition-all"
          >
            <Trash2 size={14} />
          </button>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            value={draft.name}
            onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
            className={formFieldClass}
            placeholder="e.g. KYC verification"
            autoFocus
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-xs font-medium text-gray-700">Business capabilities</label>
            {draft.capability_ids.length > 0 && (
              <span className="text-xs font-medium text-indigo-600">
                {draft.capability_ids.length} selected
              </span>
            )}
          </div>

          <div className="relative mb-2">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={capSearch}
              onChange={(e) => setCapSearch(e.target.value)}
              placeholder="Search capabilities..."
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
            {grouped.length === 0 ? (
              <p className="text-xs text-gray-400 px-3 py-3">No capabilities found</p>
            ) : (
              grouped.map(([group, items]) => (
                <div key={group}>
                  <div className="bg-gray-50 px-3 py-1.5">
                    <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                      {group}
                    </span>
                  </div>
                  {items.map((cap) => {
                    const selected = draft.capability_ids.includes(cap.id);
                    return (
                      <label
                        key={cap.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-t border-gray-100",
                          selected ? "bg-indigo-50/60" : "hover:bg-gray-50"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => toggleCap(cap.id, e.target.checked)}
                          className="accent-indigo-600"
                        />
                        <span className="truncate text-gray-800">{cap.name}</span>
                      </label>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>

        {draft.capability_ids.length > 0 && (
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2.5">
            <div className="flex items-start gap-2">
              <Sparkles size={14} className="text-indigo-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-indigo-700 leading-relaxed">
                <span className="font-medium">Inferred:</span> this stage touches{" "}
                {draft.capability_ids.length} capabilit
                {draft.capability_ids.length === 1 ? "y" : "ies"}
                {selectedCapNames.length > 0 && (
                  <>
                    {" "}
                    · {selectedCapNames.slice(0, 3).join(", ")}
                    {selectedCapNames.length > 3 ? "…" : ""}
                  </>
                )}
              </p>
            </div>
          </div>
        )}

        <OwnershipFields
          value={ownership.value}
          onChange={ownership.setValue}
          required={false}
          teamLabel="Stage owner"
        />

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Typical duration</label>
          <input
            value={draft.typical_duration}
            onChange={(e) => setDraft((prev) => ({ ...prev, typical_duration: e.target.value }))}
            className={formFieldClass}
            placeholder="e.g. 2 hours"
          />
        </div>
      </div>

      <div className="border-t border-gray-100 px-5 py-4 flex gap-3 flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 border border-gray-200 rounded-md py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md py-2 text-sm font-medium transition-colors"
        >
          Save stage
        </button>
      </div>
    </div>
  );
}
