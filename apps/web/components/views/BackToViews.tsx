"use client";

import Link from "next/link";
import { useTenancy } from "@/lib/tenancy";

/** "← Back to Views" on pages opened from a Views hub card. */
export function BackToViews({ className = "mb-4" }: { className?: string }) {
  const { basePath } = useTenancy();
  return (
    <div className={`${className} text-[13px] text-[#6b7289]`}>
      <Link href={`${basePath}/views`} data-testid="back-to-views" className="hover:text-[#1c2230]">← Back to Views</Link>
    </div>
  );
}
