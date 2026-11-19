import {
  initFirebase,
  quickCheck,
  type FirebaseStatus,
  type QuickCheckOutcome,
} from "./ai";
import type { Claim } from "./prompts";
import {
  appendTrustLog,
  clearTrustLog,
  computeTrustStats,
  loadPendingSelection,
  loadTrustLog,
  makeSnippet,
  onPendingSelection,
  TRUST_LOG_VISIBLE,
  TRUST_MAX,
  TRUST_MIN,
  type PendingSelection,
  type TrustLogEntry,
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
const checkHint = requireElement("check-hint");
const trustChange = requireElement("trust-change");
const checkView = requireElement("check-view");
const logView = requireElement("log-view");
const tabCheck = requireElement<HTMLButtonElement>("tab-check");
const tabLog = requireElement<HTMLButtonElement>("tab-log");
const logEmpty = requireElement("log-empty");
const logContent = requireElement("log-content");
const statTotal = requireElement("stat-total");
const statDropped = requireElement("stat-dropped");
const statAverage = requireElement("stat-average");
const statTypes = requireElement("stat-types");
const logListHeading = requireElement("log-list-heading");
const logList = requireElement("log-list");
const clearLogButton = requireElement<HTMLButtonElement>("clear-log-button");

interface TrustScale {
  reset(): void;
  setDisabled(disabled: boolean): void;
}

/** Fills a `fieldset.scale` with 1–5 radio buttons. */
function createTrustScale(id: string, onRate: (rating: number) => void): TrustScale {
  const fieldset = requireElement<HTMLFieldSetElement>(id);
  const options = fieldset.querySelector(".scale-options");
  if (!options) throw new Error(`Missing .scale-options in #${id}`);

  const inputs: HTMLInputElement[] = [];
  for (let rating = TRUST_MIN; rating <= TRUST_MAX; rating += 1) {
    const input = document.createElement("input");
    input.type = "radio";
    input.name = id;
    input.value = String(rating);
    input.addEventListener("change", () => onRate(rating));

    const face = document.createElement("span");
    face.textContent = String(rating);

    const label = document.createElement("label");
    label.className = "scale-option";
    label.append(input, face);
    options.append(label);
    inputs.push(input);
  }

  return {
    reset() {
      for (const input of inputs) input.checked = false;
      fieldset.disabled = false;
    },
    setDisabled(disabled) {
      fieldset.disabled = disabled;
    },
  };
}

let trustBefore: number | null = null;
let lastOutcome: QuickCheckOutcome | null = null;

const beforeScale = createTrustScale("trust-before", (rating) => {
  trustBefore = rating;
  quickCheckButton.disabled = false;
  checkHint.hidden = true;
});
const afterScale = createTrustScale("trust-after", (rating) => void recordRerate(rating));

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

/** Clears the result of a run. The first trust rating is kept. */
function resetCheck(): void {
  runId += 1;
  lastOutcome = null;
  quickCheckButton.disabled = trustBefore === null;
  resultView.hidden = true;
  afterScale.reset();
  setText(trustChange, "");
  setText(checkProgress, "");
  setText(checkError, "");
}

/** A new selection starts the whole flow over, including the first rating. */
function resetFlow(): void {
  trustBefore = null;
  beforeScale.reset();
  checkHint.hidden = false;
  resetCheck();
}

function renderSelection(selection: PendingSelection | null): void {
  currentText = selection?.text.trim() ?? "";
  const hasText = currentText.length > 0;

  resetFlow();
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
  if (currentText === "" || trustBefore === null) return;

  resetCheck();
  const thisRun = runId;
  quickCheckButton.disabled = true;
  // The first rating is a commitment: it cannot change once the analysis is requested.
  beforeScale.setDisabled(true);
  setText(checkProgress, "Checking…");

  try {
    const outcome = await quickCheck(currentText, (fraction) => {
      if (thisRun !== runId) return;
      setText(checkProgress, `Downloading Gemini Nano… ${Math.round(fraction * 100)}%`);
    });
    if (thisRun !== runId) return;
    lastOutcome = outcome;
    renderOutcome(outcome);
  } catch (error: unknown) {
    if (thisRun !== runId) return;
    console.error("[Second Look] Quick check failed", error);
    setText(checkError, describeError(error));
    // Nothing was shown, so the user may still change the first rating and retry.
    beforeScale.setDisabled(false);
    quickCheckButton.disabled = false;
  } finally {
    if (thisRun === runId) setText(checkProgress, "");
  }
}

function describeChange(before: number, after: number): string {
  if (after < before) return `Your trust dropped from ${before} to ${after}.`;
  if (after > before) return `Your trust rose from ${before} to ${after}.`;
  return `Your trust stayed at ${after}.`;
}

async function recordRerate(after: number): Promise<void> {
  if (trustBefore === null || lastOutcome === null) return;
  const before = trustBefore;
  const outcome = lastOutcome;

  // One re-rating per check, so the log reflects the first reaction.
  afterScale.setDisabled(true);
  const change = describeChange(before, after);
  trustChange.dataset.direction = after < before ? "down" : after > before ? "up" : "same";
  setText(trustChange, change);

  const entry: TrustLogEntry = {
    at: Date.now(),
    before,
    after,
    engine: outcome.engine,
    flaggedTypes:
      outcome.kind === "result"
        ? outcome.result.claims.filter((claim) => claim.risk !== "low").map((claim) => claim.type)
        : [],
    snippet: makeSnippet(currentText),
  };
  try {
    await appendTrustLog(entry);
    setText(trustChange, `${change} Saved to your trust log on this device.`);
  } catch (error: unknown) {
    console.error("[Second Look] Could not save the trust log entry", error);
    setText(trustChange, `${change} It could not be saved to your trust log.`);
  }
}

// Trust log view

const logDateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });

function createLogItem(entry: TrustLogEntry): HTMLLIElement {
  const item = document.createElement("li");
  item.className = "log-item";
  item.dataset.direction =
    entry.after < entry.before ? "down" : entry.after > entry.before ? "up" : "same";

  const ratings = document.createElement("span");
  ratings.className = "log-ratings";
  ratings.textContent = `${entry.before} → ${entry.after}`;

  const meta = document.createElement("span");
  meta.className = "log-meta";
  const flagged = entry.flaggedTypes.length;
  meta.textContent = [
    logDateFormat.format(entry.at),
    ENGINE_LABELS[entry.engine],
    `${flagged} flagged ${flagged === 1 ? "claim" : "claims"}`,
  ].join(" · ");

  const snippet = document.createElement("p");
  snippet.className = "log-snippet";
  snippet.textContent = entry.snippet;

  item.append(ratings, meta, snippet);
  return item;
}

async function renderLog(): Promise<void> {
  const entries = await loadTrustLog();
  const stats = computeTrustStats(entries);

  logEmpty.hidden = stats.total > 0;
  logContent.hidden = stats.total === 0;
  if (stats.total === 0) return;

  statTotal.textContent = String(stats.total);
  statDropped.textContent = `${stats.dropped} of ${stats.total} (${Math.round(
    (stats.dropped / stats.total) * 100,
  )}%)`;
  const average = stats.averageChange.toFixed(1);
  statAverage.textContent = stats.averageChange > 0 ? `+${average}` : average.replace("-", "−");

  if (stats.flaggedByType.length === 0) {
    const none = document.createElement("li");
    none.textContent = "Nothing flagged yet.";
    statTypes.replaceChildren(none);
  } else {
    statTypes.replaceChildren(
      ...stats.flaggedByType.map(([type, count]) => {
        const row = document.createElement("li");
        const name = document.createElement("span");
        name.textContent = type;
        const total = document.createElement("b");
        total.textContent = String(count);
        row.append(name, total);
        return row;
      }),
    );
  }

  const recent = entries.slice(-TRUST_LOG_VISIBLE).reverse();
  logListHeading.textContent =
    entries.length > recent.length ? `Last ${recent.length} checks` : "Recent checks";
  logList.replaceChildren(...recent.map(createLogItem));
}

function showView(view: "check" | "log"): void {
  const isLog = view === "log";
  checkView.hidden = isLog;
  logView.hidden = !isLog;
  tabCheck.setAttribute("aria-pressed", String(!isLog));
  tabLog.setAttribute("aria-pressed", String(isLog));
  if (isLog) {
    renderLog().catch((error: unknown) => {
      console.error("[Second Look] Could not load the trust log", error);
    });
  }
}

async function clearLog(): Promise<void> {
  if (!confirm("Delete your whole trust log? This cannot be undone.")) return;
  await clearTrustLog();
  await renderLog();
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
  tabCheck.addEventListener("click", () => showView("check"));
  tabLog.addEventListener("click", () => showView("log"));
  clearLogButton.addEventListener("click", () => {
    clearLog().catch((error: unknown) => {
      console.error("[Second Look] Could not clear the trust log", error);
    });
  });
  onPendingSelection((selection) => {
    showView("check");
    renderSelection(selection);
  });
  renderSelection(await loadPendingSelection());
  renderFirebaseStatus(await initFirebase());
}

start().catch((error: unknown) => {
  console.error("[Second Look] Side panel failed to start", error);
  firebaseStatus.dataset.state = "error";
  firebaseStatus.textContent = "Something went wrong. Reopen the side panel.";
});
