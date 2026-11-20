/** Scroll the nearest overflow pane (the org/model main column) back to the top. */
export function scrollAncestorToTop(start: HTMLElement | null): void {
  if (!start || typeof window === "undefined") return;
  let node: HTMLElement | null = start;
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight + 1) {
      node.scrollTop = 0;
      return;
    }
    node = node.parentElement;
  }
  window.scrollTo(0, 0);
}
