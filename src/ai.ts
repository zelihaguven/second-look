// Firebase init, App Check and the Firebase AI Logic calls.
// Runs in the side panel page, never in the service worker: the Prompt API is a document API.
import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type GenerativeModel,
} from "firebase/ai";
import { CustomProvider, getToken, initializeAppCheck } from "firebase/app-check";
import {
  buildDeepCheckPrompt,
  buildQuickCheckPrompt,
  collectSources,
  DEEP_CHECK_SYSTEM_PROMPT,
  parseQuickCheck,
  parseVerdict,
  prepareInput,
  QUICK_CHECK_SCHEMA,
  SYSTEM_PROMPT,
  type Claim,
  type QuickCheckResult,
  type Source,
  type Verdict,
} from "./prompts";

export type FirebaseStatus =
  | { readonly state: "unconfigured" }
  | { readonly state: "ready" }
  | { readonly state: "error"; readonly message: string };

export type Engine = "on-device" | "cloud";

interface QuickCheckBase {
  readonly engine: Engine;
  readonly wasTruncated: boolean;
}

/** `raw` is the fallback when the model did not return usable JSON twice in a row. */
export type QuickCheckOutcome =
  | (QuickCheckBase & { readonly kind: "result"; readonly result: QuickCheckResult })
  | (QuickCheckBase & { readonly kind: "raw"; readonly rawText: string });

export class NotConfiguredError extends Error {
  constructor() {
    super("Firebase is not configured. Add src/firebaseConfig.ts and rebuild.");
    this.name = "NotConfiguredError";
  }
}

/** Cloud model used when Gemini Nano is not available on this machine. */
const CLOUD_FALLBACK_MODEL = "gemini-2.5-flash-lite";
/** Cloud model for the deep check. Must support Grounding with Google Search. */
const DEEP_CHECK_MODEL = "gemini-2.5-flash";
const MAX_ATTEMPTS = 2;

// Optional import: the build still works before src/firebaseConfig.ts exists.
const configModules = import.meta.glob<{ firebaseConfig?: FirebaseOptions }>(
  "./firebaseConfig.ts",
  { eager: true },
);
const firebaseConfig = Object.values(configModules)[0]?.firebaseConfig;

interface FirebaseContext {
  readonly app: FirebaseApp;
  readonly appCheck: ReturnType<typeof initializeAppCheck>;
}

let context: FirebaseContext | null = null;
let quickModel: GenerativeModel | null = null;
let deepModel: GenerativeModel | null = null;

function getContext(): FirebaseContext {
  if (context) return context;
  if (!firebaseConfig) throw new NotConfiguredError();

  // Debug provider. reCAPTCHA providers load a remote script, which MV3 forbids.
  // `true` makes the SDK generate a token and print it to the console once;
  // register it under App Check → Apps → Manage debug tokens.
  const debugGlobal = self as typeof self & {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  };
  debugGlobal.FIREBASE_APPCHECK_DEBUG_TOKEN =
    import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;

  const app = initializeApp(firebaseConfig);
  const appCheck = initializeAppCheck(app, {
    // Never called while the debug token is set; the SDK exchanges the debug token instead.
    provider: new CustomProvider({
      getToken: () =>
        Promise.reject(new Error("App Check debug token is not set")),
    }),
    isTokenAutoRefreshEnabled: true,
  });
  context = { app, appCheck };
  return context;
}

/** Initializes Firebase and confirms App Check can mint a token. */
export async function initFirebase(): Promise<FirebaseStatus> {
  if (!firebaseConfig) return { state: "unconfigured" };

  try {
    await getToken(getContext().appCheck);
    return { state: "ready" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { state: "error", message };
  }
}

function getAIInstance(): ReturnType<typeof getAI> {
  return getAI(getContext().app, { backend: new GoogleAIBackend() });
}

function getQuickModel(): GenerativeModel {
  if (quickModel) return quickModel;

  quickModel = getGenerativeModel(getAIInstance(), {
    mode: InferenceMode.PREFER_ON_DEVICE,
    onDeviceParams: {
      createOptions: {
        expectedInputs: [{ type: "text", languages: ["en"] }],
        expectedOutputs: [{ type: "text", languages: ["en"] }],
        initialPrompts: [
          { role: "system", content: [{ type: "text", value: SYSTEM_PROMPT }] },
        ],
      },
      promptOptions: { responseConstraint: QUICK_CHECK_SCHEMA },
    },
    inCloudParams: {
      model: CLOUD_FALLBACK_MODEL,
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: QUICK_CHECK_SCHEMA,
      },
    },
  });
  return quickModel;
}

/**
 * Hybrid quick check: Gemini Nano when it is available, the cloud model otherwise.
 * Call from a user click. `onDownloadProgress` receives 0..1 while Nano downloads;
 * the check itself does not wait for the download and uses the cloud meanwhile.
 */
export async function quickCheck(
  text: string,
  onDownloadProgress: (fraction: number) => void,
): Promise<QuickCheckOutcome> {
  const model = getQuickModel();
  const input = prepareInput(text);
  const prompt = buildQuickCheckPrompt(input.text);

  model.initializeDeviceModel(onDownloadProgress).catch((error: unknown) => {
    console.warn("[Second Look] On-device model is not ready", error);
  });

  let engine: Engine = "cloud";
  let rawText = "";
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const { response } = await model.generateContent(prompt);
    engine =
      response.inferenceSource === InferenceSource.ON_DEVICE ? "on-device" : "cloud";
    rawText = response.text();

    const result = parseQuickCheck(rawText);
    if (result) {
      return { kind: "result", result, engine, wasTruncated: input.wasTruncated };
    }
  }
  return { kind: "raw", rawText, engine, wasTruncated: input.wasTruncated };
}

export interface DeepCheckFinding {
  readonly kind: "finding";
  readonly claim: Claim;
  readonly verdict: Verdict;
  readonly explanation: string;
  readonly sources: readonly Source[];
  /**
   * Google Search suggestions (HTML/CSS). The grounding terms require showing it
   * unchanged next to the grounded answer.
   */
  readonly searchEntryPointHtml: string | null;
}

export interface DeepCheckFailure {
  readonly kind: "failure";
  readonly claim: Claim;
  readonly message: string;
}

export type DeepCheckItem = DeepCheckFinding | DeepCheckFailure;

function getDeepModel(): GenerativeModel {
  if (deepModel) return deepModel;

  deepModel = getGenerativeModel(getAIInstance(), {
    mode: InferenceMode.ONLY_IN_CLOUD,
    inCloudParams: {
      model: DEEP_CHECK_MODEL,
      systemInstruction: DEEP_CHECK_SYSTEM_PROMPT,
      tools: [{ googleSearch: {} }],
    },
  });
  return deepModel;
}

async function deepCheckClaim(model: GenerativeModel, claim: Claim): Promise<DeepCheckFinding> {
  const { response } = await model.generateContent(buildDeepCheckPrompt(claim));
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const { verdict, explanation } = parseVerdict(response.text());
  return {
    kind: "finding",
    claim,
    verdict,
    explanation,
    sources: collectSources(metadata?.groundingChunks),
    searchEntryPointHtml: metadata?.searchEntryPoint?.renderedContent ?? null,
  };
}

/**
 * Cloud only, after explicit consent: sends just the given claims (not the selected text)
 * to Gemini with Grounding with Google Search, one request per claim, in parallel.
 * A claim that fails does not fail the others.
 */
export async function deepCheck(claims: readonly Claim[]): Promise<DeepCheckItem[]> {
  const model = getDeepModel();
  const settled = await Promise.allSettled(claims.map((claim) => deepCheckClaim(model, claim)));
  return settled.map((outcome, index): DeepCheckItem => {
    if (outcome.status === "fulfilled") return outcome.value;
    console.error("[Second Look] Deep check failed for a claim", outcome.reason);
    const reason: unknown = outcome.reason;
    return {
      kind: "failure",
      claim: claims[index],
      message: reason instanceof Error ? reason.message : String(reason),
    };
  });
}
