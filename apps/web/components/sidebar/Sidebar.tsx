"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Plus, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { NAV_VIEWS } from "@/lib/views";
import { REPOSITORY_LAYERS, isNavItemDisabled } from "@/lib/repository-nav";

export function Sidebar() {
  const pathname = usePathname();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { collapsedLayers, toggleLayer, viewMode } = useAppStore();

  const settingsHref = orgSlug ? `/orgs/${orgSlug}/settings` : "/home";
  const isOnSettings = pathname.endsWith("/settings");

  return (
    <aside className="sidebar fixed left-0 top-12 bottom-0 w-[200px] flex flex-col overflow-hidden z-40">
      <nav className="flex-1 overflow-y-auto py-2">
        {/* Views section — only in Views mode (split uses right panel dropdown) */}
        {workspaceSlug && orgSlug && viewMode === "views" && (
          <div>
            <div className="flex items-center justify-between px-4 mb-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Views
              </p>
              <button
                type="button"
                title="Custom views are not available in v1"
                disabled
                className="text-white/20 cursor-not-allowed"
              >
                <Plus size={12} />
              </button>
            </div>

            {NAV_VIEWS.map((view) => {
              const href = `${basePath}/${view.segment}`;
              const isActive = pathname === href || pathname.startsWith(`${href}/`);
              const Icon = view.icon;
              return (
                <Link
                  key={view.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-4 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-white/10 text-white"
                      : "text-white/55 hover:text-white hover:bg-white/5"
                  )}
                >
                  <span
                    className="h-5 w-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${view.color}22` }}
                  >
                    <Icon size={11} style={{ color: view.color }} />
                  </span>
                  <span className="truncate">{view.label}</span>
                </Link>
              );
            })}
          </div>
        )}

        {/* Repository section — hidden in views-only mode */}
        {workspaceSlug && viewMode !== "views" && (
          <div className={viewMode === "repository" ? "" : "mt-4"}>
            <div className="px-4 mb-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Repository
              </p>
            </div>

            {REPOSITORY_LAYERS.map((layer) => {
              const isCollapsed = collapsedLayers[layer.id] ?? true;
              const isLayerActive = layer.items.some((item) => {
                if (isNavItemDisabled(item)) return false;
                const href = `${basePath}/${item.segment}`;
                return pathname === href || pathname.startsWith(`${href}/`);
              });
              return (
                <div key={layer.id}>
                  <button
                    type="button"
                    onClick={() => toggleLayer(layer.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-4 py-1.5 text-sm transition-colors",
                      isLayerActive && isCollapsed
                        ? "text-white"
                        : "text-white/55 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <ChevronRight
                      size={12}
                      className={cn("flex-shrink-0 transition-transform", !isCollapsed && "rotate-90")}
                    />
                    <span
                      className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: layer.color }}
                    />
                    <span className="truncate flex-1 text-left">{layer.label}</span>
                    <span className="text-[10px] text-white/25 tabular-nums">
                      {layer.items.length}
                    </span>
                  </button>

                  {!isCollapsed && (
                    <div className="mb-0.5">
                      {layer.items.map((item) => {
                        const href = `${basePath}/${item.segment}`;

                        if (isNavItemDisabled(item)) {
                          return (
                            <div
                              key={item.segment}
                              title="Coming soon"
                              className="flex items-center gap-2 pl-10 pr-4 py-1 text-sm text-white/25 cursor-not-allowed"
                            >
                              <span
                                className="h-1 w-1 rounded-full flex-shrink-0 opacity-40"
                                style={{ backgroundColor: layer.color }}
                              />
                              <span className="truncate text-[13px]">{item.label}</span>
                              <span className="ml-auto text-[9px] font-medium uppercase tracking-wide text-white/20">
                                Upcoming
                              </span>
                            </div>
                          );
                        }

                        const isActive = pathname === href || pathname.startsWith(`${href}/`);
                        return (
                          <Link
                            key={item.segment}
                            href={href}
                            className={cn(
                              "flex items-center gap-2 pl-10 pr-4 py-1 text-sm transition-colors",
                              isActive
                                ? "bg-white/10 text-white"
                                : "text-white/45 hover:text-white hover:bg-white/5"
                            )}
                          >
                            <span
                              className="h-1 w-1 rounded-full flex-shrink-0"
                              style={{ backgroundColor: layer.color }}
                            />
                            <span className="truncate text-[13px]">{item.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 py-1">
        <Link
          href={settingsHref}
          className={cn(
            "flex items-center gap-2.5 px-4 py-2.5 text-sm transition-colors",
            isOnSettings
              ? "bg-white/10 text-white"
              : "text-white/45 hover:text-white hover:bg-white/5"
          )}
        >
          <Settings size={14} />
          Org settings
        </Link>
      </div>
    </aside>
  );
}
