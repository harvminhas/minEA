"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { verificationPagePath } from "@/lib/auth-routes";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, sessionReady, isSignedIn, user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const needsVerification = Boolean(user?.requiresEmailVerification);

  useEffect(() => {
    if (!isLoaded || !sessionReady) return;
    if (!isSignedIn) {
      const redirectUrl = encodeURIComponent(pathname);
      router.replace(`/auth/sign-in?redirect_url=${redirectUrl}`);
      return;
    }
    if (needsVerification) {
      router.replace(verificationPagePath(pathname));
    }
  }, [isLoaded, sessionReady, isSignedIn, needsVerification, router, pathname]);

  if (!isLoaded || !sessionReady || !isSignedIn || needsVerification) {
    return null;
  }

  return children;
}
