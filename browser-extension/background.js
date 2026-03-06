/**
 * Claude Log Bridge - Background Service Worker
 */

const SERVER_URL = "http://localhost:8765/log";

let settings = {
  enabled: true,
  filterTypes: [],
  allowedSites: [],   // empty = capture ALL sites
};

// Load persisted settings on startup
chrome.storage.local.get(["settings"], (result) => {
  if (result.settings) settings = { ...settings, ...result.settings };
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === "LOG_ENTRY") {
    if (!settings.enabled) return;

    const payload = message.payload;

    // ── Site filter ──────────────────────────────────────────────────────────
    if (settings.allowedSites.length > 0) {
      const pageUrl = payload.url || (sender.tab && sender.tab.url) || "";
      const allowed = settings.allowedSites.some((site) => pageUrl.includes(site));
      if (!allowed) return;
    }

    // ── Type filter ──────────────────────────────────────────────────────────
    if (settings.filterTypes.length > 0 && !settings.filterTypes.includes(payload.type)) {
      return;
    }

    // ── Enrich with tab info ─────────────────────────────────────────────────
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
    await fetch(SERVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[Claude Log Bridge] Server unreachable:", err.message);
  }
}
