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


const s12 = rd("/home/claude/uzu-repo/db/uzu-12-focus-groupes.sql");
await db.exec(s12); ctl = (await db.query(s12.split("commit;")[1])).rows[0];
ok("contrôle J4 : fonctions présentes, aucun accès anonyme", ctl.tableau_focus && ctl.droit_par_groupe && ctl.acces_anonyme === false, ctl);
await db.exec(s12); ok("script J4 rejouable", true);
const C = s => ({ r: "contents", a: "create", s });
await grant(I1, [C("own_content"), { r: "class_journal", a: "view", s: "assigned_courses" }]);
await grant(L1, [C("own_content")]);
await grant(I2, [C("own_content")]);
const F = (u, sec, f) => t(u, "select public.set_group_focus($1, $2::jsonb) r", [sec, f === null ? null : JSON.stringify(f)]);
const board = async u => { const x = await t(u, "select public.group_focus_board() b"); return x.err ? x : x.rows[0].b };

let b = await board(A1);
ok("tableau : tous les groupes, aucun focus au départ, responsable peut publier partout", b.length === 2 && b.every(g => g.current === null && g.can_publish), b);
r = await F(A1, GI, { theme: "Garde fermée", from: "fond", to: "controle", details: "Posture" });
ok("responsable : publie le focus d'un groupe", r.rows?.[0]?.r === true, r);
r = await F(A1, GI, { theme: "Passages de garde", from: "fond", to: "controle", details: "Passer, stabiliser, prendre le dos" });
b = await board(A1); let gi = b.find(g => g.id === GI);
ok("changer de focus : l'ancien passe dans l'historique (rien d'effacé)", gi.current.theme === "Passages de garde" && gi.history_count === 1 && gi.history[0].theme === "Garde fermée" && gi.history[0].to !== null, gi);
ok("focus : auteur et systèmes conservés", typeof gi.current.by === "string" && gi.current.by.length > 0 && gi.current.from === "fond" && gi.current.to === "controle");
ok("thème vide refusé", !!(await F(A1, GI, { theme: "  " })).err);
ok("description trop longue refusée", !!(await F(A1, GI, { theme: "x", details: "a".repeat(301) })).err);
ok("système inconnu refusé", !!(await F(A1, GI, { theme: "x", from: "karaté" })).err);
ok("groupe d'un autre club refusé", !!(await F(A1, GD, { theme: "x" })).err);

ok("professeur : publie pour le groupe du cours qu'il encadre", (await F(I1, GI, { theme: "Knee cut" })).rows?.[0]?.r === true);
ok("professeur : refusé pour un groupe dont il n'encadre aucun cours", !!(await F(I1, NG, { theme: "x" })).err);
ok("responsable de section : publie pour sa section", (await F(L1, NG, { theme: "Front headlock", from: "lutte" })).rows?.[0]?.r === true);
ok("responsable de section : refusé hors de sa section", !!(await F(L1, GI, { theme: "x" })).err);
ok("professeur sans cours : refusé partout", !!(await F(I2, GI, { theme: "x" })).err && !!(await F(I2, NG, { theme: "x" })).err);
b = await board(I1);
ok("tableau côté professeur : droit calculé par groupe", b.find(g => g.id === GI).can_publish === true && b.find(g => g.id === NG).can_publish === false, b);
ok("adhérent : ni tableau ni publication", !!(await board(B1)).err && !!(await F(B1, GI, { theme: "x" })).err);
ok("autre club : tableau sans nos groupes", JSON.stringify(await board(D1)).indexOf(GI) < 0);
ok("visiteur non connecté : refusé", !!(await t(null, "select public.group_focus_board()")).err);

const gB1 = (await t(B1, "select public.journal_groups() g")).rows[0].g;
ok("adhérent du groupe : voit le focus en cours (le dernier publié)", gB1.find(g => g.id === GI)?.focus?.theme === "Knee cut", gB1);
ok("dépublier : demandé par le responsable", (await F(A1, GI, null)).rows?.[0]?.r === false);
ok("après dépublication : plus de focus pour l'adhérent, historique complet", (await t(B1, "select public.journal_groups() g")).rows[0].g.find(g => g.id === GI).focus === null && (await board(A1)).find(g => g.id === GI).history_count === 3);
r = await t(A1, "select public.journal_save_session(null, $1::jsonb, true) j", [JSON.stringify({ section_id: GI, course_key: "x1", session_date: new Date().toISOString().slice(0, 10), discipline_id: "jjb_gi", theme: "Séance", techniques: [] })]);
await F(A1, GI, { theme: "Demi-garde" });
r = await t(A1, "select public.journal_save_session(null, $1::jsonb, true) j", [JSON.stringify({ section_id: GI, course_key: "x1", session_date: new Date().toISOString().slice(0, 10), discipline_id: "jjb_gi", theme: "Séance 2", techniques: [] })]);
b = await board(A1);
ok("séances publiées depuis le focus en cours", b.find(g => g.id === GI).current.sessions === 1, b.find(g => g.id === GI));
ok("journal : la séance garde le focus de son moment", (await db.query("select focus_snapshot->>'theme' t from public.class_sessions where id=$1", [r.rows[0].j.id])).rows[0].t === "Demi-garde");
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
