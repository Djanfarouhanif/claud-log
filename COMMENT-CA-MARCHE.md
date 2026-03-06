# Comment fonctionne Claude Log Bridge

## Le problème résolu

Quand tu débogues une appli web, les erreurs apparaissent dans la console du navigateur.
Pour en parler à Claude Code, tu devais **copier-coller manuellement** ces erreurs.

Ce projet crée un **pont automatique** entre le navigateur et VS Code.

---

## Vue d'ensemble

```
NAVIGATEUR                 SERVEUR LOCAL            VS CODE
──────────────────         ─────────────────        ──────────────────────
Console du navigateur  →   Log Server (Python)  →   Extension VS Code
  console.error()          localhost:8765            Output Channel
  fetch échoué             browser_logs.json         .devtools/browser_logs.txt
  erreur JS                                          └─ Claude Code lit ce fichier
```

---

## Les 3 composants

### 1. L'extension navigateur (`browser-extension/`)

C'est une extension Chrome/Edge qui s'installe une fois et tourne en arrière-plan.

**Ce qu'elle fait :**
- Elle intercepte tous les appels `console.log`, `console.error`, `console.warn`, etc.
- Elle détecte les erreurs JavaScript non gérées (`window.onerror`)
- Elle détecte les promesses rejetées (`unhandledrejection`)
- Elle surveille les requêtes réseau qui échouent (`fetch`, `XMLHttpRequest`)
- Pour chaque événement capturé, elle envoie un JSON au serveur local

**Comment elle intercepte le code de la page :**

> Un problème technique existe : les extensions Chrome tournent dans un contexte isolé,
> séparé du JavaScript de ta page web. Si on override `console` depuis l'extension,
> ça ne capturera pas les appels de *ton* code.

La solution est en deux étapes :
1. `content.js` injecte dynamiquement `injected.js` dans la page via une balise `<script>`
2. `injected.js` tourne dans le même contexte que ta page et peut donc intercepter son `console`

```
Extension (contexte isolé)
  └─ content.js injecte → injected.js (contexte de la PAGE)
                              └─ override console.log, console.error...
                              └─ patch fetch, XMLHttpRequest
                              └─ postMessage vers content.js
                          content.js reçoit → background.js
                                                  └─ POST /log vers le serveur
```

**Format du JSON envoyé :**
```json
{
  "type": "error",
  "message": "Cannot read properties of undefined",
  "stack": "TypeError: ...\n  at handleClick (app.js:42)",
  "timestamp": "2025-06-01T12:34:01.123Z",
  "url": "http://localhost:3000/",
  "tabTitle": "Mon App"
}
```

---

### 2. Le serveur local (`log-server/server.py`)

Un petit serveur Python (FastAPI) qui tourne sur ton ordinateur.

**Ce qu'il fait :**
- Reçoit les logs de l'extension via `POST http://localhost:8765/log`
- Les stocke dans `browser_logs.json` (historique complet en JSON)
- Les écrit dans `.devtools/browser_logs.txt` (format lisible par Claude Code)
- Garde les 500 derniers en mémoire pour les requêtes rapides

**Pourquoi un serveur local et pas un fichier direct ?**

L'extension navigateur ne peut pas écrire directement sur ton disque dur (raisons de sécurité).
Elle peut seulement faire des requêtes HTTP. Le serveur joue le rôle d'intermédiaire.

**Les routes disponibles :**
```
POST   /log          ← reçoit un log de l'extension
GET    /logs         ← retourne les logs récents (utilisé par VS Code)
DELETE /logs         ← efface tout
GET    /health       ← vérifie que le serveur tourne
```

---

### 3. L'extension VS Code (`vscode-extension/`)

Une extension TypeScript qui s'intègre dans VS Code.

**Ce qu'elle fait :**
- Interroge le serveur toutes les 2 secondes pour récupérer les nouveaux logs
- Les affiche dans un panneau dédié "Browser Logs (Claude)"
- Met à jour un compteur dans la barre de statut en bas de VS Code
- Commandes disponibles via `Ctrl+Shift+P` :
  - `Show Browser Logs` — ouvre le panneau
  - `Clear Logs` — efface tout
  - `Start/Stop Live Watch` — active/désactive le suivi en temps réel

---

## Le fichier clé : `.devtools/browser_logs.txt`

C'est **le fichier que Claude Code lit** pour analyser tes erreurs.

Le serveur y écrit chaque log dans un format structuré et lisible :

```
[2025-06-01T12:34:01.123Z] [ERROR] TypeError: Cannot read properties of undefined  (http://localhost:3000/)
          TypeError: Cannot read properties of undefined
              at handleClick (app.js:42:18)
              at HTMLButtonElement.onclick (index.html:15)

[2025-06-01T12:34:05.456Z] [NET  ] fetch GET /api/users → 404 Not Found  (http://localhost:3000/)
          Network: GET /api/users → 404 Not Found
```

Le fichier `.devtools/CLAUDE.md` explique à Claude Code comment lire ce fichier.
Quand Claude Code est actif dans ce projet, il voit automatiquement ce fichier d'instructions.

---

## Flux complet pas à pas

```
1. Tu ouvres ton app dans Chrome
      │
2. L'extension injecte son code dans la page
      │
3. Tu cliques sur un bouton → erreur JavaScript
      │
4. injected.js intercepte console.error()
      │
5. postMessage → content.js → background.js
      │
6. background.js fait POST http://localhost:8765/log
      │
7. Le serveur Python reçoit le JSON
      │
      ├─→ Écrit dans browser_logs.json
      └─→ Écrit dans .devtools/browser_logs.txt
              │
8. L'extension VS Code détecte le nouveau log (polling 2s)
      │
9. Affiche dans le panneau "Browser Logs (Claude)"
      │
10. Tu dis à Claude Code : "Regarde les logs, qu'est-ce qui cloche ?"
      │
11. Claude lit .devtools/browser_logs.txt
      │
12. Claude te donne un diagnostic basé sur la vraie erreur capturée
```

---

## Démarrage rapide

**Terminal 1 — démarrer le serveur :**
```bash
cd log-server
pip install -r requirements.txt
python server.py
```

**Navigateur — installer l'extension :**
```
chrome://extensions → Mode développeur ON → Charger l'extension non empaquetée → dossier browser-extension/
```

**VS Code — compiler et lancer l'extension :**
```bash
cd vscode-extension
npm install
npm run compile
# Appuyer sur F5 pour lancer en mode développement
```

---

## Résumé des fichiers

| Fichier | Rôle |
|---------|------|
| `browser-extension/manifest.json` | Déclare les permissions de l'extension |
| `browser-extension/injected.js` | Override console dans le contexte de la page |
| `browser-extension/content.js` | Injecte le script et relaie les messages |
| `browser-extension/background.js` | Envoie les logs au serveur via HTTP |
| `log-server/server.py` | Reçoit, stocke et expose les logs |
| `log-server/browser_logs.json` | Historique complet en JSON |
| `vscode-extension/src/extension.ts` | Affiche les logs dans VS Code |
| `.devtools/browser_logs.txt` | Feed texte que Claude Code analyse |
| `.devtools/CLAUDE.md` | Instructions pour Claude Code |
