"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { BusinessGetStartedForm } from "./BusinessGetStartedForm";

interface Props {
  theme?: "light" | "dark";
  orgSlug?: string | null;
  source?: string | null;
  onClose: () => void;
}

/** Business "Get started" form in a dialog (pricing page and Plan & billing). */
export function BusinessGetStartedDialog({ theme = "light", orgSlug, source, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const dark = theme === "dark";
  return (
    <>
      <div className="fixed inset-0 z-[80] bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="business-get-started-title"
        data-testid="business-get-started"
        className={`fixed left-1/2 top-1/2 z-[90] max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl p-6 text-left shadow-xl ${
          dark ? "border border-white/10 bg-[#111a33] text-white" : "bg-white text-gray-900"
        }`}
      >
        <div className="mb-1 flex items-start justify-between gap-4">
          <h3 id="business-get-started-title" className="text-lg font-semibold">
            Get started with Business
          </h3>
          <button type="button" aria-label="Close" onClick={onClose} className={dark ? "text-white/50 hover:text-white" : "text-gray-400 hover:text-gray-700"}>
            <X size={18} />
          </button>
        </div>
        <p className={`mb-5 text-sm ${dark ? "text-white/55" : "text-gray-500"}`}>
          Tell us how many licences you need and how you&apos;d like to pay. We&apos;ll email you
          the next steps.
        </p>
        <BusinessGetStartedForm theme={theme} orgSlug={orgSlug} source={source} onDone={onClose} />
      </div>
    </>
  );
}
