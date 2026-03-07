# Claude Log Bridge

Pont automatique entre la console du navigateur et VS Code / Claude Code.

---

## Prérequis

- Python 3.10+
- Node.js 18+
- Google Chrome ou Microsoft Edge
- VS Code avec Claude Code installé

---

## Installation (à faire une seule fois)

### 1. Installer les dépendances Python

```bash
cd log-server
pip install -r requirements.txt
```

### 2. Installer l'extension navigateur

1. Ouvre Chrome et va sur `chrome://extensions`
2. Active le **Mode développeur** (interrupteur en haut à droite)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier `browser-extension/`
5. L'extension apparaît dans la liste

> Si l'icône n'est pas visible dans la barre d'outils, clique sur l'icône puzzle 🧩 et épingle **Claude Log Bridge**.

### 3. Installer l'extension VS Code

```bash
cd vscode-extension
npm install
npm run compile
vsce package --allow-missing-repository
code --install-extension claude-log-bridge-1.0.0.vsix
```

Recharge VS Code après l'installation :
```
Ctrl+Shift+P → Developer: Reload Window
```

> L'extension crée automatiquement `.devtools/browser_logs.txt`, `.devtools/CLAUDE.md` et ajoute `.devtools/` au `.gitignore` dans chaque projet que tu ouvres dans VS Code.

---

## Utilisation quotidienne

### Étape 1 — Démarrer le serveur

```bash
cd log-server
python server.py
```

Tu dois voir :
```
Claude Log Bridge server  →  http://127.0.0.1:8765
  JSONL : C:\...\log-server\browser_logs.json
  TXT   : C:\...\log-server\.devtools\browser_logs.txt
```

Quand tu ouvres ton projet dans VS Code, l'extension envoie automatiquement le chemin du workspace au serveur. Le serveur redirige alors ses écritures vers `ton-projet/.devtools/browser_logs.txt`.

> Laisse ce terminal ouvert pendant toute ta session de travail.

---

### Étape 2 — Configurer le site à capturer

1. Ouvre ton app dans Chrome (ex: `http://localhost:4200`)
2. Clique sur l'icône **Claude Log Bridge** dans la barre d'outils Chrome
3. Clique **＋ Ajouter ce site**

Le site apparaît dans la liste "Sites capturés". Les logs sont maintenant envoyés automatiquement au serveur.

> - Si aucun site n'est ajouté → rien n'est capturé
> - Si tu ne vois pas l'extension dans la barre, clique sur 🧩 et épingle-la

---

### Étape 3 — Naviguer sur ton app

Utilise ton application normalement. À chaque chargement de page :

- Les anciens logs sont **automatiquement effacés**
- Les nouveaux logs arrivent en temps réel dans :
  - `log-server/browser_logs.json` — historique complet
  - `ton-projet/.devtools/browser_logs.txt` — format lisible par Claude Code

Ce qui est capturé automatiquement :
- `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`
- Erreurs JavaScript non gérées
- Promesses rejetées
- Requêtes réseau échouées (fetch / XHR)

---

### Étape 4 — Voir les logs dans VS Code

**Option A — Icône dans la barre d'activité**

Clique sur l'icône **Claude Log Bridge** dans la barre d'activité à gauche de VS Code.

**Option B — Palette de commandes**

```
Ctrl+Shift+P → Claude Log Bridge: Show Browser Logs
```

Le panneau "Browser Logs (Claude)" s'ouvre et se met à jour toutes les 2 secondes.

---

### Étape 5 — Demander à Claude Code d'analyser les logs

Quand une erreur apparaît dans le navigateur, dis simplement à Claude Code :

> "Regarde les logs et dis-moi ce qui ne va pas"

Claude Code lit automatiquement `.devtools/browser_logs.txt` grâce au fichier `.devtools/CLAUDE.md` présent dans ton projet, et te donne un diagnostic basé sur les vraies erreurs capturées.

---

## Résumé du workflow

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  INSTALLATION (une seule fois)                              │
│  1. pip install -r requirements.txt                         │
│  2. Charger browser-extension/ dans Chrome                  │
│  3. code --install-extension claude-log-bridge-1.0.0.vsix   │
│                                                             │
│  CHAQUE SESSION                                             │
│  1. python server.py          → démarrer le serveur         │
│  2. Ouvrir ton projet dans VS Code                          │
│     → .devtools/ créé automatiquement                       │
│     → serveur informé du chemin du projet                   │
│  3. Ouvrir Chrome + ton app                                 │
│     → cliquer "Ajouter ce site" (une fois par site)         │
│  4. Coder / tester normalement                              │
│     → les logs arrivent automatiquement                     │
│  5. Erreur ?                                                │
│     → dire à Claude Code "regarde les logs"                 │
│     → Claude analyse et propose un fix                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Structure des fichiers

```
claude-log/
├── browser-extension/        ← extension Chrome/Edge
│   ├── manifest.json
│   ├── background.js         ← service worker, envoie les logs au serveur
│   ├── content.js            ← injecté dans chaque page
│   ├── injected.js           ← intercepte console + fetch + XHR
│   ├── popup.html / popup.js ← interface (ajouter/retirer un site)
│   └── icons/
│
├── log-server/               ← serveur Python local
│   ├── server.py             ← reçoit et stocke les logs
│   ├── requirements.txt
│   └── browser_logs.json     ← historique complet des logs
│
├── vscode-extension/         ← extension VS Code
│   ├── package.json
│   ├── tsconfig.json
│   └── src/extension.ts      ← affiche les logs, crée .devtools/
│
└── (dans ton projet)
    └── .devtools/            ← créé automatiquement par l'extension VS Code
        ├── browser_logs.txt  ← logs en temps réel, lu par Claude Code
        └── CLAUDE.md         ← instructions pour Claude Code
```

---

## Ce que fait chaque composant

| Composant | Rôle |
|-----------|------|
| `injected.js` | Intercepte `console`, `fetch`, `XHR` dans la page |
| `content.js` | Injecte le script dans la page, relaie les messages |
| `background.js` | Filtre par site, POST vers le serveur, efface au chargement |
| `server.py` | Reçoit les logs, écrit dans `.json` et `.txt` |
| `extension.ts` | Affiche les logs dans VS Code, crée `.devtools/`, informe le serveur |
| `browser_logs.txt` | Fichier lu par Claude Code pour analyser les erreurs |
| `CLAUDE.md` | Dit à Claude Code où et comment lire les logs |

---

## Commandes disponibles dans VS Code

| Commande | Description |
|----------|-------------|
| `Claude Log Bridge: Show Browser Logs` | Ouvre le panneau des logs |
| `Claude Log Bridge: Clear Logs` | Efface tous les logs |
| `Claude Log Bridge: Start Live Watch` | Démarre le suivi en temps réel |
| `Claude Log Bridge: Stop Live Watch` | Arrête le suivi |

---

## Dépannage

**Les logs n'arrivent pas**
- Vérifie que le serveur tourne (`python server.py`)
- Vérifie que le site est ajouté dans le popup Chrome (liste "Sites capturés")
- Ouvre les DevTools de ta page → cherche : `[Claude Log Bridge] Console capture active`

**`browser_logs.txt` reste vide**
- Le serveur écrit dans le projet ouvert dans VS Code — vérifie que VS Code a bien ouvert le bon dossier
- Regarde les logs du serveur dans le terminal pour voir le chemin exact utilisé

**L'icône Chrome n'apparaît pas**
- Va sur `chrome://extensions` → clique ↺ pour recharger l'extension
- Clique 🧩 dans Chrome → épingle Claude Log Bridge

**L'extension VS Code ne voit pas les logs**
- Vérifie que le serveur tourne sur le port 8765
- Lance : `Ctrl+Shift+P → Claude Log Bridge: Start Live Watch`

**Erreur CORS**
- Le serveur doit être démarré avec `python server.py`
- Vérifie que l'URL dans les settings VS Code est bien `http://localhost:8765`
