import Link from "next/link";
import { legalHrefs } from "@/components/marketing/home/footer-links";

/** "By continuing you agree…" line under the sign-in / sign-up form. */
export function LegalNotice() {
  const { privacy, terms } = legalHrefs();
  return (
    <p className="mt-6 max-w-sm text-center text-xs text-white/45" data-testid="auth-legal-notice">
      By continuing, you agree to the{" "}
      <Link href={terms} className="underline hover:text-white/80">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href={privacy} className="underline hover:text-white/80">
        Privacy Policy
      </Link>
      .
    </p>
  );
}
