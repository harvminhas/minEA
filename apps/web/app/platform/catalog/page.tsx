"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { CatalogAdmin } from "@/components/platform/CatalogAdmin";

export default function PlatformCatalogPage() {
  return (
    <RequireAuth>
      <CatalogAdmin />
    </RequireAuth>
  );
}
