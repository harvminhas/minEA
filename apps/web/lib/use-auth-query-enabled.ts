import { useAuth } from "@/lib/auth-context";

/** Wait for Firebase auth before firing authenticated API queries. */
export function useAuthQueryEnabled(...extra: Array<boolean | string | undefined | null>): boolean {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return false;
  return extra.every((value) => Boolean(value));
}
