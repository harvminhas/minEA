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
  emailVerified: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  isSignedIn: boolean;
  getToken: () => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  resendVerificationEmail: () => Promise<VerificationEmailResult>;
  getDevVerificationLink: () => Promise<VerificationEmailResult>;
  reloadUser: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    emailVerified: user.emailVerified,
  };
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (!isFirebaseConfigured()) {
      setIsLoaded(true);
      return;
    }
    return onAuthStateChanged(getFirebaseAuth(), (firebaseUser) => {
      setUser(mapUser(firebaseUser));
      setIsLoaded(true);
    });
  }, []);

  const getToken = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return null;
    return current.getIdToken();
  }, []);

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
    await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);

  const resendVerificationEmail = useCallback(async (): Promise<VerificationEmailResult> => {
    const token = await getToken();
    if (!token) throw new Error("Not signed in");
    const current = getFirebaseAuth().currentUser;
    if (current?.emailVerified) {
      return { message: "Email already verified.", email_sent: false };
    }
    return authApi.sendVerificationEmail(token);
  }, [getToken]);

  const getDevVerificationLink = useCallback(async (): Promise<VerificationEmailResult> => {
    return resendVerificationEmail();
  }, [resendVerificationEmail]);

  const reloadUser = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (!current) return;
    await reload(current);
    await current.getIdToken(true);
    setUser(mapUser(current));
  }, []);

  const signOut = useCallback(async () => {
    await firebaseSignOut(getFirebaseAuth());
  }, []);

  const value = useMemo(
    () => ({
      user,
      isLoaded,
      isSignedIn: !!user,
      getToken,
      signInWithEmail,
      signInWithGoogle,
      signUpWithEmail,
      resendVerificationEmail,
      getDevVerificationLink,
      reloadUser,
      signOut,
    }),
    [
      user,
      isLoaded,
      getToken,
      signInWithEmail,
      signInWithGoogle,
      signUpWithEmail,
      resendVerificationEmail,
      getDevVerificationLink,
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
