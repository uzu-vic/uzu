// Test du script uzu-6-securite.sql sur une copie locale de PostgreSQL reproduisant la production
import fs from "fs";
import { makeDb, U, as } from "./base.mjs";
const db = await makeDb();
const R = []; const ok = (l, c, g = "") => { R.push([l, !!c]); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : "  → " + JSON.stringify(g))) };
const tryq = async (uid, sql, p) => { try { return { rows: (await as(db, uid, sql, p)).rows } } catch (e) { return { err: e.message } } };
const A1 = U("a1"), B1 = U("b1"), B2 = U("b2"), C1 = U("c1"), D1 = U("d1");
const club = (await db.query("select id from public.clubs limit 1")).rows[0].id;

// Données supplémentaires : un second club (C1 responsable seul), un élève D1 d'un autre club, notes et fil
await db.exec(`insert into auth.users (id,email,raw_user_meta_data) values ('${C1}','c1@x.fr','{"name":"Solo"}'),('${D1}','d1@x.fr','{"name":"Autre"}');`);
await as(db, C1, "select public.create_new_club('Club Solo', 'SOLO-2027')");
const club2 = (await db.query("select id from public.clubs where name='Club Solo'")).rows[0].id;
await db.exec(`update public.profiles set share_activity = true where user_id in ('${B1}','${B2}');
  insert into public.docs (path,data) values ('feed/${B2}','{"on":true,"ev":[]}'), ('members/${C1}','{"name":"Solo"}'), ('videos/${club2}/club-semaine','{"id":"${club2}/v.mp4"}') on conflict do nothing;
  insert into public.pedagogical_notes (academy_id, student_id, author_user_id, body, visibility) values ('${club}','${B1}','${A1}','note','private');`);

const before = fs.readFileSync("/home/claude/lot6/uzu-6-securite.sql", "utf8");
const script = before.split("-- 6. Contrôle")[0].replace(/-- -+\s*$/, "");
await db.exec(script); ok("script appliqué sans erreur", true);
await db.exec(script); ok("script rejouable (deuxième passage sans erreur)", true);
{ const { applyNew } = await import("/home/claude/compat/new-scripts.mjs"); await applyNew(db); console.log("   [compatibilité] sept nouveaux scripts installés AVANT les vérifications de ce lot de production"); }

// 1. Masquer
ok("fil : B2 voit B1 avant masquage", (await tryq(B2, "select path from public.docs where path = $1", ["feed/" + B1])).rows?.length === 1);
let r = await tryq(B2, "select public.set_user_block($1, true)", [B1]); ok("masquer un membre", !r.err, r.err);
ok("fil : B2 ne voit plus B1", (await tryq(B2, "select path from public.docs where path = $1", ["feed/" + B1])).rows?.length === 0);
ok("fil : B1 ne voit plus B2 (dans les deux sens)", (await tryq(B1, "select path from public.docs where path = $1", ["feed/" + B2])).rows?.length === 0);
ok("fil : A1 (prof) voit toujours B1", (await tryq(A1, "select path from public.docs where path = $1", ["feed/" + B1])).rows?.length === 1);
r = await tryq(B2, "select public.list_my_blocks() j"); ok("liste des membres masqués avec le nom", r.rows?.[0]?.j?.[0]?.name === "Yanis B.", r);
ok("un utilisateur ne lit que ses propres masquages", (await tryq(B1, "select * from public.user_blocks")).rows?.length === 0);
ok("masquage impossible sur soi-même", !!(await tryq(B2, "select public.set_user_block($1, true)", [B2])).err);
await tryq(B2, "select public.set_user_block($1, false)", [B1]);
ok("ne plus masquer : B2 revoit B1", (await tryq(B2, "select path from public.docs where path = $1", ["feed/" + B1])).rows?.length === 1);
ok("table des masquages fermée en écriture directe", !!(await tryq(B2, "insert into public.user_blocks values ($1,$2)", [B2, B1])).err);

// 2. Signaler
r = await tryq(B2, "select public.report_content($1,'k1','Séance validée','inapproprie','test') id", [B1]); ok("signalement créé", r.rows?.[0]?.id, r.err);
const rid = r.rows?.[0]?.id;
r = await tryq(B2, "select public.report_content($1,'k1','Séance validée','inapproprie','test') id", [B1]); ok("pas de doublon pour le même contenu", r.rows?.[0]?.id === rid);
ok("signaler un membre d'un autre club : refusé", !!(await tryq(B2, "select public.report_content($1,'k','x','autre','')", [D1])).err);
ok("se signaler soi-même : refusé", !!(await tryq(B2, "select public.report_content($1,'k','x','autre','')", [B2])).err);
ok("motif inconnu : refusé", !!(await tryq(B2, "select public.report_content($1,'k2','x','spam','')", [B1])).err);
ok("le responsable est notifié", (await db.query("select 1 from public.notifications where user_id = $1 and kind = 'coach' and url = 'reports'", [A1])).rows.length === 1);
ok("aucune lecture directe des signalements", !!(await tryq(A1, "select * from public.content_reports")).err);
ok("un élève ne peut pas lister les signalements", !!(await tryq(B2, "select public.list_reports()")).err);
r = await tryq(A1, "select public.list_reports() j"); ok("le responsable liste les signalements (auteur et membre nommés)", r.rows?.[0]?.j?.[0]?.reporter === "Sarah M." && r.rows[0].j[0].target_name === "Yanis B.", r);
ok("un autre club ne voit pas ces signalements", (await tryq(C1, "select public.list_reports() j")).rows?.[0]?.j?.length === 0);
ok("un autre club ne peut pas les traiter", !!(await tryq(C1, "select public.resolve_report($1,'resolved')", [rid])).err);
r = await tryq(A1, "select public.resolve_report($1,'resolved')", [rid]); ok("le responsable traite le signalement", !r.err, r.err);
ok("traitement journalisé", (await db.query("select 1 from public.academy_audit_logs where action = 'report.resolved'")).rows.length === 1);

// 3. Vidéos privées
await db.exec(`insert into storage.objects (bucket_id, name) values ('videos','${club}/a.mp4'),('videos','${club2}/b.mp4'),('videos','ancienne.mp4')`);
r = await tryq(B2, "select name from storage.objects where bucket_id='videos' order by name");
ok("vidéos : un élève lit celles de son club (et les anciennes du club d'origine)", JSON.stringify(r.rows?.map(x => x.name)) === JSON.stringify(["ancienne.mp4", club + "/a.mp4"].sort()), r);
r = await tryq(C1, "select name from storage.objects where bucket_id='videos'");
ok("vidéos : un autre club ne lit que les siennes", JSON.stringify(r.rows?.map(x => x.name)) === JSON.stringify([club2 + "/b.mp4"]), r);
ok("vidéos : un visiteur non connecté ne lit rien", (await tryq(null, "select name from storage.objects")).err || (await tryq(null, "select name from storage.objects")).rows?.length === 0);

// 4. Rappel de saisie
const dow = ((new Date().getDay() + 6) % 7) + 1, today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
const now = `${today} 23:30:00`, slot = (x = {}) => JSON.stringify([{ id: "z1", d: dow, s: "19:00", e: "21:00", t: "JJB", ...x }]);
const run = async (sched, profile) => {
  await db.exec(`delete from public.notifications where kind='saisie'; update public.clubs set schedule='${sched}'::jsonb, profile='${profile}'::jsonb where id='${club}'`);
  return (await db.query(`select public.uzu_cron_saisie(('${now}'::timestamp at time zone 'Europe/Paris')) n`)).rows[0].n;
};
const hol = JSON.stringify({ closures: [{ id: "v", from: today, to: today, label: "Vacances" }] });
ok("rappel envoyé un jour normal", await run(slot(), "{}") > 0);
ok("pas de rappel pendant les vacances", await run(slot(), hol) === 0);
ok("rappel maintenu pour un cours « maintenu pendant les vacances »", await run(slot({ hol: true }), hol) > 0);
ok("pas de rappel pour une date annulée", await run(slot({ off: [today] }), "{}") === 0);
ok("une autre date annulée n'empêche pas le rappel", await run(slot({ off: ["2000-01-01"] }), "{}") > 0);

// 5. Suppression du compte
ok("visiteur non connecté : suppression impossible", !!(await tryq(null, "select public.delete_my_account()")).err);
r = await tryq(A1, "select public.delete_my_account()"); ok("seul responsable d'un club avec des membres : refusé, message clair", /responsable/.test(r.err || ""), r);
ok("… et rien n'a été supprimé", (await db.query("select 1 from auth.users where id=$1", [A1])).rows.length === 1);
await tryq(B2, "select public.set_user_block($1, true)", [B1]);
r = await tryq(B1, "select public.delete_my_account() d"); ok("un élève supprime son compte", r.rows?.[0]?.d === true, r.err);
ok("compte de connexion supprimé", (await db.query("select 1 from auth.users where id=$1", [B1])).rows.length === 0);
ok("documents supprimés (carnet, fil, notes privées, présences, grades)", (await db.query("select path from public.docs where path like '%' || $1 || '%'", [B1])).rows.length === 0, (await db.query("select path from public.docs where path like '%' || $1 || '%'", [B1])).rows);
ok("profil, appartenance, notes pédagogiques, masquages supprimés", (await db.query(`select (select count(*) from public.profiles where user_id=$1)+(select count(*) from public.academy_members where user_id=$1)+(select count(*) from public.pedagogical_notes where student_id=$1)+(select count(*) from public.user_blocks where blocked_id=$1) n`, [B1])).rows[0].n == 0);
{ const x = (await db.query("select target_user_id, target_name from public.content_reports where id=$1", [rid])).rows[0]; ok("signalement conservé pour le club, anonymisé", x && x.target_user_id === null && x.target_name === "Compte supprimé", x) }
ok("journal du club : suppression tracée", (await db.query("select 1 from public.academy_audit_logs where action='member.account_deleted' and target_id=$1", [B1])).rows.length === 1);
ok("le club et les autres élèves ne sont pas touchés", (await db.query("select count(*) n from public.academy_members where academy_id=$1", [club])).rows[0].n == 2);
r = await tryq(C1, "select public.delete_my_account() d"); ok("responsable seul dans son club : compte supprimé", r.rows?.[0]?.d === true, r.err);
ok("… et son club vide supprimé avec ses vidéos de référence", (await db.query("select (select count(*) from public.clubs where id=$1) + (select count(*) from public.docs where path like 'videos/' || $1 || '/%') n", [club2])).rows[0].n == 0);
ok("le club principal existe toujours", (await db.query("select 1 from public.clubs where id=$1", [club])).rows.length === 1);

const f = R.filter(x => !x[1]).length; console.log(`\n${R.length - f}/${R.length} vérifications réussies`); process.exit(f ? 1 : 0);
