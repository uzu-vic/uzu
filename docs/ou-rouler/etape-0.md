# « Où rouler ? » — Étape 0 (cadrage), 20/11/2026

Branche : `feature/ou-rouler`, créée depuis `media/class-media` (dc9798e) — option A validée par Ali.

## Décisions retenues (cahier des charges du 20/11 + étude)

| # | Décision | Retenu |
|---|---|---|
| D1 | Visibilité la plus large | Tous les pratiquants UZU connectés ; jamais le public sans compte. Par défaut : invisible |
| D2 | Âge minimum | 18 ans, déclaration explicite datée ; membres des groupes de mineurs exclus |
| D3 | Localisation | Commune seulement ; distances par tranches ; ville habituelle + ville de déplacement distinctes |
| D4 | Disciplines | Référentiel Bibliothèque `jjb_gi`, `grappling_nogi` ; correspondance créneaux `jjb`/`grappling` ; MMA inactif |
| D5 | Clubs non clients | Fiches créées ou validées par l'équipe UZU (annuaire privé d'abord) |
| D6 | Modération | Référent UZU à désigner par Ali — OUVERT |
| D7 | Branche | A : depuis `media/class-media` |
| D8 | Coordonnées | Partage facultatif, double accord, après confirmation |

## Référentiel des communes

- `db/uzu-14a0-communes.sql` : table `geo_communes`, `geo_commune_search`, `geo_distance_km`.
- `db/data/geo_communes.csv` : 34 875 communes (métropole + DROM, hors COM), générées par `tools/geo/build_communes.py`
  (Etalab découpage administratif 6.0.0, codes-postaux 4.1.2, contours france-geojson). 7 communes nouvelles
  placées au centre de leurs voisines de même code postal.
- Base de test : installé et chargé le 20/11 ; empreinte md5 identique à la copie locale (591d8fe3…) ;
  Grigny–Vitry 14 km, Paris–Marseille 663 km ; aucun accès sans connexion, aucune écriture.

## Maquettes

Canvas « UZU — « Où rouler ? » : maquettes des premiers écrans » (8 écrans téléphone, liens cliquables),
généré par `maquettes-gen.py`. À valider avant l'étape 1.
