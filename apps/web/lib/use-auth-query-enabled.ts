import { useAuth } from "@/lib/auth-context";
import { useShareSession } from "@/lib/share-context";

/** Wait for Firebase auth before firing authenticated API queries. Share sessions skip auth. */
export function useAuthQueryEnabled(...extra: Array<boolean | string | undefined | null>): boolean {
  const shareSession = useShareSession();
  if (shareSession) {
    return extra.every((value) => value === undefined || value === null || Boolean(value));
  }

  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded || !isSignedIn) return false;
  return extra.every((value) => value === undefined || value === null || Boolean(value));
}
