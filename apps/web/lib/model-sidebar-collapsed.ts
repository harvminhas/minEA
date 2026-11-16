/** Collapsed Model sidebar preference, remembered per user in localStorage. */

export const SIDEBAR_COLLAPSED_KEY = (uid?: string | null) =>
  uid ? `bubomap-model-sidebar-collapsed:${uid}` : "bubomap-model-sidebar-collapsed";

export function readSidebarCollapsed(storage: Pick<Storage, "getItem">, uid?: string | null): boolean {
  try {
    const raw = storage.getItem(SIDEBAR_COLLAPSED_KEY(uid));
    return raw === "1" || raw === "true";
  } catch {
    return false;
  }
}

export function writeSidebarCollapsed(storage: Pick<Storage, "setItem">, collapsed: boolean, uid?: string | null): void {
  storage.setItem(SIDEBAR_COLLAPSED_KEY(uid), collapsed ? "1" : "0");
}
