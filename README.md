# Second Look

A Chrome extension that slows you down for three seconds before you trust an AI answer.
It runs on-device first, so your text stays in the browser.

> Status: skeleton (context menu → side panel shows the selected text, Firebase + App Check wired).

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

Select text on any page, right-click, choose **Second Look**.

## Where things live

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest (`contextMenus`, `sidePanel`, `storage`) |
| `src/background.ts` | Context menu → opens the side panel, passes the selected text |
| `src/sidepanel.html` / `.ts` / `.css` | Side panel UI |
| `src/ai.ts` | Firebase init and App Check; Firebase AI Logic calls go here |
| `src/storage.ts` | Selection hand-off (`chrome.storage.session`) |

## License

Apache-2.0
