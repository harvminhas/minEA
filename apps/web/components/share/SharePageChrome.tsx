"use client";

import Link from "next/link";
import { Calendar, Lock, User } from "lucide-react";
import type { SharePreview } from "@minea/types";
import { BuboMapWordmark } from "@/components/brand/BuboMapLogo";

function formatExpiresLabel(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "Expired";
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days === 1) return "Expires in 1 day";
  return `Expires in ${days} days`;
}

export function ShareTopNav({ preview }: { preview: SharePreview }) {
  const expiresLabel = formatExpiresLabel(preview.expires_at);

  return (
    <header className="h-12 bg-[#0f172a] border-b border-white/10 flex items-center px-4 gap-3 flex-shrink-0">
      <Link href="/" className="flex items-center gap-2.5 flex-shrink-0">
        <BuboMapWordmark size="sm" beta theme="dark" />
        <span className="text-violet-300/90 text-xs font-medium tracking-wide">shared view</span>
      </Link>

      <div className="flex-1 flex items-center justify-center gap-4 sm:gap-6 text-[11px] sm:text-xs text-white/45 min-w-0">
        {preview.shared_by_name && (
          <span className="inline-flex items-center gap-1.5 truncate">
            <User size={12} className="text-white/30 flex-shrink-0" aria-hidden />
            <span className="truncate">
              Shared by <span className="text-white/70">{preview.shared_by_name}</span>
            </span>
          </span>
        )}
        {expiresLabel && (
          <span className="inline-flex items-center gap-1.5 flex-shrink-0">
            <Calendar size={12} className="text-white/30" aria-hidden />
            {expiresLabel}
          </span>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3 flex-shrink-0">
        <span
          className="inline-flex items-center gap-1 rounded-full bg-white/8 border border-white/10 px-2.5 py-0.5 text-[11px] text-white/45"
          title="You can browse and export but not edit"
        >
          <Lock size={10} className="text-white/35" aria-hidden />
          Read-only
        </span>
        <Link
          href="/auth/sign-up"
          className="text-sm font-medium text-white/70 hover:text-white transition-colors"
        >
          Get BuboMap
        </Link>
      </div>
    </header>
  );
}

export function ShareFooterCta() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-5">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
        <span>
          Built with{" "}
          <Link href="/" className="font-medium text-gray-700 hover:text-indigo-600 transition-colors">
            BuboMap
          </Link>
          <span className="hidden sm:inline text-gray-400"> · architecture intelligence</span>
        </span>
        <div className="flex items-center gap-4 flex-shrink-0">
          <Link href="/" className="hover:text-gray-700 transition-colors">
            Learn more
          </Link>
          <Link
            href="/auth/sign-up"
            className="font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  );
}
