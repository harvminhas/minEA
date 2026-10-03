"use client";

import { ItemLogo } from "./ItemLogo";

export type RecordCardProps = {
  name: string;
  typeLabel: string;
  kind: string;
  vendor: string;
  catalogLogo?: string | null;
  brandColor?: string | null;
  owner?: string;
  annualCost?: string;
  renewal?: string;
  dependsOnIt?: string;
  firstGap?: { field: string; message: string } | null;
  hasNotice?: boolean;
  typedText: string;
  onAsk?: () => void;
  onOpen?: () => void;
  onAddAsNew?: () => void;
};

export function RecordCard({
  name,
  typeLabel,
  kind,
  vendor,
  catalogLogo,
  brandColor,
  owner,
  annualCost,
  renewal,
  dependsOnIt,
  firstGap,
  hasNotice,
  typedText,
  onAsk,
  onOpen,
  onAddAsNew,
}: RecordCardProps) {
  return (
    <div className="rounded-xl border border-[#e6e8ee] bg-white p-4">
      <div className="flex items-start gap-3">
        <ItemLogo name={name} catalogLogo={catalogLogo} brandColor={brandColor} size={48} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-[16px] font-semibold text-[#1c2230]">{name}</h3>
            <span className="rounded-full bg-[#ece9ff] px-2 py-0.5 text-[11px] font-medium text-[#3f35b5]">
              In your map
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-[#6b7289]">
            {typeLabel} · {kind} · {vendor}
          </p>

          <div className="mt-3 space-y-2">
            {owner && (
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-medium text-[#4b5163]">Owner:</span>
                <span className="text-[12px] text-[#1c2230]">{owner}</span>
              </div>
            )}
            {annualCost && (
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-medium text-[#4b5163]">Annual cost:</span>
                <span className="text-[12px] text-[#1c2230]">{annualCost}</span>
              </div>
            )}
            {renewal && (
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-medium text-[#4b5163]">Renewal:</span>
                <span className="text-[12px] text-[#1c2230]">{renewal}</span>
              </div>
            )}
            {dependsOnIt && (
              <div className="flex items-start gap-2">
                <span className="text-[12px] font-medium text-[#4b5163]">Depends on it:</span>
                <span className="text-[12px] text-[#1c2230]">{dependsOnIt}</span>
              </div>
            )}
          </div>

          {firstGap ? (
            <p className="mt-3 text-[12px] text-[#9a3412]">{firstGap.message} · Add</p>
          ) : (
            <p className="mt-3 text-[12px] text-[#059669]">
              Nothing missing{hasNotice ? " · decide by deadline" : ""}
            </p>
          )}

          <div className="mt-3 flex items-center gap-3">
            {onOpen && (
              <button
                type="button"
                onClick={onOpen}
                className="text-[13px] font-medium text-[#5b4ce6] hover:underline"
              >
                Open
              </button>
            )}
            {onAsk && (
              <button
                type="button"
                onClick={onAsk}
                className="text-[13px] font-medium text-[#5b4ce6] hover:underline"
              >
                Ask about it
              </button>
            )}
          </div>

          {onAddAsNew && (
            <button
              type="button"
              onClick={onAddAsNew}
              className="mt-2 text-[11px] text-[#8b90a0] hover:underline"
            >
              Not what you meant? Add '{typedText}' as new
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
