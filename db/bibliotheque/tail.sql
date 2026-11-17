
commit;

-- Contrôle : doit afficher 12 tables, 3 disciplines, 12 catégories, 70 fiches (60 du document),
-- 4 enchaînements, 33 étapes et la ressource « library » dans le catalogue des droits
select (select count(*) from pg_tables where schemaname = 'public' and (tablename like 'lib\_%' or tablename like 'club\_lib\_%')) as tables_ajoutees,
       (select count(*) from public.lib_disciplines) as disciplines,
       (select count(*) from public.lib_categories) as categories,
       (select count(*) from public.lib_techniques) as fiches,
       (select count(*) from public.lib_techniques where origin = 'document') as fiches_du_document,
       (select count(*) from public.lib_flows) as enchainements,
       (select count(*) from public.lib_flow_steps) as etapes,
       public.uzu_perm_catalog() ? 'library' as droit_bibliotheque;
