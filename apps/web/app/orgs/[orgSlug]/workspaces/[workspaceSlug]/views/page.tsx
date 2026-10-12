"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ViewsHub } from "@/components/views/ViewsHub";
import { useTenancy } from "@/lib/tenancy";
import { legacyImpactRedirect } from "@/lib/views-hub/routes";

function ViewsHubPage() {
  const params = useSearchParams();
  const router = useRouter();
  const { basePath } = useTenancy();
  // Old links (/views?tab=…&sel=…, the setup wizard's ?ready=1) belonged to the impact view.
  const redirect = legacyImpactRedirect(basePath, params);
  useEffect(() => {
    if (redirect) router.replace(redirect);
  }, [redirect, router]);
  if (redirect) return null;
  return <ViewsHub />;
}

export default function ViewsPage() {
  return (
    <Suspense fallback={null}>
      <ViewsHubPage />
    </Suspense>
  );
}
