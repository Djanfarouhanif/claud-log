import * as vscode from "vscode";
import * as http from "http";
import * as fs from "fs";
import * as path from "path";

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogEntry {
  type: string;
  message: string;
  stack?: string;
  timestamp?: string;
  url?: string;
  tabTitle?: string;
  network?: {
    requestUrl?: string;
    method?: string;
    status?: number;
    statusText?: string;
  };
  [key: string]: unknown;
}

// ─── State ────────────────────────────────────────────────────────────────────

let outputChannel: vscode.OutputChannel;
let watchTimer: ReturnType<typeof setInterval> | undefined;
let statusBarItem: vscode.StatusBarItem;
let lastSeenTimestamp: string | null = null;

// ─── Activation ───────────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Browser Logs (Claude)");

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = "claudeLogBridge.showLogs";
  statusBarItem.text = "$(browser) Logs";
  statusBarItem.tooltip = "Claude Log Bridge — click to show browser logs";
  statusBarItem.show();

  context.subscriptions.push(
    vscode.commands.registerCommand("claudeLogBridge.showLogs", cmdShowLogs),
    vscode.commands.registerCommand("claudeLogBridge.clearLogs", cmdClearLogs),
    vscode.commands.registerCommand("claudeLogBridge.startWatching", cmdStartWatching),
    vscode.commands.registerCommand("claudeLogBridge.stopWatching", cmdStopWatching),
    outputChannel,
    statusBarItem
  );

  // Créer .devtools/browser_logs.txt et CLAUDE.md dans le workspace
  initWorkspaceFiles();

  // Auto-start watching on activation
  startWatching();
}

export function deactivate() {
  stopWatching();
}

// ─── Workspace file init ──────────────────────────────────────────────────────

function initWorkspaceFiles() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return;

  const root = folders[0].uri.fsPath;
  const devtoolsDir = path.join(root, ".devtools");

  // Créer le dossier .devtools s'il n'existe pas
  if (!fs.existsSync(devtoolsDir)) {
    fs.mkdirSync(devtoolsDir, { recursive: true });
  }

  // Créer browser_logs.txt vide s'il n'existe pas
  const logsFile = path.join(devtoolsDir, "browser_logs.txt");
  if (!fs.existsSync(logsFile)) {
    fs.writeFileSync(logsFile, "", "utf-8");
  }

  // Créer CLAUDE.md s'il n'existe pas
  const claudeFile = path.join(devtoolsDir, "CLAUDE.md");
  if (!fs.existsSync(claudeFile)) {
    fs.writeFileSync(claudeFile, CLAUDE_MD_CONTENT, "utf-8");
    vscode.window.showInformationMessage(
      "Claude Log Bridge: fichiers .devtools/ créés dans votre projet."
    );
  }
}

const CLAUDE_MD_CONTENT = `# Browser Log Feed for Claude Code

When the developer asks you to debug a browser error, read the log file below
before responding. It contains real-time output captured from the browser console.

## Log File

.devtools/browser_logs.txt

## Log Format

[ISO-TIMESTAMP] [TYPE ] message  (page url)
          optional stack trace
          Network: METHOD url → STATUS statusText

## Types

- LOG   — console.log
- WARN  — console.warn
- ERROR — console.error / window.onerror
- INFO  — console.info
- DEBUG — console.debug
- NET   — failed fetch / XHR request
- REJCT — unhandled promise rejection

## How to Use

When the developer asks "why is this failing?" or "what does the error say?":
1. Read .devtools/browser_logs.txt
2. Find the most recent ERROR or REJCT entries
3. Use the stack traces and network details to pinpoint the root cause
4. Suggest targeted fixes based on the actual captured logs
`;

// ─── Commands ─────────────────────────────────────────────────────────────────

function cmdShowLogs() {
  outputChannel.show(true);
  fetchAndDisplay();
}

async function cmdClearLogs() {
  const config = getConfig();
  const confirmed = await vscode.window.showWarningMessage(
    "Clear all browser logs from the server and log file?",
    { modal: true },
    "Clear"
  );
  if (confirmed !== "Clear") return;

  httpRequest("DELETE", `${config.serverUrl}/logs`, null)
    .then(() => {
      outputChannel.clear();
      outputChannel.appendLine("[Claude Log Bridge] Logs cleared.");
      lastSeenTimestamp = null;
      updateStatusBar(0);
    })
    .catch(() => vscode.window.showErrorMessage("Could not reach the log server to clear logs."));
}

function cmdStartWatching() {
  startWatching();
  vscode.window.showInformationMessage("Claude Log Bridge: Live watch started.");
}

function cmdStopWatching() {
  stopWatching();
  vscode.window.showInformationMessage("Claude Log Bridge: Live watch stopped.");
}

// ─── Watchers ─────────────────────────────────────────────────────────────────

function startWatching() {
  if (watchTimer) return;
  const config = getConfig();
  watchTimer = setInterval(pollNewLogs, config.pollIntervalMs);
  statusBarItem.text = "$(browser) Logs $(sync~spin)";
}

function stopWatching() {
  if (watchTimer) {
    clearInterval(watchTimer);
    watchTimer = undefined;
  }
  statusBarItem.text = "$(browser) Logs";
}

async function pollNewLogs() {
  const config = getConfig();
  const url = `${config.serverUrl}/logs?limit=${config.maxDisplayedLogs}`;

  try {
    const body = await httpRequest("GET", url, null);
    const parsed = JSON.parse(body) as { logs: LogEntry[]; total: number };
    const entries = parsed.logs;

    const newEntries = lastSeenTimestamp
      ? entries.filter((e) => (e.timestamp ?? "") > lastSeenTimestamp!)
      : entries;

    if (newEntries.length > 0) {
      newEntries.forEach(appendEntry);
      lastSeenTimestamp = newEntries[newEntries.length - 1].timestamp ?? null;
      updateStatusBar(parsed.total);

      statusBarItem.text = "$(browser) Logs $(bell)";
      setTimeout(() => {
        statusBarItem.text = watchTimer ? "$(browser) Logs $(sync~spin)" : "$(browser) Logs";
      }, 1500);
    }
  } catch {
    // Server not running — don't spam notifications
  }
}

async function fetchAndDisplay() {
  const config = getConfig();
  const url = `${config.serverUrl}/logs?limit=${config.maxDisplayedLogs}`;

  try {
    const body = await httpRequest("GET", url, null);
    const parsed = JSON.parse(body) as { logs: LogEntry[]; total: number };
    outputChannel.clear();
    outputChannel.appendLine(`[Claude Log Bridge] Showing ${parsed.logs.length} of ${parsed.total} stored logs\n`);
    parsed.logs.forEach(appendEntry);
    lastSeenTimestamp = parsed.logs.length
      ? parsed.logs[parsed.logs.length - 1].timestamp ?? null
      : null;
    updateStatusBar(parsed.total);
  } catch {
    outputChannel.appendLine("[Claude Log Bridge] ERROR: Cannot reach server at " + config.serverUrl);
    outputChannel.appendLine("  Make sure to run:  cd log-server && python server.py <path-to-your-project>");
  }
}

// ─── Display ──────────────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, string> = {
  error: "✖",
  warn: "⚠",
  warning: "⚠",
  log: "·",
  info: "ℹ",
  debug: "◌",
  network_error: "⛔",
  unhandledrejection: "💥",
};

function appendEntry(entry: LogEntry) {
  const icon = TYPE_ICONS[entry.type] ?? "·";
  const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : "--:--:--";
  const origin = entry.url ? ` [${entry.url}]` : "";

  outputChannel.appendLine(`${icon} ${ts}  ${entry.message}${origin}`);

  if (entry.stack) {
    entry.stack.trim().split("\n").forEach((l) => outputChannel.appendLine("    " + l));
  }
  if (entry.network) {
    const n = entry.network;
    outputChannel.appendLine(
      `    Network: ${n.method ?? ""} ${n.requestUrl ?? ""} → ${n.status ?? ""} ${n.statusText ?? ""}`
    );
  }
}

function updateStatusBar(count: number) {
  const label = watchTimer ? "$(browser) Logs $(sync~spin)" : "$(browser) Logs";
  statusBarItem.text = `${label}  ${count}`;
  statusBarItem.tooltip = `Claude Log Bridge — ${count} total browser logs`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getConfig() {
  const cfg = vscode.workspace.getConfiguration("claudeLogBridge");
  return {
    serverUrl: cfg.get<string>("serverUrl", "http://localhost:8765"),
    pollIntervalMs: cfg.get<number>("pollIntervalMs", 2000),
    logFilePath: cfg.get<string>("logFilePath", ".devtools/browser_logs.txt"),
    maxDisplayedLogs: cfg.get<number>("maxDisplayedLogs", 100),
  };
}

function httpRequest(method: string, url: string, body: string | null): Promise<string> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const options: http.RequestOptions = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": body ? Buffer.byteLength(body) : 0,
      },
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });

    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}
