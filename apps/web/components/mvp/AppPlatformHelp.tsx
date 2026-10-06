"use client";

import { useEffect, useState } from "react";
import { APP_OR_PLATFORM } from "@/lib/setup/type-guidance";

export function AppPlatformHelp() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <span className="relative ml-1 inline-flex align-middle">
      <button
        type="button"
        aria-label="Application or platform?"
        title="Application or platform?"
        onClick={() => setOpen((value) => !value)}
        className="text-[14px] font-normal text-[#8b90a0]"
      >
        ⓘ
      </button>
      {open && (
        <span className="absolute left-0 top-6 z-20 w-[320px] rounded-lg border border-[#e6e8ee] bg-white p-3 text-left text-[13px] font-normal normal-case tracking-normal text-[#1c2230] shadow-lg">
          <span className="mb-1 block font-semibold">Application or platform?</span>
          {APP_OR_PLATFORM}
        </span>
      )}
    </span>
  );
}
