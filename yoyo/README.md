# 🎮 YOYO — Jeu de Carrés Multijoueur

> Placez des points sur une grille, formez des carrés, battez votre adversaire !

---

## 📁 Structure du projet

```
yoyo/
├── server.js          # Serveur Node.js (HTTP + WebSocket)
├── package.json       # Dépendances npm
├── public/
│   └── index.html     # Client du jeu (tout-en-un)
└── README.md
```

---

## 🚀 Déploiement rapide (local)

### Prérequis
- **Node.js** v16 ou supérieur → https://nodejs.org
- **npm** (inclus avec Node.js)

### Étapes

```bash
# 1. Aller dans le dossier du projet
cd yoyo

# 2. Installer les dépendances
npm install

# 3. Lancer le serveur
npm start
```

Le serveur démarre sur **http://localhost:3000**

Ouvrez ce lien dans votre navigateur pour jouer.

---

## 🌐 Déploiement en ligne (2 joueurs sur 2 appareils)

Pour jouer entre deux appareils différents, le serveur doit être accessible sur Internet.
Voici les méthodes recommandées :

---

### Option A — Railway (le plus simple, gratuit)

1. Créez un compte sur https://railway.app
2. Connectez votre dépôt GitHub (uploadez le dossier `yoyo/`)
3. Railway détecte automatiquement Node.js
4. Cliquez **Deploy** → vous obtenez une URL publique (ex: `yoyo-game.up.railway.app`)
5. Les WebSockets sont supportés automatiquement ✅

**Variables d'environnement à configurer :**
```
PORT=3000
```

---

### Option B — Render (gratuit, très fiable)

1. Créez un compte sur https://render.com
2. Nouveau service → **Web Service**
3. Connectez votre dépôt GitHub
4. Configurez :
   - **Build Command** : `npm install`
   - **Start Command** : `npm start`
   - **Environment** : Node
5. Déployez → URL publique fournie automatiquement

> ⚠️ Sur le plan gratuit Render, le serveur "dort" après 15 min d'inactivité.
> Utilisez un plan payant pour un jeu en production.

---

### Option C — VPS (Serveur dédié — production)

Si vous avez un VPS (DigitalOcean, OVH, Hetzner, etc.) :

```bash
# Connectez-vous en SSH
ssh user@votre-ip

# Installez Node.js (Ubuntu/Debian)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clonez ou uploadez votre projet
git clone https://github.com/votre-repo/yoyo.git
cd yoyo
npm install

# Lancer avec PM2 (maintien en arrière-plan)
npm install -g pm2
pm2 start server.js --name yoyo
pm2 save
pm2 startup  # pour redémarrage automatique

# Vérifier les logs
pm2 logs yoyo
```

**Configuration Nginx (reverse proxy + HTTPS) :**

```nginx
server {
    listen 80;
    server_name votre-domaine.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Activer HTTPS avec Certbot (Let's Encrypt)
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d votre-domaine.com
```

---

### Option D — Ngrok (test rapide, sans déploiement)

Pour tester rapidement avec un ami sans déployer :

```bash
# Installez ngrok : https://ngrok.com/download
# Lancez d'abord le serveur localement
npm start

# Dans un autre terminal
ngrok http 3000
```

Ngrok vous donne une URL publique temporaire (ex: `https://abc123.ngrok.io`).
Partagez cette URL avec votre adversaire. ✅

---

## ⚙️ Variables d'environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT`   | `3000` | Port du serveur HTTP/WebSocket |

Exemple pour changer le port :
```bash
PORT=8080 npm start
```

---

## 🔌 Architecture WebSocket

```
Joueur A (navigateur)
        │
        │  WebSocket (ws:// ou wss://)
        ▼
┌─────────────────────────────────┐
│     Serveur Node.js             │
│                                 │
│  HTTP  →  sert index.html       │
│  WS    →  gestion des parties   │
│                                 │
│  Rooms (Map) :                  │
│   code → { players, state }     │
└─────────────────────────────────┘
        │
        │  WebSocket
        ▼
Joueur B (navigateur)
```

### Messages WebSocket (Client → Serveur)

| Type | Données | Description |
|------|---------|-------------|
| `CREATE_ROOM` | — | Créer une nouvelle partie |
| `JOIN_ROOM` | `{ code }` | Rejoindre une partie |
| `START_AI_GAME` | — | Jouer contre l'IA |
| `PLACE_POINT` | `{ x, y }` | Placer un point |
| `ABANDON` | — | Abandonner la partie |
| `PING` | — | Keepalive |

### Messages WebSocket (Serveur → Client)

| Type | Description |
|------|-------------|
| `ROOM_CREATED` | Partie créée, code fourni |
| `ROOM_JOINED` | Connexion à la partie réussie |
| `AI_GAME_READY` | Partie IA prête |
| `GAME_START` | La partie commence |
| `STATE_UPDATE` | Mise à jour complète de l'état |
| `SQUARES_FORMED` | Un ou plusieurs carrés formés |
| `GAME_OVER` | Fin de partie avec scores |
| `OPPONENT_DISCONNECTED` | L'adversaire s'est déconnecté |
| `ERROR` | Message d'erreur |

---

## 🎮 Modes de jeu

### Multijoueur (2 joueurs, 2 appareils)
1. **Joueur A** clique "Lancer une partie" → reçoit un code à 4 chiffres
2. **Joueur A** partage le code avec **Joueur B**
3. **Joueur B** clique "Rejoindre" et entre le code
4. La partie démarre automatiquement

### Solo contre IA
- Cliquez "Jouer contre l'IA"
- L'IA (Yoyo IA) joue intelligemment : complète ses carrés en priorité, bloque les vôtres, puis joue aléatoirement

---

## 📱 Contrôles

| Appareil | Navigation | Placer un point |
|----------|------------|-----------------|
| Mobile   | Pinch pour zoomer, glisser pour déplacer | Tap sur une intersection |
| PC       | Molette pour zoomer, clic droit pour déplacer | Clic gauche sur une intersection |
| Tous     | Bouton 🏠 pour recentrer | — |

---

## 🛠️ Développement

```bash
# Mode développement (rechargement automatique)
npm run dev
```

Nécessite `nodemon` (installé comme devDependency).

---

## 📋 Règles du jeu

- Chaque joueur pose un point à son tour (8 secondes max par tour)
- 4 points de même couleur alignés forment un carré → +1 point
- Les carrés sont de taille 1×1 cellule
- Un point peut contribuer à plusieurs carrés
- La partie dure **10 minutes**
- Le joueur avec le plus de carrés gagne

---

## 🔒 Notes de sécurité pour la production

1. Ajoutez un **rate limiting** sur les connexions WebSocket
2. Limitez le nombre de rooms simultanées
3. Validez toutes les entrées côté serveur (déjà fait pour `x`, `y`)
4. Utilisez **HTTPS/WSS** en production (obligatoire pour les navigateurs modernes)
5. Configurez un **reverse proxy** (Nginx) devant Node.js

---

## 🐛 Dépannage

**Le jeu ne se connecte pas :**
- Vérifiez que le serveur tourne (`npm start`)
- Vérifiez que le port 3000 n'est pas bloqué par un firewall
- En production, vérifiez que votre hébergeur supporte les WebSockets

**Les WebSockets ne fonctionnent pas derrière un proxy :**
- Ajoutez les headers `Upgrade` dans votre configuration Nginx (voir ci-dessus)
- Certains hébergeurs nécessitent l'activation explicite des WebSockets

**Le jeu lag sur mobile :**
- Réduisez le zoom ou utilisez le bouton 🏠 pour recentrer la vue
- Vérifiez votre connexion réseau (le jeu nécessite une connexion stable)
