"use client";

import { ItemLogo } from "./ItemLogo";

export type AlreadyLineProps = {
  name: string;
  owner?: string;
  cost?: string;
  firstGap?: { field: string; message: string } | null;
  catalogLogo?: string | null;
  brandColor?: string | null;
  onOpen?: () => void;
};

export function AlreadyLine({
  name,
  owner,
  cost,
  firstGap,
  catalogLogo,
  brandColor,
  onOpen,
}: AlreadyLineProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[#e6e8ee] bg-[#f9fafb] px-3 py-2">
      <ItemLogo name={name} catalogLogo={catalogLogo} brandColor={brandColor} size={24} />
      <div className="flex-1">
        <span className="text-[13px] text-[#4b5163]">
          <span className="font-medium text-[#1c2230]">{name}</span> is already in your map
        </span>
        {(owner || cost) && (
          <span className="ml-1 text-[13px] text-[#8b90a0]">
            · {[owner, cost].filter(Boolean).join(" · ")}
          </span>
        )}
        {firstGap && (
          <span className="ml-2 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a3412]">
            {firstGap.message} · Add
          </span>
        )}
      </div>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          className="text-[13px] font-medium text-[#5b4ce6] hover:underline"
        >
          Open
        </button>
      )}
    </div>
  );
}
