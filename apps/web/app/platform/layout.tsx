"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { PlatformShell } from "@/components/platform/PlatformShell";

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <PlatformShell>{children}</PlatformShell>
    </RequireAuth>
  );
}
