import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth, connectAuthEmulator } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
};

const useEmulator = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let emulatorConnected = false;

export function isFirebaseConfigured(): boolean {
  if (useEmulator) {
    return true;
  }
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
  
  if (useEmulator) {
    const emulatorConfig = {
      apiKey: "demo-api-key",
      authDomain: "demo-minea.firebaseapp.com",
      projectId: "demo-minea",
      storageBucket: "demo-minea.appspot.com",
      messagingSenderId: "123456789",
      appId: "1:123456789:web:abcdef",
    };
    app = getApps().length ? getApps()[0]! : initializeApp(emulatorConfig);
  } else {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig);
  }
  
  auth = getAuth(app);
  
  if (useEmulator && !emulatorConnected) {
    connectAuthEmulator(auth, "http://localhost:9099", { disableWarnings: true });
    emulatorConnected = true;
  }
  
  return auth;
}
