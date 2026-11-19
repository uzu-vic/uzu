# Class Media — photos et vidéos privées des séances

Branche `media/class-media`. Base et stockage **de test uniquement** (`ntypsrdwxrkanahhuixx`). Rien n'est prévu pour la production sans accord explicite.

## Principe

- Le navigateur ne reçoit jamais de lien de stockage ni de chemin de fichier pour **lire** un média. Il demande un jeton opaque de 15 minutes au plus (`media_ticket`).
- La fonction serveur `class-media` (Edge Function) revérifie les droits **en base à chaque requête** (`media_stream_check`) : identité du titulaire du jeton, club, groupe, statut de la séance, validation, demande de retrait. Les vidéos sont servies par morceaux de 2 Mo au plus, chacun revérifié.
- Toutes les réponses portent `Cache-Control: no-store, private` : ni le navigateur ni le réseau de diffusion ne les gardent.
- Après une dépublication, un retrait, une demande de retrait, un refus de validation, un passage en groupe de mineurs ou une sortie du groupe, la **requête suivante** est refusée. La quarantaine (déplacement du fichier) et le passage automatique toutes les 5 minutes sont des compléments, pas la protection principale.
- L'envoi va directement au stockage, à l'emplacement réservé par `media_reserve` (seule règle de stockage ajoutée : envoi, sans lecture, remplacement ni effacement). Le fichier n'est visible qu'après le contrôle de la fonction serveur (`finalize`).

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `db/uzu-13-controle-prealable.sql` | Contrôle en lecture seule, avant tout |
| `db/uzu-13-class-media.sql` | Structure, droits, fonctions, stockage, contrôle, retour arrière commenté |
| `db/uzu-13b-class-media-taches.sql` | Tâches planifiées (pg_cron, pg_net, coffre) |
| `db/uzu-13d-class-media-controles.sql` | Contrôles de sécurité dans l'éditeur SQL (fictifs, annulés à la fin) |
| `db/uzu-13c-class-media-secret.sql` | Vérification du secret des tâches par la base (coffre seul) |
| `supabase/functions/class-media/index.ts`, `handler.ts` | Fonction serveur |
| `supabase/functions/_shared/media-format.ts` | Formats réels, métadonnées, localisation, plages (partagé avec l'application) |
| `lib/uzu/class-media.ts`, `components/uzu/class-media.tsx` | Application |
| `db/class-media/test-base-locale.mjs` | Tests de la base (79) |
| `tests/class_media_unit.mjs` | Tests de la fonction serveur et des formats (45) |
| `tests/class_media_e2e.py` | Parcours de l'interface, base simulée (35) |
| `tests/class_media_live.mjs` | Contrôles sur la base de test réelle, à lancer par le responsable |

## Mise en place sur la base de test (par le responsable)

Chaque commande nomme le projet de test. Ne jamais utiliser l'identifiant de production `ixkewdxtuhxfiodwhhzr`.

1. **Contrôle préalable** : éditeur SQL de la base de test, lancer `db/uzu-13-controle-prealable.sql`. Attendu : `medias_existants = 0`, `journal`, `focus`, `vue_ensemble`, `role_serveur` = true. Envoyer le résultat avant de continuer.
2. **Structure** : lancer `db/uzu-13-class-media.sql`. Contrôle final attendu, dans l'ordre : `true, true, true, true, true, true, false, false, true`.
3. **Outil Supabase** : `npm install -g supabase` (ou `brew install supabase/tap/supabase`), puis `supabase login`.
4. **Réglage de la fonction** : le secret des tâches planifiées n'est **pas** un secret de la fonction ; il n'existe que dans le coffre de la base (étape 6). Seule l'adresse autorisée est à régler :
   ```
   supabase secrets set CLASS_MEDIA_ALLOWED_ORIGINS=<adresse de l'aperçu, ex. https://uzu-git-media-class-media-….vercel.app> --project-ref ntypsrdwxrkanahhuixx
   ```
5. **Déploiement** : depuis le dossier du projet, sur la branche `media/class-media` :
   ```
   supabase functions deploy class-media --no-verify-jwt --project-ref ntypsrdwxrkanahhuixx
   ```
6. **Tâches planifiées** : tableau de bord de la base de test, Database › Extensions, activer `pg_cron` et `pg_net`. Ranger les deux valeurs dans le coffre (lignes en tête de `uzu-13b`), puis lancer `db/uzu-13b-class-media-taches.sql` (attendu : deux tâches actives) et `db/uzu-13c-class-media-secret.sql` (attendu : `true, true, false, false`). Le secret (64 caractères hexadécimaux, `openssl rand -hex 32`) n'est gardé que dans le coffre : la fonction envoie l'empreinte SHA-256 de ce qu'elle reçoit et la base la compare (`class_media_cron_ok`, réservée au rôle serveur). Changer le secret = une seule commande `vault.update_secret`, sans redéploiement. Contrôle : `select public.class_media_call('sweep');` puis `net._http_response`, attendu 200.
7. **Contrôles réels** : sans installation, coller et lancer `db/uzu-13d-class-media-controles.sql` dans l'éditeur SQL de la base de test (personnes fictives, tout est annulé à la fin ; attendu : 36 ✔, dernière ligne « annulation » ✔). Ou bien, depuis un ordinateur avec Node.js : lancer `tests/class_media_live.mjs` (variables en tête du fichier, quatre comptes de test, mots de passe gardés chez soi), puis :
   - ouvrir l'aperçu sur un **iPhone (Safari)**, lire une vidéo de séance, avancer dans la vidéo ;
   - vérifier qu'une **vidéo pédagogique** existante (Contenus) se lit toujours ;
   - ouvrir les journaux de la fonction (Edge Functions › class-media › Logs) et vérifier qu'aucun jeton ni chemin de fichier n'y figure.

## Retour arrière (base de test)

1. `select cron.unschedule('class-media-sweep'); select cron.unschedule('class-media-purge');`
2. `supabase functions delete class-media --project-ref ntypsrdwxrkanahhuixx`
3. Vider les espaces `class-media` et `class-media-quarantine` depuis le tableau de bord (Storage).
4. Lancer les blocs commentés en fin de `db/uzu-13c-class-media-secret.sql` puis de `db/uzu-13-class-media.sql`, puis relancer les sections 2 et 5 de `db/uzu-10-journal.sql` pour remettre `uzu_perm_catalog` et `journal_feed` dans leur version précédente.

## Politique de conservation (D5, à valider juridiquement)

| Donnée | Durée | Paramètre | Effacement |
| --- | --- | --- | --- |
| Médias de séance | 12 mois après la date de la séance | `media_retention_months` | Purge chaque nuit, trace `media.purged` |
| Médias retirés par l'équipe | 7 jours de quarantaine | `quarantine_days` | Purge chaque nuit, trace |
| Retrait demandé puis accepté | Immédiat | — | Fichier effacé au rapprochement suivant, trace |
| Registre (actions, confirmations, demandes traitées, lignes sans contenu des médias effacés) | 36 mois | `log_retention_months` | Purge chaque nuit |
| Jetons de lecture | Expirés depuis plus d'un jour | — | Purge chaque nuit |

- Aucune copie d'un média effacé n'est gardée par UZU. Le registre ne contient ni image ni chemin lisible.
- **Sauvegardes** : les sauvegardes de la base Supabase contiennent les tables (registre, lignes des médias) mais, selon la documentation Supabase, pas les fichiers du stockage ; à confirmer pour l'offre du projet. Après une restauration de la base, relancer `media_purge` puis le rapprochement : les médias marqués effacés ne reviennent pas.
- Les paramètres se modifient par `class_media_settings_set`, réservé à l'administration UZU. La durée des jetons est plafonnée à 900 s par la base.

## Risques et points ouverts

- **Jeton dans l'adresse des vidéos** : un lecteur vidéo ne sait pas envoyer d'en-tête, le jeton figure donc dans l'adresse `stream?t=…`. Nos journaux ne l'écrivent jamais ; le journal des requêtes de la plateforme Supabase peut enregistrer l'adresse complète (consultable par les administrateurs du projet). Contrôlé le 19/11 (test B6) : absent des journaux de la fonction ; reste à consulter le journal général (Logs Explorer). Si le jeton y apparaît, prévoir un intermédiaire (service worker) qui passe le jeton en en-tête. Les photos passent déjà le jeton en en-tête.
- **Jeton transmis à un tiers** : valable pour un seul média, 15 min au plus, et seulement tant que son titulaire reste autorisé.
- **Contenu déjà affiché ou déjà chargé** par le lecteur ne peut pas être repris (capture d'écran, mémoire de l'appareil).
- **Chemin connu de l'auteur de l'envoi** : il est renvoyé à la réservation pour l'envoi direct ; il ne donne aucun droit de lecture.
- **Clés Supabase** : la fonction accepte l'ancienne clé de service (JWT) ou la nouvelle clé secrète (`sb_secret_…`) fournies par Supabase ; à confirmer au déploiement.
- **Performance** : chaque morceau de vidéo est un appel de fonction ; à mesurer (quota de l'offre).
- **HEVC** : certaines vidéos d'iPhone ne se lisent pas sur Android ; aucune conversion n'est faite (D3).
- **Juridique** : rôles du club et d'UZU, autorisations des mineurs, information des familles, contact pour les demandes, analyse d'impact : voir le document d'audit.
