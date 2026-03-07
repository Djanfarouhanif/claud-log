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

---

## Utilisation quotidienne

### Étape 1 — Créer les fichiers `.devtools/` dans ton projet

Les fichiers `browser_logs.txt` et `CLAUDE.md` doivent être dans **ton projet**, pas dans le dossier `claude-log/`. Il y a deux façons de les créer :

---

#### Méthode A — Via l'extension VS Code (automatique)

Ouvre ton projet dans VS Code. L'extension crée automatiquement les fichiers au démarrage :

```
ton-projet/
└── .devtools/
    ├── browser_logs.txt   ← créé vide
    └── CLAUDE.md          ← créé avec les instructions pour Claude Code
```

Une notification apparaît : *"Claude Log Bridge: fichiers .devtools/ créés dans votre projet."*

> C'est la méthode recommandée — rien à faire manuellement.

---

#### Méthode B — Via le serveur Python (en passant le chemin)

Lance le serveur en lui indiquant le dossier de ton projet :

```bash
cd log-server
python server.py C:\chemin\vers\ton-projet
```

**Exemple :**
```bash
python server.py C:\projets\mon-app-angular
```

Le serveur crée les mêmes fichiers dans ton projet au démarrage.

> Utile si tu veux créer les fichiers avant même d'ouvrir VS Code.

---

> Laisse le terminal du serveur ouvert pendant toute ta session de travail.

---

### Étape 2 — Configurer le site à capturer

1. Ouvre ton app dans Chrome (ex: `http://localhost:4200`)
2. Clique sur l'icône **Claude Log Bridge** dans la barre d'outils Chrome
3. Clique **＋ Ajouter ce site**

Le site apparaît dans la liste "Sites capturés". Les logs vont maintenant être envoyés automatiquement au serveur.

> Si tu ne vois pas l'extension dans la barre, clique sur 🧩 et épingle-la.

---

### Étape 3 — Naviguer sur ton app

Utilise ton application normalement. À chaque chargement de page :

- Les anciens logs sont **automatiquement effacés**
- Les nouveaux logs arrivent en temps réel dans :
  - `log-server/browser_logs.json` — historique complet
  - `.devtools/browser_logs.txt` — format lisible par Claude Code

Ce qui est capturé automatiquement :
- `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`
- Erreurs JavaScript non gérées
- Promesses rejetées
- Requêtes réseau échouées (fetch / XHR)

---

### Étape 4 — Voir les logs dans VS Code

**Option A — Panneau dédié**

Clique sur l'icône **Claude Log Bridge** dans la barre d'activité à gauche de VS Code (icône navigateur).

**Option B — Palette de commandes**

```
Ctrl+Shift+P → Claude Log Bridge: Show Browser Logs
```

Le panneau "Browser Logs (Claude)" s'ouvre et se met à jour toutes les 2 secondes.

---

### Étape 5 — Demander à Claude Code d'analyser les logs

Quand une erreur apparaît dans le navigateur, dis simplement à Claude Code :

> "Regarde les logs et dis-moi ce qui ne va pas"

Claude Code lit automatiquement `.devtools/browser_logs.txt` et te donne un diagnostic basé sur les vraies erreurs capturées.

---

## Résumé du workflow

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  1. python server.py          → démarrer le serveur     │
│                                                         │
│  2. Ouvrir Chrome + ton app                             │
│     + cliquer "Ajouter ce site" (une fois par site)     │
│                                                         │
│  3. Coder / tester normalement                          │
│     → les logs arrivent automatiquement                 │
│                                                         │
│  4. Erreur ?                                            │
│     → dire à Claude Code "regarde les logs"             │
│     → Claude analyse et propose un fix                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Structure des fichiers

```
claude-log/
├── browser-extension/        ← extension Chrome/Edge
│   ├── manifest.json
│   ├── background.js         ← service worker
│   ├── content.js            ← injecté dans chaque page
│   ├── injected.js           ← intercepte console + fetch
│   ├── popup.html / popup.js ← interface du bouton
│   └── icons/
│
├── log-server/               ← serveur Python local
│   ├── server.py
│   ├── requirements.txt
│   └── browser_logs.json     ← logs enregistrés
│
├── vscode-extension/         ← extension VS Code
│   ├── package.json
│   ├── tsconfig.json
│   └── src/extension.ts
│
└── .devtools/
    ├── browser_logs.txt      ← fichier lu par Claude Code
    └── CLAUDE.md             ← instructions pour Claude Code
```

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

**Les logs n'arrivent pas dans le JSON**
- Vérifie que le serveur tourne (`python server.py`)
- Vérifie que le site est bien ajouté dans le popup de l'extension
- Ouvre la console DevTools de ta page et cherche : `[Claude Log Bridge] Console capture active`

**L'icône Chrome n'apparaît pas**
- Va sur `chrome://extensions` → clique ↺ pour recharger l'extension
- Clique 🧩 dans Chrome → épingle Claude Log Bridge

**L'extension VS Code ne voit pas les logs**
- Vérifie que le serveur tourne sur le port 8765
- Lance : `Ctrl+Shift+P → Claude Log Bridge: Start Live Watch`

**Erreur CORS**
- Le serveur doit être démarré avec `python server.py` (pas avec un autre runner)
- Vérifie que l'URL du serveur dans les settings VS Code est bien `http://localhost:8765`
