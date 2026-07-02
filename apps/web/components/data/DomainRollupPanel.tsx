"use client";

import type { DomainRollup } from "@minea/types";

function RollupList({
  title,
  subtitle,
  items,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  items: { id: string; name: string }[];
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{title}</h3>
      <p className="text-[11px] text-gray-400 mb-2">{subtitle}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-2 py-2 px-3 bg-stone-50 rounded-lg text-sm text-gray-800"
            >
              <span className="font-medium">{item.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function DomainRollupPanel({ rollup }: { rollup: DomainRollup }) {
  return (
    <div className="space-y-6">
      <RollupList
        title="Entities in this domain"
        subtitle="Direct assignment via belongs to"
        items={rollup.entities}
        emptyLabel="No entities assigned yet — set domain on each entity record."
      />
      <RollupList
        title="Stores in this domain"
        subtitle="Direct assignment via belongs to"
        items={rollup.stores}
        emptyLabel="No stores assigned yet — set domain on each store record."
      />
      <RollupList
        title="Systems operating in this domain"
        subtitle="Computed from entity lifecycle and store access relationships"
        items={rollup.systems}
        emptyLabel="No systems linked to assigned entities or stores yet."
      />
    </div>
  );
}
