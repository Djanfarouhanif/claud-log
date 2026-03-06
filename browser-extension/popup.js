const toggle      = document.getElementById("enabledToggle");
const actionBtn   = document.getElementById("actionBtn");
const currentHost = document.getElementById("currentHost");
const siteList    = document.getElementById("siteList");
const statusEl    = document.getElementById("serverStatus");

let currentSite = null;
let allowedSites = [];

// ─── Init ─────────────────────────────────────────────────────────────────────

// Get active tab + settings in parallel
Promise.all([
  new Promise((res) => chrome.tabs.query({ active: true, currentWindow: true }, res)),
  new Promise((res) => chrome.runtime.sendMessage({ type: "GET_SETTINGS" }, res)),
]).then(([tabs, settings]) => {
  allowedSites = settings.allowedSites || [];
  toggle.checked = settings.enabled;

  const url = tabs[0]?.url;
  if (url && !url.startsWith("chrome://") && !url.startsWith("chrome-extension://")) {
    currentSite = new URL(url).host;
  }

  render();
});

// Server health
fetch("http://localhost:8765/health")
  .then((r) => {
    statusEl.textContent = r.ok ? "Serveur connecté" : "Erreur serveur";
    statusEl.className = "status " + (r.ok ? "ok" : "err");
  })
  .catch(() => {
    statusEl.textContent = "Serveur non démarré";
    statusEl.className = "status err";
  });

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
  // Current site display
  currentHost.textContent = currentSite || "Page système (non capturable)";

  // Action button
  if (!currentSite) {
    actionBtn.textContent = "Non capturable";
    actionBtn.className = "action-btn";
    actionBtn.disabled = true;
  } else if (allowedSites.includes(currentSite)) {
    actionBtn.textContent = "✕ Retirer ce site";
    actionBtn.className = "action-btn remove";
    actionBtn.disabled = false;
  } else {
    actionBtn.textContent = "＋ Capturer ce site";
    actionBtn.className = "action-btn add";
    actionBtn.disabled = false;
  }

  // Site list
  siteList.innerHTML = "";
  if (allowedSites.length === 0) {
    siteList.innerHTML = '<li class="empty">Aucun filtre — tous les sites capturés</li>';
    return;
  }
  allowedSites.forEach((site) => {
    const li = document.createElement("li");
    li.className = "site-item";
    const isActive = site === currentSite;
    li.innerHTML = `
      <span class="dot ${isActive ? "" : "off"}"></span>
      <span title="${site}">${site}</span>
      <button class="rm" data-site="${site}" title="Supprimer">×</button>
    `;
    siteList.appendChild(li);
  });
  siteList.querySelectorAll(".rm").forEach((btn) => {
    btn.addEventListener("click", () => removeSite(btn.dataset.site));
  });
}

// ─── Actions ──────────────────────────────────────────────────────────────────

actionBtn.addEventListener("click", () => {
  if (!currentSite) return;
  if (allowedSites.includes(currentSite)) {
    removeSite(currentSite);
  } else {
    addSite(currentSite);
  }
});

function addSite(site) {
  allowedSites = [...allowedSites, site];
  saveAndRender();
}

function removeSite(site) {
  allowedSites = allowedSites.filter((s) => s !== site);
  saveAndRender();
}

function saveAndRender() {
  chrome.runtime.sendMessage(
    { type: "UPDATE_SETTINGS", settings: { allowedSites } },
    () => render()
  );
}

toggle.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "UPDATE_SETTINGS", settings: { enabled: toggle.checked } });
});
