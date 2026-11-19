import fs from "fs";
import { makeDb, U, as } from "./base.mjs";
const db = await makeDb(); const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + JSON.stringify(g))) };
const t = async (uid, sql, p) => { try { return { rows: (await as(db, uid, sql, p)).rows } } catch (e) { return { err: e.message } } };
const rd = f => fs.readFileSync(f, "utf8");
await db.exec(rd("/home/claude/lot6/uzu-6-securite.sql").split("-- 6. Contrôle")[0].replace(/-- -+\s*$/, ""));
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


const S = o => JSON.stringify(Object.assign({ section_id: GI, course_key: "x1", session_date: dd(0), discipline_id: "jjb_gi", theme: "Passages de garde", objective: "", exercises: "", comment: "", techniques: [{ t: "G18" }, { t: "G17" }, { text: "Passage en X" }] }, o));
function dd(n) { const x = new Date(); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10) }
const save = (u, id, o, pub) => t(u, "select public.journal_save_session($1, $2::jsonb, $3) j", [id, S(o), pub]);
const s11 = rd("/home/claude/uzu-repo/db/uzu-11-journal-vue.sql");
const before = (await db.query("select md5(string_agg(path || data::text, '|' order by path)) h from public.docs")).rows[0].h;
await db.exec(s11);
ctl = (await db.query(s11.split("commit;")[1])).rows[0];
ok("contrôle J3 : fonction présente, aucun accès anonyme", ctl.vue_ensemble === true && ctl.acces_anonyme === false, ctl);
await db.exec(s11); ok("script J3 rejouable", true);
const ov = async (u, a = [null, null, null]) => { const x = await t(u, "select public.journal_overview($1,$2,$3) o", a); return x.err ? x : x.rows[0].o };

let o = await ov(A1);
ok("sans séance : tout à zéro, aucun chiffre inventé", o.totals && o.totals.published === 0 && o.totals.drafts === 0 && o.totals.missing === 0 && o.top.length === 0 && o.authors.length === 0, o);
ok("couverture d'un groupe sans séance : 0 fiche abordée sur le total réel", o.groups.find(g => g.id === GI)?.coverage?.covered === 0 && o.groups.find(g => g.id === GI).coverage.total === (await db.query("select count(*)::int n from public.lib_techniques where discipline_id='jjb_gi' and not archived")).rows[0].n);

await save(A1, null, { session_date: dd(2) }, true);
await save(I1, null, { session_date: dd(9), theme: "Knee cut", techniques: [{ t: "G18" }] }, true);
await save(A1, null, { session_date: dd(40), theme: "Ancienne" }, true);
await save(L1, null, { section_id: NG, course_key: "x2", discipline_id: "grappling_nogi", session_date: dd(3), theme: "Front headlock", techniques: [] }, false);
const roll = (k, by) => ({ k, date: k.split("|")[0], title: "Cours", dur: 90, ...(by ? { by } : {}) });
await db.query("insert into public.docs (path,data) values ($1,$2::jsonb),($3,$4::jsonb) on conflict (path) do update set data=excluded.data",
  ["roll/" + B1, JSON.stringify({ s: [roll(dd(2) + "|x1", I1), roll(dd(5) + "|x1", I1), roll(dd(6) + "|libre", I1), roll(dd(4) + "|zz", I1), roll(dd(7) + "|x1", D1)], a: [] }),
   "roll/" + B2, JSON.stringify({ s: [roll(dd(3) + "|x2", L1), roll(dd(10) + "|x2")], a: [] })]);
const docsMid = (await db.query("select md5(string_agg(path || data::text, '|' order by path)) h from public.docs")).rows[0].h;

o = await ov(A1);
ok("responsable : séances publiées sur 30 jours (l'ancienne exclue)", o.totals.published === 2, o.totals);
ok("brouillons en attente avec auteur", o.totals.drafts === 1 && o.drafts[0].theme === "Front headlock" && o.drafts[0].author === "Resp NoGi", o.drafts);
ok("appels comptés : cours du planning seulement, ni « libre », ni cours inconnu, ni appel d'un autre club", o.totals.calls === 4, o.totals);
ok("cours sans séance saisie : appel du jour J-5 (x1) et appel ancien sans auteur (x2) ; un brouillon compte comme saisi", o.totals.missing === 2 && o.missing.map(m => m.date + "|" + m.course).sort().join() === [dd(10) + "|x2", dd(5) + "|x1"].sort().join() && o.missing.find(m => m.course === "x1").group === "Adultes Gi", o.missing);
ok("techniques les plus travaillées : G18 dans 2 séances, G17 dans 1", o.top[0].id === "G18" && o.top[0].n === 2 && o.top.find(x => x.id === "G17")?.n === 1 && o.totals.free_texts === 1, o.top);
const gi = o.groups.find(g => g.id === GI);
ok("dernière séance du groupe et jours écoulés", gi.last === dd(2) && gi.days === 2 && gi.published === 2, gi);
ok("couverture : fiches abordées depuis toujours (G17, G18), jamais abordées listées sans elles", gi.coverage.covered === 2 && !gi.coverage.never.some(x => x.id === "G17" || x.id === "G18") && gi.coverage.never.length > 0, gi.coverage);
ok("saisies par professeur", o.authors.find(a => a.name === "Prof Un")?.n === 1 && o.authors.length === 2, o.authors);
ok("groupe sans séance publiée : dernière séance vide", o.groups.find(g => g.id === NG).last === null && o.groups.find(g => g.id === NG).published === 0);

o = await ov(A1, [dd(60), null, null]);
ok("période plus longue : l'ancienne séance comptée", o.totals.published === 3);
o = await ov(A1, [null, null, GI]);
ok("filtre groupe : seuls les chiffres du groupe", o.groups.length === 1 && o.totals.drafts === 0 && o.totals.missing === 1 && o.totals.calls === 2, o.totals);

o = await ov(L1);
ok("responsable de section : sa section seulement", o.scope === "section" && o.groups.length === 1 && o.groups[0].id === NG && o.totals.published === 0 && o.totals.drafts === 1 && o.totals.missing === 1, o);
ok("responsable de section : autre section refusée", !!(await ov(L1, [null, null, GI])).err);
ok("professeur (portée ses cours) : pas de vue d'ensemble", !!(await ov(I1)).err);
ok("adhérent : refusé", !!(await ov(B1)).err);
ok("autre club : refusé sur notre groupe, ne voit que le sien", !!(await ov(D1, [null, null, GI])).err && (await ov(D1)).totals.published === 0);
ok("visiteur non connecté : refusé", !!(await t(null, "select public.journal_overview(null,null,null)")).err);
ok("période invalide refusée", !!(await ov(A1, [dd(0), dd(5), null])).err);
ok("aucune donnée par élève dans la réponse", !JSON.stringify(await ov(A1)).includes(B1) && !JSON.stringify(await ov(A1)).includes("Eleve"));
ok("lecture seule : aucun document modifié", (await db.query("select md5(string_agg(path || data::text, '|' order by path)) h from public.docs")).rows[0].h === docsMid);
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
