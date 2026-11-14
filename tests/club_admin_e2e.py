"""Espace Club (lot 3b) : Cours, Équipe, Contenus, Mon académie — Supabase simulé.
Serveur : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co npm run build && npx next start -p 3100
Vérifie les appels envoyés au serveur (modifications partielles, confirmations, droits sensibles) et l'affichage selon les droits."""
import json, time, base64, copy, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000a1"
S1 = "00000000-0000-0000-0000-0000000000c1"
T = date.today(); d = lambda n: (T - timedelta(days=n)).isoformat()
def jwt():
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": UID, "exp": int(time.time()) + 3600, "role": "authenticated", "email": "prof@test.fr"}) + ".sig"
SESS = {"access_token": jwt(), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
        "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "prof@test.fr", "user_metadata": {"name": "Paul Prof"}, "app_metadata": {}}}
def club():
    return {"id": "c1", "name": "Académie de test", "invite_code": "TEST2026", "accent_color": "sceau", "news": "",
            "schedule": [{"id": "x1", "d": 1, "s": "19:00", "e": "20:30", "t": "JJB Gi adultes"}, {"id": "x2", "d": 3, "s": "18:00", "e": "19:00", "t": "Grappling"}],
            "tactical_focus": {}, "profile": {"desc": "", "addr": "", "contact": "", "disc": ["jjb"]}}
def ctx(role="owner", perms=None):
    return {"role": "student" if role == "student" else "coach", "share_activity": False, "club": club(), "academy_role": role, "member_status": "active",
            "member_id": "m0", "section_id": None, "perms": perms, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": role, "status": "active"}]}
TEAM = {"members": [
    {"id": "m0", "user_id": UID, "role": "owner", "status": "active", "section_id": None, "name": "Paul Prof", "email": "prof@test.fr", "joined_at": d(300) + "T10:00:00Z", "is_me": True, "courses": 1, "last_activity": None, "perms": None, "students": []},
    {"id": "m1", "user_id": "u1", "role": "instructor", "status": "active", "section_id": None, "name": "Inès Prof", "email": "ines@test.fr", "joined_at": d(100) + "T10:00:00Z", "is_me": False, "courses": 1, "last_activity": d(2) + "T10:00:00Z",
     "perms": {"dashboard": {"view": "academy"}, "attendance": {"view": "assigned_courses", "create": "assigned_courses"}}, "students": []}],
    "invitations": [{"id": "i1", "email": "attente@test.fr", "role": "assistant", "status": "pending", "expires_at": d(-5) + "T10:00:00Z"}],
    "sections": [{"id": "s1", "name": "Enfants", "discipline": ""}],
    "course_staff": [{"course_key": "x1", "member_id": "m0", "role": "lead", "date": None}, {"course_key": "x1", "member_id": "m1", "role": "associate", "date": None}],
    "course_meta": []}

class Mock:
    def __init__(s, c):
        s.ctx, s.calls = c, []
        s.docs = {f"members/{S1}": {"name": "Alice Martin", "sessions": [{"id": "a1", "date": d(2), "cat": "jjb", "type": "Gi", "dur": 90}]}}
    def handle(s, route):
        r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
        ok = lambda body, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(body))
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; args = json.loads(r.post_data or "{}")
            s.calls.append((name, args))
            if name == "get_my_context": return ok(s.ctx)
            if name == "get_my_courses": return ok({"assigned": ["x1"], "section": [], "staff": [{"course_key": "x1", "name": "Paul Prof", "role": "lead", "date": None}, {"course_key": "x1", "name": "Inès Prof", "role": "associate", "date": None}]})
            if name == "get_team": return ok(TEAM)
            if name == "get_audit_log": return ok([{"id": 9, "action": "attendance.saved", "details": {"present": 4, "absent": 1}, "at": d(1) + "T19:00:00Z", "actor": "Inès Prof"},
                                                   {"id": 8, "action": "member.role_changed", "details": {"from": "assistant", "to": "instructor"}, "at": d(3) + "T19:00:00Z", "actor": "Paul Prof"}])
            if name == "update_academy":
                p = args["p_patch"]; c = s.ctx["club"]
                for k in ["name", "accent_color", "news", "schedule", "tactical_focus", "profile"]:
                    if k in p: c[k] = p[k]
                return ok({"changed": list(p.keys())})
            if name == "update_invite_code": s.ctx["club"]["invite_code"] = args["new_code"]; return ok(args["new_code"])
            if name in ("create_invitation", "resend_invitation"): return ok({"id": "i9", "token": "tok123", "email": args.get("p_email", "attente@test.fr")})
            return ok(True)
        if "/rest/v1/docs" in u:
            p = q.get("path", [""])[0]
            if p.startswith("like."):
                pre = p[5:].rstrip("%").rstrip("*"); return ok([{"path": k, "data": v} for k, v in s.docs.items() if k.startswith(pre)])
            return ok([])
        return ok([])
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
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1200)
    return pg, errs
def nav(pg, label): pg.locator(".primary-nav .nav-item", has_text=label).first.click(); pg.wait_for_timeout(1200)
def content(pg): return pg.inner_text(".page-content")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    m = Mock(ctx("owner")); pg, errs = open_page(b, m)

    # ---- Cours
    nav(pg, "Cours")
    t = content(pg)
    check("Cours : design v0 (titre, calendrier de la semaine, liste)", "Les cours, en rythme." in t and pg.locator(".calendar-grid").count() == 1 and pg.locator(".course-list-row").count() == 2)
    check("Cours : encadrement affiché", "JJB Gi adultes" in t and "Paul Prof (principal)" in t)
    pg.locator("button", has_text="Créer un cours").click(); pg.wait_for_timeout(300)
    check("Cours : discipline JJB / Grappling et type de cours proposés", pg.locator("[aria-label='Discipline'] button").all_inner_texts() == ["JJB", "Grappling"] and "Open mat" in pg.locator("[aria-label='Type de cours']").inner_text() and "Cours collectif" in pg.locator("[aria-label='Type de cours']").inner_text())
    pg.locator("[aria-label='Discipline'] button", has_text="Grappling").click(); pg.locator("[aria-label='Type de cours'] button", has_text="Open mat").click()
    pg.select_option("#sl-day", "5"); pg.fill("#sl-title", "No-gi débutants"); pg.fill("#sl-start", "18:00"); pg.fill("#sl-end", "17:00")
    pg.locator("button", has_text="Ajouter ce cours au planning").click(); pg.wait_for_timeout(400)
    check("Cours : horaires incohérents refusés sans appel serveur", not m.last("update_academy"))
    pg.fill("#sl-end", "19:00"); pg.locator("button", has_text="Ajouter ce cours au planning").click(); pg.wait_for_timeout(1200)
    ua = m.last("update_academy")
    new = ua[0]["p_patch"]["schedule"][2] if ua and len(ua[0]["p_patch"]["schedule"]) == 3 else {}
    check(f"Cours : ajout avec discipline et type, modification partielle du planning {new}", ua and list(ua[0]["p_patch"].keys()) == ["schedule"] and new.get("t") == "No-gi débutants" and new.get("d") == 5 and new.get("disc") == "grappling" and new.get("kind") == "open")
    check("Cours : planning relu, discipline et type affichés", "No-gi débutants" in content(pg) and "Grappling · Open mat" in content(pg))
    pg.locator(".course-list-row", has_text="No-gi débutants").locator(".row-action").click(); pg.wait_for_timeout(300)
    pg.locator("[aria-label='Type de cours'] button", has_text="Cours collectif").click(); pg.locator("button", has_text="Enregistrer le cours").click(); pg.wait_for_timeout(1000)
    ua = m.last("update_academy")
    check("Cours : modification du type enregistrée sur le même cours", len(ua) == 2 and [x.get("kind") for x in ua[1]["p_patch"]["schedule"] if x["t"] == "No-gi débutants"] == ["cours"] and len(ua[1]["p_patch"]["schedule"]) == 3)
    pg.locator(".course-list-row", has_text="Grappling").first.locator(".row-action").click(); pg.wait_for_timeout(300)
    rm = pg.locator("button", has_text="Retirer du planning"); gid = "x2"
    rm.click(); pg.wait_for_timeout(200)
    check("Cours : retrait seulement après confirmation", len(m.last("update_academy")) == 2)
    pg.locator("button", has_text="Confirmer le retrait").click(); pg.wait_for_timeout(1000)
    ua = m.last("update_academy")
    check("Cours : retrait envoyé sans le cours retiré", len(ua) == 3 and len(ua[2]["p_patch"]["schedule"]) == 2 and "x2" not in [x["id"] for x in ua[2]["p_patch"]["schedule"]])
    pg.locator(".course-list-row", has_text="JJB Gi adultes").locator(".row-action").click(); pg.wait_for_timeout(300)
    pg.locator("section button", has_text="Encadrement").click(); pg.wait_for_timeout(500)
    pg.select_option("select[aria-label='Rôle de Inès Prof']", "assistant"); pg.fill("#cs-disc", "JJB"); pg.fill("#cs-level", "Tous niveaux"); pg.select_option("#cs-sec", "s1")
    pg.locator("button", has_text="Enregistrer l'encadrement").click(); pg.wait_for_timeout(800)
    cs, cm = m.last("set_course_staff"), m.last("set_course_meta")
    check("Encadrement : équipe du cours envoyée", cs and cs[0]["p_course"] == "x1" and cs[0]["p_date"] is None and sorted(cs[0]["p_staff"], key=lambda x: x["member_id"]) == [{"member_id": "m0", "role": "lead"}, {"member_id": "m1", "role": "assistant"}])
    check("Encadrement : discipline, niveau, section", cm and cm[0] == {"p_course": "x1", "p_section": "s1", "p_discipline": "JJB", "p_level": "Tous niveaux"})

    # ---- Équipe
    nav(pg, "Équipe")
    t = content(pg)
    check("Équipe : design v0 et membres, invitation en attente", "Une équipe, un tatami." in t and "Rôles & permissions" in t and "Inès Prof" in t and "attente@test.fr" in t and "(toi)" in t)
    pg.locator("button", has_text="Inviter un membre").click(); pg.wait_for_timeout(300)
    pg.fill("#iv-email", "pas-un-email"); pg.locator("button", has_text="Créer l'invitation").click(); pg.wait_for_timeout(300)
    check("Invitation : adresse invalide refusée sans appel serveur", "Adresse e-mail invalide" in content(pg) and not m.last("create_invitation"))
    pg.fill("#iv-email", "nouveau@test.fr"); pg.select_option("#iv-tpl", "assistant"); pg.locator("button", has_text="Créer l'invitation").click(); pg.wait_for_timeout(800)
    ci = m.last("create_invitation")
    check("Invitation : rôle et droits du modèle Assistant", ci and ci[0]["p_email"] == "nouveau@test.fr" and ci[0]["p_role"] == "instructor" and ci[0]["p_section"] is None and len(ci[0]["p_perms"]) == 9 and all(x["e"] == "allow" for x in ci[0]["p_perms"]))
    check("Invitation : lien partageable affiché une fois", "?invite=tok123" in content(pg) and "Invitation prête" in content(pg))
    pg.locator("button", has_text="Fermer").click(); pg.wait_for_timeout(200)
    inv = pg.locator(".uzu-inv-row", has_text="attente@test.fr")
    inv.locator("button", has_text="Annuler").click(); pg.wait_for_timeout(150); inv.locator("button", has_text="Confirmer").click(); pg.wait_for_timeout(600)
    check("Invitation : annulation après confirmation", m.last("revoke_invitation") == [{"p_id": "i1"}])
    pg.locator(".uzu-inv-row", has_text="attente@test.fr").locator("button", has_text="Nouveau lien").click(); pg.wait_for_timeout(600)
    check("Invitation : nouveau lien", m.last("resend_invitation") == [{"p_id": "i1"}] and "?invite=tok123" in content(pg))
    pg.locator("button", has_text="Fermer").click(); pg.wait_for_timeout(200)
    pg.locator("button[aria-label='Options de Paul Prof']").click(); pg.wait_for_timeout(400)
    check("Ma propre fiche : aucune action sur moi-même", "tes propres droits ne se modifient pas ici" in content(pg) and pg.locator("button", has_text="Suspendre").count() == 0)
    pg.locator(".uzu-back").click(); pg.wait_for_timeout(400)
    pg.locator("button[aria-label='Options de Inès Prof']").click(); pg.wait_for_timeout(400)
    pg.locator(".uzu-tabs button", has_text="Permissions").click(); pg.wait_for_timeout(300)
    pg.locator("button[aria-label='Équipe pédagogique : Inviter']").click()
    pg.locator("button[aria-label='Présences : Corriger un appel']").click()
    check("Droits : modifications signalées non enregistrées", "Modifications non enregistrées" in content(pg))
    pg.locator("button", has_text="Enregistrer").first.click(); pg.wait_for_timeout(300)
    check("Droits sensibles : confirmation demandée avant tout envoi", "Confirmer des droits sensibles" in content(pg) and not m.last("set_member_permissions"))
    pg.locator("button", has_text="Confirmer et enregistrer").click(); pg.wait_for_timeout(600)
    sp = m.last("set_member_permissions")
    got = sorted((x["r"], x["a"], x["s"]) for x in sp[0]["p_perms"]) if sp else []
    check(f"Droits : liste complète envoyée {got}", got == sorted([("dashboard", "view", "academy"), ("attendance", "view", "assigned_courses"), ("attendance", "create", "assigned_courses"), ("attendance", "update", "academy"), ("instructors", "create", "academy")]))
    pg.locator(".uzu-tabs button", has_text="Rôle").click(); pg.wait_for_timeout(200)
    pg.select_option("#ms-role", "section_lead"); pg.select_option("#ms-sec", "s1"); pg.locator("button", has_text="Enregistrer le rôle").click(); pg.wait_for_timeout(500)
    check("Rôle : rôle et section envoyés", m.last("set_member_role") == [{"p_member": "m1", "p_role": "section_lead", "p_section": "s1"}])
    pg.fill("#ms-newsec", "Compétition"); pg.locator("button", has_text="Créer la section").click(); pg.wait_for_timeout(500)
    check("Section créée", m.last("upsert_section") == [{"p_id": None, "p_name": "Compétition", "p_discipline": ""}])
    pg.locator(".uzu-tabs button", has_text="Affectations").click(); pg.wait_for_timeout(400)
    pg.select_option("select[aria-label='Rôle sur No-gi débutants']", "lead"); pg.locator("button", has_text="Enregistrer les cours").click(); pg.wait_for_timeout(600)
    cs = m.last("set_course_staff")
    check("Affectations : seul le cours modifié est envoyé", len(cs) == 2 and cs[1]["p_course"].startswith("c") and cs[1]["p_date"] is None and cs[1]["p_staff"] == [{"member_id": "m1", "role": "lead"}])
    pg.locator(".uzu-check-row", has_text="Alice Martin").locator("input").check(); pg.locator("button", has_text="Enregistrer les élèves confiés").click(); pg.wait_for_timeout(500)
    check("Élèves confiés envoyés", m.last("set_student_access") == [{"p_member": "m1", "p_students": [S1]}])
    pg.locator(".uzu-tabs button", has_text="Informations").click(); pg.wait_for_timeout(200)
    pg.locator("button", has_text="Suspendre").click(); pg.wait_for_timeout(150)
    check("Suspension : rien avant confirmation", not m.last("set_member_status"))
    pg.locator("button", has_text="Confirmer la suspension").click(); pg.wait_for_timeout(500)
    check("Suspension envoyée", m.last("set_member_status") == [{"p_member": "m1", "p_status": "suspended"}])

    # ---- Contenus
    nav(pg, "Contenus")
    pg.fill("#fe-title", "Snap down vers front headlock"); pg.select_option("#fe-from", "lutte"); pg.select_option("#fe-to", "controle"); pg.fill("#fe-details", "Tête basse")
    pg.locator("button", has_text="Publier le focus").click(); pg.wait_for_timeout(800)
    ua = m.last("update_academy")
    check("Focus : seul le focus est envoyé", list(ua[-1]["p_patch"].keys()) == ["tactical_focus"] and ua[-1]["p_patch"]["tactical_focus"] == {"weekTheme": "Snap down vers front headlock", "focusFrom": "lutte", "focusTo": "controle", "focusDetails": "Tête basse"})
    pg.locator("button", has_text="Publier l'annonce").click(); pg.wait_for_timeout(200)
    check("Annonce vide refusée", len(m.last("update_academy")) == len(ua))
    pg.fill("#club-news", "Stage samedi"); pg.locator("button", has_text="Publier l'annonce").click(); pg.wait_for_timeout(700)
    check("Annonce : seule l'annonce est envoyée", m.last("update_academy")[-1]["p_patch"] == {"news": "Stage samedi"})

    # ---- Mon académie
    nav(pg, "Mon académie")
    t = content(pg)
    check("Journal d'activité lisible", "Appel enregistré" in t and "4 présent(s), 1 absent(s)" in t and "Assistant → Professeur" in t)
    n0 = len(m.last("update_academy"))
    pg.fill("#ac-code", "ab"); pg.locator("button", has_text="Enregistrer les informations du club").click(); pg.wait_for_timeout(300)
    check("Code invitation invalide refusé sans appel", len(m.last("update_academy")) == n0 and not m.last("update_invite_code"))
    pg.fill("#ac-code", "nouveau-2027"); pg.fill("#ac-desc", "Club de test"); pg.locator(".uzu-chips button", has_text="MMA").click(); pg.locator(".uzu-chips button", has_text="Vert").click()
    pg.locator("button", has_text="Enregistrer les informations du club").click(); pg.wait_for_timeout(800)
    check("Code invitation changé par sa fonction dédiée", m.last("update_invite_code") == [{"new_code": "NOUVEAU-2027"}])
    pa = m.last("update_academy")[-1]["p_patch"]
    check("Informations : nom, couleur, profil (sans planning ni focus)", sorted(pa.keys()) == ["accent_color", "name", "profile"] and pa["accent_color"] == "vert" and pa["profile"]["disc"] == ["jjb", "mma"] and pa["profile"]["desc"] == "Club de test")
    check("Responsable : pas de bouton Quitter", "Quitter cette académie" not in content(pg))
    check("Responsable : aucune erreur JavaScript", not errs); print("   ", errs)
    pg.context.close()

    # ---- Professeur sans droits d'administration
    perms = {"dashboard": {"view": "academy"}, "schedule": {"view": "academy"}, "students": {"view": "academy"}, "courses": {"view": "academy"}, "contents": {"view": "academy"}, "communications": {"view": "academy"}}
    m = Mock(ctx("instructor", perms)); pg, errs = open_page(b, m)
    nav_txt = pg.inner_text(".primary-nav")
    check("Professeur : pas d'onglet Équipe", "Équipe" not in nav_txt and "Cours" in nav_txt and "Contenus" in nav_txt)
    nav(pg, "Cours")
    check("Professeur : planning en lecture seule", pg.locator("button", has_text="Créer un cours").count() == 0 and pg.locator(".course-list-row .row-action").count() == 0 and pg.locator(".uzu-cal-btn:enabled").count() == 0)
    nav(pg, "Contenus")
    check("Professeur : ni focus ni annonce modifiables", pg.locator("#fe-title").count() == 0 and pg.locator("#club-news").count() == 0)
    nav(pg, "Mon académie")
    check("Professeur : pas d'informations modifiables ni de journal", pg.locator("#ac-name").count() == 0 and "Journal d'activité" not in content(pg) and not m.last("get_audit_log"))
    pg.locator("button", has_text="Quitter cette académie").click(); pg.wait_for_timeout(150)
    check("Quitter : rien avant confirmation", not m.last("leave_academy"))
    pg.locator("button", has_text="Confirmer : quitter").click(); pg.wait_for_timeout(1500)
    check("Quitter : leave_academy envoyé", m.last("leave_academy") == [{}])
    check("Professeur : aucune erreur JavaScript", not errs)
    pg.context.close()
    b.close()
ok = sum(1 for _, v in RES if v); print(f"\n{ok}/{len(RES)} vérifications réussies")
