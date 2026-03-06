const toggle = document.getElementById("enabledToggle");
const statusEl = document.getElementById("serverStatus");
const testBtn = document.getElementById("testBtn");

// Load current settings
chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, (settings) => {
  toggle.checked = settings.enabled;
});

// Check server health
fetch("http://localhost:8765/health")
  .then((r) => {
    statusEl.textContent = r.ok ? "Server connected" : "Server error";
    statusEl.className = "status " + (r.ok ? "ok" : "err");
  })
  .catch(() => {
    statusEl.textContent = "Server not running";
    statusEl.className = "status err";
  });

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({
    type: "UPDATE_SETTINGS",
    settings: { enabled: toggle.checked },
  });
});

testBtn.addEventListener("click", () => {
  fetch("http://localhost:8765/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "log",
      message: "Test log from Claude Log Bridge popup",
      timestamp: new Date().toISOString(),
      url: "chrome-extension://popup",
    }),
  })
    .then(() => {
      statusEl.textContent = "Test log sent!";
      statusEl.className = "status ok";
    })
    .catch(() => {
      statusEl.textContent = "Failed — is the server running?";
      statusEl.className = "status err";
    });
});
