// Two stores:
// - chrome.storage.session: hand-off of the selected text from the service worker to the
//   side panel. In memory only, cleared when the browser closes, not readable by content scripts.
// - chrome.storage.local: the trust log. Stays on this device, never uploaded.
import type { Engine } from "./ai";
import { CLAIM_TYPES, type ClaimType } from "./prompts";

const PENDING_SELECTION_KEY = "pendingSelection";
const TRUST_LOG_KEY = "trustLog";

export interface PendingSelection {
  readonly text: string;
  /** Epoch ms. Also makes re-selecting the same text fire a change event. */
  readonly selectedAt: number;
}

function isPendingSelection(value: unknown): value is PendingSelection {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.text === "string" &&
    typeof candidate.selectedAt === "number"
  );
}

export async function savePendingSelection(text: string): Promise<void> {
  const selection: PendingSelection = { text, selectedAt: Date.now() };
  await chrome.storage.session.set({ [PENDING_SELECTION_KEY]: selection });
}

export async function loadPendingSelection(): Promise<PendingSelection | null> {
  const stored = await chrome.storage.session.get(PENDING_SELECTION_KEY);
  const value: unknown = stored[PENDING_SELECTION_KEY];
  return isPendingSelection(value) ? value : null;
}

export function onPendingSelection(
  listener: (selection: PendingSelection) => void,
): void {
  chrome.storage.session.onChanged.addListener((changes) => {
    const value: unknown = changes[PENDING_SELECTION_KEY]?.newValue;
    if (isPendingSelection(value)) listener(value);
  });
}

// Trust log

export const TRUST_MIN = 1;
export const TRUST_MAX = 5;
/** Entries kept for the stats. The panel lists the newest `TRUST_LOG_VISIBLE`. */
export const TRUST_LOG_LIMIT = 200;
export const TRUST_LOG_VISIBLE = 20;
const SNIPPET_CHARS = 80;

export interface TrustLogEntry {
  /** Epoch ms of the re-rating. */
  readonly at: number;
  readonly before: number;
  readonly after: number;
  readonly engine: Engine;
  /** One item per claim flagged medium or high risk. */
  readonly flaggedTypes: readonly ClaimType[];
  /** Start of the checked text, so the user can recognize the check. */
  readonly snippet: string;
}

export interface TrustStats {
  readonly total: number;
  readonly dropped: number;
  readonly raised: number;
  readonly unchanged: number;
  /** Mean of (after - before). 0 when the log is empty. */
  readonly averageChange: number;
  /** Most flagged first. Types that were never flagged are left out. */
  readonly flaggedByType: readonly (readonly [ClaimType, number])[];
}

function isTrustRating(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= TRUST_MIN &&
    value <= TRUST_MAX
  );
}

function isClaimType(value: unknown): value is ClaimType {
  return typeof value === "string" && CLAIM_TYPES.includes(value as ClaimType);
}

function isTrustLogEntry(value: unknown): value is TrustLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.at === "number" &&
    isTrustRating(entry.before) &&
    isTrustRating(entry.after) &&
    (entry.engine === "on-device" || entry.engine === "cloud") &&
    Array.isArray(entry.flaggedTypes) &&
    entry.flaggedTypes.every(isClaimType) &&
    typeof entry.snippet === "string"
  );
}

export function makeSnippet(text: string): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= SNIPPET_CHARS) return collapsed;
  return `${collapsed.slice(0, SNIPPET_CHARS).trimEnd()}…`;
}

/** Oldest first. */
export async function loadTrustLog(): Promise<TrustLogEntry[]> {
  const stored = await chrome.storage.local.get(TRUST_LOG_KEY);
  const value: unknown = stored[TRUST_LOG_KEY];
  return Array.isArray(value) ? value.filter(isTrustLogEntry) : [];
}

export async function appendTrustLog(entry: TrustLogEntry): Promise<void> {
  const entries = [...(await loadTrustLog()), entry].slice(-TRUST_LOG_LIMIT);
  await chrome.storage.local.set({ [TRUST_LOG_KEY]: entries });
}

export async function clearTrustLog(): Promise<void> {
  await chrome.storage.local.remove(TRUST_LOG_KEY);
}

export function computeTrustStats(entries: readonly TrustLogEntry[]): TrustStats {
  let dropped = 0;
  let raised = 0;
  let changeSum = 0;
  const flagged = new Map<ClaimType, number>();

  for (const entry of entries) {
    const change = entry.after - entry.before;
    changeSum += change;
    if (change < 0) dropped += 1;
    if (change > 0) raised += 1;
    for (const type of entry.flaggedTypes) {
      flagged.set(type, (flagged.get(type) ?? 0) + 1);
    }
  }

  const total = entries.length;
  return {
    total,
    dropped,
    raised,
    unchanged: total - dropped - raised,
    averageChange: total === 0 ? 0 : changeSum / total,
    flaggedByType: [...flagged.entries()].sort((a, b) => b[1] - a[1]),
  };
}
