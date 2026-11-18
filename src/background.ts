import { savePendingSelection } from "./storage";

const MENU_ID = "second-look";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Second Look",
    contexts: ["selection"],
  });

  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => {
      console.error("[Second Look] Could not set side panel behavior", error);
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || tab?.windowId === undefined) return;

  // sidePanel.open() must run synchronously inside the user gesture,
  // so it is called before any await.
  chrome.sidePanel.open({ windowId: tab.windowId }).catch((error: unknown) => {
    console.error("[Second Look] Could not open the side panel", error);
  });

  savePendingSelection(info.selectionText ?? "").catch((error: unknown) => {
    console.error("[Second Look] Could not pass the selection", error);
  });
});
