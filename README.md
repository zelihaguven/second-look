# Second Look

A Chrome extension that slows you down for three seconds before you trust an AI answer.
It runs on-device first, so your text stays in the browser.

> Status: the full MVP flow is in code: trust → quick check (on-device first, cloud fallback, engine badge) → optional deep check (cloud, Google Search grounding, consent) → re-trust, plus the local trust log. Next: real-device testing with `test-cases/`, polish, demo.

## Setup

Requires Node 20+ and Chrome 139+. Uses the Firebase JS SDK 12.5.0 or later (bundled; `npm install` currently resolves 12.19.0).

```bash
npm install
```

### 1. Firebase project

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Add a **Web app** to it and copy the config object.
3. Copy `src/firebaseConfig.example.ts` to `src/firebaseConfig.ts` and paste the values.
   `src/firebaseConfig.ts` is gitignored.
4. In the console, open **AI Logic** and enable the **Gemini Developer API**.

### 2. Build and load

```bash
npm run build
```

Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick `dist/`.
Use `npm run dev` to rebuild on change (reload the extension after each build).

### 3. App Check debug token

reCAPTCHA providers load a remote script, which Manifest V3 does not allow, so this
extension uses the App Check **debug provider**.

1. In the console, open **App Check → Apps** and register the web app (any provider).
2. Open the side panel, right-click it → **Inspect**, and copy the line
   `Firebase App Check debug token: …` from the console.
3. In **App Check → Apps → ⋮ → Manage debug tokens**, add that token.
4. Reopen the side panel. The footer should read `Firebase connected. App Check token OK.`

To pin a token instead of using the generated one, copy `.env.example` to `.env.local`
and set `VITE_APPCHECK_DEBUG_TOKEN`. Never commit a debug token.

## Use

Select text on any page, right-click, choose **Second Look**. Then:

1. **Commit first.** Rate how much you trust the answer (1–5). The quick check stays locked until you do, and the rating can't be changed once the analysis is shown.
2. **Quick check.** Claims are flagged by type and risk. The badge shows which engine answered (`On-device` / `Cloud`).
3. **Deep check (optional).** If any claim is high risk, you can search the web for it. A notice lists exactly what will be sent (only the high-risk claims, never the full text), and nothing leaves the device until you confirm. Each claim gets a verdict (supported, contradicted, unclear), source links and Google Search suggestions.
4. **Re-rate.** Rate again and see the change.

**My trust log** (tab at the top) shows how often your trust dropped, the average change, the claim types flagged most (medium or high risk) and your last 20 checks.
It lives in `chrome.storage.local` and is never uploaded. Only the first 80 characters of each checked text are kept.

## Where things live

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest (`contextMenus`, `sidePanel`, `storage`) |
| `src/background.ts` | Context menu → opens the side panel, passes the selected text |
| `src/sidepanel.html` / `.ts` / `.css` | Side panel UI |
| `src/ai.ts` | Firebase init, App Check, and the Firebase AI Logic calls: `quickCheck()` (`InferenceMode.PREFER_ON_DEVICE`, Gemini Nano with `gemini-3.5-flash-lite` fallback) and `deepCheck()` (`InferenceMode.ONLY_IN_CLOUD`, `gemini-3.8-flash` with `tools: [{ googleSearch: {} }]`) |
| `src/prompts.ts` | Prompts, JSON Schema, output validation, verdict and source parsing |
| `src/storage.ts` | Selection hand-off (`chrome.storage.session`) and the trust log (`chrome.storage.local`) |

## Grounding with Google Search

The deep check uses Grounding with Google Search, so its display requirements apply
([Gemini API terms](https://ai.google.dev/gemini-api/terms#grounding-with-google-search)).
Each grounded result shows its source links and the Google Search suggestions
(`searchEntryPoint.renderedContent`) unchanged, inside a shadow root as the SDK recommends.
Links open in a new tab.

## Test cases

`test-cases/` has five AI-style answers with known-wrong claims and the expected flags.
See `test-cases/README.md` for how to run them.

## License

Apache-2.0
