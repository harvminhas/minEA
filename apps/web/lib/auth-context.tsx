"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import { authApi } from "@/lib/api-client";
import { firebaseAuthErrorMessage, type VerificationEmailResult } from "@/lib/firebase-verification";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase";

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  /** Firebase / server combined verified flag */
  emailVerified: boolean;
  /** True for email+password accounts that still need to verify */
  requiresEmailVerification: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  /** False while /auth/me is in flight for a signed-in user */
  sessionReady: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerificationEmail: () => Promise<VerificationEmailResult>;
  getDevVerificationLink: () => Promise<VerificationEmailResult>;
  refreshSession: () => Promise<AuthUser | null>;
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

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

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(getFirebaseAuth(), googleProvider);
    } catch (err) {
      throw new Error(firebaseAuthErrorMessage(err));
    }
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
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
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoaded,
      sessionReady,
      isSignedIn: !!user,
      getToken,
      signInWithEmail,
      signInWithGoogle,
      signUpWithEmail,
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
      signInWithGoogle,
      signUpWithEmail,
      resendVerificationEmail,
      getDevVerificationLink,
      refreshSession,
      reloadUser,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
