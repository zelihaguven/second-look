import { initFirebase, type FirebaseStatus } from "./ai";
import {
  loadPendingSelection,
  onPendingSelection,
  type PendingSelection,
} from "./storage";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in sidepanel.html`);
  return element as T;
}

const emptyState = requireElement("empty-state");
const selectionView = requireElement("selection-view");
const selectionText = requireElement("selection-text");
const selectionMeta = requireElement("selection-meta");
const firebaseStatus = requireElement("firebase-status");

function renderSelection(selection: PendingSelection | null): void {
  const text = selection?.text.trim() ?? "";
  const hasText = text.length > 0;

  emptyState.hidden = hasText;
  selectionView.hidden = !hasText;
  if (!hasText) return;

  selectionText.textContent = text;
  selectionMeta.textContent = `${text.length.toLocaleString("en")} characters`;
}

const FIREBASE_STATUS_LABELS: Record<FirebaseStatus["state"], string> = {
  unconfigured: "Firebase not configured. Add src/firebaseConfig.ts.",
  ready: "Firebase connected. App Check token OK.",
  error: "App Check failed",
};

function renderFirebaseStatus(status: FirebaseStatus): void {
  const label = FIREBASE_STATUS_LABELS[status.state];
  firebaseStatus.dataset.state = status.state;
  firebaseStatus.textContent =
    status.state === "error" ? `${label}: ${status.message}` : label;
}

async function start(): Promise<void> {
  onPendingSelection(renderSelection);
  renderSelection(await loadPendingSelection());
  renderFirebaseStatus(await initFirebase());
}

start().catch((error: unknown) => {
  console.error("[Second Look] Side panel failed to start", error);
  firebaseStatus.dataset.state = "error";
  firebaseStatus.textContent = "Something went wrong. Reopen the side panel.";
});
