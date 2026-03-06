/**
 * Claude Log Bridge - Background Service Worker
 *
 * allowedSites vide   → rien n'est capturé
 * allowedSites rempli → capture uniquement les sites listés
 */

const SERVER_URL = "http://localhost:8765";

let settings = {
  enabled: true,
  allowedSites: [],
};

chrome.storage.local.get(["settings"], (result) => {
  if (result.settings) settings = { ...settings, ...result.settings };
});

// ─── Clear logs on every page navigation ─────────────────────────────────────
// Using the tabs API instead of content script messages avoids the
// "Extension context invalidated" error that occurs when the extension
// is reloaded while a page is open.

chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  // "loading" fires at the very start of a navigation (before content loads)
  if (changeInfo.status !== "loading") return;

  clearLogs();
});

function clearLogs() {
  fetch(`${SERVER_URL}/logs`, { method: "DELETE" })
    .catch(() => {}); // server may not be running — fail silently
}

// ─── Messages ─────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "INJECT_SCRIPT") {
    if (!sender.tab) return;
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: false },
      files: ["injected.js"],
      world: "MAIN",
    }).catch((err) => {
      console.warn("[Claude Log Bridge] executeScript failed:", err.message);
    });
    return;
  }

  if (message.type === "LOG_ENTRY") {
    if (!settings.enabled) return;

    const payload = message.payload;
    const pageUrl = payload.url || (sender.tab && sender.tab.url) || "";

    const allowed = settings.allowedSites.some((site) => pageUrl.includes(site));
    if (!allowed) return;

    if (sender.tab) {
      payload.tabId    = sender.tab.id;
      payload.tabTitle = sender.tab.title || "";
    }

    sendToServer(payload);
    return;
  }

  if (message.type === "UPDATE_SETTINGS") {
    settings = { ...settings, ...message.settings };
    chrome.storage.local.set({ settings });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === "GET_SETTINGS") {
    sendResponse(settings);
    return true;
  }
});

async function sendToServer(payload) {
  try {
    await fetch(`${SERVER_URL}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[Claude Log Bridge] Server unreachable:", err.message);
  }
}
