// Vidéos pédagogiques de la Bibliothèque (uzu-9b) — contrôles sur une copie locale de la base.
// Lancer depuis /home/claude/pgtest6 (base.mjs + pglite) : node /home/claude/uzu-repo/db/bibliotheque/test-videos-locale.mjs
import fs from "fs";
import { makeDb, U, as } from "/home/claude/pgtest6/base.mjs";
const db = await makeDb(); const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + JSON.stringify(g))) };
const t = async (uid, sql, p) => { try { return { rows: (await as(db, uid, sql, p)).rows } } catch (e) { return { err: e.message } } };
const rd = f => fs.readFileSync(f, "utf8");
await db.exec("create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); insert into storage.buckets values ('videos','videos',false,null,null) on conflict do nothing; alter table storage.objects add column if not exists metadata jsonb;");
await db.exec(rd("/home/claude/lot6/uzu-6-securite.sql").split("-- 6. Contrôle")[0].replace(/-- -+\s*$/, ""));
await db.exec(rd("/home/claude/uzu-repo/db/uzu-9-bibliotheque.sql"));

const A1 = U("a1"), B1 = U("b1"), B2 = U("b2"), D1 = U("d1"), I1 = U("c1"), I2 = U("c2"), X1 = U("e1");
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${D1}','d1@x.fr','{"name":"Autre"}'),('${I1}','i1@x.fr','{"name":"Prof Un"}'),('${I2}','i2@x.fr','{"name":"Prof Deux"}'),('${X1}','x1@x.fr','{"name":"Sans club"}');`);
await as(db, D1, "select public.create_new_club('Club Autre', 'AUTRE-2027')");
const CA = (await db.query("select academy_id from public.academy_members where user_id=$1", [A1])).rows[0].academy_id;
const CD = (await db.query("select academy_id from public.academy_members where user_id=$1", [D1])).rows[0].academy_id;
for (const [u, n] of [[I1, "Prof Un"], [I2, "Prof Deux"]]) {
  await db.query("insert into public.profiles (user_id, club_id, role, display_name) values ($1,$2,'coach',$3) on conflict (user_id) do update set club_id=excluded.club_id, role=excluded.role", [u, CA, n]);
  await db.query("insert into public.academy_members (academy_id, user_id, role, display_name) values ($1,$2,'instructor',$3)", [CA, u, n]);
}
const mI1 = (await db.query("select id from public.academy_members where user_id=$1", [I1])).rows[0].id;
await t(A1, "select public.set_member_permissions($1, $2::jsonb)", [mI1, JSON.stringify([{ r: "library", a: "approve", s: "academy" }])]);

// Vidéos pédagogiques EXISTANTES (ancienne application) : doivent rester strictement identiques
await db.query("insert into storage.objects (bucket_id, name, metadata) values ('videos', $1, '{\"size\": 1000, \"mimetype\": \"video/mp4\"}'), ('videos', 'ancienne-racine.mp4', '{\"size\": 900, \"mimetype\": \"video/mp4\"}')", [CA + "/lx2k-abc123.mp4"]);
await db.query("insert into public.docs (path, data) values ($1, $2)", ["videos/" + CA + "/sys-garde", JSON.stringify({ id: CA + "/lx2k-abc123.mp4", uploadedAt: "2026-10-01T00:00:00Z" })]);
const snapOld = async () => (await db.query(`select md5(coalesce(string_agg(bucket_id||name||coalesce(metadata::text,''), '|' order by name), '')) o,
  (select md5(string_agg(path||data::text, '|' order by path)) from public.docs) d,
  (select md5(string_agg(policyname||cmd||coalesce(qual,'')||coalesce(with_check,''), '|' order by policyname)) from pg_policies where schemaname='storage' and policyname like 'uzu_videos%') p
  from storage.objects where name not like '%/lib/%'`)).rows[0];
const before = await snapOld();

// Installation
const s = rd("/home/claude/uzu-repo/db/uzu-9b-bibliotheque-videos.sql");
await db.exec(s);
let ctl = (await db.query(s.split("commit;")[1])).rows[0];
ok("installation : 1 table, 2 règles ajoutées, 3 règles existantes conservées, stockage privé, rien dans Class Media",
  ctl.table_ajoutee == 1 && ctl.regles_ajoutees == 2 && ctl.regles_existantes == 3 && ctl.stockage_prive && ctl.rien_dans_class_media, ctl);
await db.exec(s);
ok("script rejouable", (await db.query(s.split("commit;")[1])).rows[0].regles_ajoutees == 2);
ok("vidéos existantes, références et règles existantes inchangées après installation", JSON.stringify(await snapOld()) === JSON.stringify(before));

// Réservation
const res = (u, kind, target, o = {}) => t(u, "select public.library_video_reserve($1,$2,$3,$4,$5,$6,$7) j",
  [kind, target, o.mime || "video/mp4", o.size || 2000000, o.title ?? "Démonstration", o.rights ?? true, o.replaces || null]);
ok("élève : ne peut pas ajouter de vidéo", !!(await res(B1, "technique", "G17")).err);
ok("professeur sans droit Bibliothèque : refusé", !!(await res(I2, "technique", "G17")).err);
ok("personne sans club : refusée", !!(await res(X1, "technique", "G17")).err);
ok("visiteur non connecté : refusé", !!(await res(null, "technique", "G17")).err);
let r = await res(I1, "technique", "G17", { rights: false });
ok("sans déclaration d'accord des personnes filmées : refusé", /accord/.test(r.err || ""), r);
ok("format non vidéo refusé", /Format/.test((await res(I1, "technique", "G17", { mime: "image/png" })).err || ""));
ok("plus de 50 Mo refusé", /50 Mo/.test((await res(I1, "technique", "G17", { size: 52428801 })).err || ""));
ok("fiche inconnue refusée", !!(await res(I1, "technique", "ZZ99")).err);
ok("fiche archivée refusée", !!(await res(I1, "technique", "G31")).err);
ok("enchaînement inconnu refusé", !!(await res(I1, "flow", "FC99")).err);
r = await res(I1, "technique", "G17"); const v1 = r.rows?.[0]?.j;
ok("professeur autorisé : réservation dans le stockage pédagogique, sous-dossier Bibliothèque du club",
  v1?.bucket === "videos" && v1.path === CA + "/lib/" + v1.id + ".mp4" && v1.poster_path === CA + "/lib/" + v1.id + ".jpg", r);
ok("responsable du club : peut aussi ajouter (droit « gérer »)", !!(await res(A1, "flow", "FC1")).rows?.[0]?.j?.id);
ok("vidéo en attente invisible des élèves", (await t(B1, "select count(*)::int n from public.club_lib_videos")).rows[0].n === 0);

// Envoi dans le stockage
const put = (u, name, size, mime) => t(u, "insert into storage.objects (bucket_id, name, metadata) values ('videos', $1, $2::jsonb)", [name, JSON.stringify({ size, mimetype: mime })]);
ok("stockage : envoi refusé à l'élève, même à l'emplacement réservé", !!(await put(B1, v1.path, 2000000, "video/mp4")).err);
ok("stockage : règle Bibliothèque refusée hors emplacement réservé", (await t(I1, "select public.uzu_lib_video_upload_ok($1) a, public.uzu_lib_video_upload_ok($2) b, public.uzu_lib_video_upload_ok($3) c",
  [CA + "/lib/autre.mp4", CA + "/lx2k-abc123.mp4", "ancienne-racine.mp4"])).rows.every(x => !x.a && !x.b && !x.c));
ok("stockage : règle Bibliothèque refusée à un autre professeur pour la réservation d'I1", (await t(I2, "select public.uzu_lib_video_upload_ok($1) a", [v1.path])).rows[0].a === false);
ok("stockage : envoi accepté à l'auteur, à l'emplacement réservé (vidéo et miniature)", !(await put(I1, v1.path, 2000000, "video/mp4")).err && !(await put(I1, v1.poster_path, 40000, "image/jpeg")).err);

// Confirmation
r = await t(I2, "select public.library_video_confirm($1, 12.3, 1280, 720) j", [v1.id]);
ok("confirmation par une autre personne refusée", !!r.err);
r = await t(I1, "select public.library_video_confirm($1, 12.34, 1280, 720) j", [v1.id]);
ok("confirmation : fichier vérifié (taille, type), vidéo en ligne en position 1 avec sa miniature", r.rows?.[0]?.j?.ok === true && (await db.query("select status, position, poster_path, duration_s::text d from public.club_lib_videos where id=$1", [v1.id])).rows[0].status === "ready", r);
ok("… la vidéo n'a plus besoin de règle d'envoi (réservation consommée)", (await t(I1, "select public.uzu_lib_video_upload_ok($1) a", [v1.path])).rows[0].a === false);
r = await res(I1, "technique", "G17", { size: 3000000 }); const bad = r.rows[0].j;
await put(I1, bad.path, 2999999, "video/mp4");
r = await t(I1, "select public.library_video_confirm($1, 5, 640, 360) j", [bad.id]);
ok("taille différente de l'annonce : refusée, fichier signalé à effacer", r.rows?.[0]?.j?.ok === false && r.rows[0].j.cleanup.includes(bad.path), r);
r = await res(I1, "technique", "G17"); const nofile = r.rows[0].j;
r = await t(I1, "select public.library_video_confirm($1, 5, 640, 360) j", [nofile.id]);
ok("fichier jamais reçu : refusé proprement", r.rows?.[0]?.j?.ok === false && /non reçu/.test(r.rows[0].j.msg), r);
r = await res(I1, "technique", "G17"); const v2 = r.rows[0].j;
await put(I1, v2.path, 2000000, "video/mp4"); await put(I1, v2.poster_path, 2000000, "image/jpeg");
r = await t(I1, "select public.library_video_confirm($1, null, null, null) j", [v2.id]);
ok("miniature trop lourde : écartée, la vidéo reste en ligne sans miniature", r.rows[0].j.ok && r.rows[0].j.cleanup.includes(v2.poster_path) && (await db.query("select poster_path from public.club_lib_videos where id=$1", [v2.id])).rows[0].poster_path === null, r);
r = await res(I1, "technique", "G17", { mime: "video/webm" }); const v3 = r.rows[0].j;
await put(I1, v3.path, 2000000, "video/webm"); await t(I1, "select public.library_video_confirm($1, 3, 640, 360)", [v3.id]);
const list = async (u, target = "G17") => (await t(u, "select id, title, position from public.club_lib_videos where technique_id=$1 order by position", [target])).rows;
let L = await list(B1);
ok("plusieurs vidéos sur une même fiche : 3 en ligne, dans l'ordre d'ajout", L?.length === 3 && L.map(x => x.id).join() === [v1.id, v2.id, v3.id].join(), L);
ok("élève d'un autre groupe du même club : voit aussi les vidéos de la fiche", (await list(B2)).length === 3);
ok("autre club, personne sans club : ne voient rien", (await list(D1)).length === 0 && (await list(X1)).length === 0);
ok("visiteur non connecté : aucun accès", !!(await t(null, "select count(*) from public.club_lib_videos")).err);
ok("lecture du fichier : élève du club oui (règle existante), autre club non", (await t(B1, "select count(*)::int n from storage.objects where name=$1", [v1.path])).rows[0].n === 1 && (await t(D1, "select count(*)::int n from storage.objects where name=$1", [v1.path])).rows[0].n === 0);
ok("aucune écriture directe dans la table, même pour le responsable", !!(await t(A1, "update public.club_lib_videos set title='x'")).err || (await db.query("select count(*)::int n from public.club_lib_videos where title='x'")).rows[0].n === 0);

// Titre et ordre
ok("titre modifiable par le professeur autorisé", !(await t(I1, "select public.library_video_update($1, 'Entrée en Torreando', 0)", [v1.id])).err);
ok("titre et ordre : refusés à l'élève et au prof sans droit", !!(await t(B1, "select public.library_video_update($1, 'x', 0)", [v1.id])).err && !!(await t(I2, "select public.library_video_update($1, null, 1)", [v1.id])).err);
await t(I1, "select public.library_video_update($1, null, -1)", [v3.id]);
L = await list(B1);
ok("déplacer la 3e vidéo d'un cran vers le haut", L.map(x => x.id).join() === [v1.id, v3.id, v2.id].join() && L[0].title === "Entrée en Torreando", L);

// Repères de la fiche modifiés : vidéos conservées
await t(I1, "select public.library_set_details('G17','1. Saisir les genoux','Dos droit',2)");
ok("modifier la fiche (repères du club) : vidéos conservées", (await list(B1)).length === 3);

// Remplacement
r = await res(I1, "technique", "G17", { replaces: v1.id, title: "" }); const v1b = r.rows[0].j;
ok("remplacement réservé : l'ancienne vidéo reste en ligne pendant l'envoi", (await list(B1)).some(x => x.id === v1.id));
await put(I1, v1b.path, 2000000, "video/mp4");
r = await t(I1, "select public.library_video_confirm($1, 9, 1080, 1920) j", [v1b.id]);
L = await list(B1);
ok("remplacement confirmé : la nouvelle prend la place et le titre de l'ancienne, l'ancienne est retirée et ses fichiers signalés à effacer",
  r.rows[0].j.ok && L[0].id === v1b.id && L[0].title === "Entrée en Torreando" && !L.some(x => x.id === v1.id) && r.rows[0].j.cleanup.includes(v1.path) && r.rows[0].j.cleanup.includes(v1.poster_path), { r, L });
ok("remplacer une vidéo d'une autre fiche : refusé", !!(await res(I1, "technique", "G18", { replaces: v2.id })).err);

// Suppression
ok("suppression refusée à l'élève et au prof sans droit", !!(await t(B1, "select public.library_video_remove($1)", [v2.id])).err && !!(await t(I2, "select public.library_video_remove($1)", [v2.id])).err);
ok("autre club : ne peut ni retirer ni modifier une vidéo du club", !!(await t(D1, "select public.library_video_remove($1)", [v2.id])).err && !!(await t(D1, "select public.library_video_update($1,'x',0)", [v2.id])).err);
r = await t(I1, "select public.library_video_remove($1) j", [v2.id]);
ok("suppression par le professeur autorisé : disparaît aussitôt, fichiers signalés à effacer", r.rows?.[0]?.j?.ok && r.rows[0].j.cleanup.includes(v2.path) && !(await list(B1)).some(x => x.id === v2.id), r);
const del = (u, n) => t(u, "select public.uzu_lib_video_delete_ok($1) a", [n]).then(x => x.rows?.[0]?.a);
ok("effacement du fichier retiré : permis au professeur autorisé, refusé à l'élève, au prof sans droit et à l'autre club",
  await del(I1, v2.path) === true && await del(B1, v2.path) === false && await del(I2, v2.path) === false && await del(D1, v2.path) === false);
ok("effacement d'un fichier en ligne ou d'une vidéo existante : jamais permis par la nouvelle règle",
  await del(I1, v3.path) === false && await del(A1, CA + "/lx2k-abc123.mp4") === false && await del(A1, "ancienne-racine.mp4") === false);
ok("élève : effacement réel refusé", !!(await t(B1, "delete from storage.objects where name=$1 returning 1", [v2.path])).err || (await db.query("select count(*)::int n from storage.objects where name=$1", [v2.path])).rows[0].n === 1);
r = await t(I1, "delete from storage.objects where name = any($1::text[]) returning name", [[v2.path, v1.path, v1.poster_path]]);
ok("professeur autorisé : effacement réel des fichiers retirés", !r.err && r.rows.length === 3, r);

// Limite par fiche
await db.query("delete from public.club_lib_videos where technique_id='G18'");
for (let i = 0; i < 10; i++) { const x = (await res(I1, "technique", "G18")).rows[0].j; await put(I1, x.path, 2000000, "video/mp4"); await t(I1, "select public.library_video_confirm($1,1,1,1)", [x.id]); }
ok("11e vidéo d'une fiche refusée (10 au plus)", /10 vidéos/.test((await res(I1, "technique", "G18")).err || ""));

// Réservation expirée
r = await res(I1, "flow", "FC2"); const old = r.rows[0].j;
await db.query("update public.club_lib_videos set created_at = now() - interval '3 hours' where id=$1", [old.id]);
ok("réservation de plus de 2 h : l'envoi n'est plus permis", (await t(I1, "select public.uzu_lib_video_upload_ok($1) a", [old.path])).rows[0].a === false);

// Enchaînement
r = await res(I1, "flow", "FC3"); const f1 = r.rows[0].j; await put(I1, f1.path, 2000000, "video/mp4"); await t(I1, "select public.library_video_confirm($1,30,1280,720)", [f1.id]);
ok("enchaînement : vidéo en ligne pour les élèves", (await t(B1, "select count(*)::int n from public.club_lib_videos where flow_id='FC3'")).rows[0].n === 1);
// Discipline fermée
await t(A1, "select public.library_set_disciplines(array['jjb_gi'])");
ok("discipline fermée par le club : ajout refusé sur ses fiches", /Discipline/.test((await res(I1, "technique", "N27")).err || ""));
await t(A1, "select public.library_set_disciplines(array['jjb_gi','grappling_nogi'])");

// Séparation et non-régression
ok("aucun chemin hors du sous-dossier Bibliothèque du club, aucun lien avec Class Media",
  (await db.query("select count(*)::int n from public.club_lib_videos where path not like academy_id::text || '/lib/%' or path like '%class-media%'")).rows[0].n === 0);
ok("vidéos existantes, références (docs) et règles existantes toujours identiques à la fin", JSON.stringify(await snapOld()) === JSON.stringify(before));
ok("journal d'audit : ajouts, remplacement, retrait tracés", (await db.query("select count(*)::int n from public.academy_audit_logs where action like 'library.video_%'")).rows[0].n >= 5);
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
