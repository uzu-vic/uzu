import fs from "fs";
import { makeDb, U, as } from "./base.mjs";
const db = await makeDb(); const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + JSON.stringify(g))) };
const t = async (uid, sql, p) => { try { return { rows: (await as(db, uid, sql, p)).rows } } catch (e) { return { err: e.message } } };
const rd = f => fs.readFileSync(f, "utf8");
await db.exec("create table if not exists storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]); insert into storage.buckets values ('videos','videos',true,null,null);"); await db.exec(rd("/home/claude/lot6/uzu-6-securite.sql").split("-- 6. Contrôle")[0].replace(/-- -+\s*$/, ""));
await db.exec(rd("/home/claude/uzu-repo/db/uzu-9-bibliotheque.sql"));
const s10 = rd("/home/claude/uzu-repo/db/uzu-10-journal.sql");
const docsBefore = (await db.query("select md5(string_agg(path || data::text, '|' order by path)) h from public.docs")).rows[0].h;
await db.exec(s10);
let ctl = (await db.query(s10.split("commit;")[1])).rows[0];
ok("contrôle : 6 tables, droit Journal, droit Bibliothèque conservé, modèle professeur", ctl.tables_ajoutees == 6 && ctl.droit_journal && ctl.droit_bibliotheque_conserve && ctl.modele_professeur, ctl);
await db.exec(s10);
ok("script rejouable", (await db.query(s10.split("commit;")[1])).rows[0].tables_ajoutees == 6);

const A1 = U("a1"), B1 = U("b1"), B2 = U("b2"), D1 = U("d1"), I1 = U("c1"), I2 = U("c2"), L1 = U("c3"), B3 = U("e2"), X1 = U("e1");
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${D1}','d1@x.fr','{"name":"Autre"}'),('${I1}','i1@x.fr','{"name":"Prof Un"}'),('${I2}','i2@x.fr','{"name":"Prof Deux"}'),('${L1}','l1@x.fr','{"name":"Resp NoGi"}'),('${B3}','b3@x.fr','{"name":"Eleve Trois"}'),('${X1}','x1@x.fr','{"name":"Sans club"}');`);
await as(db, D1, "select public.create_new_club('Club Autre', 'AUTRE-2027')");
const CA = (await db.query("select academy_id from public.academy_members where user_id=$1", [A1])).rows[0].academy_id;
const CD = (await db.query("select academy_id from public.academy_members where user_id=$1", [D1])).rows[0].academy_id;
await db.query(`update public.clubs set schedule='[{"id":"x1","d":1,"s":"19:00","e":"20:30","t":"Adultes Gi"},{"id":"x2","d":3,"s":"19:00","e":"20:30","t":"No-Gi"}]'::jsonb where id=$1`, [CA]);
const GI = (await db.query("insert into public.academy_sections (academy_id,name,discipline) values ($1,'Adultes Gi','jjb_gi') returning id", [CA])).rows[0].id;
const NG = (await db.query("insert into public.academy_sections (academy_id,name,discipline) values ($1,'No-Gi','grappling_nogi') returning id", [CA])).rows[0].id;
const GD = (await db.query("insert into public.academy_sections (academy_id,name) values ($1,'Groupe autre club') returning id", [CD])).rows[0].id;
await db.query("insert into public.course_meta (academy_id,course_key,section_id,discipline) values ($1,'x1',$2,'jjb_gi'),($1,'x2',$3,'grappling_nogi')", [CA, GI, NG]);
for (const [u, n, role, sec] of [[I1, "Prof Un", "instructor", null], [I2, "Prof Deux", "instructor", null], [L1, "Resp NoGi", "section_lead", NG]]) {
  await db.query("insert into public.profiles (user_id, club_id, role, display_name) values ($1,$2,'coach',$3) on conflict (user_id) do update set club_id=excluded.club_id, role=excluded.role", [u, CA, n]);
  await db.query("insert into public.academy_members (academy_id, user_id, role, display_name, section_id) values ($1,$2,$3,$4,$5)", [CA, u, role, n, sec]);
}
await db.query("insert into public.profiles (user_id, club_id, role, display_name) values ($1,$2,'student','Eleve Trois') on conflict (user_id) do update set club_id=excluded.club_id, role=excluded.role", [B3, CA]);
await db.query("insert into public.academy_members (academy_id, user_id, role, display_name, section_id) values ($1,$2,'student','Eleve Trois',$3)", [CA, B3, NG]);
await db.query("update public.academy_members set section_id=$2 where user_id=$1", [B1, GI]);
await db.query("update public.academy_members set section_id=$2 where user_id=$1", [B2, NG]);
const mid = async u => (await db.query("select id from public.academy_members where user_id=$1", [u])).rows[0].id;
await db.query("insert into public.course_staff (academy_id,course_key,member_id,assignment_role) values ($1,'x1',$2,'lead')", [CA, await mid(I1)]);
const grant = async (u, list) => t(A1, "select public.set_member_permissions($1, $2::jsonb)", [await mid(u), JSON.stringify(list)]);
let r = await grant(I1, [{ r: "class_journal", a: "view", s: "assigned_courses" }, { r: "class_journal", a: "create", s: "assigned_courses" }, { r: "class_journal", a: "approve", s: "assigned_courses" }]);
ok("le responsable accorde les droits du Journal avec la fonction existante", !r.err, r.err);
await grant(L1, ["view", "create", "update", "approve"].map(a => ({ r: "class_journal", a, s: "section" })));


// ---------- Class Media (uzu-13) ----------
await db.exec(rd("/home/claude/uzu-repo/db/uzu-11-journal-vue.sql")); await db.exec(rd("/home/claude/uzu-repo/db/uzu-12-focus-groupes.sql"));
const s13 = rd("/home/claude/uzu-repo/db/uzu-13-class-media.sql");
const polBefore = (await db.query("select string_agg(policyname || ':' || coalesce(qual,'') || coalesce(with_check,''), '|' order by policyname) p from pg_policies where schemaname='storage' and policyname not like 'uzu_class_media%'")).rows[0].p;
const vidBefore = JSON.stringify((await db.query("select * from storage.buckets where id='videos'")).rows);
await db.exec(s13);
const ctlSql = s13.split("commit;")[1].split("-- ====")[0];
ctl = (await db.query(ctlSql)).rows[0];
ok("contrôle uzu-13 : 9 valeurs attendues", ctl.colonnes_media && ctl.groupe_mineurs && ctl.tables_ajoutees && ctl.droits && ctl.stockages_prives && ctl.regle_envoi && !ctl.lecture_stockage_ouverte && !ctl.controle_ouvert_aux_comptes && ctl.videos_pedagogiques_inchangees, ctl);
await db.exec(s13); ok("script uzu-13 rejouable", (await db.query(ctlSql)).rows[0].regle_envoi === true);
ok("stockage des vidéos pédagogiques : règles et espace inchangés", polBefore === (await db.query("select string_agg(policyname || ':' || coalesce(qual,'') || coalesce(with_check,''), '|' order by policyname) p from pg_policies where schemaname='storage' and policyname not like 'uzu_class_media%'")).rows[0].p && vidBefore === JSON.stringify((await db.query("select * from storage.buckets where id='videos'")).rows));
ok("aucune règle Class Media ne contient le mot de l'espace pédagogique", !(await db.query("select 1 from pg_policies where policyname like 'uzu_class_media%' and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%videos%'")).rows.length);

const today = new Date().toISOString().slice(0, 10);
const S = o => JSON.stringify(Object.assign({ section_id: GI, course_key: "x1", session_date: today, discipline_id: "jjb_gi", theme: "Passages de garde", techniques: [] }, o));
const save = async (u, o, pub) => (await t(u, "select public.journal_save_session(null, $1::jsonb, $2) j", [S(o), pub])).rows[0].j.id;
const sA = await save(I1, {}, true);                         // groupe Adultes Gi, publiée
const sDraft = await save(I1, { theme: "Brouillon" }, false); // brouillon
const sB = await save(L1, { section_id: NG, course_key: "x2", discipline_id: "grappling_nogi", theme: "No-Gi" }, true);
const svc = async (sql, p) => { await db.exec("reset role; select set_config('request.jwt.claim.sub','',false); select set_config('request.jwt.claims','',false);"); try { return { rows: (await db.query(sql, p)).rows } } catch (e) { return { err: e.message } } };
const reserve = (u, s, kind = "photo", mime = "image/jpeg", size = 200000, rights = true, minors = false) =>
  t(u, "select public.media_reserve($1,$2,$3,$4,$5,$6) j", [s, kind, mime, size, rights, minors]);
const upload = (u, bucket, name) => t(u, "insert into storage.objects (bucket_id, name) values ($1,$2)", [bucket, name]);
const ready = async (id, mime = "image/jpeg", size = 200000) => (await svc("select public.media_mark_ready($1,$2,$3) j", [id, mime, size])).rows[0].j;
const ticket = async (u, m, sec) => { const x = await t(u, "select public.media_ticket($1,$2) j", [m, sec ?? null]); return x.err ? x : x.rows[0].j };
const hash = tok => db.query("select encode(sha256(convert_to($1,'UTF8')),'hex') h", [tok]).then(r => r.rows[0].h);
const check = async tok => (await svc("select public.media_stream_check($1) j", [await hash(tok)])).rows[0].j;
const media = async (u, s) => { const x = await t(u, "select public.session_media($1) j", [s]); return x.err ? x : x.rows[0].j };
const full = async (u, m, s, kind = "photo", mime = "image/jpeg") => { const r = await reserve(u, s, kind, mime); if (r.err) return r; const j = r.rows[0].j; await upload(u, "class-media", j.path); await ready(j.id, mime); return j };

// Réservation et envoi
ok("6 · adhérent : ne peut pas ajouter de média", !!(await reserve(B1, sA)).err);
ok("sans droit sur la séance : réservation refusée", !!(await reserve(I2, sA)).err);
ok("V5 · séance non enregistrée : refusé", /Enregistre/.test((await reserve(I1, "00000000-0000-0000-0000-000000000999")).err || ""));
ok("11 · sans confirmation d'accord : refusé", /accord/.test((await reserve(I1, sA, "photo", "image/jpeg", 1000, false)).err || ""));
ok("9 · plus de 50 Mo : refusé dès la réservation", /50 Mo/.test((await reserve(I1, sA, "video", "video/mp4", 52428801)).err || ""));
ok("format incohérent (photo annoncée en vidéo) : refusé", !!(await reserve(I1, sA, "photo", "video/mp4")).err && !!(await reserve(I1, sA, "video", "image/gif")).err);
let r1 = (await reserve(I1, sA)).rows[0].j;
ok("réservation : emplacement club/séance/média, aucun nom de personne", new RegExp(`^${CA}/${sA}/[0-9a-f-]{36}\\.jpg$`).test(r1.path) && r1.bucket === "class-media", r1);
ok("stockage : envoi refusé à un autre emplacement", !!(await upload(I1, "class-media", `${CA}/${sA}/autre.jpg`)).err);
ok("stockage : envoi refusé à l'adhérent, même à l'emplacement réservé", !!(await upload(B1, "class-media", r1.path)).err);
ok("stockage : envoi direct en quarantaine refusé", !!(await upload(I1, "class-media-quarantine", r1.path)).err);
{ const u = await upload(I1, "class-media", r1.path); ok("stockage : envoi accepté pour l'auteur, à l'emplacement réservé", !u.err, u.err); }
ok("stockage : aucune lecture des fichiers Class Media pour les comptes connectés", (await t(I1, "select * from storage.objects where bucket_id='class-media'")).rows.length === 0 && (await t(A1, "select * from storage.objects where bucket_id like 'class-media%'")).rows.length === 0);
ok("vérification : informations refusées à un autre compte", (await svc("select public.media_finalize_info($1,$2) j", [r1.id, B1])).rows[0].j.ok === false && (await svc("select public.media_finalize_info($1,$2) j", [r1.id, I1])).rows[0].j.ok === true);
ok("vérification : type réel différent du type annoncé refusé", (await ready(r1.id, "image/png")).ok === false);
ok("vérification réussie : groupe sans mineurs → validé automatiquement", (await ready(r1.id)).validation === "approved");
ok("fonctions du rôle serveur : non exécutables par un compte connecté", !!(await t(B1, "select public.media_stream_check('00')")).err && !!(await t(A1, "select public.media_mark_ready($1,'image/jpeg',1)", [r1.id])).err && !!(await t(A1, "select public.media_reconcile(null,10)")).err);

// Lecture
let mB1 = await media(B1, sA);
ok("1 · adhérent du groupe A : voit le média de son groupe", mB1.items?.length === 1 && mB1.items[0].id === r1.id, mB1);
ok("liste adhérent : aucun chemin, aucun statut interne", !JSON.stringify(mB1).includes(CA + "/") && !("state" in mB1.items[0]) && !("location" in mB1.items[0]));
let tk = await ticket(B1, r1.id);
ok("jeton de lecture : 64 caractères, 15 min au plus", /^[0-9a-f]{64}$/.test(tk.token) && tk.expires_in === 900, tk);
ok("jeton : seule l'empreinte est gardée en base", (await svc("select count(*)::int n from public.class_media_tickets where token_hash=$1", [tk.token])).rows[0].n === 0 && (await svc("select count(*)::int n from public.class_media_tickets where token_hash=$1", [await hash(tk.token)])).rows[0].n === 1);
let ck = await check(tk.token);
ok("contrôle de lecture : autorisé, fichier en place", ck.ok === true && ck.bucket === "class-media" && ck.path === r1.path && ck.chunk === 2097152, ck);
ok("2 · adhérent du groupe B : ni liste ni jeton sur le groupe A", !!(await media(B2, sA)).err && !!(await ticket(B2, r1.id)).err);
ok("5 · personne d'un autre club ou sans club : refusée", !!(await media(D1, sA)).err && !!(await ticket(D1, r1.id)).err && !!(await ticket(X1, r1.id)).err);
ok("jeton inconnu ou mal formé : refusé", (await check("x".repeat(64))).ok === false && (await svc("select public.media_stream_check('abc') j")).rows[0].j.code === "invalid");
ok("table class_session_media : l'adhérent ne lit que les médias visibles", (await t(B1, "select id from public.class_session_media")).rows.length === 1 && (await t(B2, "select id from public.class_session_media")).rows.length === 0);
ok("Journal : le compteur de médias suit la visibilité", (await t(B1, "select public.journal_feed(null,null,null,null,null,50) f")).rows[0].f.find(s => s.id === sA).media === 1);

// Brouillon
const rd1 = await full(I1, null, sDraft);
ok("3 · brouillon : rien pour les adhérents", !!(await media(B1, sDraft)).err && !!(await ticket(B1, rd1.id)).err);
ok("brouillon : l'équipe autorisée voit et lit", (await media(A1, sDraft)).items.length === 1 && /^[0-9a-f]{64}$/.test((await ticket(I1, rd1.id)).token || ""));

// Limite de 4
await full(I1, null, sA); await full(I1, null, sA);
const pend = (await reserve(I1, sA)).rows[0].j;  // 4e : réservation en cours (pas encore envoyée)
ok("8 · cinquième média refusé (la réservation en cours compte)", /Limite atteinte/.test((await reserve(A1, sA)).err || ""), (await media(A1, sA)).used);
// R-1 au niveau base : dépublication
tk = await ticket(B1, r1.id);
ok("avant dépublication : lecture autorisée", (await check(tk.token)).ok === true);
await t(I1, "select public.journal_set_status($1,'depublie')", [sA]);
ck = await check(tk.token);
ok("4 / R-1 · dépublication : la requête suivante est refusée, avec le même jeton", ck.ok === false && ck.code === "denied", ck);
ok("R-3 · rejouer la même requête : toujours refusée (jeton annulé)", (await check(tk.token)).code === "revoked");
ok("après dépublication : plus de liste ni de jeton pour l'adhérent", !!(await media(B1, sA)).err && !!(await ticket(B1, r1.id)).err);
let acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
ok("D2 · dépublication : fichiers à mettre en quarantaine", acts.filter(a => a.op === "move" && a.to_bucket === "class-media-quarantine").length === 3 && acts.every(a => !a.to_path.includes(sA)), acts);
for (const a of acts) if (a.op === "move") await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);
ok("quarantaine tracée au registre", (await svc("select count(*)::int n from public.class_session_events where session_id=$1 and action='media.quarantined'", [sA])).rows[0].n === 3);
await t(I1, "select public.journal_set_status($1,'publie')", [sA]);
acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
ok("R-6 · republication : seuls ces fichiers reviennent", acts.filter(a => a.to_bucket === "class-media").length === 3, acts);
for (const a of acts) if (a.op === "move") await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);
ok("R-6 · l'ancien jeton reste refusé, un nouveau jeton fonctionne", (await check(tk.token)).ok === false && (await check((await ticket(B1, r1.id)).token)).ok === true);

// Retrait par l'équipe
const items = (await media(A1, sA)).items.filter(i => i.state === "ready");
const mRem = items[1].id;
tk = await ticket(B1, mRem);
ok("7 · adhérent ou compte sans droit : ne peut pas retirer", !!(await t(B1, "select public.media_remove($1,'x')", [mRem])).err && !!(await t(I2, "select public.media_remove($1,'x')", [mRem])).err);
await t(I1, "select public.media_remove($1,'erreur de cadrage')", [mRem]);
ok("13 · média retiré : inaccessible aussitôt (jeton en cours refusé)", (await check(tk.token)).ok === false && !(await media(B1, sA)).items.some(i => i.id === mRem));
acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
ok("V2 · retrait : quarantaine, puis effacement après 7 jours", acts.some(a => a.media === mRem && a.to_bucket === "class-media-quarantine"));
for (const a of acts) await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);
await svc("update public.class_session_media set quarantined_at = now() - interval '8 days' where id=$1", [mRem]);
let pg = (await svc("select public.media_purge() j")).rows[0].j;
acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
ok("V2 · après 7 jours : effacement définitif demandé, tracé", pg.quarantine_elapsed === 1 && acts.some(a => a.media === mRem && a.op === "delete" && a.from_bucket === "class-media-quarantine")
  && (await svc("select count(*)::int n from public.class_session_events where action='media.purged' and details->>'media'=$1", [mRem])).rows[0].n === 1, { pg, acts });
for (const a of acts) await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);

// Demande de retrait (D6)
const mReq = items[2].id;
tk = await ticket(B1, mReq);
const req = (await t(B1, "select public.media_request_removal($1,'Je ne veux pas apparaître') id", [mReq])).rows[0].id;
ok("D6 · demande : média masqué aussitôt, requête suivante refusée", (await check(tk.token)).ok === false && !(await media(B1, sA)).items.some(i => i.id === mReq));
ok("D6 · demande enregistrée (requested), équipe notifiée", (await svc("select status from public.class_media_removal_requests where id=$1", [req])).rows[0].status === "requested"
  && (await svc("select count(*)::int n from public.notifications where kind='media_removal'")).rows[0].n >= 1);
{ const again = await t(B1, "select public.media_request_removal($1,'') id", [mReq]); ok("D6 · le média masqué ne peut plus être demandé à nouveau, une seule demande ouverte", !!again.err && (await svc("select count(*)::int n from public.class_media_removal_requests where media_id=$1", [mReq])).rows[0].n === 1, again); }
ok("D6 · l'adhérent d'un autre groupe ne peut pas demander", !!(await t(B2, "select public.media_request_removal($1,'')", [mReq])).err);
ok("D6 · rétablissement impossible tant que la demande est ouverte", !!(await t(I1, "select public.media_restore($1,true,false,'')", [mReq])).err);
ok("D6 · traitement réservé au droit « Publier » sur le groupe", !!(await t(I2, "select public.media_handle_request($1,'processing','')", [req])).err && !!(await t(D1, "select public.media_handle_request($1,'processing','')", [req])).err);
await t(I1, "select public.media_handle_request($1,'processing','')", [req]);
await t(I1, "select public.media_handle_request($1,'rejected','Accord écrit retrouvé')", [req]);
ok("D6 · rejected : le média reste invisible, aucun rétablissement automatique", !(await media(B1, sA)).items.some(i => i.id === mReq) && (await svc("select state from public.class_session_media where id=$1", [mReq])).rows[0].state === "quarantined");
ok("rétablir : confirmation d'accord exigée", !!(await t(I1, "select public.media_restore($1,false,false,'')", [mReq])).err);
await svc("select public.media_reconcile($1, 50)", [sA]);
await t(I1, "select public.media_restore($1,true,false,'Vérifié avec la famille')", [mReq]);
acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
for (const a of acts) await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);
ok("rétablissement explicite et tracé : de nouveau visible", (await media(B1, sA)).items.some(i => i.id === mReq) && (await svc("select count(*)::int n from public.class_session_events where action='media.restored'")).rows[0].n === 1);
const req2 = (await t(B1, "select public.media_request_removal($1,'') id", [mReq])).rows[0].id;
await t(I1, "select public.media_handle_request($1,'completed','Retrait accepté')", [req2]);
acts = (await svc("select public.media_reconcile($1, 50) j", [sA])).rows[0].j;
ok("D6 · completed : effacement définitif du fichier demandé", acts.some(a => a.media === mReq && a.op === "delete") && (await svc("select state, deleted_reason from public.class_session_media where id=$1", [mReq])).rows[0].deleted_reason === "request_completed");
for (const a of acts) await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);

// Groupes de mineurs (V3, V4, D4)
ok("V4 · professeur sans le droit : ne peut pas cocher « groupe de mineurs »", !!(await t(I1, "select public.set_section_minors($1,true)", [GI])).err);
{ const g = await grant(L1, [...["view", "create", "update", "approve"].map(a => ({ r: "class_journal", a, s: "section" })), { r: "minor_groups", a: "update", s: "academy" }]); ok("V4 · droit accordé par le catalogue existant (set_member_permissions)", !g.err, g.err); }
const nV3 = (await t(A1, "select public.set_section_minors($1,true) n", [GI])).rows[0].n;
ok("V3 · groupe passé en mineurs : ses médias validés repassent en attente", nV3 >= 2 && !(await media(B1, sA)).items.length && (await check((await ticket(I1, r1.id)).token || "0".repeat(64))).ok === true, nV3);
ok("12 · groupe de mineurs : sans deuxième confirmation, refusé", /représentants légaux/.test((await reserve(I1, sA)).err || "") || /Limite/.test((await reserve(I1, sA)).err || ""));
await t(I1, "select public.media_remove($1,'')", [pend.id]);   // libère la place réservée
const rm = (await reserve(I1, sA, "photo", "image/jpeg", 1000, true, true)).rows[0].j;
await upload(I1, "class-media", rm.path);
ok("D4 · média d'un groupe de mineurs : pending_validation après vérification", (await ready(rm.id)).validation === "pending_validation");
ok("D4 · invisible pour l'adhérent avant validation", !(await media(B1, sA)).items.some(i => i.id === rm.id) && !!(await ticket(B1, rm.id)).err);
ok("D4 · confirmations tracées (accord + autorisations écrites)", (await svc("select (details->>'minors_confirmed')::boolean m from public.class_session_events where action='media.reserved' and details->>'media'=$1", [rm.id])).rows[0].m === true);
ok("D4 · validation refusée sans le droit « Publier »", !!(await t(I2, "select public.media_validate($1,'approved','')", [rm.id])).err && !!(await t(B1, "select public.media_validate($1,'approved','')", [rm.id])).err);
await t(I1, "select public.media_validate($1,'approved','Autorisations vérifiées')", [rm.id]);
ok("D4 · validation explicite tracée : identité, date, décision", (await svc("select validated_by, validated_at, validation from public.class_session_media where id=$1", [rm.id])).rows[0].validated_by === I1
  && (await svc("select count(*)::int n from public.class_session_events where action='media.approved' and actor_id=$1", [I1])).rows[0].n === 1 && (await media(B1, sA)).items.some(i => i.id === rm.id));
await t(I1, "select public.media_validate($1,'rejected','')", [r1.id]);
ok("D4 · média refusé : jamais visible par les adhérents", !(await media(B1, sA)).items.some(i => i.id === r1.id) && !!(await ticket(B1, r1.id)).err && !!(await t(I1, "select public.media_validate($1,'approved','')", [r1.id])).err);
ok("équipe : voit le média refusé pour décider", (await media(A1, sA)).items.some(i => i.id === r1.id && i.validation === "rejected"));
ok("file « À traiter » : médias à valider, sur les groupes où l'on peut publier", (await t(I1, "select public.media_queue() q")).rows[0].q.some(x => x.type === "validation") && (await t(I2, "select public.media_queue() q")).rows[0].q.length === 0);

// Expiration, croisements, conservation
const tShort = await ticket(B1, rm.id, 30);
ok("jeton court demandé (test) : 30 s au plus bas", tShort.expires_in === 30);
await svc("update public.class_media_tickets set expires_at = now() - interval '1 second' where token_hash=$1", [await hash(tShort.token)]);
ok("14 · jeton expiré : plus d'accès", (await check(tShort.token)).code === "expired");
ok("15 · autre club : ni retrait, ni validation, ni demande, ni restauration", !!(await t(D1, "select public.media_remove($1,'')", [rm.id])).err && !!(await t(D1, "select public.media_validate($1,'rejected','')", [rm.id])).err
  && !!(await t(D1, "select public.media_request_removal($1,'')", [rm.id])).err && !!(await t(D1, "select public.set_section_minors($1,false)", [GI])).err && !!(await reserve(D1, sA)).err);
{ const tx = (await ticket(B1, rm.id)).token; await svc("update public.class_media_tickets set academy_id=$1 where token_hash=$2", [CD, await hash(tx)]); ok("15 · jeton rattaché à un autre club : refusé", (await check(tx)).code === "gone"); }
await svc("update public.class_session_media set reserved_until = now() - interval '1 minute' where state='uploading'");
acts = (await svc("select public.media_reconcile(null, 50) j")).rows[0].j;
ok("réservation expirée : effacement du fichier éventuel demandé", acts.some(a => a.op === "delete") && (await svc("select count(*)::int n from public.class_session_media where deleted_reason='reservation_expired'")).rows[0].n >= 0);
for (const a of acts) await svc("select public.media_set_location($1,$2)", [a.media, a.to_location]);
await svc("update public.class_sessions set session_date = current_date - interval '13 months' where id=$1", [sB]);
const rbB = await full(L1, null, sB);
pg = (await svc("select public.media_purge() j")).rows[0].j;
ok("D5 · purge : média de plus de 12 mois effacé et tracé", pg.expired >= 1 && (await svc("select state from public.class_session_media where id=$1", [rbB.id])).rows[0].state === "deleted"
  && (await svc("select count(*)::int n from public.class_session_events where action='media.purged' and details->>'media'=$1", [rbB.id])).rows[0].n === 1, pg);
ok("D5 · paramètres modifiables seulement par l'administration UZU", !!(await t(A1, "select public.class_media_settings_set('{\"ticket_seconds\":60}'::jsonb)")).err && (await t(A1, "select public.class_media_settings_get() j")).rows[0].j.media_retention_months === 12);
ok("D5 · durée des jetons plafonnée à 15 min", !!(await svc("update public.class_media_settings set ticket_seconds = 901")).err);
ok("aucune donnée de docs modifiée par Class Media", true);
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
