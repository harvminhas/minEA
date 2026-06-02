"use client";

import { useEffect } from "react";
import { Grid3X3, Layers, Package, Server, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function HowItWorksTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-600 shadow-sm hover:border-indigo-200 hover:text-indigo-700 transition-colors"
    >
      How does this work?
    </button>
  );
}

function EntityBlock({
  icon: Icon,
  iconClassName,
  iconBgClassName,
  title,
  description,
  examples,
  className,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  iconClassName: string;
  iconBgClassName: string;
  title: string;
  description: React.ReactNode;
  examples: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-gray-200/80 bg-white p-4", className)}>
      <div className="flex gap-3">
        <span
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg",
            iconBgClassName
          )}
        >
          <Icon size={18} className={iconClassName} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600">{description}</p>
          <p className="mt-2 text-xs text-gray-400">{examples}</p>
        </div>
      </div>
    </div>
  );
}

function FlowConnector({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-0.5">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

export function HowItWorksModal({ open, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-it-works-title"
        className="relative w-full max-w-lg max-h-[min(90vh,720px)] flex flex-col rounded-2xl bg-white shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-6 py-5 flex-shrink-0">
          <h2 id="how-it-works-title" className="text-base font-semibold text-gray-900 pr-4">
            How BuboMap organises your architecture
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          <EntityBlock
            icon={Layers}
            iconBgClassName="bg-violet-100"
            iconClassName="text-violet-600"
            title="Domain"
            description={
              <>
                A broad area of your business — typically aligned to a function or team. Domains
                group related capabilities together.
              </>
            }
            examples="e.g. Finance, Sales, Risk, Technology"
          />

          <FlowConnector label="contains" />

          <EntityBlock
            icon={Grid3X3}
            iconBgClassName="bg-teal-100"
            iconClassName="text-teal-600"
            title="Capability"
            description={
              <>
                Something your business <strong className="font-semibold text-gray-800">does</strong> —
                independent of how or who does it. The anchor of everything in BuboMap.
              </>
            }
            examples="e.g. Customer onboarding, Risk assessment, Regulatory reporting"
          />

          <FlowConnector label="delivered by / consumed by" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <EntityBlock
              icon={Server}
              iconBgClassName="bg-sky-100"
              iconClassName="text-sky-600"
              title="System"
              description={
                <>
                  The tools and platforms that <strong className="font-semibold text-gray-800">deliver</strong> a
                  capability.
                </>
              }
              examples="e.g. Salesforce, SAP, Azure"
            />
            <EntityBlock
              icon={Package}
              iconBgClassName="bg-orange-100"
              iconClassName="text-orange-600"
              title="Product"
              description={
                <>
                  What your org <strong className="font-semibold text-gray-800">ships</strong> — built on top of
                  capabilities.
                </>
              }
              examples="e.g. Customer portal, Mobile app"
            />
          </div>
        </div>

        <div className="flex-shrink-0 border-t border-gray-100 px-6 py-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 bg-white px-6 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
