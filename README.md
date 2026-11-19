# Second Look

A Chrome extension that slows you down for three seconds before you trust an AI answer.
It runs on-device first, so your text stays in the browser.

> Status: trust → quick check → re-trust flow and the local trust log work in code (on-device first, cloud fallback, engine badge). Deep check with Google Search grounding is next.

## Setup

Requires Node 20+ and Chrome 139+.

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
3. **Re-rate.** Rate again and see the change.

**My trust log** (tab at the top) shows how often your trust dropped, the average change, the claim types flagged most (medium or high risk) and your last 20 checks.
It lives in `chrome.storage.local` and is never uploaded. Only the first 80 characters of each checked text are kept.

## Where things live

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest (`contextMenus`, `sidePanel`, `storage`) |
| `src/background.ts` | Context menu → opens the side panel, passes the selected text |
| `src/sidepanel.html` / `.ts` / `.css` | Side panel UI |
| `src/ai.ts` | Firebase init, App Check, and the Firebase AI Logic hybrid call (`quickCheck()`, `InferenceMode.PREFER_ON_DEVICE`) |
| `src/prompts.ts` | System prompt, JSON Schema, output validation |
| `src/storage.ts` | Selection hand-off (`chrome.storage.session`) and the trust log (`chrome.storage.local`) |

## License

Apache-2.0
