"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUpdatedAgo } from "@/lib/system-utils";

export interface HistoryEntry {
  id: string;
  actor_name: string;
  action: string;
  detail?: string | null;
  created_at: string;
}

function ActorAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const colors = [
    "bg-indigo-500",
    "bg-violet-500",
    "bg-emerald-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-sky-500",
  ];
  const color = colors[name.charCodeAt(0) % colors.length]!;
  return (
    <div
      className={cn(
        "h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0",
        color
      )}
    >
      {initials || "?"}
    </div>
  );
}

function HistoryEntryRow({ entry }: { entry: HistoryEntry }) {
  return (
    <div className="flex gap-3 py-3 border-b border-gray-100 last:border-0">
      <ActorAvatar name={entry.actor_name} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gray-900">
          <span className="font-medium">{entry.actor_name}</span> {entry.action}
        </p>
        {entry.detail && (
          <p className="text-xs text-gray-500 mt-0.5 whitespace-normal break-words">{entry.detail}</p>
        )}
      </div>
      <div className="flex items-center gap-1 text-xs text-gray-400 flex-shrink-0">
        <Clock size={11} />
        <span>{formatUpdatedAgo(entry.created_at)}</span>
      </div>
    </div>
  );
}

interface EntityHistoryPanelProps {
  entries: HistoryEntry[];
  isLoading: boolean;
  emptyMessage?: string;
}

export function EntityHistoryPanel({
  entries,
  isLoading,
  emptyMessage = "No history yet.",
}: EntityHistoryPanelProps) {
  if (isLoading) {
    return <p className="text-sm text-gray-400 px-6 py-4">Loading history…</p>;
  }
  if (entries.length === 0) {
    return <p className="text-sm text-gray-400 px-6 py-4">{emptyMessage}</p>;
  }
  return (
    <div className="px-6 py-4">
      {entries.map((entry) => (
        <HistoryEntryRow key={entry.id} entry={entry} />
      ))}
    </div>
  );
}
