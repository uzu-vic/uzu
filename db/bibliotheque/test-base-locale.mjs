import fs from "fs";
import { makeDb, U, as } from "./base.mjs";
const db = await makeDb(); const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + JSON.stringify(g))) };
const t = async (uid, sql, p) => { try { return { rows: (await as(db, uid, sql, p)).rows } } catch (e) { return { err: e.message } } };
const rd = f => fs.readFileSync(f, "utf8");
await db.exec(rd("/home/claude/lot6/uzu-6-securite.sql").split("-- 6. Contrôle")[0].replace(/-- -+\s*$/, ""));
await db.exec(rd("/home/claude/lot6/uzu-8-partenaires.sql").split("-- Contrôle")[0]);
const s9 = rd("/home/claude/uzu-repo/db/uzu-9-bibliotheque.sql");
const before = (await db.query("select count(*)::int n from public.docs")).rows[0].n;
await db.exec(s9);
const ctl = (await db.query(s9.split("commit;")[1])).rows[0];
ok("contrôle : 13 tables, 3 disciplines, 12 catégories, 70 fiches dont 60 du document, 4 enchaînements, 33 étapes, droit ajouté",
  ctl.tables_ajoutees == 13 && ctl.fiches_archivees == 10 && ctl.disciplines == 3 && ctl.categories == 12 && ctl.fiches == 70 && ctl.fiches_du_document == 60 && ctl.enchainements == 4 && ctl.etapes == 33 && ctl.droit_bibliotheque, ctl);
await db.exec(s9);
ok("script rejouable sans doublon ni changement de version", (await db.query("select count(*)::int n, max(version) v from public.lib_techniques")).rows[0].v === 1);
ok("aucune donnée existante modifiée", (await db.query("select count(*)::int n from public.docs")).rows[0].n === before);

// Fidélité au document
const src = rd("/home/claude/uzu-repo/db/bibliotheque/programme-source.txt").replace(/\s+/g, " ");
const docs = (await db.query("select id, name, source_text from public.lib_techniques where origin='document' order by id")).rows;
ok("les 60 descriptions du document sont reprises mot pour mot", docs.length === 60 && docs.every(d => src.includes(d.name + " : " + d.source_text)), docs.filter(d => !src.includes(d.name + " : " + d.source_text)).map(d => d.id));
const n27 = (await db.query("select source_text, proposed_text, validation_status from public.lib_techniques where id='N27'")).rows[0];
ok("N27 : texte d'origine conservé, correction à côté, statut « à valider »", n27.source_text.includes("trachée") && n27.proposed_text.includes("pas de pression sur la trachée") && n27.validation_status === "a_valider", n27);
ok("fiches complémentaires : origine « proposition », pas de texte d'origine", (await db.query("select count(*)::int n from public.lib_techniques where origin='proposition' and source_text is null and validation_status='a_valider'")).rows[0].n === 10);
ok("toutes les fiches sont « à valider » (aucune présentée comme validée)", (await db.query("select count(*)::int n from public.lib_techniques where validation_status<>'a_valider'")).rows[0].n === 0);
ok("clés de talon signalées (N25, N28, N32, N33)", (await db.query("select string_agg(id, ',' order by id) s from public.lib_techniques where restricted='cles_talon'")).rows[0].s === "N25,N28,N32,N33");
ok("aucun lien vidéo dans le catalogue", !(await db.query("select 1 from public.lib_techniques where source_text ~ 'https?://' or proposed_text ~ 'https?://'")).rows.length);
const fc3 = (await db.query("select id, parent_id, kind, origin from public.lib_flow_steps where flow_id='FC3' order by position")).rows;
ok("FC3 : deux réactions depuis l'action 1 ; suite A proposée ; clés de jambes sous la réaction B",
  fc3.filter(s => s.parent_id === "FC3-a1").length === 2 && fc3.find(s => s.id === "FC3-pa").origin === "proposition" && fc3.find(s => s.id === "FC3-t").parent_id === "FC3-rb", fc3);
ok("liens étape → fiche proposés marqués comme tels", (await db.query("select count(*)::int n from public.lib_flow_step_techniques where technique_id in ('G31','G32','G33','G34','N31','N32','N33','N34','N35','N36') and origin<>'proposition'")).rows[0].n === 0);

// Utilisateurs : club A (A1 responsable, I1 prof avec droit de valider, I2 prof sans, B1/B2 élèves) ; club D (D1)
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
// Le responsable accorde le droit de valider à I1 par la fonction existante (catalogue des droits étendu)
let r = await t(A1, "select public.set_member_permissions($1, $2::jsonb) n", [mI1, JSON.stringify([{ r: "library", a: "approve", s: "academy" }])]);
ok("le responsable peut accorder « valider la bibliothèque » avec la fonction existante", !r.err, r.err);
ok("un prof ne peut pas s'accorder lui-même le droit", !!(await t(I2, "select public.set_member_permissions((select id from public.academy_members where user_id=auth.uid()), $1::jsonb)", [JSON.stringify([{ r: "library", a: "approve", s: "academy" }])])).err);

// Lecture du catalogue
const cnt = async u => (await t(u, "select count(*)::int n from public.lib_techniques")).rows?.[0]?.n;
ok("élève du club : voit les 60 fiches du document (10 complémentaires archivées, club non configuré)", await cnt(B1) === 60);
ok("D1 : aucune fiche complémentaire ni suite proposée visible d'un club", (await t(B1, "select count(*)::int n from public.lib_techniques where origin='proposition'")).rows[0].n === 0 && (await t(B1, "select count(*)::int n from public.lib_flow_steps where origin='proposition'")).rows[0].n === 0 && (await t(B1, "select count(*)::int n from public.lib_flow_step_techniques where origin='proposition'")).rows[0].n === 0);
ok("D1 : étapes du document conservées (31 sur 33), sans lien vers une fiche archivée", (await t(B1, "select count(*)::int n from public.lib_flow_steps")).rows[0].n === 31);
ok("D2 : corrections N25, N27, N28 conservées, « à valider »", (await t(B1, "select count(*)::int n from public.lib_techniques where id in ('N25','N27','N28') and proposed_text is not null and validation_status='a_valider'")).rows[0].n === 3);
ok("personne sans club : ne voit aucune fiche", await cnt(X1) === 0);
ok("visiteur non connecté : aucun accès", !!(await t(null, "select count(*) from public.lib_techniques")).err);
ok("élève : modification du catalogue impossible", !!(await t(B1, "update public.lib_techniques set name='x' where id='G01'")).err);
ok("responsable : modification ou ajout dans le catalogue impossible", !!(await t(A1, "insert into public.lib_disciplines (id,label) values ('judo','Judo')")).err && !!(await t(A1, "delete from public.lib_flow_steps")).err);
ok("élève : ne peut pas choisir les disciplines", !!(await t(B1, "select public.library_set_disciplines(array['jjb_gi'])")).err);
r = await t(A1, "select public.library_set_disciplines(array['grappling_nogi']) v");
ok("responsable : n'ouvre que le Grappling No-Gi", r.rows?.[0]?.v?.join() === "grappling_nogi", r);
ok("… l'élève ne voit plus que les 30 fiches No-Gi", await cnt(B1) === 30);
ok("… et seulement les enchaînements FC3 et FC4", (await t(B1, "select string_agg(id, ',' order by id) s from public.lib_flows")).rows[0].s === "FC3,FC4");
ok("… l'autre club garde tout son catalogue", await cnt(D1) === 60);
ok("fermer toutes les disciplines refusé (la bibliothèque resterait inaccessible)", !!(await t(A1, "select public.library_set_disciplines(array[]::text[])")).err);
ok("discipline inactive (MMA) refusée", !!(await t(A1, "select public.library_set_disciplines(array['mma'])")).err);
ok("MMA invisible dans le catalogue tant qu'elle est inactive", (await t(B1, "select count(*)::int n from public.lib_disciplines where id='mma'")).rows[0].n === 0);
await t(A1, "select public.library_set_disciplines(array['jjb_gi','grappling_nogi'])");
r = await t(B1, "select public.library_context() c"); const c = r.rows?.[0]?.c;
ok("contexte élève : disciplines, aucun droit de valider ni de gérer", c?.disciplines?.length === 2 && !c.can_review && !c.can_manage, r);
ok("contexte prof autorisé : peut valider", (await t(I1, "select public.library_context() c")).rows[0].c.can_review === true);

// Contributions
const item = (o) => JSON.stringify(Object.assign({ kind: "variante", technique_id: "G12", title: "Tripod depuis la Spider", body: "Variante du club" }, o));
r = await t(B1, "select public.library_save_item(null, $1::jsonb, false) j", [item({})]); const it1 = r.rows?.[0]?.j?.id;
ok("élève : brouillon créé", r.rows?.[0]?.j?.status === "brouillon", r);
ok("brouillon invisible des autres membres et des relecteurs", (await t(B2, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0 && (await t(I1, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0);
ok("lien autre que YouTube/Instagram refusé", !!(await t(B1, "select public.library_save_item(null, $1::jsonb, false)", [item({ kind: "lien", url: "https://evil.example/x" })])).err);
ok("envoi d'un lien sans déclaration d'accord refusé", !!(await t(B1, "select public.library_save_item(null, $1::jsonb, true)", [item({ kind: "lien", url: "https://www.youtube.com/watch?v=abc" })])).err);
r = await t(B1, "select public.library_save_item($1, $2::jsonb, true) j", [it1, item({ url: "https://youtu.be/abc", rights: true })]);
ok("élève : envoi → en attente (jamais publié directement)", r.rows?.[0]?.j?.status === "en_attente", r);
ok("accord des personnes filmées enregistré avec l'auteur et la date", (await db.query("select rights_declared_by=$2 and rights_declared_at is not null ok from public.club_lib_items where id=$1", [it1, B1])).rows[0].ok);
ok("relecteurs notifiés (responsable et prof autorisé, pas le prof sans droit)", (await db.query("select string_agg(user_id::text, ',' order by user_id) s from public.notifications where dedupe=$1", ["lib:" + it1])).rows[0].s === [A1, I1].sort().join(","));
ok("prof autorisé : voit la proposition en attente", (await t(I1, "select count(*)::int n from public.club_lib_items where status='en_attente'")).rows[0].n === 1);
ok("prof sans droit : ne la voit pas et ne peut pas la valider", (await t(I2, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0 && !!(await t(I2, "select public.library_review_item($1,'publier','',null)", [it1])).err);
r = await t(I1, "select public.library_review_queue() q"); const qq = r.rows?.[0]?.q;
ok("file de validation : la proposition, avec le nom et le rôle de l'auteur", Array.isArray(qq) && qq.length === 1 && qq[0].author_role === "student" && !!qq[0].author_name, r);
ok("file de validation refusée à un élève et au prof sans droit", !!(await t(B2, "select public.library_review_queue()")).err && !!(await t(I2, "select public.library_review_queue()")).err);
ok("élève : ne peut pas valider", !!(await t(B2, "select public.library_review_item($1,'publier','',null)", [it1])).err);
ok("auteur : ne peut plus modifier une proposition en attente", !!(await t(B1, "select public.library_save_item($1, $2::jsonb, false)", [it1, item({})])).err);
ok("autre club : ne voit rien", (await t(D1, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0);
ok("autre club : ne peut pas la valider", !!(await t(D1, "select public.library_review_item($1,'publier','',null)", [it1])).err);
ok("aucune écriture directe dans les contenus", !!(await t(B1, "update public.club_lib_items set status='publie'")).err && !!(await t(I1, "insert into public.club_lib_items (academy_id,kind,title,status) values ($1,'note','x','publie')", [CA])).err);
ok("demande de précisions sans motif refusée", !!(await t(I1, "select public.library_review_item($1,'preciser','',null)", [it1])).err);
r = await t(I1, "select public.library_review_item($1,'preciser','Préciser la prise de manche',null) s", [it1]);
ok("demande de précisions → « À compléter » avec motif", r.rows?.[0]?.s === "a_completer", r);
ok("« À compléter » : l'auteur voit le motif, les autres élèves ne voient rien", (await t(B1, "select review_note from public.club_lib_items where id=$1", [it1])).rows?.[0]?.review_note === "Préciser la prise de manche" && (await t(B2, "select count(*)::int n from public.club_lib_items where id=$1", [it1])).rows[0].n === 0);
ok("enregistrer sans renvoyer : reste « À compléter »", (await t(B1, "select public.library_save_item($1, $2::jsonb, false) j", [it1, item({ body: "brouillon", url: "https://youtu.be/abc", rights: true })])).rows?.[0]?.j?.status === "a_completer");
ok("l'auteur est notifié de la demande", (await db.query("select 1 from public.notifications where user_id=$1 and dedupe=$2", [B1, "lib:" + it1 + ":preciser"])).rows.length === 1);
await t(B1, "select public.library_save_item($1, $2::jsonb, true)", [it1, item({ body: "Avec saisie de la manche", url: "https://youtu.be/abc", rights: true })]);
r = await t(I1, "select public.library_review_item($1,'publier','',$2::jsonb) s", [it1, JSON.stringify({ title: "Tripod depuis la Spider Guard" })]);
ok("validation avec correction du titre → publié", r.rows?.[0]?.s === "publie" && (await db.query("select title from public.club_lib_items where id=$1", [it1])).rows[0].title === "Tripod depuis la Spider Guard", r);
ok("publié : visible par tous les membres du club", (await t(B2, "select count(*)::int n from public.club_lib_items where status='publie'")).rows[0].n === 1);
ok("… mais pas par l'autre club", (await t(D1, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0);
const ev = (await db.query("select string_agg(action, ',' order by id) s from public.club_lib_events where item_id=$1", [it1])).rows[0].s;
ok("historique complet (création, envoi, précisions, modification, envoi, validation)", ev === "creation,envoi,demande_precisions,modification,envoi,validation", ev);
ok("historique : lisible par les relecteurs, pas par les élèves", (await t(I1, "select count(*)::int n from public.club_lib_events")).rows[0].n === 6 && (await t(B2, "select count(*)::int n from public.club_lib_events")).rows[0].n === 0);
r = await t(B2, "select public.library_save_item(null, $1::jsonb, true) j", [item({ kind: "astuce", title: "Astuce" })]); const it2 = r.rows?.[0]?.j?.id;
ok("refus sans motif impossible", !!(await t(I1, "select public.library_review_item($1,'refuser','',null)", [it2])).err);
ok("refus avec motif", (await t(I1, "select public.library_review_item($1,'refuser','Hors programme',null) s", [it2])).rows?.[0]?.s === "refuse");
ok("refusé : visible de l'auteur avec le motif, pas des autres élèves", (await t(B2, "select review_note from public.club_lib_items where id=$1", [it2])).rows?.[0]?.review_note === "Hors programme" && (await t(B1, "select count(*)::int n from public.club_lib_items where id=$1", [it2])).rows[0].n === 0);
r = await t(A1, "select public.library_save_item(null, $1::jsonb, true) j", [item({ kind: "note", title: "Note du responsable" })]);
ok("question pédagogique sans fiche (discipline choisie) : envoyée en attente", (await t(B1, "select public.library_save_item(null, $1::jsonb, true) j", [JSON.stringify({ kind: "question", discipline_id: "grappling_nogi", title: "Quand préférer le Knee Cut ?", body: "" })])).rows?.[0]?.j?.status === "en_attente");
ok("élève : annotation réservée à l'équipe", !!(await t(B1, "select public.library_save_item(null, $1::jsonb, false)", [item({ kind: "note", title: "x" })])).err);
ok("responsable : publication directe", r.rows?.[0]?.j?.status === "publie", r);
r = await t(I2, "select public.library_save_item(null, $1::jsonb, true) j", [item({ kind: "note", title: "Note prof sans droit" })]);
ok("prof sans droit : passe par la validation", r.rows?.[0]?.j?.status === "en_attente", r);
ok("contenu sur une discipline fermée refusé", (await t(A1, "select public.library_set_disciplines(array['grappling_nogi'])"), !!(await t(B1, "select public.library_save_item(null, $1::jsonb, false)", [item({})])).err));
await t(A1, "select public.library_set_disciplines(array['jjb_gi','grappling_nogi'])");
ok("archivage : l'élève ne peut pas archiver le contenu d'un autre", !!(await t(B2, "select public.library_archive_item($1)", [it1])).err);
ok("archivage par un relecteur : rien n'est effacé", (await t(I1, "select public.library_archive_item($1) v", [it1])).rows?.[0]?.v === true && (await db.query("select status from public.club_lib_items where id=$1", [it1])).rows[0].status === "archive");

// Masquage et collections
ok("prof sans droit « gérer » : masquage impossible", !!(await t(I1, "select public.library_set_hidden('G22', true)")).err);
ok("responsable : masque une fiche", (await t(A1, "select public.library_set_hidden('G22', true) v")).rows?.[0]?.v === true && (await t(B1, "select public.library_context() c")).rows[0].c.hidden.includes("G22"));
r = await t(A1, "select public.library_save_collection(null, 'Programme ceinture bleue', '', 1, $1::jsonb) id", [JSON.stringify([{ t: "G04" }, { t: "G17" }, { t: "G23" }])]);
const col = r.rows?.[0]?.id;
ok("collection ordonnée créée", !!col && (await t(B1, "select string_agg(technique_id, ',' order by position) s from public.club_lib_collection_items")).rows[0].s === "G04,G17,G23", r);
ok("collection : contenu non publié refusé", !!(await t(A1, "select public.library_save_collection($1, 'X', '', 1, $2::jsonb)", [col, JSON.stringify([{ i: it2 }])])).err);
ok("élève : ne peut pas créer de collection", !!(await t(B1, "select public.library_save_collection(null, 'X', '', 1, '[]'::jsonb)")).err);
ok("autre club : ne voit pas la collection", (await t(D1, "select count(*)::int n from public.club_lib_collections")).rows[0].n === 0);

await db.query("insert into public.uzu_platform_admins (user_id) values ($1)", [X1]);
ok("D1 : archive conservée pour l'administration UZU (10 fiches complémentaires lisibles par l'admin plateforme)", (await t(X1, "select count(*)::int n from public.lib_techniques where archived")).rows[0].n === 10);
await db.query("delete from public.uzu_platform_admins where user_id=$1", [X1]);
// D3 : détails pédagogiques par club
ok("D3 : élève ne peut pas remplir les champs pédagogiques", !!(await t(B1, "select public.library_set_details('G18','x','y',1)")).err);
ok("D3 : prof sans droit bibliothèque ne peut pas", !!(await t(I2, "select public.library_set_details('G18','x','y',1)")).err);
ok("D3 : prof autorisé remplit étapes, vigilance, niveau pour son club", (await t(I1, "select public.library_set_details('G18','1. Saisir le col','Genou de l''adversaire',2) v")).rows?.[0]?.v === true);
ok("D3 : visibles des membres du club, pas de l'autre club ; catalogue UZU inchangé", (await t(B1, "select steps from public.club_lib_technique_details where technique_id='G18'")).rows?.[0]?.steps === "1. Saisir le col" && (await t(D1, "select count(*)::int n from public.club_lib_technique_details")).rows[0].n === 0 && (await db.query("select version from public.lib_techniques where id='G18'")).rows[0].version === 1);
ok("D3 : fiche archivée refusée", !!(await t(I1, "select public.library_set_details('G31','x','',1)")).err);
ok("D1 : contribution sur une fiche archivée refusée", !!(await t(B1, "select public.library_save_item(null, $1::jsonb, false)", [JSON.stringify({ kind: "variante", technique_id: "G31", title: "x" })])).err);

// Droits : catalogue étendu sans régression
ok("le droit inconnu reste refusé", !!(await t(A1, "select public.set_member_permissions($1, $2::jsonb)", [mI1, JSON.stringify([{ r: "library", a: "delete", s: "academy" }])])).err);
ok("les droits existants restent valides", (await db.query("select public.uzu_perm_valid('students','view','academy') a, public.uzu_perm_valid('belts','approve','section') b")).rows.every(x => x.a && x.b));

// Retrait d'un membre et suppression de compte : l'historique reste
await db.query("update public.academy_members set status='removed' where user_id=$1", [B2]);
ok("membre retiré : ne voit plus rien, ses contenus et l'historique restent", (await t(B2, "select count(*)::int n from public.club_lib_items")).rows[0].n === 0 && (await db.query("select count(*)::int n from public.club_lib_items where author_id=$1", [B2])).rows[0].n === 1);
await t(I2, "select public.delete_my_account()");
ok("suppression de compte : contenus conservés sans auteur", (await db.query("select count(*)::int n from public.club_lib_items where title='Note prof sans droit' and author_id is null")).rows[0].n === 1);
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1);
