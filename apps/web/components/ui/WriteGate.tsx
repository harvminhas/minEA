"use client";

import type { PermissionSlug } from "@minea/types";
import { usePermissions } from "@/lib/use-permissions";

interface WriteGateProps {
  children: React.ReactNode;
  /** When set, requires this permission in addition to non-read-only access. */
  permission?: PermissionSlug;
  fallback?: React.ReactNode;
}

/** Renders children only when the user can write (not viewer/share read-only). */
export function WriteGate({ children, permission, fallback = null }: WriteGateProps) {
  const { isReadOnly, can } = usePermissions();

  if (isReadOnly) return <>{fallback}</>;
  if (permission && !can(permission)) return <>{fallback}</>;

  return <>{children}</>;
}
