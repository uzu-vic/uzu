-- =========================================================================================
-- UZU — « OÙ ROULER ? » ÉTAPE 0 : RÉFÉRENTIEL DES COMMUNES
--   • Table de référence publique (données ouvertes), sans aucune donnée personnelle.
--   • Une ligne par commune actuelle de métropole et des départements d'outre-mer (34 875).
--   • lat / lon = CENTRE de la commune, arrondi à 0,01° (environ 1 km) : sert seulement à
--     calculer des distances de commune à commune. Jamais la position d'une personne.
--   • Sources : Etalab, découpage administratif 6.0.0 (codes, noms, départements, codes postaux,
--     population) ; centres calculés à partir des contours communaux (france-geojson).
--     Générateur : tools/geo/build_communes.py ; données : db/data/geo_communes.csv.
--   • Lecture : personnes connectées. Aucune écriture depuis l'application.
-- Ajout seul : aucune table, donnée ou règle existante n'est touchée. Rejouable.
-- Les lignes sont chargées à part (fichier CSV), voir le contrôle en fin de script.
-- =========================================================================================
begin;

create table if not exists public.geo_communes (
  insee        text primary key check (insee ~ '^[0-9][0-9AB][0-9]{3}$'),
  nom          text not null,
  departement  text not null,
  code_postal  text not null default '',
  population   integer not null default 0,
  lat          numeric(5,2) not null check (lat between -90 and 90),
  lon          numeric(5,2) not null check (lon between -180 and 180)
);
create index if not exists geo_communes_nom_idx on public.geo_communes (lower(nom) text_pattern_ops);
create index if not exists geo_communes_cp_idx on public.geo_communes (code_postal);

alter table public.geo_communes enable row level security;
revoke all on public.geo_communes from anon, authenticated;
grant select on public.geo_communes to authenticated;
drop policy if exists uzu_geo_communes_select on public.geo_communes;
create policy uzu_geo_communes_select on public.geo_communes for select to authenticated using (true);

-- Recherche d'une commune par début de nom ou de code postal (sans accents ni majuscules)
create or replace function public.geo_commune_search(p_q text, p_limit int default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  with q as (select lower(translate(btrim(coalesce(p_q, '')), 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ''-', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC  ')) s)
  select coalesce(jsonb_agg(jsonb_build_object('insee', insee, 'nom', nom, 'departement', departement, 'code_postal', code_postal) order by population desc), '[]'::jsonb)
  from (select c.* from public.geo_communes c, q
         where length(q.s) >= 2
           and (lower(translate(c.nom, 'àâäéèêëîïôöùûüçÀÂÄÉÈÊËÎÏÔÖÙÛÜÇ''-', 'aaaeeeeiioouuucAAAEEEEIIOOUUUC  ')) like q.s || '%'
                or c.code_postal like q.s || '%')
         order by c.population desc limit least(greatest(coalesce(p_limit, 10), 1), 20)) x
$$;

-- Distance en km entre deux communes (centres), arrondie ; null si l'une est inconnue
create or replace function public.geo_distance_km(p_a text, p_b text) returns integer
language sql stable security definer set search_path = public as $$
  select round(6371 * 2 * asin(sqrt(power(sin(radians(b.lat - a.lat) / 2), 2)
         + cos(radians(a.lat)) * cos(radians(b.lat)) * power(sin(radians(b.lon - a.lon) / 2), 2))))::int
  from public.geo_communes a, public.geo_communes b where a.insee = p_a and b.insee = p_b
$$;

revoke all on function public.geo_commune_search(text, int) from public, anon;
revoke all on function public.geo_distance_km(text, text) from public, anon;
grant execute on function public.geo_commune_search(text, int) to authenticated;
grant execute on function public.geo_distance_km(text, text) to authenticated;

commit;

-- Contrôle (après chargement du CSV) : 34 875 communes, Grigny–Vitry ≈ 14 km, Paris–Marseille ≈ 660 km
select (select count(*) from public.geo_communes) as communes,
       public.geo_distance_km('91286', '94081') as grigny_vitry_km,
       public.geo_distance_km('75056', '13055') as paris_marseille_km,
       (select jsonb_array_length(public.geo_commune_search('evry', 5))) as recherche_evry;
