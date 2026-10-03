"use client";

import { useState } from "react";
import { AddCard } from "./AddCard";
import { RecordCard } from "./RecordCard";
import { AlreadyLine } from "./AlreadyLine";
import { AddSaved } from "./AddSaved";

export type AddResultItem = {
  key: string;
  name: string;
  isExisting: boolean;
  typeLabel?: string;
  kind?: string;
  vendor?: string;
  category?: string;
  owner?: string;
  cost?: string;
  renewal?: string;
  dependsOnIt?: string;
  firstGap?: { field: string; message: string } | null;
  catalogLogo?: string | null;
  brandColor?: string | null;
  typicalCost?: number;
  isSaas?: boolean;
  hostingChoice?: "saas" | "own" | "unknown";
  serverName?: string;
  needsHostingQuestion?: boolean;
  isFuzzy?: boolean;
  fuzzySuggestion?: string;
};

export type AddResultProps = {
  items: AddResultItem[];
  typedTexts: Map<string, string>;
  servers?: string[];
  onHostingChange?: (key: string, choice: "saas" | "own" | "unknown") => void;
  onServerChange?: (key: string, serverName: string) => void;
  onFuzzyYes?: (key: string) => void;
  onFuzzyNo?: (key: string) => void;
  onRemove?: (key: string) => void;
  onAddAsNew?: (key: string) => void;
  onSave?: () => Promise<void>;
  saveState: "idle" | "saving" | "saved" | "error";
  savedResult?: {
    addedNames: string[];
    keptNames: string[];
    addedLogos: { name: string; logo?: string | null; color?: string | null }[];
    homeSentence?: string;
    newTodos: number;
    canUndo: boolean;
    mapReady?: boolean;
  };
  onUndo?: () => void;
  error?: string;
  onRetry?: () => void;
};

export function AddResult({
  items,
  typedTexts,
  servers = [],
  onHostingChange,
  onServerChange,
  onFuzzyYes,
  onFuzzyNo,
  onRemove,
  onAddAsNew,
  onSave,
  saveState,
  savedResult,
  onUndo,
  error,
  onRetry,
}: AddResultProps) {
  const [staggered, setStaggered] = useState(false);

  // Rule 1: All items already exist
  const allExisting = items.every((item) => item.isExisting);
  const newItems = items.filter((item) => !item.isExisting);
  const existingItems = items.filter((item) => item.isExisting);

  // Rule 2: Show saved result after save completes
  if (saveState === "saved" && savedResult) {
    return <AddSaved {...savedResult} onUndo={savedResult.canUndo ? onUndo : undefined} />;
  }

  // Start stagger animation when component mounts
  if (!staggered && newItems.length > 0) {
    setTimeout(() => setStaggered(true), 10);
  }

  // Rule 1: All existing - just show RecordCards, no button
  if (allExisting) {
    const title =
      existingItems.length === 1
        ? `You already have ${existingItems[0].name}`
        : `You already have all ${existingItems.length}`;

    return (
      <div>
        <h2 className="text-[16px] font-semibold text-[#1c2230]">{title}</h2>
        <div className="mt-3 space-y-3">
          {existingItems.map((item) => (
            <RecordCard
              key={item.key}
              name={item.name}
              typeLabel={item.typeLabel || ""}
              kind={item.kind || ""}
              vendor={item.vendor || ""}
              catalogLogo={item.catalogLogo}
              brandColor={item.brandColor}
              owner={item.owner}
              annualCost={item.cost}
              renewal={item.renewal}
              dependsOnIt={item.dependsOnIt}
              firstGap={item.firstGap}
              typedText={typedTexts.get(item.key) || item.name}
              onAddAsNew={onAddAsNew ? () => onAddAsNew(item.key) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  // Rule 3: New items as cards (and Rule 3b: Mixed with collapsed existing)
  const hasExisting = existingItems.length > 0;
  const questionCount = newItems.filter(
    (item) => item.needsHostingQuestion || item.isFuzzy
  ).length;

  const subtitle =
    questionCount > 0
      ? `We filled in what we know; ${questionCount === 1 ? "one quick question" : `${questionCount} quick questions`}. Owners and renewals can wait.`
      : "We filled in what we know. Owners and renewals can wait.";

  return (
    <div className={saveState === "saving" ? "pointer-events-none opacity-60" : ""}>
      <h2 className="text-[16px] font-semibold text-[#1c2230]">
        Add {newItems.length} {newItems.length === 1 ? "app" : "apps"} to your map
      </h2>
      {newItems.length > 0 && <p className="mt-1 text-[13px] text-[#6b7289]">{subtitle}</p>}

      {/* Rule 3: AddCards in grid */}
      <div
        className="mt-3 grid gap-3"
        style={{
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        }}
      >
        {newItems.map((item, index) => {
          const prefersReducedMotion =
            typeof window !== "undefined" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;

          return (
            <div
              key={item.key}
              className={
                prefersReducedMotion || !staggered
                  ? ""
                  : "animate-fade-in-up"
              }
              style={
                prefersReducedMotion || !staggered
                  ? {}
                  : {
                      animationDelay: `${index * 60}ms`,
                      animationFillMode: "backwards",
                    }
              }
            >
              <AddCard
                name={item.name}
                category={item.category}
                vendor={item.vendor}
                typicalCost={item.typicalCost}
                catalogLogo={item.catalogLogo}
                brandColor={item.brandColor}
                isSaas={item.isSaas || false}
                hostingQuestion={
                  item.needsHostingQuestion && onHostingChange && onServerChange
                    ? {
                        current: item.hostingChoice || "unknown",
                        onChoose: (choice) => onHostingChange(item.key, choice),
                        serverName: item.serverName,
                        servers,
                        onServerChange: (name) => onServerChange(item.key, name),
                      }
                    : undefined
                }
                fuzzyQuestion={
                  item.isFuzzy && item.fuzzySuggestion && onFuzzyYes && onFuzzyNo
                    ? {
                        suggestion: item.fuzzySuggestion,
                        onYes: () => onFuzzyYes(item.key),
                        onNo: () => onFuzzyNo(item.key),
                      }
                    : undefined
                }
                onRemove={onRemove ? () => onRemove(item.key) : undefined}
              />
            </div>
          );
        })}
      </div>

      {/* Rule 3b: Collapsed existing items */}
      {hasExisting && (
        <div className="mt-3 space-y-2">
          {existingItems.map((item) => (
            <AlreadyLine
              key={item.key}
              name={item.name}
              owner={item.owner}
              cost={item.cost}
              firstGap={item.firstGap}
              catalogLogo={item.catalogLogo}
              brandColor={item.brandColor}
            />
          ))}
        </div>
      )}

      {/* Rule 3: Primary button (never disabled) */}
      {newItems.length > 0 && onSave && (
        <button
          type="button"
          onClick={onSave}
          disabled={saveState === "saving"}
          className="mt-4 rounded-lg bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white transition-all hover:bg-[#4a3cc7] disabled:opacity-60"
        >
          {saveState === "saving" ? (
            <span className="flex items-center gap-2">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Adding…
            </span>
          ) : (
            `Add ${newItems.length} ${newItems.length === 1 ? "app" : "apps"}`
          )}
        </button>
      )}

      {/* Rule 2: Error state */}
      {error && saveState === "error" && (
        <div className="mt-3 flex items-center gap-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2">
          <p className="flex-1 text-[13px] text-[#b42318]">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-[13px] font-semibold text-[#b42318] hover:underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Hidden datalist for server autocomplete */}
      {servers.length > 0 && (
        <datalist id="add-servers">
          {servers.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      )}
    </div>
  );
}
