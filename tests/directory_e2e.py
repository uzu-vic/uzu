# « Où rouler ? » étape 1 — annuaire privé des clubs, sur base simulée.
# Lancer après : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_mocktest npx next build && npx next start -p 3100
# Profils : carnet solo, élève de club, professeur sans droit « Paramètres », responsable, multi-club (assistant ici, élève ailleurs),
# deux pratiquants de clubs différents. Ordinateur (1280 px) et téléphone (390 px).
import json, time, base64, sys, urllib.parse as up
from playwright.sync_api import sync_playwright
REF = "abcdefghijkltest"; BASE = "http://127.0.0.1:3100/"; SHOTS = "/tmp/dir-shots/"
import os; os.makedirs(SHOTS, exist_ok=True)

def sess(uid, email, name):
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    tok = e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": uid, "exp": int(time.time()) + 3600, "role": "authenticated", "email": email}) + ".sig"
    return {"access_token": tok, "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": email, "user_metadata": {"name": name}, "app_metadata": {}}}
SCHED = [{"id": "x1", "d": 0, "s": "19:00", "e": "20:30", "t": "JJB Gi adultes", "disc": "jjb", "kind": "cours"},
         {"id": "x2", "d": 5, "s": "11:00", "e": "12:30", "t": "Open mat", "disc": "grappling", "kind": "open"},
         {"id": "x3", "d": 2, "s": "18:00", "e": "19:00", "t": "Enfants", "disc": "jjb", "kind": "cours"}]
def club(cid="c1", name="DA Club test"):
    return {"id": cid, "name": name, "invite_code": "TEST2026", "accent_color": "sceau", "news": "", "schedule": SCHED, "tactical_focus": {},
            "profile": {"desc": "Club de JJB et grappling.", "addr": "Gymnase test", "contact": "", "disc": ["jjb", "grappling"]}}
def ctx(role, perms=None, memberships=None, cid="c1"):
    if role == "solo": return {"role": "solo", "share_activity": False, "club": None, "memberships": []}
    return {"role": "student" if role == "student" else "coach", "share_activity": False, "club": club(cid), "academy_role": role, "member_status": "active",
            "member_id": "m0", "section_id": None, "perms": perms, "memberships": memberships or [{"academy_id": cid, "name": "DA Club test", "role": role, "status": "active"}]}

COMMUNES = [{"insee": "91286", "nom": "Grigny", "departement": "91", "code_postal": "91350"},
            {"insee": "69096", "nom": "Grigny", "departement": "69", "code_postal": "69520"}]
SESS_A = [{"d": 5, "s": "11:00", "e": "12:30", "disc": "grappling_nogi", "kind": "open_mat", "price": "Gratuit", "notes": "", "title": "Open mat"}]
HITS = [{"slug": "da-club-test-grigny", "name": "DA Club test", "uzu": True, "commune": "Grigny", "dep": "91", "band": "moins de 10 km",
         "disciplines": ["jjb_gi", "grappling_nogi"], "sessions": SESS_A, "n_sessions": 1, "price": "Gratuit", "verified_at": "2026-11-18T10:00:00Z"},
        {"slug": "club-reference-evry", "name": "Club référencé Évry", "uzu": False, "commune": "Évry-Courcouronnes", "dep": "91", "band": "10 à 25 km",
         "disciplines": ["jjb_gi"], "sessions": [{"d": 2, "s": "20:00", "e": "21:30", "disc": "jjb_gi", "kind": "open_class", "price": "", "notes": "", "title": ""}],
         "n_sessions": 1, "price": "", "verified_at": "2026-11-10T10:00:00Z"}]
SHEET = {"slug": "da-club-test-grigny", "name": "DA Club test", "uzu": True, "status": "published", "commune": "Grigny", "dep": "91", "insee": "91286",
         "address": "Gymnase test, 1 rue d'essai", "disciplines": ["jjb_gi", "grappling_nogi"], "description": "Club de test.", "website": "https://exemple.test",
         "instagram": "daclubtest", "phone": "01 00 00 00 00", "email": "contact@exemple.test",
         "welcome": {"price": "Gratuit", "license": "Licence demandée", "rules": "Rashguard obligatoire", "contact_first": True}, "verified_at": "2026-11-18T10:00:00Z", "sessions": SESS_A}

class Mock:
    def __init__(s, c, installed=True):
        s.ctx, s.installed, s.calls, s.saved = c, installed, [], None
    def can_settings(s):
        c = s.ctx
        if c.get("role") == "solo" or c.get("academy_role") == "student": return False
        return c.get("academy_role") == "owner" or c.get("perms") is None or (c.get("perms") or {}).get("academy_settings", {}).get("update") not in (None, "deny")
    def handle(s, route):
        r = route.request; u = r.url
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if "/rpc/" in u:
            fn = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}"); s.calls.append((fn, a))
            if fn == "get_my_context": return J(s.ctx)
            if fn in ("geo_commune_search", "dir_search", "dir_get", "dir_suggest", "dir_my_club", "dir_my_club_save") and not s.installed:
                return J({"code": "PGRST202", "message": f"Could not find the function public.{fn} in the schema cache"}, 404)
            if fn == "geo_commune_search": return J([c for c in COMMUNES if c["nom"].lower().startswith(a["p_q"].lower()[:3]) or c["code_postal"].startswith(a["p_q"])])
            if fn == "dir_search":
                L = [h for h in HITS if (not a.get("p_disc") or a["p_disc"] in h["disciplines"]) and (not a.get("p_kind") or any(x["kind"] == a["p_kind"] for x in h["sessions"]))
                     and (a["p_radius"] >= 25 or h["band"] == "moins de 10 km")]
                return J({"commune": {"insee": a["p_insee"], "nom": "Grigny", "dep": "91"}, "radius": a["p_radius"], "clubs": L})
            if fn == "dir_get": return J(SHEET) if a["p_slug"] == SHEET["slug"] else J({"code": "P0001", "message": "Fiche introuvable"}, 400)
            if fn == "dir_suggest": return J(True)
            if fn == "dir_my_club":
                if not s.can_settings(): return J({"code": "P0001", "message": "Action non autorisée"}, 400)
                return J({"exists": False, "can_edit": True, "slug": None, "status": "draft", "name": "DA Club test", "insee": None, "commune": None,
                          "address": "Gymnase test", "disciplines": [], "description": "Club de JJB et grappling.", "website": "", "instagram": "", "phone": "", "email": "", "welcome": {},
                          "slots": [{"id": x["id"], "d": x["d"], "s": x["s"], "e": x["e"], "t": x["t"], "disc": {"jjb": "jjb_gi", "grappling": "grappling_nogi"}[x["disc"]],
                                     "course_kind": x["kind"], "pub": False, "kind": None, "price": "", "notes": ""} for x in SCHED]})
            if fn == "dir_my_club_save":
                if not s.can_settings(): return J({"code": "P0001", "message": "Action non autorisée"}, 400)
                s.saved = a["p"]; return J({"ok": True, "slug": "da-club-test-grigny", "slots": len(a["p"].get("slots", []))})
            if fn == "get_audit_log": return J([])
            return J(True)
        if "/rest/v1/docs" in u:
            q = up.parse_qs(up.urlparse(u).query); pq = q.get("path", ["eq."])[0]
            if r.method in ("POST", "DELETE"): return route.fulfill(status=201, content_type="application/json", body="[]")
            if pq.startswith("like."): return J([])
            path = pq[3:]; data = {"name": "Test", "sessions": [], "skills": {}, "comps": [], "consent": {"at": "2026-01-01T00:00:00Z", "share": False}} if path.startswith("members/") else None
            if "vnd.pgrst.object" in r.headers.get("accept", ""):
                return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}))
            return J([{"path": path, "data": data}] if data is not None else [])
        return route.fulfill(status=200, content_type="application/json", body="[]" if "/rest/v1/" in u else "{}")
    def names(s): return [n for n, _ in s.calls]
    def last(s, fn): return [a for n, a in s.calls if n == fn]

R = []
def check(label, ok, got=""):
    R.append(bool(ok)); print(("✔ " if ok else "✖ ") + label + ("" if ok else " → " + str(got)[:300]))
def open_page(b, m, who, vp, mob):
    c = b.new_context(viewport=vp, has_touch=mob, is_mobile=mob); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(who))});")
    pg.goto(BASE); pg.wait_for_timeout(2200)
    return c, pg, errs
def go_feed(pg, mob):
    if mob:
        pg.locator(".mobile-bottom-nav button", has_text="Plus").click(); pg.wait_for_timeout(300)
    pg.locator(".nav-item", has_text="Fil du club").first.click(); pg.wait_for_timeout(1500)
def tab(pg, t): pg.locator(".uzu-lib-volets button", has_text=t).click(); pg.wait_for_timeout(700)
def pick_grigny(pg):
    pg.locator("#dir-commune").fill("Grig"); pg.wait_for_timeout(900)
    pg.get_by_role("option", name="Grigny 91 · 91350").click(); pg.wait_for_timeout(900)
def content(pg): return pg.inner_text(".page-content") if pg.locator(".page-content").count() else pg.inner_text("body")
PRIV = ["Gymnase test, 1 rue", "contact@exemple.test", "01 00 00 00 00"]

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("mob", {"width": 390, "height": 844}), ("desk", {"width": 1280, "height": 900})]:
        mob = name == "mob"
        # ------------------------------------------------------------ 1. carnet solo
        m = Mock(ctx("solo")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000f1", "solo@test.fr", "Léa Solo"), vp, mob)
        home = content(pg)
        check(f"[{name}] solo : carte « Où rouler ? » sur l'accueil", "OÙ ROULER ?" in home and pg.get_by_role("button", name="Trouver un club").count() == 1, home[:300])
        pg.get_by_role("button", name="Trouver un club").click(); pg.wait_for_timeout(1200)
        check(f"[{name}] solo : la carte ouvre Tatami sur le volet Clubs", pg.locator(".uzu-lib-volets button.on").inner_text() == "Clubs" and pg.locator("#dir-commune").count() == 1)
        check(f"[{name}] aucune recherche lancée tant qu'aucune ville n'est choisie", "dir_search" not in m.names())
        pick_grigny(pg)
        txt = content(pg)
        check(f"[{name}] recherche par commune : 2 clubs à moins de 25 km de Grigny", "2 clubs à moins de 25 km de Grigny" in txt and pg.locator(".uzu-dir-card").count() == 2, txt[:400])
        a = m.last("dir_search")[-1]
        check(f"[{name}] la recherche n'envoie que commune, rayon et filtres (aucun identifiant)", set(a.keys()) == {"p_insee", "p_radius", "p_disc", "p_kind", "p_day"} and a["p_insee"] == "91286" and a["p_radius"] == 25, a)
        cards = pg.locator(".uzu-dir-list").inner_text()
        check(f"[{name}] badges « Club UZU » et « Référencé », distances par tranches", "Club UZU" in cards and "Référencé" in cards and "moins de 10 km" in cards and "10 à 25 km" in cards, cards)
        check(f"[{name}] cartes : ni adresse, ni courriel, ni téléphone", not any(x in cards for x in PRIV), cards)
        if mob: pg.screenshot(path=SHOTS + "1-clubs-resultats-mobile.png", full_page=True)
        else: pg.screenshot(path=SHOTS + "1-clubs-resultats-ordinateur.png", full_page=True)
        pg.get_by_role("button", name="Open mat", exact=True).click(); pg.wait_for_timeout(800)
        check(f"[{name}] filtre « Open mat » : 1 club, filtre transmis", pg.locator(".uzu-dir-card").count() == 1 and m.last("dir_search")[-1]["p_kind"] == "open_mat")
        pg.get_by_role("button", name="10 km", exact=True).click(); pg.wait_for_timeout(800)
        check(f"[{name}] rayon 10 km transmis", m.last("dir_search")[-1]["p_radius"] == 10)
        pg.locator(".uzu-dir-card").first.click(); pg.wait_for_timeout(1000)
        sh = content(pg)
        check(f"[{name}] fiche club : créneaux, conditions d'accueil, salle, contacts, date de vérification",
              "Samedi" in sh and "Open mat" in sh and "Rashguard obligatoire" in sh and "Prévenir avant de venir" in sh and "Gymnase test, 1 rue d'essai" in sh and "18 novembre 2026" in sh, sh[:600])
        check(f"[{name}] contacts cliquables (téléphone, courriel, site en nouvel onglet sécurisé)",
              pg.locator("a[href^='tel:']").count() == 1 and pg.locator("a[href^='mailto:']").count() == 1 and pg.locator("a[href='https://exemple.test'][rel='noopener noreferrer']").count() == 1)
        if mob: pg.screenshot(path=SHOTS + "2-fiche-club-mobile.png", full_page=True)
        pg.get_by_role("button", name="Signaler une erreur").click(); pg.wait_for_timeout(500)
        pg.locator("#sg-details").fill("L'open mat est à 10 h."); pg.get_by_role("button", name="Envoyer").click(); pg.wait_for_timeout(900)
        sg = m.last("dir_suggest")
        check(f"[{name}] « Signaler une erreur » : envoyé avec la fiche concernée, retour à la fiche", len(sg) == 1 and sg[0]["p_slug"] == "da-club-test-grigny" and "10 h" in sg[0]["p"]["details"] and "Merci" in pg.inner_text("body"), sg)
        pg.get_by_role("button", name="Retour aux clubs").click(); pg.wait_for_timeout(800)
        pg.get_by_role("button", name="Propose-le à l'équipe UZU").click(); pg.wait_for_timeout(400)
        pg.get_by_role("button", name="Envoyer").click(); pg.wait_for_timeout(300)
        check(f"[{name}] « Proposer un club » vide : refusé avec message", "Indique au moins le nom du club" in pg.inner_text("body") and len(m.last("dir_suggest")) == 1)
        pg.locator("#sg-name").fill("Club absent"); pg.locator("#sg-commune").fill("Ris-Orangis"); pg.get_by_role("button", name="Envoyer").click(); pg.wait_for_timeout(900)
        sg = m.last("dir_suggest")
        check(f"[{name}] « Proposer un club » : envoyé sans fiche liée", len(sg) == 2 and sg[1]["p_slug"] is None and sg[1]["p"]["name"] == "Club absent", sg)
        tab(pg, "Partenaires")
        check(f"[{name}] volet Partenaires : annonce « bientôt », aucun appel", "Bientôt dans UZU" in content(pg))
        tab(pg, "Fil")
        check(f"[{name}] volet Fil : le fil existant s'affiche (« Ton fil » en solo)", "Ton fil" in content(pg))
        go_feed(pg, mob)
        check(f"[{name}] menu Tatami : volet Fil par défaut", pg.locator(".uzu-lib-volets button.on").inner_text() == "Fil")
        tab(pg, "Clubs")
        check(f"[{name}] dernière commune mémorisée sur l'appareil, recherche relancée", "Grigny (91)" in content(pg) and pg.locator(".uzu-dir-card").count() >= 1)
        check(f"[{name}] solo : aucun appel à la fiche académie", "dir_my_club" not in m.names() and "dir_my_club_save" not in m.names())
        check(f"[{name}] solo : aucune erreur de page", not errs, errs)
        c.close()

        # ------------------------------------------------------------ 2. élève de club ; 6. deux pratiquants de clubs différents
        res = {}
        for who, cid in [("eleve-c1", "c1"), ("eleve-c2", "c2")]:
            m = Mock(ctx("student", cid=cid)); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000" + ("b1" if cid == "c1" else "b2"), who + "@test.fr", who), vp, mob)
            go_feed(pg, mob)
            if who == "eleve-c1": check(f"[{name}] élève : Tatami s'ouvre sur le fil du club, 3 volets", "Le fil du club" in content(pg) and pg.locator(".uzu-lib-volets button").count() == 3)
            if who == "eleve-c1" and mob: pg.screenshot(path=SHOTS + "3-tatami-fil-mobile.png", full_page=False)
            tab(pg, "Clubs"); pick_grigny(pg)
            res[who] = (pg.locator(".uzu-dir-list").inner_text(), m.last("dir_search")[-1])
            check(f"[{name}] {who} : aucun appel à la fiche académie, aucune erreur", "dir_my_club" not in m.names() and not errs, errs)
            c.close()
        check(f"[{name}] deux pratiquants de clubs différents : même résultat, même requête (rien ne dépend du club)", res["eleve-c1"] == res["eleve-c2"], res)

        # ------------------------------------------------------------ 7. annuaire pas encore installé
        m = Mock(ctx("solo"), installed=False); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000f2", "x@test.fr", "X"), vp, mob)
        go_feed(pg, mob); tab(pg, "Clubs"); pg.locator("#dir-commune").fill("Grig"); pg.wait_for_timeout(900)
        check(f"[{name}] base sans annuaire : message clair, pas de plantage", "L'annuaire n'est pas encore disponible" in content(pg) and not errs, (content(pg)[:200], errs))
        c.close()

    # ------------------------------------------------------------ Espace club (ordinateur puis téléphone)
    for name, vp in [("desk", {"width": 1280, "height": 900}), ("mob", {"width": 390, "height": 844})]:
        mob = name == "mob"
        def academy(pg):
            if mob:
                pg.locator(".mobile-switcher button").click(); pg.wait_for_timeout(1200)
                pg.locator(".mobile-menu-trigger").click(); pg.wait_for_timeout(300)
            else: pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1200)
            pg.locator(".primary-nav .nav-item", has_text="Mon académie").first.click()
            pg.wait_for_timeout(1500)
        # 3. professeur sans droit « Paramètres de l'académie »
        m = Mock(ctx("instructor", perms={"dashboard": {"view": "academy"}, "students": {"view": "assigned_courses"}}))
        c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a2", "prof@test.fr", "Inès Prof"), vp, mob)
        academy(pg)
        check(f"[{name}] professeur sans droit : pas de panneau annuaire, aucun appel", "Fiche dans l'annuaire UZU" not in content(pg) and "dir_my_club" not in m.names(), content(pg)[:200])
        c.close()
        # 5. multi-club : assistant sans droit dans le club actif
        m = Mock(ctx("assistant", perms={"dashboard": {"view": "academy"}}, memberships=[{"academy_id": "c1", "name": "DA Club test", "role": "assistant", "status": "active"}, {"academy_id": "c2", "name": "Autre club", "role": "student", "status": "active"}]))
        c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a3", "multi@test.fr", "Multi Club"), vp, mob)
        academy(pg)
        check(f"[{name}] multi-club (assistant ici, élève ailleurs) : pas de panneau annuaire", "Fiche dans l'annuaire UZU" not in content(pg) and "dir_my_club" not in m.names())
        c.close()
        # 4. responsable
        m = Mock(ctx("owner")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a1", "resp@test.fr", "Paul Resp"), vp, mob)
        academy(pg)
        panel = pg.locator("section[aria-label=\"Fiche dans l'annuaire UZU\"]")
        check(f"[{name}] responsable : panneau annuaire pré-rempli depuis les informations du club", panel.count() == 1 and panel.locator("#dir-address").input_value() == "Gymnase test" and "Club de JJB" in panel.locator("#dir-description").input_value())
        check(f"[{name}] responsable : les 3 créneaux du planning listés, aucun ouvert par défaut", panel.locator(".uzu-dir-slots li").count() == 3 and panel.locator(".uzu-dir-slots li.on").count() == 0)
        panel.get_by_role("button", name="Enregistrer la fiche annuaire").click(); pg.wait_for_timeout(500)
        check(f"[{name}] sans commune : enregistrement refusé côté écran", m.saved is None and "Choisis la commune" in pg.inner_text("body"))
        panel.locator("#dir-my-commune").fill("Grig"); pg.wait_for_timeout(900); pg.get_by_role("option", name="Grigny 91 · 91350").click(); pg.wait_for_timeout(300)
        panel.get_by_role("button", name="No-Gi / Grappling").click()
        panel.get_by_role("checkbox", name="Publier la fiche du club dans l'annuaire").click()
        panel.locator("#dir-w-price").fill("Gratuit")
        panel.get_by_role("checkbox", name="Les visiteurs doivent prévenir avant de venir").click()
        panel.get_by_role("checkbox", name="Ouvert aux visiteurs · Sam. 11:00–12:30 · Open mat · No-Gi / Grappling").click(); pg.wait_for_timeout(200)
        check(f"[{name}] créneau « open » coché : type proposé Open mat", panel.locator(".uzu-dir-slots li.on button.on", has_text="Open mat").count() == 1)
        panel.locator("input[aria-label='Tarif du créneau']").fill("Gratuit")
        if mob: pg.screenshot(path=SHOTS + "4-academie-fiche-annuaire-mobile.png", full_page=True)
        else: panel.screenshot(path=SHOTS + "4-academie-fiche-annuaire-ordinateur.png")
        panel.locator("#dir-website").fill("http://non-securise.test"); panel.get_by_role("button", name="Enregistrer la fiche annuaire").click(); pg.wait_for_timeout(400)
        check(f"[{name}] site en http:// refusé", m.saved is None and "https://" in pg.inner_text("body"))
        pg.wait_for_timeout(4700)  # laisse disparaître le message précédent (minuterie existante de 4,5 s)
        panel.locator("#dir-website").fill("https://exemple.test"); panel.get_by_role("button", name="Enregistrer la fiche annuaire").click(); pg.wait_for_timeout(1200)
        sv = m.saved or {}
        check(f"[{name}] enregistrement : commune, publication, disciplines, conditions, un seul créneau ouvert",
              sv.get("insee") == "91286" and sv.get("published") is True and sv.get("disciplines") == ["grappling_nogi"] and sv.get("welcome", {}).get("contact_first") is True
              and sv.get("slots") == [{"id": "x2", "kind": "open_mat", "price": "Gratuit", "notes": ""}], sv)
        check(f"[{name}] le planning et les informations du club ne sont pas modifiés (aucun update_academy)", "update_academy" not in m.names())
        check(f"[{name}] message de confirmation « Fiche publiée »", "Fiche publiée dans l'annuaire UZU" in pg.inner_text("body"))
        check(f"[{name}] responsable : aucune erreur de page", not errs, errs)
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} contrôles réussis"); sys.exit(0 if all(R) else 1)
