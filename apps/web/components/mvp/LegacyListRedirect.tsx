"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";
import { legacyListRedirect } from "@/lib/model-legacy-paths";

export function LegacyListRedirect() {
  const { basePath } = useTenancy();
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const target = legacyListRedirect(basePath, pathname, search.toString());

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (!target) return null;
  return <p className="px-8 py-8 text-[13px] text-[#6b7289]">Taking you to the new page…</p>;
}
