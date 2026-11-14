# Fusion UZU — branche `fusion/next`

Branche de travail de la fusion entre l'application actuelle (A) et le nouveau design (B).
**Ne jamais fusionner dans `main` ni mettre en production sans validation explicite.**
Plan complet : document « UZU — Audit comparatif et plan de fusion ».

## Organisation

| Dossier | Contenu |
| --- | --- |
| `app/` | Écrans Next.js (nouvelle application) |
| `components/uzu/` | Composants réels, reliés à Supabase |
| `components/maquette/` | Maquette B d'origine, conservée comme référence graphique (non publiée) |
| `lib/uzu/` | Couche données unique : client Supabase, contexte, droits |
| `legacy/` | Ancienne application A, servie sur `/legacy/` pendant la transition |
| `scripts/prepare-legacy.mjs` | Copie A dans `public/legacy/` en injectant la configuration de l'environnement |
| `archive/api-legacy/` | Anciennes fonctions Vercel (non déployées, à réécrire au lot 6) |

## Variables d'environnement

| Variable | Aperçus (Preview) | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Projet Supabase **de test** | Projet de production (au lot 5 seulement) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé publique du projet de test | Clé publique de production |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Facultatif | Clé publique VAPID actuelle |

Jamais de clé `service_role` ou `sb_secret_` dans ces variables.

## Garde-fous de construction

La construction échoue si :
- les variables Supabase manquent ;
- un aperçu ou un poste local vise la base de production ;
- une clé secrète est fournie ;
- le bloc de configuration de l'ancienne application est introuvable ;
- TypeScript signale une erreur.

## Commandes

```
npm install
cp .env.example .env.local   # valeurs du projet de TEST
npm run dev
npm run build
```

## Règles métier reprises de l'ancienne application

`scripts/extract-core.mjs` extrait automatiquement de `legacy/index.html` (analyse syntaxique) les
catalogues et fonctions du carnet : `lib/uzu/legacy-core.generated.js`, régénéré à chaque construction.
La construction échoue si le code extrait touche à l'écran, au stockage ou au réseau.

## Tests

| Commande | Contenu |
| --- | --- |
| `node tests/equivalence/make-harness.mjs legacy/index.html /tmp/legacy-harness.html` puis `python3 tests/equivalence/legacy_run.py /tmp/legacy-harness.html tests/equivalence/scenarios.json /tmp/legacy-out.json` puis `npx tsx tests/equivalence/new_run.ts tests/equivalence/scenarios.json /tmp/legacy-out.json` | Mêmes saisies dans l'ancienne et la nouvelle application : enregistrements comparés au caractère près |
| `python3 tests/journal_e2e.py` (serveur sur le port 3100) | Saisie de bout en bout, Supabase simulé : documents envoyés, confidentialité, équipe, hors ligne, retour du réseau |
| `python3 tests/athlete_mock_e2e.py` | Accueil et Carnet, Supabase simulé |
