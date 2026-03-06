/**
 * Claude Log Bridge - Background Service Worker
 *
 * Receives log entries from content scripts and POSTs them to the local
 * log server at http://localhost:8765/log.
 *
 * Also handles enabling/disabling capture and storing settings.
 */

const SERVER_URL = "http://localhost:8765/log";

// Default settings
let settings = {
  enabled: true,
  filterTypes: [], // empty = capture everything
};

// Load persisted settings on startup
chrome.storage.local.get(["settings"], (result) => {
  if (result.settings) settings = { ...settings, ...result.settings };
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "LOG_ENTRY") {
    if (!settings.enabled) return;

    const payload = message.payload;

    // Apply type filter if configured
    if (settings.filterTypes.length > 0 && !settings.filterTypes.includes(payload.type)) {
      return;
    }

    // Enrich with tab info
    if (sender.tab) {
      payload.tabId = sender.tab.id;
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
    await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Server not running — fail silently so we don't spam the devtools console
    // with recursive errors.
    console.warn("[Claude Log Bridge] Server unreachable:", err.message);
  }
}
