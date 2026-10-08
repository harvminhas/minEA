"use client";

/**
 * Signed-in aware calls to action on the public marketing page.
 *
 * Signed out, and while Firebase is still restoring the session, every CTA renders exactly as
 * before (that is also what the server sends, so there is no flash for signed-out visitors and
 * nothing blocks the page). Once the session is known to be signed in, "Get started free" /
 * "Sign in" become one "Open BuboMap" button to /home, the same place sign-in lands people:
 * it opens the last org/workspace Ask page, or the create-org flow when there is no org yet.
 */
import Link from "next/link";
import { useOptionalAuth } from "@/lib/auth-context";

export type Visitor = "unknown" | "signed_out" | "signed_in";

export const APP_HREF = "/home";
export const OPEN_APP_LABEL = "Open BuboMap";
export const SIGN_UP_HREF = "/auth/sign-up";
export const SIGN_IN_HREF = "/auth/sign-in";

export function visitorFrom(auth: { isLoaded: boolean; isSignedIn: boolean } | null | undefined): Visitor {
  if (!auth || !auth.isLoaded) return "unknown";
  return auth.isSignedIn ? "signed_in" : "signed_out";
}

export function useVisitor(): Visitor {
  return visitorFrom(useOptionalAuth());
}

/** Hero: Get started free + Sign in, or Open BuboMap. */
export function HeroCtas() {
  const visitor = useVisitor();
  if (visitor === "signed_in") {
    return (
      <div className="ctas" data-visitor="signed_in">
        <Link className="btn btn-primary btn-lg" href={APP_HREF}>
          {OPEN_APP_LABEL}
        </Link>
      </div>
    );
  }
  return (
    <div className="ctas">
      <Link className="btn btn-primary btn-lg" href={SIGN_UP_HREF}>
        Get started free
      </Link>
      <Link className="btn btn-ghost btn-lg" href={SIGN_IN_HREF}>
        Sign in
      </Link>
    </div>
  );
}

/** Header right side: Sign in + Get started free, or Open BuboMap. */
export function NavCtas() {
  const visitor = useVisitor();
  if (visitor === "signed_in") {
    return (
      <div className="navright" data-visitor="signed_in">
        <Link className="btn btn-primary btn-sm" href={APP_HREF}>
          {OPEN_APP_LABEL}
        </Link>
      </div>
    );
  }
  return (
    <div className="navright">
      <Link className="link" href={SIGN_IN_HREF}>
        Sign in
      </Link>
      <Link className="btn btn-primary btn-sm" href={SIGN_UP_HREF}>
        Get started free
      </Link>
    </div>
  );
}

/** Pricing band: the primary button becomes Open BuboMap; "See pricing" stays. */
export function BandPrimaryCta() {
  const signedIn = useVisitor() === "signed_in";
  return (
    <Link className="btn btn-primary btn-sm" href={signedIn ? APP_HREF : SIGN_UP_HREF}>
      {signedIn ? OPEN_APP_LABEL : "Get started free"}
    </Link>
  );
}

/** Plan card buttons: sign-up when signed out, the app (/home) when signed in. */
export function PlanCtaLink({ className, children }: { className: string; children: React.ReactNode }) {
  const signedIn = useVisitor() === "signed_in";
  return (
    <Link href={signedIn ? APP_HREF : SIGN_UP_HREF} className={className}>
      {signedIn ? OPEN_APP_LABEL : children}
    </Link>
  );
}
