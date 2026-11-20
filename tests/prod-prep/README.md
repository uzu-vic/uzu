# Préparation de la mise en production — preuves (20/11)

Tout ce dossier a été produit SANS accès à la production, sur une copie locale PostgreSQL 16 reconstruite
à partir des scripts déjà passés en production (base d'origine, lots 5 et 6 jusqu'à uzu-8).

| Fichier | Rôle |
| --- | --- |
| `build-prod.sh` | Reconstruit la copie « état de la production » |
| `stubs.sql` | Remplace pg_cron et pg_net (absents en local) par des équivalents inertes |
| `snap.sql`, `data.sql` | Photographie du catalogue (fonctions, règles, droits, colonnes, déclencheurs, espaces) et des données (empreinte par table) |
| `00-base.txt` … `07-*.txt` | Photographies avant puis après chacun des sept scripts |
| `diff.py` | Différences : ce que chaque script ajoute, modifie, supprime ; objets EXISTANTS touchés |
| `avant.txt`, `apres.txt` | Catalogue des droits, modèles de rôle et espaces de stockage, avant/après |
| `R0`…`R3-*.txt` | Scénario retour arrière : base, déployé + données, après retour arrière, après réactivation |
| `new-scripts.mjs`, `compat_test*.mjs` | Tests de base des lots 6 déjà en production, rejoués après installation des sept scripts |
