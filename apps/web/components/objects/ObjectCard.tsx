"use client";

import { type MinEAObject, OBJECT_TYPE_LABELS } from "@minea/types";
import { Clock } from "lucide-react";
import {
  formatUpdatedAgo,
  isSystemObject,
  systemStatusLabel,
  SYSTEM_STATUS_STYLE,
} from "@/lib/system-utils";
import { formatCurrency, getObjectInitial, cn } from "@/lib/utils";

interface Props {
  object: MinEAObject;
  layerColor: string;
  onClick?: () => void;
}

const CARD_COLORS_FALLBACK = "#6366f1";

export function ObjectCard({ object, layerColor, onClick }: Props) {
  if (isSystemObject(object)) {
    return <SystemCard object={object} color={layerColor || CARD_COLORS_FALLBACK} onClick={onClick} />;
  }

  return <LegacyObjectCard object={object} layerColor={layerColor} onClick={onClick} />;
}

function SystemCard({
  object,
  color,
  onClick,
}: {
  object: MinEAObject;
  color: string;
  onClick?: () => void;
}) {
  const status = object.status ?? "planned";
  const capCount = object.capability_count ?? 0;
  const props = object.properties as Record<string, unknown>;
  const vendor = props.vendor ? String(props.vendor) : null;
  const category = props.category ? String(props.category) : null;
  const annualCost = props.annual_cost != null && Number(props.annual_cost) > 0
    ? Number(props.annual_cost)
    : null;
  const tags = object.tags ?? [];

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
    >
      {/* Header: avatar + name + vendor + status badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="h-9 w-9 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            {getObjectInitial(object.name)}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 text-sm leading-tight truncate">{object.name}</p>
            {vendor && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">{vendor}</p>
            )}
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 text-xs font-medium capitalize flex-shrink-0",
            SYSTEM_STATUS_STYLE[status] ?? SYSTEM_STATUS_STYLE.planned
          )}
        >
          {systemStatusLabel(status)}
        </span>
      </div>

      {/* Key-value rows */}
      <div className="space-y-1.5 text-xs">
        {category && <PropertyRow label="Category" value={category} />}
        {annualCost != null && (
          <PropertyRow label="Annual cost" value={formatCurrency(annualCost)} />
        )}
        <PropertyRow label="Capabilities" value={String(capCount)} />
        {object.owner && <PropertyRow label="Owner" value={object.owner} />}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded border border-gray-200 px-2 py-0.5 text-xs text-gray-500"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-1.5 mt-4 pt-3 border-t border-gray-100 text-xs text-gray-400">
        <Clock size={12} className="flex-shrink-0" />
        <span>
          Updated{object.updated_by_name ? ` by ${object.updated_by_name}` : ""}{" "}
          {formatUpdatedAgo(object.updated_at)}
        </span>
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-gray-400">{label}</span>
      <span className="text-gray-700 font-medium">{value}</span>
    </div>
  );
}

/** Original card layout for non-system repository types. */
function LegacyObjectCard({ object, layerColor, onClick }: Props) {
  const props = object.properties as Record<string, unknown>;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="h-9 w-9 rounded-md flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
            style={{ backgroundColor: layerColor }}
          >
            {getObjectInitial(object.name)}
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm leading-tight">{object.name}</p>
            <p className="text-xs text-gray-400">{OBJECT_TYPE_LABELS[object.type] ?? object.type}</p>
          </div>
        </div>
      </div>
      {object.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{object.description}</p>
      )}
    </div>
  );
}
