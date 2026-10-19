import type { CatalogMissing } from "@/lib/model-catalog";
import { REGISTRY, recordTypeOf } from "@/lib/fields/registry";
import { MISSING_FIELD_KEYS } from "@/lib/fields/section-missing";

/**
 * The detail-panel field a table's "+ Add" for this gap points at, e.g. renewal is
 * contract_renewal on apps and platforms but commitment_ends on servers.
 */
export function fieldKeyForGap(objectType: string, gap: keyof CatalogMissing): string | null {
  const type = recordTypeOf(objectType);
  if (!type) return null;
  const keys = MISSING_FIELD_KEYS[gap];
  return REGISTRY[type].find((def) => keys.includes(def.key))?.key ?? null;
}

/** Fired when "+ Add" asks for the field the panel already has in its URL, so it flashes again. */
export const FOCUS_FIELD_EVENT = "bubomap:focus-field";

/** Go to the record with ?focus=<field>, or re-ask the open panel when already there. */
export function openRecordField(href: string, push: (href: string) => void) {
  if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` === href) {
    const focus = new URL(href, window.location.origin).searchParams.get("focus");
    window.dispatchEvent(new CustomEvent(FOCUS_FIELD_EVENT, { detail: focus }));
    return;
  }
  push(href);
}

export const FLASH_MS = 1500;

type Flashable = { style: { boxShadow: string; backgroundColor: string; transition: string; borderRadius: string } };

/**
 * A short amber ring on the field: full at once, then fades over FLASH_MS. With reduced
 * motion it just shows and goes, no fade. Returns a cancel that clears it immediately.
 */
export function flashField(
  el: Flashable,
  { reducedMotion, setTimer = (fn, ms) => window.setTimeout(fn, ms), clearTimer = (id) => window.clearTimeout(id) }: {
    reducedMotion: boolean;
    setTimer?: (fn: () => void, ms: number) => number;
    clearTimer?: (id: number) => void;
  }
): () => void {
  const clear = () => {
    el.style.transition = "";
    el.style.boxShadow = "";
    el.style.backgroundColor = "";
  };
  el.style.transition = "";
  el.style.borderRadius = "8px";
  el.style.boxShadow = "0 0 0 2px rgba(245, 158, 11, 0.55)";
  el.style.backgroundColor = "#fffbeb";
  const timers: number[] = [];
  if (reducedMotion) {
    timers.push(setTimer(clear, FLASH_MS));
  } else {
    // Hold briefly, then fade out; clear the inline styles once the fade is done.
    timers.push(
      setTimer(() => {
        el.style.transition = `box-shadow ${FLASH_MS - 300}ms ease-out, background-color ${FLASH_MS - 300}ms ease-out`;
        el.style.boxShadow = "0 0 0 2px rgba(245, 158, 11, 0)";
        el.style.backgroundColor = "rgba(255, 251, 235, 0)";
      }, 300)
    );
    timers.push(setTimer(clear, FLASH_MS + 50));
  }
  return () => {
    timers.forEach(clearTimer);
    clear();
  };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}
