/**
 * Claude Log Bridge - Content Script
 *
 * Injects a script into the page's context to intercept console methods
 * and forward logs to the background service worker.
 *
 * Why inject instead of overriding directly here?
 * Content scripts run in an isolated world. Overriding console here would
 * NOT intercept console calls made by the page's own JavaScript.
 * We inject a <script> tag so our override runs in the page's world.
 */

(function () {
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("injected.js");
  script.dataset.extensionId = chrome.runtime.id;
  (document.head || document.documentElement).appendChild(script);
  script.remove(); // clean up the DOM after injection

  // Listen for log events relayed from the injected script via window messages
  window.addEventListener("message", function (event) {
    if (event.source !== window) return;
    if (!event.data || event.data.__claudeLogBridge !== true) return;

    // Forward the log payload to the background service worker
    chrome.runtime.sendMessage({
      type: "LOG_ENTRY",
      payload: event.data.payload,
    });
  });
})();
