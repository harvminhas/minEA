import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, connectAuthEmulator, type Auth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let emulatorConfigured = false;

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

/** Lazy init — do not call getAuth() at import time (breaks Next.js static prerender/build). */
export function getFirebaseAuth(): Auth {
  if (auth) return auth;
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured. Set NEXT_PUBLIC_FIREBASE_* environment variables."
    );
  }
  app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  auth = getAuth(app);
  
  // Connect to emulator if configured (dev/test only, never in production)
  if (!emulatorConfigured && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true") {
    const emulatorHost = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_HOST || "localhost";
    const emulatorPort = process.env.NEXT_PUBLIC_FIREBASE_EMULATOR_PORT || "9099";
    connectAuthEmulator(auth, `http://${emulatorHost}:${emulatorPort}`, { disableWarnings: true });
    emulatorConfigured = true;
    console.log(`[Firebase Auth] Connected to emulator at ${emulatorHost}:${emulatorPort}`);
  }
  
  return auth;
}
