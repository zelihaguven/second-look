import {
  initFirebase,
  quickCheck,
  type FirebaseStatus,
  type QuickCheckOutcome,
} from "./ai";
import type { Claim } from "./prompts";
import {
  loadPendingSelection,
  onPendingSelection,
  type PendingSelection,
} from "./storage";

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id} in sidepanel.html`);
  return element as T;
}

const emptyState = requireElement("empty-state");
const selectionView = requireElement("selection-view");
const selectionText = requireElement("selection-text");
const selectionMeta = requireElement("selection-meta");
const quickCheckButton = requireElement<HTMLButtonElement>("quick-check-button");
const checkProgress = requireElement("check-progress");
const checkError = requireElement("check-error");
const resultView = requireElement("result-view");
const engineBadge = requireElement("engine-badge");
const resultNotice = requireElement("result-notice");
const resultSummary = requireElement("result-summary");
const claimList = requireElement("claim-list");
const rawOutput = requireElement("raw-output");
const firebaseStatus = requireElement("firebase-status");

const ENGINE_LABELS: Record<QuickCheckOutcome["engine"], string> = {
  "on-device": "On-device",
  cloud: "Cloud",
};

let currentText = "";
/** Incremented per selection and per run, so a slow reply never overwrites a newer state. */
let runId = 0;

function setText(element: HTMLElement, text: string): void {
  element.textContent = text;
  element.hidden = text === "";
}

function resetCheck(): void {
  runId += 1;
  quickCheckButton.disabled = false;
  resultView.hidden = true;
  setText(checkProgress, "");
  setText(checkError, "");
}

function renderSelection(selection: PendingSelection | null): void {
  currentText = selection?.text.trim() ?? "";
  const hasText = currentText.length > 0;

  resetCheck();
  emptyState.hidden = hasText;
  selectionView.hidden = !hasText;
  if (!hasText) return;

  selectionText.textContent = currentText;
  selectionMeta.textContent = `${currentText.length.toLocaleString("en")} characters`;
}

function createClaimDetail(label: string, text: string): HTMLParagraphElement {
  const detail = document.createElement("p");
  detail.className = "claim-detail";
  const heading = document.createElement("b");
  heading.textContent = `${label} `;
  detail.append(heading, text);
  return detail;
}

function createClaimItem(claim: Claim): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "claim";
  item.dataset.risk = claim.risk;

  const tags = document.createElement("div");
  tags.className = "claim-tags";
  const risk = document.createElement("span");
  risk.className = "claim-risk";
  risk.textContent = `${claim.risk} risk`;
  const type = document.createElement("span");
  type.className = "claim-type";
  type.textContent = claim.type;
  tags.append(risk, type);

  const quote = document.createElement("blockquote");
  quote.className = "claim-quote";
  quote.textContent = `“${claim.text}”`;

  item.append(tags, quote);
  if (claim.why) item.append(createClaimDetail("Why it might be wrong:", claim.why));
  if (claim.verify) item.append(createClaimDetail("How to verify:", claim.verify));
  return item;
}

function buildNotice(outcome: QuickCheckOutcome): string {
  const notices: string[] = [];
  if (outcome.engine === "cloud") {
    notices.push(
      "Gemini Nano was not available, so this check ran in the cloud and the selected text left your device.",
    );
  }
  if (outcome.wasTruncated) {
    notices.push("The selection was too long. Only the first part was checked.");
  }
  return notices.join(" ");
}

function renderOutcome(outcome: QuickCheckOutcome): void {
  engineBadge.textContent = ENGINE_LABELS[outcome.engine];
  engineBadge.dataset.engine = outcome.engine;
  setText(resultNotice, buildNotice(outcome));

  if (outcome.kind === "raw") {
    setText(resultSummary, "The model did not return a structured answer. This is its raw reply.");
    claimList.replaceChildren();
    setText(rawOutput, outcome.rawText);
  } else {
    const { claims, summary } = outcome.result;
    setText(resultSummary, summary || (claims.length === 0 ? "No checkable claims found." : ""));
    claimList.replaceChildren(...claims.map(createClaimItem));
    setText(rawOutput, "");
  }
  resultView.hidden = false;
}

function describeError(error: unknown): string {
  if (!navigator.onLine) {
    return "You are offline and Gemini Nano is not available on this machine, so the check could not run.";
  }
  const message = error instanceof Error ? error.message : String(error);
  return `The quick check failed. ${message}`;
}

async function runQuickCheck(): Promise<void> {
  if (currentText === "") return;

  resetCheck();
  const thisRun = runId;
  quickCheckButton.disabled = true;
  setText(checkProgress, "Checking…");

  try {
    const outcome = await quickCheck(currentText, (fraction) => {
      if (thisRun !== runId) return;
      setText(checkProgress, `Downloading Gemini Nano… ${Math.round(fraction * 100)}%`);
    });
    if (thisRun !== runId) return;
    renderOutcome(outcome);
  } catch (error: unknown) {
    if (thisRun !== runId) return;
    console.error("[Second Look] Quick check failed", error);
    setText(checkError, describeError(error));
  } finally {
    if (thisRun === runId) {
      quickCheckButton.disabled = false;
      setText(checkProgress, "");
    }
  }
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
  quickCheckButton.addEventListener("click", () => void runQuickCheck());
  onPendingSelection(renderSelection);
  renderSelection(await loadPendingSelection());
  renderFirebaseStatus(await initFirebase());
}

start().catch((error: unknown) => {
  console.error("[Second Look] Side panel failed to start", error);
  firebaseStatus.dataset.state = "error";
  firebaseStatus.textContent = "Something went wrong. Reopen the side panel.";
});
