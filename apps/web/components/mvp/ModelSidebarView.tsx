"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, SlidersHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { modelPath, type ModelSection } from "@/lib/mvp-paths";
import { ADVANCED_TOOLTIP } from "@/lib/architecture-nav";

export type SidebarIcon = LucideIcon;

export type SidebarNavItem = {
  label: string;
  href: string;
  icon?: SidebarIcon;
  count?: number;
  match: string[];
  children?: SidebarNavItem[];
};

export type SidebarSection = {
  id: string;
  label: string | null;
  items: SidebarNavItem[];
};

function isActive(pathname: string, match: string[]): boolean {
  return match.some((fragment) => pathname.includes(fragment));
}

export function ModelSidebarView({
  pathname,
  active,
  basePath,
  collapsed,
  onToggle,
  sections,
  advanced,
  onAdvanced,
  advancedError,
  subnav,
  completeness,
  completenessLabel,
  missing,
  showcaseTooltip,
}: {
  pathname: string;
  active?: ModelSection;
  basePath: string;
  collapsed: boolean;
  onToggle: () => void;
  sections: SidebarSection[];
  advanced: boolean;
  onAdvanced: (next: boolean) => void;
  advancedError?: string | null;
  subnav: { open: Record<string, boolean>; toggle: (key: string, next: boolean) => void };
  completeness: number | null;
  completenessLabel: string;
  missing: number | null;
  showcaseTooltip?: string;
}) {
  return (
    <aside
      data-testid="model-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "relative z-10 flex h-full flex-shrink-0 flex-col overflow-hidden border-r border-[#e7e8ee] bg-[#f6f7f9]",
        collapsed ? "w-[60px]" : "w-[232px]"
      )}
    >
      <div className={cn("flex shrink-0", collapsed ? "justify-center px-0 pt-2" : "justify-end px-2 pt-2")}>
        <button
          type="button"
          data-testid="sidebar-collapse"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-pressed={collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={onToggle}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#8b90a0] hover:bg-[#eceef3] hover:text-[#3c4254]"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav className={cn("min-h-0 flex-1", collapsed ? "overflow-visible px-0 py-2" : "space-y-4 overflow-y-auto px-2 pb-2 pt-2")}>
        {sections.map((section) => (
          <Section
            key={section.id}
            label={section.label}
            items={section.items}
            pathname={pathname}
            active={active}
            subnav={subnav}
            collapsed={collapsed}
            hairline={collapsed && section.id !== "overview"}
            showcaseTooltip={showcaseTooltip}
          />
        ))}
      </nav>
      {collapsed ? (
        <div className="mt-1 flex shrink-0 justify-center pb-1">
          <button
            type="button"
            role="switch"
            aria-checked={advanced}
            data-testid="arch-advanced-toggle"
            aria-label="Show advanced"
            title={ADVANCED_TOOLTIP}
            onClick={() => onAdvanced(!advanced)}
            className={cn(
              "group relative inline-flex h-9 w-9 items-center justify-center rounded-lg",
              advanced ? "bg-[#ece9ff] text-[#5b4ce6]" : "text-[#8b90a0] hover:bg-[#eceef3] hover:text-[#3c4254]"
            )}
          >
            <SlidersHorizontal size={16} />
            <RailTip label="Show advanced" show={showcaseTooltip === "Show advanced"} />
          </button>
        </div>
      ) : (
        <label className="mx-2 mb-1 flex shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[12px] text-[#6b7289] hover:bg-[#eceef3]">
          <span title={ADVANCED_TOOLTIP}>Show advanced</span>
          <input
            type="checkbox"
            role="switch"
            data-testid="arch-advanced-toggle"
            aria-label="Show advanced"
            checked={advanced}
            onChange={(event) => onAdvanced(event.target.checked)}
            className="h-3.5 w-3.5 accent-[#5b4ce6]"
          />
        </label>
      )}
      {advancedError && !collapsed ? <p className="shrink-0 px-4 pb-1 text-[11px] text-[#b42318]">{advancedError}</p> : null}
      <div className={cn("shrink-0 border-t border-[#e7e8ee]", collapsed ? "flex justify-center px-0 py-3" : "px-4 py-3")}>
        {collapsed ? (
          <div className="group relative">
            <span
              className="relative grid h-[22px] w-[22px] place-items-center rounded-full"
              style={{
                background: `conic-gradient(#5b4ce6 0 ${completeness ?? 0}%, #e6e8ee 0)`,
              }}
              aria-label={completenessLabel}
            >
              <span className="h-[14px] w-[14px] rounded-full bg-[#f6f7f9]" />
            </span>
            <RailTip label={completenessLabel} show={showcaseTooltip === completenessLabel || showcaseTooltip === "completeness"} />
          </div>
        ) : completeness != null ? (
          <>
            <p className="text-[12px] font-medium text-[#3c4254]">{completenessLabel}</p>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#e6e8ee]">
              <div className="h-full rounded-full bg-[#5b4ce6]" style={{ width: `${completeness}%` }} />
            </div>
            {missing != null && (
              <Link href={modelPath(basePath)} className="mt-1 inline-block text-[12px] text-[#5b4ce6]">
                {missing} key fields missing
              </Link>
            )}
          </>
        ) : (
          <p className="text-[12px] text-[#8b90a0]">{completenessLabel}</p>
        )}
      </div>
    </aside>
  );
}

function RailTip({ label, show }: { label: string; show?: boolean }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-md bg-[#111827] px-2 py-1 text-[11px] font-medium text-white shadow-[0_8px_20px_rgba(17,24,39,0.18)]",
        show ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
      )}
    >
      {label}
      <span className="absolute right-full top-1/2 -translate-y-1/2 border-[5px] border-transparent border-r-[#111827]" />
    </span>
  );
}

function Section({
  label,
  items,
  pathname,
  active,
  subnav,
  collapsed,
  hairline,
  showcaseTooltip,
}: {
  label: string | null;
  items: SidebarNavItem[];
  pathname: string;
  active?: ModelSection;
  subnav: { open: Record<string, boolean>; toggle: (key: string, next: boolean) => void };
  collapsed: boolean;
  hairline?: boolean;
  showcaseTooltip?: string;
}) {
  return (
    <div
      className={cn(
        collapsed && "flex flex-col items-center gap-0.5",
        collapsed && hairline && "mt-2.5 w-9 border-t border-[#e7e8ee] pt-2.5"
      )}
    >
      {!collapsed && label && (
        <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-[#8b90a0]">
          {label.toUpperCase()}
        </p>
      )}
      <div className={cn(collapsed ? "flex flex-col items-center gap-0.5" : "space-y-0.5")}>
        {items.map((item) => (
          <NavRows
            key={item.label}
            item={item}
            pathname={pathname}
            active={active}
            depth={0}
            subnav={subnav}
            collapsed={collapsed}
            showcaseTooltip={showcaseTooltip}
          />
        ))}
      </div>
    </div>
  );
}

function NavRows({
  item,
  pathname,
  active,
  depth,
  subnav,
  collapsed,
  showcaseTooltip,
}: {
  item: SidebarNavItem;
  pathname: string;
  active?: ModelSection;
  depth: number;
  subnav: { open: Record<string, boolean>; toggle: (key: string, next: boolean) => void };
  collapsed: boolean;
  showcaseTooltip?: string;
}) {
  const childActive = item.children?.some((child) => isActive(pathname, child.match)) ?? false;
  const expanded = Boolean(item.children) && subnav.open[item.label] !== false;

  useEffect(() => {
    if (childActive && subnav.open[item.label] === false) {
      subnav.toggle(item.label, true);
    }
    // Open a collapsed group when the route moves into it. A click to collapse stays put.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);
  const selected =
    !childActive &&
    (isActive(pathname, item.match) || (active === "overview" && item.label === "Overview") || (active === "vendors" && item.label === "Vendors & contracts"));
  const Icon = item.icon;
  const tip = showcaseTooltip === item.label;

  if (collapsed) {
    const on = selected || childActive;
    const className = cn(
      "group relative inline-flex h-9 w-9 items-center justify-center rounded-lg",
      on ? "bg-[#ece9ff] text-[#5b4ce6]" : "text-[#8b90a0] hover:bg-[#eceef3] hover:text-[#3c4254]"
    );
    const body = (
      <>
        {Icon ? <Icon size={16} /> : <span className="text-[10px] font-semibold">{item.label.slice(0, 1)}</span>}
        <RailTip label={item.label} show={tip} />
      </>
    );
    return (
      <Link href={item.href} className={className} aria-label={item.label}>
        {body}
      </Link>
    );
  }

  const className = cn(
    "flex w-full items-center gap-2 rounded-lg py-1.5 text-left text-[13.5px]",
    depth === 0 ? "px-2.5" : "py-1.5 pl-9 pr-2.5 text-[13px]",
    selected ? "bg-[#ece9ff] font-semibold text-[#3f35b5]" : "text-[#3c4254] hover:bg-white"
  );
  const body = (
    <>
      {Icon && <Icon size={16} className={cn("shrink-0", selected || childActive ? "text-[#5b4ce6]" : "text-[#8b90a0]")} />}
      {item.children && (
        <ChevronRight
          size={14}
          className={cn("shrink-0 text-[#8b90a0] transition-transform", expanded && "rotate-90")}
        />
      )}
      <span className={cn("flex-1 truncate", childActive && "font-medium text-[#1f2430]")}>{item.label}</span>
      {item.count != null && <span className="text-[12px] text-[#8b90a0]">{item.count}</span>}
    </>
  );

  return (
    <>
      {item.children ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => subnav.toggle(item.label, !expanded)}
          className={className}
        >
          {body}
        </button>
      ) : (
        <Link href={item.href} className={className}>
          {body}
        </Link>
      )}
      {expanded &&
        item.children?.map((child) => (
          <NavRows
            key={child.href}
            item={child}
            pathname={pathname}
            active={active}
            depth={depth + 1}
            subnav={subnav}
            collapsed={false}
          />
        ))}
    </>
  );
}
