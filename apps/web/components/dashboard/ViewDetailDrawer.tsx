"use client";

import { useEffect } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import type { DashboardViewCard, ViewRequirement } from "@/lib/workspace-dashboard";
import { cn } from "@/lib/utils";

interface Props {
  card: DashboardViewCard | null;
  requirements: ViewRequirement[];
  onClose: () => void;
}

export function ViewDetailDrawer({ card, requirements, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (card) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [card, onClose]);

  if (!card) return null;

  const Icon = card.icon;

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-[400px] bg-white shadow-2xl z-[210] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-900">{card.label}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md border border-gray-200 text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <div className="rounded-xl border border-stone-200/80 bg-[#faf8f5] p-4">
            <div className="flex gap-3">
              <span
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-stone-200/60 bg-white flex-shrink-0"
                style={{ color: card.iconColor }}
              >
                <Icon size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">{card.label}</p>
                <p className="text-sm text-gray-500 mt-1 leading-relaxed">{card.drawerDescription}</p>
              </div>
            </div>
          </div>

          {requirements.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Requirements
              </p>
              <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
                {requirements.map((req) => (
                  <li key={req.label}>
                    <RequirementRow requirement={req} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-4 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
          <a
            href={card.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Open view
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </>
  );
}

function RequirementRow({ requirement }: { requirement: ViewRequirement }) {
  const { label, met, actionLabel, actionHref } = requirement;

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-white">
      {met ? (
        <Check size={16} className="text-emerald-600 flex-shrink-0" strokeWidth={2.5} />
      ) : (
        <span className="h-4 w-4 rounded border border-gray-300 flex-shrink-0" />
      )}
      <span
        className={cn(
          "flex-1 text-sm text-gray-800",
          met && "line-through text-gray-400"
        )}
      >
        {label}
      </span>
      {!met && actionHref && actionLabel && (
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700 flex-shrink-0"
        >
          {actionLabel}
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
