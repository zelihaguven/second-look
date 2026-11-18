// Firebase init + App Check. quickCheck() and deepCheck() (Firebase AI Logic) land here next.
// Runs in the side panel page, never in the service worker.
import { initializeApp, type FirebaseOptions } from "firebase/app";
import {
  CustomProvider,
  getToken,
  initializeAppCheck,
  type AppCheck,
} from "firebase/app-check";

export type FirebaseStatus =
  | { readonly state: "unconfigured" }
  | { readonly state: "ready" }
  | { readonly state: "error"; readonly message: string };

// Optional import: the build still works before src/firebaseConfig.ts exists.
const configModules = import.meta.glob<{ firebaseConfig?: FirebaseOptions }>(
  "./firebaseConfig.ts",
  { eager: true },
);
const firebaseConfig = Object.values(configModules)[0]?.firebaseConfig;

let appCheck: AppCheck | null = null;

function getAppCheck(config: FirebaseOptions): AppCheck {
  if (appCheck) return appCheck;

  // Debug provider. reCAPTCHA providers load a remote script, which MV3 forbids.
  // `true` makes the SDK generate a token and print it to the console once;
  // register it under App Check → Apps → Manage debug tokens.
  const debugGlobal = self as typeof self & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  };
  debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;

  const app = initializeApp(config);
  appCheck = initializeAppCheck(app, {
    // Never called while the debug token is set; the SDK exchanges the debug token instead.
    provider: new CustomProvider({
      getToken: () =>
        Promise.reject(new Error("App Check debug token is not set")),
    }),
    isTokenAutoRefreshEnabled: true,
  });
  return appCheck;
}

/** Initializes Firebase and confirms App Check can mint a token. */
export async function initFirebase(): Promise<FirebaseStatus> {
  if (!firebaseConfig) return { state: "unconfigured" };

  try {
    await getToken(getAppCheck(firebaseConfig));
    return { state: "ready" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "error", message };
  }
}
