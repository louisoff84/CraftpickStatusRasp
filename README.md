# CraftpickStatusRasp

Dashboard web léger pour afficher l'état d'un Raspberry Pi.

## Fonctionnalités

- CPU et charge système
- RAM utilisée
- espace disque de /
- température CPU
- uptime
- architecture et version Node.js
- interfaces IPv4
- actualisation automatique toutes les 3 secondes
- interface responsive
- aucune dépendance npm

## Installation

Cloner le dépôt, entrer dans le dossier puis lancer :

    npm start

Le dashboard est disponible sur http://IP_DU_RASPBERRY:3000.

Pour changer le port :

    PORT=8080 npm start

## systemd

Créer /etc/systemd/system/craftpick-status.service avec un service Node.js pointant vers server.js, puis activer le service avec :

    sudo systemctl daemon-reload
    sudo systemctl enable --now craftpick-status

Le serveur écoute sur 0.0.0.0 par défaut.
