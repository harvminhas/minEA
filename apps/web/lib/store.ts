import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Org, Workspace } from "@minea/types";
import type { ViewId } from "@/lib/views";

export type ViewMode = "repository" | "views" | "split";

interface AppStore {
  activeOrg: Org | null;
  activeWorkspace: Workspace | null;
  setActiveOrg: (org: Org | null) => void;
  setActiveWorkspace: (ws: Workspace | null) => void;

  collapsedLayers: Record<string, boolean>;
  toggleLayer: (layer: string) => void;

  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;

  splitViewId: ViewId;
  setSplitViewId: (id: ViewId) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;

  sidebarExpanded: boolean;
  setSidebarExpanded: (expanded: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      activeOrg: null,
      activeWorkspace: null,
      setActiveOrg: (org) => set({ activeOrg: org }),
      setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),

      collapsedLayers: {},
      toggleLayer: (layer) =>
        set((state) => ({
          collapsedLayers: {
            ...state.collapsedLayers,
            [layer]: !state.collapsedLayers[layer],
          },
        })),

      viewMode: "repository",
      setViewMode: (mode) => set({ viewMode: mode }),

      splitViewId: "capability-heatmap",
      setSplitViewId: (id) => set({ splitViewId: id }),

      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),

      sidebarExpanded: false,
      setSidebarExpanded: (expanded) => set({ sidebarExpanded: expanded }),
    }),
    {
      name: "minea-app-store",
      partialize: (state) => ({
        collapsedLayers: state.collapsedLayers,
        viewMode: state.viewMode,
        splitViewId: state.splitViewId,
        sidebarExpanded: state.sidebarExpanded,
      }),
    }
  )
);
