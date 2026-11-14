"""Espace Club (lot 3) de bout en bout, Supabase simulé.
Serveur : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co npm run build && npx next start -p 3100
Vérifie : accès selon le rôle et les droits, appel (seuls les pointages modifiés partent au serveur),
fiche élève, notes pédagogiques (académie et auteur fixés), ★★★, retrait, grades (demandes, propositions, attribution)."""
import json, time, base64, copy, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000a1"
S1, S2, S3 = "00000000-0000-0000-0000-0000000000c1", "00000000-0000-0000-0000-0000000000c2", "00000000-0000-0000-0000-0000000000c3"
T = date.today(); d = lambda n: (T - timedelta(days=n)).isoformat()
WD = T.weekday() + 1  # aujourd'hui, 1 = lundi
def jwt():
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": UID, "exp": int(time.time()) + 3600, "role": "authenticated", "email": "prof@test.fr"}) + ".sig"
SESS = {"access_token": jwt(), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
        "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "prof@test.fr", "user_metadata": {"name": "Paul Prof"}, "app_metadata": {}}}
CLUB = {"id": "c1", "name": "Académie de test", "invite_code": "TEST2026",
        "schedule": [{"id": "x1", "d": WD, "s": "00:01", "e": "23:59", "t": "JJB Gi adultes"}, {"id": "x2", "d": WD, "s": "00:00", "e": "23:58", "t": "Grappling"}],
        "tactical_focus": {"weekTheme": "Front headlock", "focusFrom": "lutte", "focusTo": "controle", "focusDetails": "Snap down puis guillotine"}, "profile": {}}
def ctx(role="owner", perms=None, team=True):
    c = {"role": "student" if role == "student" else "coach", "share_activity": False, "club": CLUB}
    if team:
        c.update({"academy_role": role, "member_status": "active", "member_id": "m0", "section_id": None, "perms": perms,
                  "memberships": [{"academy_id": "c1", "name": CLUB["name"], "role": role, "status": "active"}]})
    return c
def base_docs():
    return {
        f"members/{S1}": {"name": "Alice Martin", "sessions": [{"id": "a1", "date": d(2), "cat": "jjb", "type": "Gi", "dur": 90, "theme": "Guillotine", "sys": "lutte", "note": "SECRET-NOTE", "forme": "douleur"}],
                          "request": {"rank": "bleue", "stripes": 0, "since": d(1), "at": d(1) + "T10:00:00Z"}, "skills": {"Takedowns": {"lvl": 2, "at": d(2)}}, "comps": [{"id": "k1", "date": d(5), "event": "Open de test", "result": "or", "wins": 3, "losses": 0}]},
        f"members/{S2}": {"name": "Bruno Durand", "sessions": [{"id": "b1", "date": d(40), "cat": "jjb", "type": "No-gi", "dur": 60, "theme": "Passage"}]},
        f"members/{S3}": {"name": "Chloé Petit", "sessions": [{"id": "c1", "date": d(1), "cat": "jjb", "type": "Gi", "dur": 90, "theme": "Triangle"}]},
        f"grades/{S3}": {"rank": "violette", "stripes": 1, "since": "2025-09-01", "decidedAt": d(30) + "T09:00:00Z", "status": "validé", "hist": [{"rank": "violette", "stripes": 1, "since": "2025-09-01", "status": "validé", "at": d(30) + "T09:00:00Z", "by": UID}]},
        f"roll/{S3}": {"s": [{"k": d(0) + "|x1", "date": d(0), "title": "JJB Gi adultes", "dur": 90}], "a": []},
    }

class Mock:
    def __init__(s, c, my_courses=None):
        s.ctx, s.docs, s.calls, s.notes = c, base_docs(), [], [{"id": "n1", "author_user_id": "other", "visibility": "team", "body": "Note d'équipe existante", "legacy": False, "created_at": d(3) + "T08:00:00Z"}]
        s.mc = my_courses or {"assigned": [], "section": [], "staff": []}
    def handle(s, route):
        r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
        ok = lambda body, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(body))
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; args = json.loads(r.post_data or "{}")
            s.calls.append((name, args))
            if name == "get_my_context": return ok(s.ctx)
            if name == "get_my_courses": return ok(s.mc)
            if name == "get_roll_students": return ok([{"id": S1, "name": "Alice Martin"}, {"id": S2, "name": "Bruno Durand"}, {"id": S3, "name": "Chloé Petit"}, {"id": UID, "name": "Paul Prof"}])
            if name == "decide_grade": return ok({"rank": args["p_rank"], "stripes": args["p_stripes"], "status": args["p_status"]})
            if name == "verify_technique": return ok({args["p_tech"]: {"verified_by_coach": True}})
            return ok(True)
        if "/rest/v1/docs" in u:
            p = q.get("path", [""])[0]
            if p.startswith("like."):
                pre = p[5:].rstrip("%").rstrip("*")
                return ok([{"path": k, "data": v} for k, v in s.docs.items() if k.startswith(pre)])
            path = p[3:]; data = s.docs.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept", ""):
                return ok({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}, 200 if data is not None else 406)
            return ok([{"path": path, "data": data}] if data is not None else [])
        if "/rest/v1/pedagogical_notes" in u:
            if r.method == "POST":
                b = json.loads(r.post_data); s.calls.append(("notes.insert", b))
                s.notes.insert(0, {"id": "n" + str(len(s.notes) + 1), "legacy": False, "created_at": T.isoformat() + "T12:00:00Z", **b}); return ok([], 201)
            if r.method == "PATCH":
                b = json.loads(r.post_data); s.calls.append(("notes.update", {"q": q, "b": b})); return ok([], 204)
            s.calls.append(("notes.select", q)); return ok(s.notes)
        if "/rest/v1/belt_history" in u:
            s.calls.append(("belt_history.select", q))
            return ok([{"id": "p1", "student_id": S2, "rank": "bleue", "stripes": 1, "since": d(2), "comment": "Très solide", "proposed_by": "other", "created_at": d(2) + "T10:00:00Z"}])
        return ok({})
    def last(s, name): return [a for n, a in s.calls if n == name]

RES = []
def check(label, cond):
    RES.append((label, bool(cond))); print(("✔ " if cond else "✖ ") + label)

def open_page(b, m, vp={"width": 1280, "height": 900}):
    c = b.new_context(viewport=vp); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2000)
    return pg, errs

def nav(pg, label):
    pg.locator(".primary-nav .nav-item", has_text=label).first.click(); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")

    # 1. Responsable : accueil
    m = Mock(ctx("owner")); pg, errs = open_page(b, m)
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1500)
    t = pg.inner_text(".page-content")
    check("Accueil club : 3 élèves, 2 actifs, 1 grade à valider", "Élèves au total\n3" in t.replace("\n\n", "\n") or ("3" in t and "Élèves au total" in t))
    nums = [pg.locator(".metric-card strong").nth(i).inner_text() for i in range(3)]
    check(f"Accueil club : compteurs {nums} = 3 / 2 / 1", nums == ["3", "2", "1"])
    check("Accueil club : focus publié et prochains cours", "Front headlock" in t and "JJB Gi adultes" in t)
    check("Accueil club : activité (appel, compétition, grade)", "Appel JJB Gi adultes" in t and "Open de test" in t)
    nav_txt = pg.inner_text(".primary-nav")
    check("Responsable : tous les onglets", all(k in nav_txt for k in ["Présences", "Élèves", "Progression", "Équipe", "Mon académie"]))
    pg.screenshot(path="/tmp/club_home_desk.png", full_page=True)

    # 2. Appel
    nav(pg, "Présences"); pg.wait_for_timeout(800)
    opts = pg.locator("#roll-slot option").all_inner_texts()
    check(f"Appel : cours du jour proposés ({len(opts)})", any("JJB Gi adultes" in o for o in opts) and any("Grappling" in o for o in opts))
    names = pg.locator(".uzu-roll-n b").all_inner_texts()
    check("Appel : le prof n'apparaît pas dans la liste", "Paul Prof" not in names and len(names) == 3)
    pg.select_option("#roll-slot", label=[o for o in opts if "JJB Gi adultes" in o][0]); pg.wait_for_timeout(800)
    check("Appel : présence déjà enregistrée reprise", "déjà noté pour ce cours" in pg.inner_text(".uzu-roll"))
    pg.locator(".uzu-roll li", has_text="Alice").locator("button", has_text="Présent").click()
    pg.locator(".uzu-roll li", has_text="Bruno").locator("button", has_text="Absent").click()
    counts = pg.inner_text(".uzu-counts")
    check("Appel : compteurs 2 présents / 1 absent", counts.split()[0] == "2" and counts.split()[2] == "1")
    pg.locator("button", has_text="Valider l'appel").click(); pg.wait_for_timeout(800)
    sa = m.last("set_attendance")
    check("Appel : un seul envoi au serveur", len(sa) == 1)
    if sa:
        a = sa[0]
        check(f"Appel : seuls les pointages modifiés partent {a['p_marks']}", a["p_marks"] == {S1: "p", S2: "a"})
        check("Appel : cours, date, thème = focus, système = focus", a["p_course"] == "x1" and a["p_date"] == d(0) and a["p_theme"] == "Front headlock" and a["p_sys"] == "lutte" and a["p_dur"] == 1438)
    check("Appel : confirmation affichée", "Appel enregistré" in pg.inner_text(".page-content"))
    pg.locator(".uzu-seg button", has_text="Journal").click(); pg.wait_for_timeout(300)
    check("Journal des appels", "JJB Gi adultes" in pg.inner_text(".page-content") and "présent" in pg.inner_text(".page-content"))

    # 3. Élèves et fiche
    nav(pg, "Élèves")
    cards = pg.locator(".uzu-pcard").all_inner_texts()
    check("Élèves : 3 fiches", len(cards) == 3)
    pg.locator(".uzu-seg button", has_text="À relancer").click(); pg.wait_for_timeout(200)
    check("Élèves : filtre À relancer", pg.locator(".uzu-pcard").count() == 1 and "Bruno" in pg.inner_text(".uzu-plist"))
    pg.locator(".uzu-seg button", has_text="Tous").click(); pg.locator(".uzu-pcard", has_text="Alice").click(); pg.wait_for_timeout(500)
    t = pg.inner_text(".page-content")
    check("Fiche : demande en attente et médaille", "Demande en attente : Demande de ceinture bleue" in t and "1 or" in t)
    check("Fiche : la note perso et l'état physique de l'élève ne sont jamais affichés", "SECRET-NOTE" not in pg.content() and "douleur" not in t.lower())
    pg.locator(".uzu-tabs button", has_text="Progression").click(); pg.wait_for_timeout(300)
    pg.locator(".uzu-skill-list li", has_text="Takedowns").locator("button", has_text="Valider ★★★").click(); pg.wait_for_timeout(600)
    vt = m.last("verify_technique")
    check("★★★ : validation envoyée", vt and vt[0] == {"p_student": S1, "p_tech": "Takedowns", "p_on": True})
    pg.locator(".uzu-tabs button", has_text="Notes").click(); pg.wait_for_timeout(600)
    check("Notes : note d'équipe existante affichée", "Note d'équipe existante" in pg.inner_text(".page-content"))
    sel = m.last("notes.select")
    check("Notes : lecture limitée à l'élève et à l'académie active", sel and sel[-1].get("student_id") == [f"eq.{S1}"] and sel[-1].get("academy_id") == ["eq.c1"] and sel[-1].get("deleted_at") == ["is.null"])
    pg.fill("textarea[aria-label='Nouvelle note']", "Travailler la base en garde fermée")
    pg.locator("[aria-label='Visibilité de la note'] button", has_text="Privée").click()
    pg.locator("button", has_text="Ajouter la note").click(); pg.wait_for_timeout(800)
    ins = m.last("notes.insert")
    check(f"Notes : insertion privée, auteur = moi, académie active", ins and ins[0] == {"academy_id": "c1", "student_id": S1, "author_user_id": UID, "visibility": "private", "body": "Travailler la base en garde fermée"})
    pg.locator(".uzu-notes li", has_text="Travailler la base").locator("button", has_text="Supprimer").click(); pg.wait_for_timeout(600)
    up_ = m.last("notes.update")
    check("Notes : suppression = effacement logique (deleted_at), pas de DELETE", up_ and "deleted_at" in up_[0]["b"] and up_[0]["q"].get("id"))
    check("Notes : on ne peut supprimer que ses propres notes", pg.locator(".uzu-notes li", has_text="Note d'équipe existante").locator("button").count() == 0)
    pg.locator(".uzu-tabs button", has_text="Profil").click(); pg.wait_for_timeout(200)
    rm = pg.locator("button", has_text="Retirer de l'académie"); rm.click(); pg.wait_for_timeout(200)
    check("Retrait : rien n'est envoyé au premier appui", not m.last("remove_student"))
    pg.locator("button", has_text="Confirmer le retrait").click(); pg.wait_for_timeout(600)
    check("Retrait : remove_student envoyé après confirmation", m.last("remove_student") == [{"p_student": S1}])

    # 4. Progression : demandes, propositions, attribution
    nav(pg, "Progression"); pg.wait_for_timeout(500)
    t = pg.inner_text(".page-content")
    check("Progression : demande d'Alice et proposition pour Bruno", "Demande de ceinture bleue" in t and "Proposé par un prof du club" in t and "Très solide" in t)
    req = pg.locator(".uzu-req", has_text="Alice").first
    req.locator("button", has_text="Voir la fiche").click(); req.locator("textarea").fill("Bravo")
    req.locator("button", has_text="Valider").click(); pg.wait_for_timeout(600)
    dg = m.last("decide_grade")
    check(f"Progression : demande validée avec le commentaire", dg and dg[0] == {"p_student": S1, "p_rank": "bleue", "p_stripes": 0, "p_since": d(1), "p_status": "validé", "p_comment": "Bravo"})
    pg.locator(".uzu-req", has_text="Bruno").locator("button", has_text="Refuser").click(); pg.wait_for_timeout(600)
    dg = m.last("decide_grade")
    check("Progression : refus d'une proposition = grade actuel conservé", len(dg) == 2 and dg[1]["p_status"] == "refusé" and dg[1]["p_rank"] == "blanche" and dg[1]["p_student"] == S2)
    pg.select_option("#g-who", label="Chloé Petit"); pg.wait_for_timeout(200)
    check("Attribution : grade actuel pré-rempli", pg.input_value("#g-rank") == "violette")
    pg.locator("[aria-label='Barrettes'] button", has_text="2").click(); pg.locator("button", has_text="Valider le grade").click(); pg.wait_for_timeout(600)
    dg = m.last("decide_grade")
    check("Attribution : décision envoyée", len(dg) == 3 and dg[2]["p_student"] == S3 and dg[2]["p_rank"] == "violette" and dg[2]["p_stripes"] == 2 and dg[2]["p_status"] == "validé")
    t = pg.inner_text(".page-content")
    check("Progression : historique, répartition, compétitions", "validé par toi" in t and "Violette" in t and "Open de test" in t)
    check("Responsable : aucune erreur JavaScript", not errs); print("   ", errs)
    pg.context.close()

    # 5. Professeur aux droits limités (cours affectés), sur mobile
    perms = {"dashboard": {"view": "academy"}, "attendance": {"view": "assigned_courses", "create": "assigned_courses"}, "students": {"view": "assigned_courses"},
             "belts": {"view": "assigned_courses", "create": "assigned_courses"}, "progression": {"view": "assigned_courses"}, "pedagogical_notes": {"view": "assigned_courses", "create": "assigned_courses"}}
    m = Mock(ctx("instructor", perms), {"assigned": ["x2"], "section": [], "staff": []}); pg, errs = open_page(b, m, {"width": 390, "height": 844})
    pg.locator(".mobile-switcher button").click(); pg.wait_for_timeout(1200)
    pg.locator(".mobile-menu-trigger").click(); pg.wait_for_timeout(300)
    nav_txt = pg.inner_text(".primary-nav")
    check("Professeur : pas d'onglet Équipe", "Équipe" not in nav_txt and "Présences" in nav_txt)
    t = pg.inner_text(".page-content")
    check("Professeur : pas de bouton Ajouter un élève", "Ajouter un élève" not in t)
    pg.locator(".primary-nav .nav-item", has_text="Présences").click(); pg.wait_for_timeout(1200)
    opts = pg.locator("#roll-slot option").all_inner_texts()
    check(f"Professeur : seulement son cours affecté, pas de cours hors planning {opts}", all("Grappling" in o for o in opts) and len(opts) >= 1 and not any("hors planning" in o for o in opts))
    pg.screenshot(path="/tmp/club_roll_mob.png", full_page=True)
    pg.locator(".mobile-menu-trigger").click(); pg.wait_for_timeout(300)
    pg.locator(".primary-nav .nav-item", has_text="Progression").click(); pg.wait_for_timeout(1200)
    t = pg.inner_text(".page-content")
    check("Professeur : propose au lieu de valider", "Proposer au responsable" in t and "Propositions de l'équipe" not in t and "Proposer ce grade au responsable" in t)
    check("Professeur : les propositions ne sont pas lues sans droit de validation", not m.last("belt_history.select"))
    pg.locator(".uzu-req", has_text="Alice").locator("button", has_text="Proposer au responsable").click(); pg.wait_for_timeout(600)
    pr = m.last("propose_grade")
    check("Professeur : proposition envoyée", pr and pr[0]["p_student"] == S1 and pr[0]["p_rank"] == "bleue")
    check("Professeur : aucune erreur JavaScript", not errs)
    pg.context.close()

    # 6. Élève : pas d'espace Club
    m = Mock(ctx("student", {})); m.ctx["role"] = "student"; pg, errs = open_page(b, m)
    check("Élève : pas de sélecteur Club", pg.locator(".space-picker").count() == 0)
    pg.context.close()

    # 7. Base sans migration « équipe » : l'espace Club renvoie vers l'application actuelle
    m = Mock(ctx("owner", team=False)); pg, errs = open_page(b, m)
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1000)
    t = pg.inner_text(".page-content")
    check("Sans migration équipe : aucune écriture possible, renvoi vers l'application actuelle", "Ouvrir l'application actuelle" in t and not m.last("set_attendance"))
    pg.context.close()
    b.close()

ok = sum(1 for _, v in RES if v); print(f"\n{ok}/{len(RES)} vérifications réussies")
