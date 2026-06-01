"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTenancy } from "@/lib/tenancy";

export default function InsightsLegacyRedirect() {
  const router = useRouter();
  const { basePath } = useTenancy();

  useEffect(() => {
    router.replace(`${basePath}/views`);
  }, [router, basePath]);

  return null;
}
