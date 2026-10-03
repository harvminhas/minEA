"use client";

import { ItemLogo } from "./ItemLogo";

export type AddCardProps = {
  name: string;
  category?: string;
  vendor?: string;
  typicalCost?: number;
  catalogLogo?: string | null;
  brandColor?: string | null;
  isSaas: boolean;
  hostingQuestion?: {
    current: "saas" | "own" | "unknown";
    onChoose: (choice: "saas" | "own" | "unknown") => void;
    serverName?: string;
    servers?: string[];
    onServerChange?: (name: string) => void;
  };
  fuzzyQuestion?: {
    suggestion: string;
    onYes: () => void;
    onNo: () => void;
  };
  onRemove?: () => void;
};

export function AddCard({
  name,
  category,
  vendor,
  typicalCost,
  catalogLogo,
  brandColor,
  isSaas,
  hostingQuestion,
  fuzzyQuestion,
  onRemove,
}: AddCardProps) {
  const hasQuestion = Boolean(hostingQuestion || fuzzyQuestion);

  return (
    <div className="group relative rounded-xl border border-[#e6e8ee] bg-white p-4 transition-all">
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7289] opacity-0 transition-opacity hover:bg-[#e6e8ee] group-hover:opacity-100"
          aria-label="Remove"
        >
          ×
        </button>
      )}

      <div className="flex items-start gap-3">
        <ItemLogo name={name} catalogLogo={catalogLogo} brandColor={brandColor} size={40} />
        <div className="flex-1">
          <h3 className="text-[15px] font-semibold text-[#1c2230]">{name}</h3>
          {(category || vendor) && (
            <p className="mt-0.5 text-[12px] text-[#6b7289]">
              {[category, vendor].filter(Boolean).join(" · ")}
            </p>
          )}
          {typicalCost && (
            <span className="mt-1 inline-block rounded-full bg-[#fff7ed] px-2 py-0.5 text-[11px] text-[#9a3412]">
              typical ${typicalCost.toLocaleString("en-US")}
            </span>
          )}
        </div>
      </div>

      {isSaas && !hasQuestion && (
        <p className="mt-3 text-[12px] text-[#6b7289]">Cloud app (SaaS), nothing to ask</p>
      )}

      {hostingQuestion && (
        <div className="mt-3">
          <p className="text-[13px] font-medium text-[#4b5163]">Where does it live?</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(["saas", "own", "unknown"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => hostingQuestion.onChoose(choice)}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors ${
                  hostingQuestion.current === choice
                    ? "border-[#5b4ce6] bg-[#ece9ff] font-semibold text-[#3f35b5]"
                    : "border-[#e6e8ee] text-[#4b5163] hover:border-[#c9c6f5]"
                }`}
              >
                {choice === "saas" ? "SaaS (cloud)" : choice === "own" ? "Our server" : "Don't know"}
              </button>
            ))}
          </div>
          {hostingQuestion.current === "own" && hostingQuestion.onServerChange && (
            <input
              type="text"
              value={hostingQuestion.serverName || ""}
              list="add-servers"
              onChange={(e) => hostingQuestion.onServerChange?.(e.target.value)}
              placeholder="Server name"
              className="mt-2 h-8 w-full rounded-lg border border-[#e6e8ee] px-2 text-[13px] outline-none focus:border-[#5b4ce6]"
            />
          )}
        </div>
      )}

      {fuzzyQuestion && (
        <div className="mt-3">
          <p className="text-[13px] text-[#4b5163]">Is it {fuzzyQuestion.suggestion}?</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              onClick={fuzzyQuestion.onYes}
              className="rounded-full border border-[#c9c6f5] px-3 py-1 text-[12px] font-medium text-[#3f35b5] hover:bg-[#ece9ff]"
            >
              Yes
            </button>
            <button
              type="button"
              onClick={fuzzyQuestion.onNo}
              className="rounded-full border border-[#e6e8ee] px-3 py-1 text-[12px] text-[#4b5163] hover:border-[#c9c6f5]"
            >
              No, it's custom
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
