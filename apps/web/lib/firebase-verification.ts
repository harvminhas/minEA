import type { ActionCodeSettings } from "firebase/auth";

export interface VerificationEmailResult {
  message: string;
  email_sent: boolean;
  verification_link?: string | null;
}

export function verificationActionSettings(): ActionCodeSettings {
  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  return {
    url: `${origin}/auth/verify-email`,
    handleCodeInApp: false,
  };
}

/** Map Firebase auth errors to user-friendly messages. */
export function firebaseAuthErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const code = String((err as { code: string }).code);
    switch (code) {
      case "auth/too-many-requests":
        return "Too many attempts. Wait a few minutes and try again.";
      case "auth/requires-recent-login":
        return "Please sign out and sign in again, then retry verification.";
      case "auth/popup-closed-by-user":
        return "Sign-in cancelled.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with this email using a different sign-in method.";
      case "auth/popup-blocked":
        return "Popup blocked by the browser. Allow popups and try again.";
      default:
        break;
    }
  }
  return err instanceof Error ? err.message : "Authentication failed";
}
