"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AppRef } from "@/lib/capability-detail";

export type RelationshipTarget = {
  id: string;
  name: string;
  level: "capability" | "activity";
};

export type AppHit = AppRef & {
  subtitle: string;
  alreadyOnTarget: boolean;
};

export function AddRelationshipDialog({
  targets,
  defaultTargetId,
  apps,
  linkedByApp,
  targetNames,
  onClose,
  onLink,
  onCreate,
  busy = false,
  error = "",
  initialAppId,
}: {
  targets: RelationshipTarget[];
  defaultTargetId: string;
  apps: AppRef[];
  linkedByApp: Map<string, string[]>;
  targetNames: Map<string, string>;
  onClose: () => void;
  onLink: (targetId: string, appId: string) => void | Promise<void>;
  onCreate: (targetId: string, name: string) => void | Promise<void>;
  busy?: boolean;
  error?: string;
  initialAppId?: string | null;
}) {
  const [targetId, setTargetId] = useState(defaultTargetId || targets[0]?.id || "");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(initialAppId ?? null);
  const [creating, setCreating] = useState(false);

  const hits = useMemo<AppHit[]>(() => {
    const needle = query.trim().toLowerCase();
    return apps
      .filter((app) => !needle || app.name.toLowerCase().includes(needle))
      .map((app) => {
        const linked = linkedByApp.get(app.id) ?? [];
        const alreadyOnTarget = linked.includes(targetId);
        let subtitle = "Unmapped";
        if (alreadyOnTarget) {
          const target = targets.find((item) => item.id === targetId);
          subtitle = target?.level === "capability" ? "Already on this capability" : `Already on ${target?.name ?? "this activity"}`;
        } else if (linked.length) {
          subtitle = `Already on ${linked.map((id) => targetNames.get(id) ?? id).join(", ")}`;
        }
        return { ...app, subtitle, alreadyOnTarget };
      })
      .sort((a, b) => Number(a.alreadyOnTarget) - Number(b.alreadyOnTarget) || a.name.localeCompare(b.name));
  }, [apps, query, targetId, linkedByApp, targetNames, targets]);

  const selected = hits.find((hit) => hit.id === selectedId) ?? null;
  const canLink = Boolean(selected && !selected.alreadyOnTarget && targetId && !busy);
  const trimmed = query.trim();
  const exact = apps.some((app) => app.name.toLowerCase() === trimmed.toLowerCase());
  const showCreate = Boolean(trimmed) && !exact;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(28,34,48,0.28)] px-6 pt-[72px] pb-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-relationship-title"
        data-testid="add-relationship-dialog"
        className="w-[440px] rounded-xl border border-[#e6e8ee] bg-white p-[18px_20px_16px] shadow-[0_16px_48px_rgba(28,34,48,0.18)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="add-relationship-title" className="m-0 text-[16px] font-semibold text-[#1c2230]">
          Add relationship
        </h2>
        <p className="mb-3.5 mt-1 text-[12.5px] text-[#6b7289]">
          Link an app to this capability or to a specific activity.
        </p>

        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">LINK TO</p>
        <div className="mb-3.5 overflow-hidden rounded-lg border border-[#e6e8ee]">
          {targets.map((target, index) => {
            const on = target.id === targetId;
            return (
              <button
                key={target.id}
                type="button"
                data-testid={`link-target-${target.id}`}
                onClick={() => setTargetId(target.id)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                  index > 0 && "border-t border-[#f3f4f8]",
                  on ? "bg-[#f6f5ff]" : "bg-white"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px]",
                    on ? "border-[#5b4ce6] shadow-[inset_0_0_0_3.5px_#5b4ce6]" : "border-[#c4c7d0]"
                  )}
                />
                <span className={cn("text-[13px] text-[#1c2230]", target.level === "capability" && "font-semibold", target.level === "activity" && "pl-4")}>
                  {target.name}
                </span>
                <span className="ml-auto text-[11px] text-[#8b90a0]">{target.level === "capability" ? "Capability" : "Activity"}</span>
              </button>
            );
          })}
        </div>

        <p className="mb-1.5 text-[11px] font-semibold tracking-[0.08em] text-[#8b90a0]">APP</p>
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCreating(false);
          }}
          placeholder="Search apps or type a name to create"
          data-testid="add-relationship-search"
          className="mb-2 w-full rounded-md border border-[#e5e7eb] px-3 py-2 text-[13.5px] outline-none focus:border-[#5b4ce6]"
        />
        <div className="max-h-[220px] overflow-y-auto rounded-lg border border-[#e6e8ee]">
          {hits.length === 0 ? (
            <p className="px-3 py-2 text-[13px] text-[#8b90a0]">{trimmed ? "No matching apps." : "No apps in the catalog yet."}</p>
          ) : (
            hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                disabled={hit.alreadyOnTarget}
                onClick={() => {
                  setSelectedId(hit.id);
                  setCreating(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between border-t border-[#f3f4f8] px-3 py-2 text-left text-[13px] first:border-t-0",
                  hit.id === selectedId && !creating ? "bg-[#f6f5ff]" : "bg-white",
                  hit.alreadyOnTarget && "cursor-default opacity-70"
                )}
              >
                <span className="text-[#1c2230]">{hit.name}</span>
                <span className="text-[11px] text-[#8b90a0]">{hit.subtitle}</span>
              </button>
            ))
          )}
        </div>

        <button
          type="button"
          className={cn("mt-2 block w-full bg-transparent py-2 text-left text-[12.5px] font-medium text-[#5b4ce6]", creating && "rounded-md bg-[#f6f5ff] px-2")}
          onClick={() => {
            setCreating(true);
            setSelectedId(null);
            if (!trimmed) setQuery("");
          }}
        >
          {showCreate ? `+ Create “${trimmed}” and link it` : "+ Create a new app and link it"}
        </button>
        {creating && (
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="New app name"
            data-testid="create-app-name"
            className="mt-1 w-full rounded-md border border-[#e5e7eb] px-3 py-2 text-[13.5px] outline-none focus:border-[#5b4ce6]"
          />
        )}

        {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 items-center rounded-md border border-[#e6e8ee] bg-white px-3 text-[12.5px] font-medium text-[#4b5163]"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="link-app-submit"
            disabled={creating ? !trimmed || busy || !targetId : !canLink}
            onClick={() => {
              if (creating) void onCreate(targetId, trimmed);
              else if (selected) void onLink(targetId, selected.id);
            }}
            className="inline-flex h-8 items-center rounded-lg border border-[#5b4ce6] bg-[#5b4ce6] px-3 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {creating ? (trimmed ? `Create and link ${trimmed}` : "Create and link") : selected ? `Link ${selected.name}` : "Link app"}
          </button>
        </div>
      </div>
    </div>
  );
}
