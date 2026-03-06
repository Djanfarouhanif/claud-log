(function () {
  // Relay log events from the injected script to the background worker
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.__claudeLogBridge !== true) return;

    chrome.runtime.sendMessage({
      type: "LOG_ENTRY",
      payload: event.data.payload,
    });
  });

  // Ask the background to inject injected.js via chrome.scripting (bypasses CSP)
  chrome.runtime.sendMessage({ type: "INJECT_SCRIPT" });
})();
