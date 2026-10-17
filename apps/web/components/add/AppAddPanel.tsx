"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AddFlow } from "@/components/add/AddFlow";
import type { AddReceipt } from "@/lib/setup/add-cards";
import { useModelCatalog } from "@/lib/use-model-catalog";
import { useTenancy } from "@/lib/tenancy";
import { takeAddDraft } from "@/lib/add-draft";
import { APP_OR_PLATFORM_BODY, applicationAddHint, nextPreset } from "@/lib/setup/type-guidance";
import { ADD_BOX_BUTTON, ADD_BOX_LABEL, appendChipName, canSubmitAdd, isSubmitKey, quickAddSuggestions, textHasName } from "@/lib/setup/quick-add";

/**
 * THE add-apps experience: labelled box, Add apps button, quick-add chips that append to the text,
 * Ctrl+Enter, and the preview cards ("Where does it live?" chips, x to drop). Model > Applications
 * and the Ask page both render this one component so they can't drift.
 */
export function AppAddPanel({
  origin,
  initialText = "",
  pulse = 0,
  onSaved,
  onClose,
  onFullDetails,
  boxId = "model-add-box",
  submitSignal = 0,
  onTextChange,
  onPendingApps,
}: {
  origin: "model" | "ask" | "setup";
  /** Prefill (Ask: the names parsed from the question). */
  initialText?: string;
  /** Bump to focus and briefly highlight the box (the page's "+ Add" button). */
  pulse?: number;
  onSaved?: (receipt: AddReceipt) => void;
  onClose: () => void;
  /** "Add one with full details": opens the full form (hidden when not given). */
  onFullDetails?: () => void;
  boxId?: string;
  /** Bump to save from outside (the setup wizard's Next): same path as the Add apps button. */
  submitSignal?: number;
  /** The box text as the person types (the wizard keeps it for its later steps). */
  onTextChange?: (text: string) => void;
  /** New apps the cards would still save (what fits on the plan): the setup pill counts these. */
  onPendingApps?: (count: number) => void;
}) {
  const catalog = useModelCatalog();
  const [addText, setAddText] = useState(initialText);
  const [kindLocked, setKindLocked] = useState(false);
  const [kindChoice, setKindChoice] = useState<"app" | "platform">("app");
  const [saved, setSaved] = useState(false);
  const [submit, setSubmit] = useState(0);
  const [highlight, setHighlight] = useState(false);
  const [whatOpen, setWhatOpen] = useState(false);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const kind = kindLocked ? kindChoice : nextPreset("app", addText, false) === "platform" ? "platform" : "app";

  // A new prefill (e.g. a new question on Ask) replaces the box text.
  const lastInitial = useRef(initialText);
  useEffect(() => {
    if (lastInitial.current === initialText) return;
    lastInitial.current = initialText;
    setAddText(initialText);
    setSaved(false);
  }, [initialText]);

  // Back from Plan & billing (Upgrade to Starter on the cards): the list comes back, once.
  const { orgSlug, workspaceSlug } = useTenancy();
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    // Ask's box holds the names from its question; the draft returns to Model > Applications.
    if (!orgSlug || !workspaceSlug || origin === "ask") return;
    const draft = takeAddDraft(orgSlug, workspaceSlug);
    if (!draft) return;
    setAddText(draft.text);
    setSaved(false);
    setRestored(draft.count);
  }, [orgSlug, workspaceSlug, origin]);

  const appNames = useMemo(() => (catalog.data?.objects ?? []).map((object) => object.name), [catalog.data?.objects]);
  const suggestions = useMemo(() => quickAddSuggestions("app", appNames, 5).filter((name) => !textHasName(addText, name)), [appNames, addText]);
  const submitAdd = () => {
    if (!canSubmitAdd(addText, saved)) return;
    setSaved(false);
    setSubmit((n) => n + 1);
  };

  useEffect(() => {
    if (!pulse) return;
    boxRef.current?.focus({ preventScroll: true });
    boxRef.current?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    setHighlight(true);
    const timer = window.setTimeout(() => setHighlight(false), 1600);
    return () => window.clearTimeout(timer);
  }, [pulse]);

  const close = () => {
    setSaved(false);
    setKindLocked(false);
    setKindChoice("app");
    onClose();
  };
  useEffect(() => {
    onTextChange?.(addText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addText]);
  const outerSubmit = useRef(submitSignal);
  useEffect(() => {
    if (outerSubmit.current === submitSignal) return;
    outerSubmit.current = submitSignal;
    setSaved(false);
    setSubmit((n) => n + 1);
  }, [submitSignal]);

  const hint = applicationAddHint(addText, kind, kindLocked);

  return (
    <div
      className="mb-4"
      data-testid="app-add-panel"
      data-origin={origin}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || saved) return;
        event.preventDefault();
        close();
      }}
    >
      <label htmlFor={boxId} className="mb-1.5 block text-[13px] font-semibold text-[#1c2230]">
        {ADD_BOX_LABEL}
      </label>
      <div className="mb-2 flex items-start gap-2">
        <textarea
          id={boxId}
          ref={boxRef}
          data-testid="model-add-box"
          data-highlight={highlight ? "on" : "off"}
          value={addText}
          onChange={(event) => {
            setAddText(event.target.value);
            setSaved(false);
          }}
          onKeyDown={(event) => {
            if (!isSubmitKey(event)) return;
            event.preventDefault();
            submitAdd();
          }}
          rows={2}
          placeholder="Slack, Zoom, the server in the back room"
          className={cn(
            "min-w-0 flex-1 rounded-xl border-2 border-[#c9c3f7] bg-white px-3 py-2 text-[14px] shadow-sm outline-none transition-shadow duration-300 focus:border-[#5b4ce6]",
            highlight && "animate-pulse ring-4 ring-[#5b4ce6]/40"
          )}
        />
        <button
          type="button"
          data-testid="model-add-submit"
          disabled={!canSubmitAdd(addText, saved)}
          onClick={submitAdd}
          title="Ctrl+Enter"
          className="shrink-0 rounded-xl bg-[#5b4ce6] px-4 py-2 text-[14px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-[#c9c3f7]"
        >
          {ADD_BOX_BUTTON}
        </button>
      </div>
      {restored > 0 && (
        <p data-testid="add-restored" className="mb-2 text-[12px] text-[#4b5163]">
          Your list is back: the {restored} {restored === 1 ? "item" : "items"} not added last time.
        </p>
      )}
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[12px] text-[#6b7289]">
        {suggestions.length > 0 && <span>Quick add:</span>}
        {suggestions.map((name) => (
          <button
            key={name}
            type="button"
            data-testid="quick-add-chip"
            onClick={() => {
              // A chip types its name into the box; nothing saves until Add apps.
              setAddText((text) => appendChipName(text, name));
              setSaved(false);
              boxRef.current?.focus();
            }}
            className="rounded-full border border-[#e6e8ee] px-2.5 py-0.5 text-[12px] text-[#3f35b5] hover:border-[#5b4ce6] hover:bg-[#f4f2ff]"
          >
            + {name}
          </button>
        ))}
        <span className="ml-auto text-[#8b90a0]">Ctrl+Enter to add{onFullDetails ? " ·" : ""}</span>
        {onFullDetails && (
          <button type="button" data-testid="add-full-details" className="font-medium text-[#3f35b5]" onClick={onFullDetails}>
            Add one with full details
          </button>
        )}
      </div>
      {/* The app-vs-platform rule stays one click away instead of a paragraph under every box. */}
      <div className="mb-1 text-[12px] leading-5">
        <button
          type="button"
          data-testid="what-counts-toggle"
          aria-expanded={whatOpen}
          aria-controls={`${boxId}-what-counts`}
          onClick={() => setWhatOpen((open) => !open)}
          className="font-medium text-[#5b4ce6] hover:underline"
        >
          <span aria-hidden>{whatOpen ? "▾" : "▸"}</span> What counts as an app?
        </button>
        {whatOpen && (
          <p id={`${boxId}-what-counts`} className="mt-1 rounded-lg bg-[#fafafb] px-3 py-2 text-[#6b7289]">
            {APP_OR_PLATFORM_BODY}
          </p>
        )}
      </div>
      {hint && (
        <p className="mb-3 text-[12px] text-[#4b5163]">
          {hint}:{" "}
          <button
            type="button"
            className="font-medium text-[#3f35b5]"
            onClick={() => {
              setKindLocked(true);
              setKindChoice(kind === "platform" ? "app" : "platform");
            }}
          >
            change
          </button>
        </p>
      )}
      <AddFlow
        // The setup wizard shows the same cards as Model > Applications.
        origin={origin === "setup" ? "model" : origin}
        kind={kind}
        cards
        compact
        initialText={addText}
        submitSignal={submit}
        onPendingApps={onPendingApps}
        onSaved={(receipt) => {
          setSaved(true);
          onSaved?.(receipt);
        }}
        onClose={close}
      />
    </div>
  );
}
