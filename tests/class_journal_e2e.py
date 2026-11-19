# Journal des cours (lot J2) de bout en bout, base simulée.
# Lancer après un build simulé et : npx next start -p 3100
# Vérifie : onglets Club › Cours, saisie (préremplissage planning, groupe, focus, Bibliothèque, texte libre, séance précédente),
# brouillon / publication / dépublication, recherche, entrée depuis l'appel, « Cours du groupe » côté adhérent
# (présent / absent, fiche, « Noter dans mon journal »), groupes de la fiche élève, absence du script.
import json, time, base64, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; OWNER = "00000000-0000-0000-0000-0000000000a1"; S1 = "00000000-0000-0000-0000-0000000000c1"
T = date.today(); d = lambda n: (T - timedelta(days=n)).isoformat(); WD = T.weekday() + 1
CAT = json.load(open("db/bibliotheque/catalogue.json"))
def jwt(uid, email):
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": uid, "exp": int(time.time()) + 3600, "role": "authenticated", "email": email}) + ".sig"
def sess(uid, email, name): return {"access_token": jwt(uid, email), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
                                    "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email, "user_metadata": {"name": name}, "app_metadata": {}}}
CLUB = {"id": "c1", "name": "Académie de test", "invite_code": "TEST2026",
        "schedule": [{"id": "x1", "d": WD, "s": "00:01", "e": "23:59", "t": "JJB Gi adultes", "disc": "jjb"}, {"id": "x2", "d": WD, "s": "00:00", "e": "23:58", "t": "Grappling", "disc": "grappling"}],
        "tactical_focus": {"weekTheme": "Front headlock"}, "profile": {}}
PERMS = {"owner": None, "instructor": {"schedule": {"view": "academy"}, "courses": {"view": "academy"}, "class_journal": {"view": "assigned_courses", "create": "assigned_courses", "approve": "assigned_courses"}}}
def ctx(role):
    return {"role": "student" if role == "student" else "coach", "share_activity": False, "club": CLUB, "academy_role": role, "member_status": "active", "member_id": "m0",
            "section_id": None, "perms": PERMS.get(role), "memberships": [{"academy_id": "c1", "name": CLUB["name"], "role": role, "status": "active"}]}
TABLES = {
 "lib_disciplines": [dict(id=x["id"], label=x["label"], long_label=x["long"], position=x["pos"]) for x in CAT["disciplines"] if x["active"]],
 "lib_categories": [dict(id=c["id"], discipline_id=c["discipline"], position=c["pos"], label=c["label"]) for c in CAT["categories"]],
 "lib_techniques": [dict(id=t["id"], discipline_id=t["discipline"], category_id=t["category"], position=t["pos"], name=t["name"], aliases=t["aliases"], source_text=t["source_text"], proposed_text=t["proposed_text"], origin=t["origin"], level=t["level"], validation_status="a_valider", validation_refs=t["validation_refs"], restricted=t["restricted"], uzu_links=t["links"]) for t in CAT["techniques"] if t["origin"] == "document"],
 "lib_flows": [dict(id=f["id"], discipline_id=f["discipline"], position=f["pos"], title=f["title"], intro=f["intro"]) for f in CAT["flows"]],
 "lib_flow_steps": [dict(id=s["id"], flow_id=s["flow"], position=s["pos"], parent_id=s["parent"], kind=s["kind"], branch_label=s["branch"], label=s["text"], origin=s["origin"]) for s in CAT["steps"] if s["origin"] == "document"],
 "lib_flow_step_techniques": [dict(step_id=s["id"], technique_id=x["t"], position=i + 1, origin=x["o"]) for s in CAT["steps"] if s["origin"] == "document" for i, x in enumerate(s["techs"]) if x["o"] == "document"],
}
NAME = {t["id"]: t["name"] for t in CAT["techniques"]}
GI, NG = "00000000-0000-0000-0000-00000000a001", "00000000-0000-0000-0000-00000000a002"
FOCUS = {"theme": "Passer la demi-garde", "from": "fond", "to": "controle", "details": "Underhook d'abord", "published_at": d(3) + "T10:00:00Z"}
def S(id, sec, course, day, theme, status, techs, **k):
    o = {"id": id, "section_id": sec, "group_name": "Adultes Gi" if sec == GI else "No-Gi", "course_key": course, "session_date": d(day), "discipline_id": "jjb_gi" if sec == GI else "grappling_nogi",
         "theme": theme, "objective": "", "exercises": "", "comment": "", "previous_session_id": None, "status": status, "focus": {}, "created_at": d(day) + "T20:00:00Z",
         "published_at": d(day) + "T21:00:00Z" if status == "publie" else None, "mine": True, "author_name": "Paul Prof",
         "techniques": [{"id": t, "name": NAME[t], "text": None} if t in NAME else {"id": None, "name": None, "text": t} for t in techs], "media": 0, "can_edit": True, "can_publish": True}
    o.update(k); return o

class Mock:
    def __init__(s, role, journal=True, uid=OWNER, empty_overview=False):
        s.role, s.journal, s.uid, s.calls, s.empty_ov = role, journal, uid, [], empty_overview
        s.sessions = [S("s1", GI, "x1", 7, "Gardes ouvertes", "publie", ["G17"], objective="Ouvrir la garde"),
                      S("s2", GI, "x1", 14, "Passages de garde", "publie", ["G18", "Passage en X"], exercises="Situations 3 × 3 min", comment="Très bonne intensité"),
                      S("s3", NG, "x2", 1, "Front headlock", "brouillon", [])]
        s.sg = {"member": "m-s1", "student": True, "primary": GI, "secondary": [], "can_edit": True}
        s.docs = {f"members/{S1}": {"name": "Alice Martin", "consent": {"at": "2026-01-01T00:00:00Z", "share": True}, "sessions": [{"id": "a1", "date": d(7), "cat": "jjb", "type": "Gi", "dur": 90, "theme": "Gardes", "roll": True}]},
                  "members/00000000-0000-0000-0000-0000000000c9": {"name": "Zoé", "consent": {"at": "2026-01-01T00:00:00Z", "share": True}, "sessions": []},
                  f"members/{OWNER}": {"name": "Paul Prof", "consent": {"at": "2026-01-01T00:00:00Z", "share": True}, "sessions": []},
                  f"roll/{S1}": {"s": [{"k": d(7) + "|x1", "date": d(7), "title": "JJB Gi adultes", "dur": 90}], "a": [d(14) + "|x1"]}}
    def groups(s):
        if s.role == "student":
            return [{"id": GI, "name": "Adultes Gi", "discipline": "jjb_gi", "mine": True, "primary": True, "courses": ["x1"], "can_create": False, "can_view": False, "focus": FOCUS}] if s.uid == S1 else []
        return [{"id": GI, "name": "Adultes Gi", "discipline": "jjb_gi", "mine": False, "primary": False, "courses": ["x1"], "can_create": True, "can_view": True, "focus": FOCUS},
                {"id": NG, "name": "No-Gi", "discipline": "grappling_nogi", "mine": False, "primary": False, "courses": ["x2"], "can_create": True, "can_view": True, "focus": None}]
    def handle(s, route):
        r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}"); s.calls.append((name, a))
            if name == "get_my_context": return J(ctx(s.role))
            if name == "get_my_courses": return J({"assigned": [], "section": [], "staff": []})
            if name == "get_roll_students": return J([{"id": S1, "name": "Alice Martin"}])
            if name == "library_context": return J({"academy": "c1", "disciplines": ["jjb_gi", "grappling_nogi"], "configured": True, "can_review": False, "can_manage": False, "can_configure": False, "hidden": [], "pending": 0})
            if name.startswith("journal_") or name in ("student_groups", "set_student_groups"):
                if not s.journal: return J({"code": "PGRST202", "message": "Could not find the function public." + name}, 404)
            if name == "journal_groups": return J(s.groups())
            if name == "journal_feed":
                L = [x for x in s.sessions if (s.role != "student" or (x["status"] == "publie" and x["section_id"] == GI and s.uid == S1))]
                if a.get("p_section"): L = [x for x in L if x["section_id"] == a["p_section"]]
                if a.get("p_discipline"): L = [x for x in L if x["discipline_id"] == a["p_discipline"]]
                if a.get("p_query"):
                    qq = a["p_query"].lower(); L = [x for x in L if qq in x["theme"].lower() or any(qq in (t["name"] or t["text"] or "").lower() for t in x["techniques"])]
                if s.role == "student": L = [dict(x, can_edit=False, can_publish=False, mine=False) for x in L]
                return J(sorted(L, key=lambda x: x["session_date"], reverse=True))
            if name == "journal_save_session":
                st = "publie" if a["p_publish"] else "brouillon"; i = a["p_id"] or "s9"; p = a["p"]
                s.sessions = [x for x in s.sessions if x["id"] != i] + [S(i, p["section_id"], p["course_key"], (T - date.fromisoformat(p["session_date"])).days, p["theme"], st, [t.get("t") or t.get("text") for t in p["techniques"]])]
                return J({"id": i, "status": st})
            if name == "journal_set_status":
                for x in s.sessions:
                    if x["id"] == a["p_id"]: x["status"] = a["p_status"]
                return J(a["p_status"])
            if name == "journal_overview":
                if s.role != "owner": return J({"code": "P0001", "message": "Droit requis : vue d'ensemble du Journal"}, 400)
                if s.empty_ov: return J({"scope": "academy", "section": None, "from": d(30), "to": d(0), "totals": {"published": 0, "drafts": 0, "calls": 0, "missing": 0, "techniques": 0, "free_texts": 0},
                                         "groups": [{"id": GI, "name": "Adultes Gi", "discipline": "jjb_gi", "published": 0, "last": None, "days": None, "coverage": {"total": 30, "covered": 0, "never": [{"id": "G17", "name": NAME["G17"]}]}}], "drafts": [], "missing": [], "top": [], "authors": []})
                return J({"scope": "academy", "section": a.get("p_section"), "from": a.get("p_from") or d(30), "to": d(0),
                          "totals": {"published": 2, "drafts": 1, "calls": 4, "missing": 2, "techniques": 2, "free_texts": 1},
                          "groups": [{"id": GI, "name": "Adultes Gi", "discipline": "jjb_gi", "published": 2, "last": d(7), "days": 7, "coverage": {"total": 30, "covered": 2, "never": [{"id": "G1", "name": NAME.get("G1", "Garde fermée")}]}},
                                     {"id": NG, "name": "No-Gi", "discipline": "grappling_nogi", "published": 0, "last": d(20), "days": 20, "coverage": None}],
                          "drafts": [{"id": "s3", "date": d(1), "group": "No-Gi", "theme": "Front headlock", "author": "Paul Prof"}],
                          "missing": [{"date": d(5), "course": "x1", "title": "JJB Gi adultes", "group": "Adultes Gi"}, {"date": d(10), "course": "x2", "title": "Grappling", "group": "No-Gi"}],
                          "top": [{"id": "G18", "name": NAME["G18"], "n": 2}, {"id": "G17", "name": NAME["G17"], "n": 1}], "authors": [{"name": "Paul Prof", "n": 2}]})
            if name == "student_groups": return J(s.sg)
            if name == "set_student_groups": s.sg = dict(s.sg, primary=a["p_primary"], secondary=a["p_secondary"]); return J(len(a["p_secondary"]))
            if name == "get_team": return J({"members": [], "invitations": [], "sections": [{"id": GI, "name": "Adultes Gi", "discipline": "jjb_gi"}], "course_staff": [], "course_meta": []})
            return J(True)
        for tb, rows in TABLES.items():
            if f"/rest/v1/{tb}?" in u: return J(rows)
        if "/rest/v1/club_lib_" in u: return J([])
        if "/rest/v1/docs" in u:
            if r.method in ("POST", "PATCH"): return J([], 201)
            p = q.get("path", [""])[0]
            if p.startswith("like."):
                pre = p[5:].rstrip("%").rstrip("*"); return J([{"path": k, "data": v} for k, v in s.docs.items() if k.startswith(pre)])
            path = p[3:]; data = s.docs.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept", ""): return J({"path": path, "data": data}) if data is not None else J({"code": "PGRST116", "message": "0 rows"}, 406)
            return J([{"path": path, "data": data}] if data is not None else [])
        return J([] if "/rest/v1/" in u else {})
    def last(s, name): return [a for n, a in s.calls if n == name]

R = []
def check(label, ok, got=""):
    R.append(bool(ok)); print(("✔ " if ok else "✖ ") + label + ("" if ok else " → " + str(got)[:400]))
def open_page(b, m, uid, email, name, vp):
    c = b.new_context(viewport=vp); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess(uid, email, name)))});")
    pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2200)
    return c, pg, errs
def courses(pg):
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1200)
    pg.locator(".primary-nav .nav-item", has_text="Cours").first.click(); pg.wait_for_timeout(1500)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------------- Responsable (ordinateur)
    m = Mock("owner"); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    tabs = pg.locator("[role=tablist][aria-label=Cours]")
    check("Club › Cours : onglets « Cours de la semaine » et « Journal des cours », planning existant intact", tabs.count() == 1 and "Journal des cours" in tabs.inner_text() and pg.get_by_text("Les cours de la semaine").count() >= 1)
    pg.get_by_role("tab", name="Journal des cours").click(); pg.wait_for_timeout(1500)
    t = pg.inner_text(".page-content")
    check("Journal : brouillon à finir, chronologie des séances publiées", "À finir · 1 brouillon" in t and "Gardes ouvertes" in t and "Passages de garde" in t and "Publiée" in t, t[:500])
    check("Journal : le brouillon n'est pas dans la chronologie", pg.locator(".uzu-jr-card", has_text="Front headlock").count() == 0)
    pg.fill("input[placeholder^='Thème ou technique']", "knee"); pg.wait_for_timeout(900)
    fd = m.last("journal_feed")
    check("recherche « knee » : envoyée au serveur, seule la séance du Knee Cut reste", fd[-1].get("p_query") == "knee" and pg.locator(".uzu-jr-card").count() == 1 and "Passages de garde" in pg.locator(".uzu-jr-card").inner_text(), fd[-1])
    pg.fill("input[placeholder^='Thème ou technique']", ""); pg.wait_for_timeout(900)
    pg.get_by_label("Groupe").first.select_option(NG); pg.wait_for_timeout(700)
    check("filtre groupe : transmis au serveur", m.last("journal_feed")[-1].get("p_section") == NG)
    pg.get_by_label("Groupe").first.select_option(""); pg.wait_for_timeout(700)

    pg.get_by_role("button", name="Nouvelle séance").click(); pg.wait_for_timeout(800)
    f = pg.locator("form.uzu-lib-form")
    f.get_by_label("Cours du planning").select_option("x1"); pg.wait_for_timeout(300)
    check("saisie : le cours du planning choisit le groupe et la discipline", f.get_by_label("Groupe").input_value() == GI and f.get_by_label("Discipline").input_value() == "jjb_gi")
    check("saisie : thème proposé à partir du Focus du groupe (modifiable)", f.get_by_label("Thème principal").input_value() == "Passer la demi-garde" and "Focus du groupe" in f.inner_text())
    check("saisie : séance précédente proposée automatiquement", "Automatique : " in f.get_by_label("Suite de la séance").locator("option").first.inner_text() and "Gardes ouvertes" in f.get_by_label("Suite de la séance").locator("option").first.inner_text())
    f.get_by_label("Thème principal").fill("Passages de garde (suite)")
    f.locator("input[type=search]").fill("knee cut"); pg.wait_for_timeout(300)
    check("Bibliothèque : recherche d'une fiche dans la discipline du cours", f.locator(".uzu-jr-pick", has_text="G18").count() == 1)
    f.locator(".uzu-jr-pick", has_text="G18").click(); pg.wait_for_timeout(200)
    f.get_by_role("button", name="+ Ajouter en texte libre (hors Bibliothèque)").click()
    f.get_by_label("Technique en texte libre").fill("Passage en X"); f.get_by_role("button", name="Ajouter", exact=True).click(); pg.wait_for_timeout(200)
    check("techniques choisies : fiche G18 + texte libre", f.locator(".uzu-lib-chips button.on").count() == 2 and "G18" in f.locator(".uzu-lib-chips").inner_text())
    f.get_by_label("Exercices et situations").fill("Situations 3 × 3 min"); f.get_by_label("Objectif du cours").fill("Enchaîner Torreando et Knee Cut")
    pg.screenshot(path="/tmp/jr_editor.png", full_page=True)
    f.get_by_role("button", name="Publier pour le groupe").click(); pg.wait_for_timeout(1500)
    sv = m.last("journal_save_session")
    pp = sv[-1]["p"] if sv else {}
    check("publication : groupe, cours, date, discipline, techniques et séance précédente transmis", sv and sv[-1]["p_publish"] is True and sv[-1]["p_id"] is None and pp["section_id"] == GI and pp["course_key"] == "x1" and pp["session_date"] == T.isoformat()
          and pp["discipline_id"] == "jjb_gi" and pp["techniques"] == [{"t": "G18"}, {"text": "Passage en X"}] and pp["previous_session_id"] == "s1" and pp["objective"] == "Enchaîner Torreando et Knee Cut", sv)
    check("après publication : retour au Journal, nouvelle séance en tête", pg.locator(".uzu-jr-card").first.inner_text().find("Passages de garde (suite)") >= 0, pg.locator(".uzu-jr-card").first.inner_text() if pg.locator(".uzu-jr-card").count() else "")
    pg.locator(".uzu-jr-card", has_text="Gardes ouvertes").click(); pg.wait_for_timeout(600)
    dt = pg.inner_text(".page-content")
    check("détail équipe : statut, objectif, Modifier, Dépublier", "Publiée" in dt and "Ouvrir la garde" in dt and pg.get_by_role("button", name="Modifier").count() == 1 and pg.get_by_role("button", name="Dépublier").count() == 1, dt[:400])
    pg.get_by_role("button", name="Dépublier").click(); pg.wait_for_timeout(1000)
    check("dépublier : demandé au serveur, statut mis à jour", m.last("journal_set_status")[-1] == {"p_id": "s1", "p_status": "depublie"} and "Dépubliée" in pg.inner_text(".page-content") and pg.get_by_role("button", name="Publier pour le groupe").count() == 1)
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(800)
    pg.locator(".uzu-jr-todo button").first.click(); pg.wait_for_timeout(800)
    f = pg.locator("form.uzu-lib-form")
    check("reprendre le brouillon : formulaire prérempli (groupe No-Gi, thème)", "MODIFIER LA SÉANCE" in f.inner_text() and f.get_by_label("Thème principal").input_value() == "Front headlock" and f.get_by_label("Groupe").input_value() == NG)
    f.get_by_role("button", name="Enregistrer le brouillon").click(); pg.wait_for_timeout(1000)
    sv = m.last("journal_save_session")
    check("brouillon : même séance, non publiée", sv[-1]["p_id"] == "s3" and sv[-1]["p_publish"] is False)
    # Entrée depuis l'appel (même événement que le bouton « Saisir la séance au Journal des cours »)
    pg.evaluate(f"window.dispatchEvent(new CustomEvent('uzu-nav', {{ detail: {{ page: 'courses', arg: 'journal:new:x2:{d(1)}' }} }}))"); pg.wait_for_timeout(1800)
    f = pg.locator("form.uzu-lib-form")
    check("depuis l'appel : saisie ouverte, cours, groupe et date du cours repris", f.count() == 1 and f.get_by_label("Cours du planning").input_value() == "x2" and f.get_by_label("Groupe").input_value() == NG and f.locator("input[type=date]").input_value() == d(1))
    # Vue d'ensemble (J3)
    pg.locator(".primary-nav .nav-item", has_text="Cours").first.click(); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Vue d'ensemble").click(); pg.wait_for_timeout(1200)
    t = pg.inner_text(".page-content")
    check("vue d'ensemble : chiffres du serveur (2 publiées, 1 brouillon, 2 cours sans séance sur 4 appels, 2 fiches)", all(x in t for x in ["séances publiées", "brouillon en attente", "cours sans séance saisie", "sur 4 appels", "fiches abordées", "+ 1 technique en texte libre"]) and [x.inner_text().split("\n")[0] for x in pg.locator(".uzu-jv-tile").all()] == ["2", "1", "2", "2"], t[:600])
    check("groupes : dernière séance, alerte après 14 jours, couverture de la Bibliothèque", "il y a 7 jours" in t and "plus de 14 jours sans séance publiée" in t and "2 fiches abordées sur 30" in t)
    check("techniques les plus travaillées et saisies par professeur (barres + valeurs écrites)", pg.locator(".uzu-jv-bar", has_text="G18").count() == 1 and "2 séances" in pg.locator(".uzu-jv-bar", has_text="G18").inner_text() and pg.locator(".uzu-jv-bar", has_text="Paul Prof").count() == 1)
    check("rappel : rien sur la progression individuelle", "ne modifient aucune maîtrise" in t)
    pg.screenshot(path="/tmp/jv_desktop.png", full_page=True)
    pg.get_by_role("button", name="90 jours").click(); pg.wait_for_timeout(800)
    pg.get_by_label("Groupe", exact=True).select_option(GI); pg.wait_for_timeout(800)
    ovc = m.last("journal_overview")
    check("filtres période et groupe transmis au serveur", ovc[-1]["p_section"] == GI and ovc[-1]["p_from"] == (T - timedelta(days=90)).isoformat() and ovc[-2]["p_section"] is None, ovc[-2:])
    pg.locator(".uzu-jv-list li", has_text="Grappling").get_by_role("button", name="Saisir ›").click(); pg.wait_for_timeout(1500)
    f = pg.locator("form.uzu-lib-form")
    check("cours sans séance → « Saisir » ouvre la saisie du bon cours, à la bonne date", f.count() == 1 and f.get_by_label("Cours du planning").input_value() == "x2" and f.locator("input[type=date]").input_value() == d(10))
    # Fiche élève : groupes
    pg.locator(".primary-nav .nav-item", has_text="Élèves").first.click(); pg.wait_for_timeout(1800)
    pg.locator(".uzu-pcard", has_text="Alice Martin").click(); pg.wait_for_timeout(1200)
    g = pg.locator(".uzu-jr-groups")
    check("fiche élève : groupes affichés (principal)", g.count() == 1 and "Adultes Gi (principal)" in g.inner_text(), g.inner_text() if g.count() else "")
    g.get_by_role("button", name="Modifier").click(); g.get_by_label("Groupe principal").select_option(NG); g.get_by_role("button", name="Adultes Gi").click(); g.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(900)
    sg = m.last("set_student_groups")
    check("groupes de l'élève : principal No-Gi + secondaire Adultes Gi envoyés au serveur", sg and sg[-1] == {"p_user": S1, "p_primary": NG, "p_secondary": [GI]} and "No-Gi (principal) · Adultes Gi" in g.inner_text(), sg)
    check("responsable : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Vue d'ensemble vide (téléphone)
    m = Mock("owner", empty_overview=True); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 390, "height": 844})
    pg.locator(".mobile-space-bar .mobile-switcher button").click(); pg.wait_for_timeout(1200)
    pg.locator(".mobile-menu-trigger").click(); pg.wait_for_timeout(300); pg.locator(".primary-nav .nav-item", has_text="Cours").first.click(); pg.wait_for_timeout(1500)
    pg.get_by_role("tab", name="Vue d'ensemble").click(); pg.wait_for_timeout(1200)
    t = pg.inner_text(".page-content")
    check("vue d'ensemble sans donnée : zéros réels et message, aucun chiffre estimé", "Rien n'est estimé" in t and "aucun appel sur la période" in t and "Aucune séance publiée pour l'instant" in t and pg.locator(".uzu-jv-bar").count() == 0, t[:400])
    pg.screenshot(path="/tmp/jv_empty_mob.png", full_page=True)
    check("vue vide : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Professeur (portée ses cours) : Journal oui, vue d'ensemble non
    m = Mock("instructor"); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    check("professeur (ses cours) : onglet Journal, pas de vue d'ensemble, aucun appel à la vue d'ensemble", pg.get_by_role("tab", name="Journal des cours").count() == 1 and pg.get_by_role("tab", name="Vue d'ensemble").count() == 0 and not m.last("journal_overview"))
    check("professeur : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Base sans le script du Journal
    m = Mock("owner", journal=False); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    check("sans le script : pas d'onglet Journal, page Cours inchangée", pg.locator("[role=tablist][aria-label=Cours]").count() == 0 and pg.get_by_text("Les cours de la semaine").count() >= 1)
    pg.locator(".primary-nav .nav-item", has_text="Élèves").first.click(); pg.wait_for_timeout(1500); pg.locator(".uzu-pcard", has_text="Alice Martin").click(); pg.wait_for_timeout(800)
    check("sans le script : fiche élève sans bloc Groupes, sans erreur", pg.locator(".uzu-jr-groups").count() == 0 and not errs, errs); c.close()

    # ---------------- Adhérent (téléphone)
    m = Mock("student", uid=S1); c, pg, errs = open_page(b, m, S1, "alice@test.fr", "Alice Martin", {"width": 390, "height": 844})
    pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1500)
    check("adhérent : onglet « Cours du groupe », « Mon journal » conservé", pg.locator(".subnav-tabs button", has_text="Cours du groupe").count() == 1 and pg.locator(".subnav-tabs button", has_text="Mon journal").count() == 1)
    pg.locator(".subnav-tabs button", has_text="Cours du groupe").click(); pg.wait_for_timeout(1200)
    t = pg.inner_text(".page-content")
    check("Cours du groupe : focus du groupe et séances publiées seulement", "FOCUS DU GROUPE" in t and "Passer la demi-garde" in t and "Gardes ouvertes" in t and "Passages de garde" in t and "Front headlock" not in t, t[:500])
    check("présent / absent repris de l'appel", "Tu étais présent" in pg.locator(".uzu-jr-card", has_text="Gardes ouvertes").inner_text() and "Tu étais absent" in pg.locator(".uzu-jr-card", has_text="Passages de garde").inner_text())
    check("adhérent : aucun bouton de saisie ni statut", pg.get_by_role("button", name="Nouvelle séance").count() == 0 and "Brouillon" not in t and "Publiée" not in t)
    pg.screenshot(path="/tmp/jr_group_mob.png", full_page=True)
    pg.locator(".uzu-jr-card", has_text="Passages de garde").click(); pg.wait_for_timeout(600)
    dt = pg.inner_text(".page-content")
    check("détail (absent) : techniques, texte libre, exercices, mot du prof, séance suivante", "G18 · Knee Cut Pass" in dt and "Pas encore dans la Bibliothèque" in dt and "Situations 3 × 3 min" in dt and "Très bonne intensité" in dt and "Séance suivante" in dt, dt[:600])
    check("détail adhérent : ni Modifier ni Publier, rappel « tes étoiles ne changent pas »", pg.get_by_role("button", name="Modifier").count() == 0 and pg.get_by_role("button", name="Dépublier").count() == 0 and "Tes étoiles ne changent pas" in dt)
    pg.screenshot(path="/tmp/jr_detail_mob.png", full_page=True)
    pg.get_by_role("button", name="Noter dans mon journal").click(); pg.wait_for_timeout(1200)
    vals = pg.locator("textarea").evaluate_all("l => l.map(x => x.value)")
    check("« Noter dans mon journal » : saisie personnelle préremplie (date du cours, rappel du thème), rien d'enregistré", any("Cours du groupe : Passages de garde" in v for v in vals) and pg.locator("input[type=date]").first.input_value() == d(14) and not [1 for n, a in m.calls if n.startswith("save") or n == "upsert_doc"], vals)
    pg.get_by_role("button", name="Fermer", exact=True).click(); pg.wait_for_timeout(800)
    pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1200)
    pg.locator(".subnav-tabs button", has_text="Cours du groupe").click(); pg.wait_for_timeout(1000)
    pg.locator(".uzu-jr-card", has_text="Gardes ouvertes").click(); pg.wait_for_timeout(600)
    check("détail (présent) : déjà dans « Mon journal », pas de second bouton", pg.get_by_role("button", name="Noter dans mon journal").count() == 0 and "déjà dans « Mon journal »" in pg.inner_text(".page-content"))
    pg.locator(".uzu-lib-row", has_text="G17").click(); pg.wait_for_timeout(2000)
    check("technique du cours → fiche de la Bibliothèque", "Torreando Pass" in pg.inner_text(".page-content") and pg.locator(".mobile-bottom-nav button.active", has_text="Techniques").count() == 1, pg.inner_text(".page-content")[:300])
    check("adhérent : aucune écriture du Journal tentée", not [n for n, a in m.calls if n in ("journal_save_session", "journal_set_status", "set_student_groups")])
    check("adhérent : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Adhérent sans groupe
    m = Mock("student", uid="00000000-0000-0000-0000-0000000000c9"); c, pg, errs = open_page(b, m, "00000000-0000-0000-0000-0000000000c9", "z@test.fr", "Zoé", {"width": 390, "height": 844})
    pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1500)
    check("adhérent sans groupe : pas d'onglet « Cours du groupe »", pg.locator(".subnav-tabs button", has_text="Cours du groupe").count() == 0 and not errs, errs); c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} vérifications réussies")
