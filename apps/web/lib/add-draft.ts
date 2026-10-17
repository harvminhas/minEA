/**
 * The list on the Add cards survives a trip to Plan & billing (Upgrade to Starter → Stripe Checkout
 * → back). Saved in sessionStorage just before leaving, per org/workspace, and restored once into
 * the add box when the person comes back. Same tab only; nothing leaves the browser.
 */
const PREFIX = "bubomap.addDraft:";
export const ADD_DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
export const RESTORE_PARAM = "add";
export const RESTORE_VALUE = "restore";

export interface AddDraft {
  text: string;
  count: number;
  /** Where to come back to (the page with the add box), with ?add=restore. */
  returnTo: string;
  at: number;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function session(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const keyFor = (orgSlug: string, workspaceSlug: string) => `${PREFIX}${orgSlug}/${workspaceSlug}`;

/** The add-box text for these card names: one per line, in paste order. */
export function draftText(names: string[]): string {
  return names.map((name) => name.trim()).filter(Boolean).join("\n");
}

/** returnTo with ?add=restore so the page opens its add box. */
export function restoreHref(path: string): string {
  const [base, hash = ""] = path.split("#");
  const url = new URL(base, "http://x");
  url.searchParams.set(RESTORE_PARAM, RESTORE_VALUE);
  return `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`;
}

export function saveAddDraft(orgSlug: string, workspaceSlug: string, names: string[], returnTo: string, store: Store | null = session(), now = Date.now()): void {
  const text = draftText(names);
  if (!store || !text) return;
  const draft: AddDraft = { text, count: text.split("\n").length, returnTo: restoreHref(returnTo), at: now };
  try {
    store.setItem(keyFor(orgSlug, workspaceSlug), JSON.stringify(draft));
  } catch {
    /* storage full or blocked: the list just won't come back */
  }
}

function read(orgSlug: string, workspaceSlug: string, store: Store | null, now: number): AddDraft | null {
  if (!store) return null;
  const raw = store.getItem(keyFor(orgSlug, workspaceSlug));
  if (!raw) return null;
  try {
    const draft = JSON.parse(raw) as AddDraft;
    if (typeof draft?.text !== "string" || !draft.text || now - Number(draft.at) > ADD_DRAFT_TTL_MS) {
      store.removeItem(keyFor(orgSlug, workspaceSlug));
      return null;
    }
    return draft;
  } catch {
    store.removeItem(keyFor(orgSlug, workspaceSlug));
    return null;
  }
}

export function peekAddDraft(orgSlug: string, workspaceSlug: string, store: Store | null = session(), now = Date.now()): AddDraft | null {
  return read(orgSlug, workspaceSlug, store, now);
}

/** Read and clear. */
export function takeAddDraft(orgSlug: string, workspaceSlug: string, store: Store | null = session(), now = Date.now()): AddDraft | null {
  const draft = read(orgSlug, workspaceSlug, store, now);
  if (draft) store?.removeItem(keyFor(orgSlug, workspaceSlug));
  return draft;
}

/** Any waiting list for this org (Plan & billing shows "Back to your list"). */
export function peekOrgDraft(orgSlug: string, store: (Store & Pick<Storage, "length" | "key">) | null = session() as Storage | null, now = Date.now()): AddDraft | null {
  if (!store) return null;
  const prefix = `${PREFIX}${orgSlug}/`;
  for (let i = 0; i < store.length; i += 1) {
    const key = store.key(i);
    if (!key?.startsWith(prefix)) continue;
    const draft = read(orgSlug, key.slice(prefix.length), store, now);
    if (draft) return draft;
  }
  return null;
}
