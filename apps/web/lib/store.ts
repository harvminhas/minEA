import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Org, Workspace } from "@minea/types";

interface AppStore {
  activeOrg: Org | null;
  activeWorkspace: Workspace | null;
  setActiveOrg: (org: Org | null) => void;
  setActiveWorkspace: (ws: Workspace | null) => void;

  collapsedLayers: Record<string, boolean>;
  toggleLayer: (layer: string) => void;

  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
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

      chatOpen: false,
      setChatOpen: (open) => set({ chatOpen: open }),
    }),
    {
      name: "minea-app-store",
      partialize: (state) => ({
        collapsedLayers: state.collapsedLayers,
      }),
    }
  )
);
