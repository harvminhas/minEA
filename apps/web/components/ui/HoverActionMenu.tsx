"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface MenuItemProps {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "danger";
}

export function HoverActionMenu({
  items,
  ariaLabel = "More actions",
  className,
  buttonClassName,
}: {
  items: MenuItemProps[];
  ariaLabel?: string;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <div className={cn("relative flex-shrink-0", className)}>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-opacity",
          buttonClassName
        )}
        aria-label={ariaLabel}
        aria-expanded={open}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={close} />
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 z-40 min-w-[11rem] bg-white rounded-lg border border-gray-200 shadow-lg py-1"
            onClick={(e) => e.stopPropagation()}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  close();
                  item.onClick();
                }}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-sm text-left",
                  item.variant === "danger"
                    ? "text-red-600 hover:bg-red-50"
                    : "text-gray-700 hover:bg-gray-50"
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
