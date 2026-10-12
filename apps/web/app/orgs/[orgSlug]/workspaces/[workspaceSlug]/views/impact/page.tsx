"use client";

import { Suspense } from "react";
import { EstateViews } from "@/components/mvp/EstateViews";

export default function ImpactViewPage() {
  return (
    <Suspense fallback={null}>
      <EstateViews />
    </Suspense>
  );
}
