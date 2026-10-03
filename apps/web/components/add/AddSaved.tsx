"use client";

import { ItemLogo } from "./ItemLogo";

export type AddSavedProps = {
  addedNames: string[];
  keptNames: string[];
  addedLogos: { name: string; logo?: string | null; color?: string | null }[];
  homeSentence?: string;
  newTodos: number;
  canUndo: boolean;
  onUndo?: () => void;
  mapReady?: boolean;
};

export function AddSaved({
  addedNames,
  keptNames,
  addedLogos,
  homeSentence,
  newTodos,
  canUndo,
  onUndo,
  mapReady,
}: AddSavedProps) {
  const addedCount = addedNames.length;
  const keptCount = keptNames.length;

  return (
    <div className="rounded-xl border border-[#e4e0ff] bg-[#f7f6ff] px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex -space-x-2">
          {addedLogos.slice(0, 3).map((item, i) => (
            <div key={i} className="ring-2 ring-white">
              <ItemLogo name={item.name} catalogLogo={item.logo} brandColor={item.color} size={24} />
            </div>
          ))}
        </div>
        <div className="flex-1">
          <p className="text-[14px] font-medium text-[#1c2230]">
            {addedCount > 0 && (
              <>
                Added {addedCount} {addedCount === 1 ? "app" : "apps"}: {addedNames.join(", ")}.
              </>
            )}
            {keptCount > 0 && (
              <>
                {addedCount > 0 && " "}
                {keptNames.join(", ")} {keptCount === 1 ? "was" : "were"} already in your map, so nothing
                changed.
              </>
            )}
          </p>

          {homeSentence && <p className="mt-1 text-[13px] text-[#4b5163]">{homeSentence}</p>}

          {canUndo && onUndo && (
            <button
              type="button"
              onClick={onUndo}
              className="mt-2 text-[13px] font-semibold text-[#3f35b5] hover:underline"
            >
              Undo
            </button>
          )}

          {newTodos > 0 && (
            <p className="mt-2 text-[13px] text-[#4b5163]">
              {newTodos} new to-do{newTodos === 1 ? "" : "s"}
            </p>
          )}

          {mapReady && (
            <p className="mt-2 text-[14px] font-semibold text-[#3f35b5]">Your map is ready.</p>
          )}
        </div>
      </div>
    </div>
  );
}
