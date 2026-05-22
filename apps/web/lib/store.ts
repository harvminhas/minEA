import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Workspace } from "@minea/types";

interface AppStore {
  // Active workspace
  activeWorkspace: Workspace | null;
  setActiveWorkspace: (ws: Workspace | null) => void;

  // Sidebar collapsed state per layer
  collapsedLayers: Record<string, boolean>;
  toggleLayer: (layer: string) => void;

  // Chat panel
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      activeWorkspace: null,
      setActiveWorkspace: (ws) => set({ activeWorkspace: ws }),

      collapsedLayers: {},
      toggleLayer: (layer) =>
        set((state) => ({
          collapsedLayers: {
            ...state.collapsedLayers,
            [layer]: !state.collapsedLayers[layer],
          },
        })),

      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),
    }),
    {
      name: "minea-app-store",
      partialize: (state) => ({
        activeWorkspace: state.activeWorkspace,
        collapsedLayers: state.collapsedLayers,
      }),
    }
  )
);
