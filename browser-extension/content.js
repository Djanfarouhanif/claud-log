(function () {
  // Relay log events from the injected script to the background worker
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.__claudeLogBridge !== true) return;

    // Guard: extension context may be invalidated after extension reload
    try {
      chrome.runtime.sendMessage({
        type: "LOG_ENTRY",
        payload: event.data.payload,
      });
    } catch (e) {}
  });

  // Ask the background to inject injected.js via chrome.scripting (bypasses CSP)
  try {
    chrome.runtime.sendMessage({ type: "INJECT_SCRIPT" });
  } catch (e) {}
})();
