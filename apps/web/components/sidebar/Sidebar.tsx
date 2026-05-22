"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser, UserButton } from "@clerk/nextjs";
import { ChevronDown, LayoutDashboard, Sparkles, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { GROWTH_TYPES } from "@minea/types";

const LAYERS = [
  {
    id: "business",
    label: "BUSINESS",
    color: "#3b82f6",
    items: [
      { label: "Capability Map", href: "/app/business/capabilities", type: "capability" },
      { label: "Value Streams", href: "/app/business/value-streams", type: "value_stream" },
    ],
  },
  {
    id: "application",
    label: "APPLICATION",
    color: "#6366f1",
    items: [
      { label: "Applications", href: "/app/application/applications", type: "application" },
      { label: "Solutions", href: "/app/application/solutions", type: "solution" },
      { label: "Technical Capabilities", href: "/app/application/tech-capabilities", type: "technical_capability" },
      { label: "AI Agents", href: "/app/application/agents", type: "agent", growth: true },
    ],
  },
  {
    id: "data",
    label: "DATA",
    color: "#f59e0b",
    items: [
      { label: "Data Objects", href: "/app/data/data-objects", type: "data_object" },
      { label: "Data Stores", href: "/app/data/data-stores", type: "data_store" },
    ],
  },
  {
    id: "integration",
    label: "INTEGRATION",
    color: "#14b8a6",
    items: [
      { label: "APIs", href: "/app/integration/apis", type: "api" },
      { label: "Events", href: "/app/integration/events", type: "event" },
      { label: "Integration Flows", href: "/app/integration/flows", type: "integration_flow" },
      { label: "Tools / MCP", href: "/app/integration/tools", type: "tool", growth: true },
    ],
  },
  {
    id: "infrastructure",
    label: "INFRASTRUCTURE",
    color: "#64748b",
    items: [
      { label: "Cloud Services", href: "/app/infrastructure/cloud-services", type: "cloud_service" },
      { label: "Models", href: "/app/infrastructure/models", type: "model", growth: true },
    ],
  },
];

const MODULES = [
  { label: "AI Infrastructure", href: "/app/ai-infrastructure", growth: true, color: "#a855f7" },
  { label: "AI Insights", href: "/app/insights", indicator: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useUser();
  const { collapsedLayers, toggleLayer, activeWorkspace } = useAppStore();

  return (
    <aside className="sidebar flex h-screen w-[220px] flex-col text-white/90 overflow-hidden fixed left-0 top-0">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10">
        <div className="h-7 w-7 rounded-md bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">
          m
        </div>
        <span className="font-semibold text-sm">minEA</span>
        <span className="ml-auto rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/60">
          beta
        </span>
      </div>

      {/* Workspace */}
      {activeWorkspace && (
        <div className="px-4 py-2 border-b border-white/10">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">Workspace</p>
          <p className="text-xs text-white/70 font-medium truncate">{activeWorkspace.name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 space-y-1 scrollbar-hide">
        {/* Dashboard */}
        <Link
          href="/app/dashboard"
          className={cn(
            "flex items-center gap-2 px-4 py-1.5 text-sm transition-colors",
            pathname === "/app/dashboard"
              ? "bg-white/10 text-white"
              : "text-white/60 hover:text-white hover:bg-white/5"
          )}
        >
          <LayoutDashboard size={14} />
          Dashboard
        </Link>

        {/* Repository */}
        <div className="px-4 pt-3 pb-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Repository</p>
        </div>

        {LAYERS.map((layer) => {
          const isCollapsed = collapsedLayers[layer.id];
          return (
            <div key={layer.id}>
              <button
                onClick={() => toggleLayer(layer.id)}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-xs font-semibold text-white/50 hover:text-white/80 transition-colors"
              >
                <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: layer.color }} />
                {layer.label}
                <ChevronDown
                  size={12}
                  className={cn("ml-auto transition-transform", isCollapsed && "-rotate-90")}
                />
              </button>
              {!isCollapsed && (
                <div className="ml-4">
                  {layer.items.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          "flex items-center gap-2 px-4 py-1 text-sm rounded-l-sm transition-colors",
                          isActive
                            ? "bg-white/10 text-white"
                            : "text-white/55 hover:text-white hover:bg-white/5"
                        )}
                      >
                        <span
                          className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: layer.color }}
                        />
                        <span className="truncate">{item.label}</span>
                        {item.growth && (
                          <span className="ml-auto rounded bg-purple-600/80 px-1 py-0.5 text-[9px] font-medium text-white">
                            Growth
                          </span>
                        )}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Modules */}
        <div className="px-4 pt-4 pb-1">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">Modules</p>
        </div>
        {MODULES.map((mod) => {
          const isActive = pathname === mod.href;
          return (
            <Link
              key={mod.href}
              href={mod.href}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 text-sm transition-colors",
                isActive ? "bg-white/10 text-white" : "text-white/55 hover:text-white hover:bg-white/5"
              )}
            >
              {mod.growth ? (
                <Sparkles size={13} style={{ color: "#a855f7" }} />
              ) : (
                <Zap size={13} className="text-white/40" />
              )}
              <span className="truncate">{mod.label}</span>
              {mod.growth && (
                <span className="ml-auto rounded bg-purple-600/80 px-1 py-0.5 text-[9px] font-medium text-white">
                  Growth
                </span>
              )}
              {mod.indicator && (
                <span className="ml-auto h-2 w-2 rounded-full bg-amber-400" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 px-4 py-3 flex items-center gap-3">
        <UserButton afterSignOutUrl="/" />
        {user && (
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/80 font-medium truncate">{user.fullName ?? user.firstName}</p>
            <p className="text-[10px] text-white/40">Admin</p>
          </div>
        )}
      </div>
    </aside>
  );
}
