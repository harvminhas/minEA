/**
 * Presentational pieces of the Google / Microsoft sign-in (no auth hooks, so they render in tests).
 */
import { Loader2 } from "lucide-react";
import { PASSWORD_USERS_NOTE, PROVIDER_LABEL, type ExistingAccountAdvice, type SocialProvider } from "@/lib/auth/errors";

export function GoogleIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

/** The Microsoft logo: four squares, per Microsoft's sign-in branding guidelines. */
export function MicrosoftIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

const BUTTON =
  "w-full flex items-center justify-center gap-3 border border-gray-200 rounded-md py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors";

interface ButtonsProps {
  busy: SocialProvider | "password" | null;
  disabled?: boolean;
  /** Draw attention to these (after account-exists). */
  highlight?: readonly string[];
  onSelect: (provider: SocialProvider) => void;
}

export function ProviderButtons({ busy, disabled, highlight = [], onSelect }: ButtonsProps) {
  return (
    <div className="space-y-2">
      {(["google", "microsoft"] as const).map((provider) => (
        <button
          key={provider}
          type="button"
          data-provider={provider}
          onClick={() => onSelect(provider)}
          disabled={disabled || busy !== null}
          className={`${BUTTON} ${highlight.includes(provider) ? "ring-2 ring-indigo-500 border-indigo-300" : ""}`}
        >
          {busy === provider ? (
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : provider === "google" ? (
            <GoogleIcon />
          ) : (
            <MicrosoftIcon />
          )}
          Continue with {PROVIDER_LABEL[provider]}
        </button>
      ))}
    </div>
  );
}

export function ExistingAccountPanel({ advice }: { advice: ExistingAccountAdvice }) {
  return (
    <div
      role="status"
      data-testid="existing-account"
      className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
    >
      {advice.message}
    </div>
  );
}

export function PasswordUsersNote() {
  return (
    <p data-testid="password-users-note" className="text-xs text-gray-500 text-center">
      {PASSWORD_USERS_NOTE}
    </p>
  );
}
