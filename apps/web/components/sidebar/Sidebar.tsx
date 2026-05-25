"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronRight,
  Home,
  Plus,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useTenancy } from "@/lib/tenancy";
import { PRIMARY_VIEW_ID, VIEWS_V1, viewPath } from "@/lib/views";

const LAYERS = [
  {
    id: "business",
    label: "Business",
    color: "#3b82f6",
    items: [
      { label: "Capability Map", typePath: "business/capabilities" },
      { label: "Value Streams", typePath: "business/value-streams" },
    ],
  },
  {
    id: "application",
    label: "Application",
    color: "#6366f1",
    items: [
      { label: "Applications", typePath: "application/applications" },
      { label: "Solutions", typePath: "application/solutions" },
      { label: "Technical Capabilities", typePath: "application/tech-capabilities" },
      { label: "AI Agents", typePath: "application/agents" },
    ],
  },
  {
    id: "data",
    label: "Data",
    color: "#f59e0b",
    items: [
      { label: "Data Objects", typePath: "data/data-objects" },
      { label: "Data Stores", typePath: "data/data-stores" },
    ],
  },
  {
    id: "integration",
    label: "Integration",
    color: "#14b8a6",
    items: [
      { label: "APIs", typePath: "integration/apis" },
      { label: "Events", typePath: "integration/events" },
      { label: "Integration Flows", typePath: "integration/flows" },
      { label: "Tools / MCP", typePath: "integration/tools" },
    ],
  },
  {
    id: "infrastructure",
    label: "Infrastructure",
    color: "#64748b",
    items: [
      { label: "Cloud Services", typePath: "infrastructure/cloud-services" },
      { label: "Models", typePath: "infrastructure/models" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { orgSlug, workspaceSlug, basePath } = useTenancy();
  const { collapsedLayers, toggleLayer } = useAppStore();

  const homeHref =
    orgSlug && workspaceSlug
      ? viewPath(orgSlug, workspaceSlug, PRIMARY_VIEW_ID)
      : "/home";
  const isOnHome =
    pathname === "/home" ||
    pathname.endsWith("/views/products") ||
    pathname.endsWith("/dashboard");

  const settingsHref = orgSlug ? `/orgs/${orgSlug}/settings` : "/home";
  const isOnSettings = pathname.endsWith("/settings");

  return (
    <aside className="sidebar fixed left-0 top-12 bottom-0 w-[200px] flex flex-col overflow-hidden z-40">
      <nav className="flex-1 overflow-y-auto py-2">
        <Link
          href={homeHref}
          className={cn(
            "flex items-center gap-2.5 px-4 py-2 text-sm transition-colors",
            isOnHome ? "text-white bg-white/10" : "text-white/55 hover:text-white hover:bg-white/5"
          )}
        >
          <Home size={14} />
          Home
        </Link>

        {workspaceSlug && orgSlug && (
          <div className="mt-4">
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

            {VIEWS_V1.map((view) => {
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

        {workspaceSlug && (
          <div className="mt-4">
            <div className="px-4 mb-1">
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">
                Repository
              </p>
            </div>

            {LAYERS.map((layer) => {
              const isCollapsed = collapsedLayers[layer.id] ?? true;
              const isLayerActive = layer.items.some(
                (item) => pathname === `${basePath}/${item.typePath}`
              );
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
                        const href = `${basePath}/${item.typePath}`;
                        const isActive = pathname === href;
                        return (
                          <Link
                            key={href}
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
