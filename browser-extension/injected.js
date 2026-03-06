/**
 * Claude Log Bridge - Injected Page Script
 *
 * Runs in the PAGE's JavaScript context (not the extension's isolated world).
 * Overrides console methods and global error handlers to capture all logs.
 * Relays captured logs back to the content script via window.postMessage.
 */

(function () {
  "use strict";

  const EXTENSION_ID = document.currentScript
    ? document.currentScript.dataset.extensionId
    : null;

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function relay(payload) {
    window.postMessage(
      { __claudeLogBridge: true, payload },
      "*"
    );
  }

  function serialize(value) {
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (value instanceof Error) {
      return `${value.name}: ${value.message}${value.stack ? "\n" + value.stack : ""}`;
    }
    if (typeof value === "object") {
      try {
        return JSON.stringify(value, null, 2);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  function buildEntry(type, args, extra = {}) {
    return {
      type,
      message: Array.from(args).map(serialize).join(" "),
      timestamp: new Date().toISOString(),
      url: window.location.href,
      ...extra,
    };
  }

  // ─── Console override ────────────────────────────────────────────────────────

  const _console = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
  };

  ["log", "warn", "error", "info", "debug"].forEach(function (method) {
    console[method] = function (...args) {
      _console[method](...args); // still print to devtools
      relay(buildEntry(method, args));
    };
  });

  // ─── Unhandled promise rejections ────────────────────────────────────────────

  window.addEventListener("unhandledrejection", function (event) {
    const reason = event.reason;
    relay({
      type: "unhandledrejection",
      message: reason instanceof Error ? reason.message : serialize(reason),
      stack: reason instanceof Error ? reason.stack || "" : "",
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });

  // ─── Global errors ───────────────────────────────────────────────────────────

  window.addEventListener("error", function (event) {
    relay({
      type: "error",
      message: event.message || "Unknown error",
      stack: event.error ? event.error.stack || "" : "",
      source: event.filename || "",
      line: event.lineno || 0,
      column: event.colno || 0,
      timestamp: new Date().toISOString(),
      url: window.location.href,
    });
  });

  // ─── Network errors (fetch & XHR) ────────────────────────────────────────────

  // Patch fetch
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url ?? "";
    const method = args[1]?.method || "GET";
    try {
      const response = await _fetch(...args);
      if (!response.ok) {
        relay({
          type: "network_error",
          message: `fetch ${method} ${url} → ${response.status} ${response.statusText}`,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          network: { requestUrl: url, method, status: response.status, statusText: response.statusText },
        });
      }
      return response;
    } catch (err) {
      relay({
        type: "network_error",
        message: `fetch ${method} ${url} → ${err.message}`,
        stack: err.stack || "",
        timestamp: new Date().toISOString(),
        url: window.location.href,
        network: { requestUrl: url, method, status: 0, statusText: err.message },
      });
      throw err;
    }
  };

  // Patch XMLHttpRequest
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._clbMethod = method;
    this._clbUrl = url;
    return _open.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("loadend", () => {
      if (this.status >= 400 || this.status === 0) {
        relay({
          type: "network_error",
          message: `XHR ${this._clbMethod || "?"} ${this._clbUrl || "?"} → ${this.status} ${this.statusText}`,
          timestamp: new Date().toISOString(),
          url: window.location.href,
          network: {
            requestUrl: this._clbUrl || "",
            method: this._clbMethod || "",
            status: this.status,
            statusText: this.statusText,
          },
        });
      }
    });
    return _send.call(this, ...args);
  };

  _console.log("[Claude Log Bridge] Console capture active on", window.location.href);
})();
