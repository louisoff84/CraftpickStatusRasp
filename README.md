# CraftpickStatusRasp

Monitoring et status pages inspirés d'Uptime Kuma, optimisés pour un Raspberry Pi 3 A+.

## Fonctionnalités

- Dashboard public de statut
- Monitors **HTTP / HTTPS**
- Monitors **HTTP + Keyword**
- Monitors **TCP**
- Monitors **Ping**
- Intervalle et timeout configurables par monitor
- Historique des checks
- Uptime et temps de réponse
- Tags
- Détection des changements UP/DOWN
- Notifications Discord via webhook
- Incidents manuels avec niveaux mineur / majeur / critique
- Maintenance planifiée
- Plusieurs Status Pages publiques
- Administration protégée par mot de passe
- Protection basique contre le brute-force du login
- Données persistantes dans `data/`
- Aucune dépendance npm externe

## Installation

```bash
git clone https://github.com/louisoff84/CraftpickStatusRasp.git
cd CraftpickStatusRasp
export ADMIN_PASSWORD='CHANGE-ME'
npm start
```

Page publique : `http://IP_DU_RASPBERRY:3000`

Administration : `http://IP_DU_RASPBERRY:3000/admin`

Les Status Pages créées depuis l'administration sont accessibles avec :

```
/status/slug
```

## systemd

Exemple :

```ini
[Unit]
Description=Craftpick Status
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/CraftpickStatusRasp
ExecStart=/usr/bin/node /opt/CraftpickStatusRasp/server.js
Environment=NODE_ENV=production
Environment=ADMIN_PASSWORD=CHANGE-ME
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Puis :

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now craftpick-status
```

Pour une exposition Internet, utilise HTTPS devant Node.js (Caddy, Nginx ou Cloudflare Tunnel) et ne mets jamais le mot de passe dans Git.

## Limites actuelles

Ce projet reproduit les fonctions principales d'un outil de status/monitoring de type Uptime Kuma, mais ce n'est pas un fork d'Uptime Kuma et ne prétend pas reproduire 100 % de ses intégrations et protocoles.
