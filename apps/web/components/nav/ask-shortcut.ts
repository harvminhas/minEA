/** Ctrl/Cmd K opens Ask. The header calls this; the Ask bar element id is ASK_BAR_ID. */

export const ASK_BAR_ID = "ask-bar";

export type AskShortcut =
  | { type: "focus" }
  | { type: "navigate"; href: string };

export function isAskPath(pathname: string): boolean {
  return /\/ask(\/|$)/.test(pathname);
}

export function askShortcut(
  event: { metaKey: boolean; ctrlKey: boolean; key: string },
  pathname: string,
  basePath: string
): AskShortcut | null {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return null;
  if (isAskPath(pathname)) return { type: "focus" };
  const href = `${basePath || ""}/ask?focus=ask`;
  return { type: "navigate", href };
}

/** Old side-by-side links (?split=1 or a /split path) become the same page without split. */
export function stripSplitUrl(pathname: string, search: string): string | null {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const hadQuery = params.has("split");
  params.delete("split");
  const nextPath = pathname.replace(/\/split\/?$/, "") || "/";
  if (!hadQuery && nextPath === pathname) return null;
  const query = params.toString();
  return query ? `${nextPath}?${query}` : nextPath;
}
