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

const S = o => JSON.stringify(Object.assign({ section_id: GI, course_key: "x1", session_date: new Date().toISOString().slice(0, 10), discipline_id: "jjb_gi", theme: "Passages de garde", objective: "Enchaîner Torreando et Knee Cut", exercises: "Situations 3 × 3 min", comment: "", techniques: [{ t: "G18" }, { t: "G17" }, { text: "Passage en X" }] }, o));
const save = (u, id, o, pub) => t(u, "select public.journal_save_session($1, $2::jsonb, $3) j", [id, S(o), pub]);
const feed = async (u, a = [null, null, null, null, null, null]) => { const x = await t(u, "select public.journal_feed($1,$2,$3,$4,$5,$6) f", a); return x.err ? x : x.rows[0].f };

// Brouillon puis publication
r = await save(A1, null, {}, false); const s1 = r.rows?.[0]?.j?.id;
ok("responsable : brouillon créé (techniques de la Bibliothèque + texte libre)", r.rows?.[0]?.j?.status === "brouillon" && (await db.query("select count(*)::int n from public.class_session_techniques where session_id=$1", [s1])).rows[0].n === 3, r);
ok("brouillon invisible de l'adhérent du groupe", (await feed(B1)).length === 0);
ok("adhérent : publication directe impossible", !!(await t(B1, "select public.journal_set_status($1,'publie')", [s1])).err);
ok("adhérent : aucune écriture directe", !!(await t(B1, "insert into public.class_sessions (academy_id,section_id,session_date,theme,status) values ($1,$2,current_date,'x','publie')", [CA, GI])).err && !!(await t(B1, "update public.class_sessions set theme='x'")).err);
ok("adhérent : ne peut pas créer de séance", !!(await save(B1, null, {}, true)).err);
r = await t(A1, "select public.journal_set_status($1,'publie') s", [s1]);
ok("responsable : publication", r.rows?.[0]?.s === "publie", r);
let f = await feed(B1);
ok("adhérent du groupe (absent, jamais pointé) : voit la séance publiée avec ses techniques reliées", f.length === 1 && f[0].theme === "Passages de garde" && f[0].techniques[0].id === "G18" && /Knee Cut/.test(f[0].techniques[0].name) && f[0].techniques[2].text === "Passage en X", f);
ok("adhérent : aucun droit de modifier dans le fil", f[0].can_edit === false && f[0].can_publish === false);
ok("adhérent d'un autre groupe : ne voit pas la séance", (await feed(B2)).length === 0 && (await t(B2, "select count(*)::int n from public.class_sessions")).rows[0].n === 0);
ok("autre club et personne sans club : rien", (await feed(D1)).length === 0 && (await t(D1, "select count(*)::int n from public.class_sessions")).rows[0].n === 0 && (await feed(X1)).length === 0);
ok("visiteur non connecté : aucun accès", !!(await t(null, "select count(*) from public.class_sessions")).err);

// Groupes secondaires
ok("adhérent : ne peut pas modifier ses groupes", !!(await t(B3, "select public.set_member_groups($1, array[$2]::uuid[])", [await mid(B3), GI])).err);
r = await t(A1, "select public.set_member_groups($1, array[$2]::uuid[]) n", [await mid(B3), GI]);
ok("responsable : ajoute le groupe secondaire Adultes Gi à un adhérent No-Gi", r.rows?.[0]?.n === 1, r);
ok("groupe principal inchangé (aucune donnée existante modifiée)", (await db.query("select section_id from public.academy_members where user_id=$1", [B3])).rows[0].section_id === NG);
ok("… il voit maintenant le Journal des deux groupes", (await feed(B3)).length === 1 && (await t(B3, "select public.journal_groups() g")).rows[0].g.filter(g => g.mine).length === 2);
ok("groupe d'un autre club refusé", !!(await t(A1, "select public.set_member_groups($1, array[$2]::uuid[])", [await mid(B3), GD])).err);
// Fiche élève : groupe principal + secondaires, par le compte de l'élève
let sg = await t(A1, "select public.student_groups($1) j", [B3]);
ok("fiche élève : groupes lus (principal No-Gi, secondaire Adultes Gi, modifiable)", sg.rows?.[0]?.j?.primary === NG && sg.rows[0].j.secondary.includes(GI) && sg.rows[0].j.can_edit === true, sg);
r = await t(A1, "select public.set_student_groups($1, $2, array[$3]::uuid[]) n", [B3, GI, NG]);
ok("responsable : change le groupe principal d'un élève et garde l'autre en secondaire", r.rows?.[0]?.n === 1 && (await db.query("select section_id from public.academy_members where user_id=$1", [B3])).rows[0].section_id === GI, r);
await t(A1, "select public.set_student_groups($1, $2, array[$3]::uuid[]) n", [B3, NG, GI]);
ok("le groupe d'un membre de l'équipe ne se règle pas par la fiche élève", !!(await t(A1, "select public.set_student_groups($1, $2, '{}'::uuid[])", [L1, GI])).err && (await db.query("select section_id from public.academy_members where user_id=$1", [L1])).rows[0].section_id === NG);
ok("personne ne modifie ses propres groupes (pas d'élévation de droits)", !!(await t(A1, "select public.set_member_groups($1, array[$2]::uuid[])", [await mid(A1), GI])).err && !!(await t(A1, "select public.set_student_groups($1, null, '{}'::uuid[])", [A1])).err);
ok("élève : ne lit pas les groupes d'un autre élève", !!(await t(B3, "select public.student_groups($1)", [B1])).err);
ok("autre club : élève introuvable", !!(await t(D1, "select public.student_groups($1)", [B3])).err);

const gA = (await t(I1, "select public.journal_groups() g")).rows[0].g;
ok("groupes côté équipe : cours rattachés et droit de création par groupe", gA.find(g => g.id === GI)?.courses?.includes("x1") && gA.find(g => g.id === GI)?.can_create === true && gA.find(g => g.id === NG)?.can_create === false, gA);
// Droits des professeurs
r = await save(I1, null, { theme: "Gardes ouvertes" }, true);
ok("prof (ses cours) : crée et publie une séance de son cours", r.rows?.[0]?.j?.status === "publie", r); const s2 = r.rows?.[0]?.j?.id;
ok("prof (ses cours) : refusé sur un groupe dont il n'encadre aucun cours", !!(await save(I1, null, { section_id: NG, course_key: "x2", discipline_id: "grappling_nogi" }, false)).err);
ok("prof sans droit « modifier les séances des autres » : ne peut pas modifier celle du responsable", !!(await save(I1, s1, { theme: "Modifié" }, false)).err);
ok("prof : modifie sa propre séance", (await save(I1, s2, { theme: "Gardes ouvertes et rétention" }, false)).rows?.[0]?.j?.status === "publie");
ok("prof sans aucun droit Journal : ni création ni lecture", !!(await save(I2, null, {}, false)).err && (await feed(I2)).length === 0);
ok("cours d'un autre groupe refusé", !!(await save(A1, null, { section_id: NG, course_key: "x1", discipline_id: "grappling_nogi" }, false)).err);
r = await save(L1, null, { section_id: NG, course_key: "x2", discipline_id: "grappling_nogi", theme: "Front headlock", techniques: [{ t: "N01" }] }, true);
ok("responsable de section : publie dans sa section", r.rows?.[0]?.j?.status === "publie", r); const s3 = r.rows?.[0]?.j?.id;
ok("responsable de section : refusé hors de sa section", !!(await save(L1, null, {}, false)).err);
ok("responsable de section : ne voit pas le Journal du groupe Gi", (await feed(L1)).every(x => x.section_id === NG));
ok("adhérent No-Gi : voit la séance No-Gi seulement ; adhérent Gi ne la voit pas", (await feed(B2)).length === 1 && (await feed(B1)).every(x => x.section_id === GI));
ok("fiche archivée (D1) refusée dans une séance", !!(await save(A1, null, { techniques: [{ t: "G31" }] }, false)).err);
ok("discipline fermée refusée", (await t(A1, "select public.library_set_disciplines(array['grappling_nogi'])"), !!(await save(A1, null, {}, false)).err));
await t(A1, "select public.library_set_disciplines(array['jjb_gi','grappling_nogi'])");
ok("thème obligatoire", !!(await save(A1, null, { theme: " " }, false)).err);
ok("séance précédente d'un autre groupe refusée", !!(await save(A1, null, { previous_session_id: s3 }, false)).err);
ok("séance précédente du même groupe acceptée", !(await save(A1, null, { previous_session_id: s1, session_date: "2026-11-01" }, false)).err);

// Recherche, filtres, dépublication, historique
const kn = await feed(A1, [null, null, null, null, "knee", null]), hl = await feed(A1, [null, null, null, null, "headlock", null]);
ok("recherche par technique (« knee ») et par thème", kn.length >= 1 && kn.every(x => x.techniques.some(y => y.id === "G18")) && hl.length === 1 && hl[0].theme === "Front headlock", [kn.length, hl.length]);
ok("filtre groupe et discipline", (await feed(A1, [NG, null, null, null, null, null])).length === 1 && (await feed(A1, [null, "jjb_gi", null, null, null, null])).every(x => x.discipline_id === "jjb_gi"));
await t(A1, "select public.journal_set_status($1,'depublie')", [s1]);
ok("dépubliée : disparaît pour les adhérents, reste pour l'équipe", (await feed(B1)).every(x => x.id !== s1) && (await feed(A1)).some(x => x.id === s1 && x.status === "depublie"));
const ev = (await db.query("select string_agg(action, ',' order by id) s from public.class_session_events where session_id=$1", [s1])).rows[0].s;
ok("historique : création, publication, dépublication", ev === "creation,publication,depublication", ev);
ok("historique lisible par l'équipe autorisée, pas par l'adhérent", (await t(A1, "select count(*)::int n from public.class_session_events")).rows[0].n > 0 && (await t(B1, "select count(*)::int n from public.class_session_events")).rows[0].n === 0);

// Focus de groupe
ok("adhérent : ne peut pas publier de focus", !!(await t(B1, "select public.set_group_focus($1, $2::jsonb)", [GI, JSON.stringify({ theme: "x" })])).err);
await t(A1, "select public.set_group_focus($1, $2::jsonb)", [GI, JSON.stringify({ theme: "Passer la demi-garde", from: "fond", to: "controle", details: "Underhook d'abord" })]);
const gB1 = (await t(B1, "select public.journal_groups() g")).rows[0].g, gB2 = (await t(B2, "select public.journal_groups() g")).rows[0].g;
ok("focus du groupe : visible des adhérents du groupe seulement", gB1.length === 1 && gB1[0].focus?.theme === "Passer la demi-garde" && gB2.every(g => g.id !== GI));
r = await save(A1, null, { theme: "Demi-garde" }, true);
ok("la séance garde le focus du moment (celui du groupe)", (await db.query("select focus_snapshot->>'source' s from public.class_sessions where id=$1", [r.rows[0].j.id])).rows[0].s === "groupe");
await t(A1, "select public.set_group_focus($1, null)", [GI]);
ok("focus dépublié : historique conservé", (await db.query("select count(*)::int n from public.group_focus where section_id=$1 and unpublished_at is not null", [GI])).rows[0].n === 1);

// Collectif ≠ individuel ; retrait ; droits existants
ok("le Journal n'a rien écrit dans les journaux personnels ni les étoiles", (await db.query("select md5(string_agg(path || data::text, '|' order by path)) h from public.docs")).rows[0].h === docsBefore);
await db.query("update public.academy_members set status='removed' where user_id=$1", [B1]);
ok("adhérent retiré : plus d'accès, les séances restent", (await feed(B1)).length === 0 && (await db.query("select count(*)::int n from public.class_sessions where academy_id=$1", [CA])).rows[0].n >= 4);
ok("droits existants toujours valides", (await db.query("select public.uzu_perm_valid('students','view','academy') a, public.uzu_perm_valid('library','approve','academy') b, public.uzu_perm_valid('class_journal','approve','section') c")).rows.every(x => x.a && x.b && x.c));
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
