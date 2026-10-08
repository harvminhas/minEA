"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  GoogleAuthProvider,
  linkWithCredential,
  OAuthProvider,
  onAuthStateChanged,
  reload,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type AuthCredential,
  type User,
} from "firebase/auth";
import { authApi } from "@/lib/api-client";
import { type VerificationEmailResult } from "@/lib/firebase-verification";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";
import {
  describeAuthError,
  existingAccountAdvice,
  type AuthErrorInfo,
  type ExistingAccountAdvice,
  type SignInMethod,
  type SocialProvider,
} from "@/lib/auth/errors";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** Firebase / server combined verified flag */
  emailVerified: boolean;
  /** True for email+password accounts that still need to verify */
  requiresEmailVerification: boolean;
}

/** A sign-in that failed, with a message to show and, for account-exists, how to get in. */
export class SignInError extends Error {
  readonly info: AuthErrorInfo;
  readonly advice: ExistingAccountAdvice | null;
  constructor(info: AuthErrorInfo, advice: ExistingAccountAdvice | null = null) {
    super(advice?.message ?? info.message);
    this.name = "SignInError";
    this.info = info;
    this.advice = advice;
  }
}

/** A Google/Microsoft credential waiting to be linked after the person signs in the old way. */
export interface PendingLink {
  provider: SocialProvider;
  email: string | null;
}

export interface SignInResult {
  /** Set when a pending Google/Microsoft credential was linked to this account. */
  linked: SocialProvider | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  /** False while /auth/me is in flight for a signed-in user */
  sessionReady: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  /** Password sign-in (dev/test, and the one-time link for old password accounts). Throws SignInError. */
  signInWithEmail: (email: string, password: string) => Promise<SignInResult>;
  /** Google or Microsoft popup. Throws SignInError. */
  signInWithProvider: (provider: SocialProvider) => Promise<SignInResult>;
  signInWithGoogle: () => Promise<SignInResult>;
  signInWithMicrosoft: () => Promise<SignInResult>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  /** Set after account-exists until the person signs in the old way (or gives up). */
  pendingLink: PendingLink | null;
  clearPendingLink: () => void;
  resendVerificationEmail: () => Promise<VerificationEmailResult>;
  getDevVerificationLink: () => Promise<VerificationEmailResult>;
  refreshSession: () => Promise<AuthUser | null>;
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Exported for tests and for pages that must render without a provider (useOptionalAuth). */
export const AuthContext = createContext<AuthContextValue | null>(null);

function mapFirebaseUser(user: User): AuthUser {
  const usesPassword = user.providerData.some((p) => p.providerId === "password");
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
    requiresEmailVerification: usesPassword && !user.emailVerified,
  };
}

function mergeSession(
  user: User,
  session: {
    email_verified: boolean;
    requires_email_verification: boolean;
  }
): AuthUser {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: session.email_verified,
    requiresEmailVerification: session.requires_email_verification,
  };
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Microsoft work and school accounts (personal accounts too, if the Entra app allows them).
const microsoftProvider = new OAuthProvider("microsoft.com");
microsoftProvider.addScope("email");
microsoftProvider.addScope("profile");
microsoftProvider.setCustomParameters({ prompt: "select_account" });

function popupProvider(provider: SocialProvider) {
  return provider === "microsoft" ? microsoftProvider : googleProvider;
}

function credentialFromError(provider: SocialProvider, err: unknown): AuthCredential | null {
  try {
    const source = err as Parameters<typeof OAuthProvider.credentialFromError>[0];
    return provider === "microsoft"
      ? OAuthProvider.credentialFromError(source)
      : GoogleAuthProvider.credentialFromError(source);
  } catch {
    return null;
  }
}

/** [] when email-enumeration protection is on (the Firebase default) or the call fails. */
async function signInMethodsFor(email: string): Promise<string[]> {
  try {
    return await fetchSignInMethodsForEmail(getFirebaseAuth(), email);
  } catch {
    return [];
  }
}

function signInError(err: unknown, method: SignInMethod): SignInError {
  return err instanceof SignInError ? err : new SignInError(describeAuthError(err, method));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [pendingLink, setPendingLink] = useState<PendingLink | null>(null);
  const pendingRef = useRef<(PendingLink & { credential: AuthCredential }) | null>(null);

  const hydrateSession = useCallback(async (firebaseUser: User): Promise<AuthUser> => {
    setSessionReady(false);
    const fallback = mapFirebaseUser(firebaseUser);
    setUser(fallback);
    try {
      const token = await firebaseUser.getIdToken();
      const session = await authApi.me(token);
      const merged = mergeSession(firebaseUser, session);
      setUser(merged);
      return merged;
    } catch {
      setUser(fallback);
      return fallback;
    } finally {
      setSessionReady(true);
    }
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsLoaded(true);
      setSessionReady(true);
      return;
    }
    return onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsLoaded(true);
        setSessionReady(true);
        return;
      }
      setIsLoaded(true);
      void hydrateSession(firebaseUser);
    });
  }, [hydrateSession]);

  const getToken = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return null;
    return current.getIdToken();
  }, []);

  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const current = getFirebaseAuth().currentUser;
    if (!current) {
      setUser(null);
      setSessionReady(true);
      return null;
    }
    return hydrateSession(current);
  }, [hydrateSession]);

  const clearPendingLink = useCallback(() => {
    pendingRef.current = null;
    setPendingLink(null);
  }, []);

  /**
   * After the person signs in the old way, attach the Google/Microsoft credential that hit
   * account-exists, so both work from now on. Same email only; a failed link is ignored
   * (they are signed in either way and can retry next time).
   */
  const completePendingLink = useCallback(
    async (signedIn: User): Promise<SocialProvider | null> => {
      const pending = pendingRef.current;
      if (!pending) return null;
      clearPendingLink();
      if (!pending.email || signedIn.email?.toLowerCase() !== pending.email.toLowerCase()) return null;
      try {
        await linkWithCredential(signedIn, pending.credential);
        await signedIn.getIdToken(true);
        return pending.provider;
      } catch {
        return null;
      }
    },
    [clearPendingLink]
  );

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<SignInResult> => {
      try {
        const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
        return { linked: await completePendingLink(credential.user) };
      } catch (err) {
        throw signInError(err, "password");
      }
    },
    [completePendingLink]
  );

  const signInWithProvider = useCallback(
    async (provider: SocialProvider): Promise<SignInResult> => {
      try {
        const credential = await signInWithPopup(getFirebaseAuth(), popupProvider(provider));
        return { linked: await completePendingLink(credential.user) };
      } catch (err) {
        const info = describeAuthError(err, provider);
        if (info.kind !== "account_exists") throw signInError(err, provider);
        const credential = credentialFromError(provider, err);
        if (credential) {
          pendingRef.current = { provider, email: info.email, credential };
          setPendingLink({ provider, email: info.email });
        }
        const methods = info.email ? await signInMethodsFor(info.email) : [];
        throw new SignInError(info, existingAccountAdvice(provider, info.email, methods));
      }
    },
    [completePendingLink]
  );

  const signInWithGoogle = useCallback(() => signInWithProvider("google"), [signInWithProvider]);
  const signInWithMicrosoft = useCallback(() => signInWithProvider("microsoft"), [signInWithProvider]);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    } catch (err) {
      throw signInError(err, "password");
    }
    const token = await credential.user.getIdToken();
    const appOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
    try {
      await authApi.sendVerificationEmail(token, appOrigin);
    } catch {
      // verify-email page retries after session hydrates
    }
  }, []);

  const resendVerificationEmail = useCallback(async (): Promise<VerificationEmailResult> => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in");
    const session = await authApi.me(token);
    if (!session.requires_email_verification) {
      return { message: "Email already verified.", email_sent: false };
    }
    const appOrigin = typeof window !== "undefined" ? window.location.origin : undefined;
    return authApi.sendVerificationEmail(token, appOrigin);
  }, [getToken]);

  const getDevVerificationLink = useCallback(async (): Promise<VerificationEmailResult> => {
    return resendVerificationEmail();
  }, [resendVerificationEmail]);

  const reloadUser = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return;
    await reload(current);
    await current.getIdToken(true);
    await hydrateSession(current);
  }, [hydrateSession]);

  const signOut = useCallback(async () => {
    clearPendingLink();
    await firebaseSignOut(getFirebaseAuth());
  }, [clearPendingLink]);

  const value = useMemo(
    () => ({
      user,
      isLoaded,
      sessionReady,
      isSignedIn: !!user,
      getToken,
      signInWithEmail,
      signInWithProvider,
      signInWithGoogle,
      signInWithMicrosoft,
      signUpWithEmail,
      pendingLink,
      clearPendingLink,
      resendVerificationEmail,
      getDevVerificationLink,
      refreshSession,
      reloadUser,
      signOut,
    }),
    [
      user,
      isLoaded,
      sessionReady,
      getToken,
      signInWithEmail,
      signInWithProvider,
      signInWithGoogle,
      signInWithMicrosoft,
      signUpWithEmail,
      pendingLink,
      clearPendingLink,
      resendVerificationEmail,
      getDevVerificationLink,
      refreshSession,
      reloadUser,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Like useAuth, but null outside AuthProvider instead of throwing (public marketing pages). */
export function useOptionalAuth(): AuthContextValue | null {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
