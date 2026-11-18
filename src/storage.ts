// Hand-off of the selected text from the service worker to the side panel.
// Uses chrome.storage.session: in memory only, cleared when the browser closes,
// and not readable by content scripts. The trust log (chrome.storage.local) comes later.

const PENDING_SELECTION_KEY = "pendingSelection";

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
