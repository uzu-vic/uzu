# « Où rouler ? » fin d'étape 1 — espace du référent UZU (uzu-14a2), sur base simulée.
# Lancer après la construction simulée (voir tests/directory_e2e.py) et npx next start -p 3100.
# Profils : référent UZU, pratiquant sans rôle, administrateur plateforme sans rôle, base sans uzu-14a2,
# responsable dont la fiche est masquée par la modération. Téléphone (390 px) et ordinateur (1280 px).
import json, sys
SRC = open("tests/directory_e2e.py").read()
exec(SRC[:SRC.index("with sync_playwright() as p:")])  # reprend les outils et la base simulée de l'annuaire

STAFF = {"slug": "club-reference-evry", "name": "Club référencé Évry", "uzu": False, "status": "published", "commune": "Évry-Courcouronnes", "dep": "91", "insee": "91228",
         "address": "Salle fictive", "disciplines": ["jjb_gi"], "description": "", "website": "", "instagram": "", "phone": "", "email": "", "welcome": {"price": "Gratuit"},
         "verified_at": "2026-11-10T10:00:00Z", "origin": "uzu_staff", "moderated": False, "moderation_note": "",
         "sessions": [{"d": 2, "s": "20:00", "e": "21:30", "disc": "jjb_gi", "kind": "open_class", "price": "", "notes": "", "title": ""}]}
ADMIN_LIST = [
    {"slug": "da-club-test-grigny", "name": "DA Club test", "uzu": True, "origin": "uzu_client", "status": "published", "moderated": False, "commune": "Grigny", "dep": "91", "n_sessions": 1, "verified_at": "2026-11-18T10:00:00Z", "open_suggestions": 1},
    {"slug": "club-reference-evry", "name": "Club référencé Évry", "uzu": False, "origin": "uzu_staff", "status": "published", "moderated": False, "commune": "Évry-Courcouronnes", "dep": "91", "n_sessions": 1, "verified_at": "2026-11-10T10:00:00Z", "open_suggestions": 0},
    {"slug": "club-vitry-brouillon", "name": "Club Vitry brouillon", "uzu": False, "origin": "uzu_staff", "status": "draft", "moderated": False, "commune": "Vitry-sur-Seine", "dep": "94", "n_sessions": 0, "verified_at": None, "open_suggestions": 0}]
SUGG = [{"id": "s-new", "club": None, "slug": None, "uzu": None, "payload": {"name": "Club du coin", "commune": "Ris-Orangis", "details": "Open mat le dimanche 10 h", "contact": "https://exemple.test"}, "status": "open", "at": "2026-11-19T10:00:00Z", "resolved_at": None},
        {"id": "s-fix", "club": "DA Club test", "slug": "da-club-test-grigny", "uzu": True, "payload": {"details": "Horaires faux"}, "status": "open", "at": "2026-11-19T11:00:00Z", "resolved_at": None}]

class AdminMock(Mock):
    def __init__(s, c, moderator=False, v14a2=True, moderated=False):
        super().__init__(c); s.moderator, s.v14a2, s.moderated = moderator, v14a2, moderated; s.sugg = json.loads(json.dumps(SUGG))
    def handle(s, route):
        r = route.request; u = r.url
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if "/rpc/" in u:
            fn = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}")
            if fn == "dir_whoami" or fn.startswith("dir_admin_"):
                s.calls.append((fn, a))
                if not s.v14a2: return J({"code": "PGRST202", "message": f"Could not find the function public.{fn}"}, 404)
                if fn == "dir_whoami": return J({"moderator": s.moderator})
                if not s.moderator: return J({"code": "P0001", "message": "Action réservée au référent UZU"}, 400)
                if fn == "dir_admin_list": return J([c for c in ADMIN_LIST if (not a.get("p_dep") or c["dep"] == a["p_dep"]) and (not a.get("p_status") or c["status"] == a["p_status"])])
                if fn == "dir_admin_suggestions": return J([x for x in s.sugg if not a.get("p_status") or x["status"] == a["p_status"]])
                if fn == "dir_admin_resolve":
                    for x in s.sugg:
                        if x["id"] == a["p_id"]: x["status"] = a["p_status"]
                    return J(True)
                if fn == "dir_admin_save": return J({"ok": True, "slug": a["p"].get("slug") or "club-du-coin-ris-orangis"})
                if fn == "dir_admin_set_status": return J({"ok": True})
                if fn == "dir_admin_log": return J([{"id": 2, "action": "club.status", "target": "da-club-test-grigny", "details": {"status": "moderated", "note": "Horaires trompeurs"}, "at": "2026-11-20T10:00:00Z", "actor": "Référent UZU · Test"},
                                                    {"id": 1, "action": "club.created", "target": "club-reference-evry", "details": {"status": "published"}, "at": "2026-11-10T10:00:00Z", "actor": "Référent UZU · Test"}])
            if fn == "dir_get" and a.get("p_slug") == STAFF["slug"]: s.calls.append((fn, a)); return J(STAFF)
            if fn == "dir_get" and a.get("p_slug") == SHEET["slug"] and s.moderator:
                s.calls.append((fn, a)); return J({**SHEET, "origin": "uzu_client", "moderated": False, "moderation_note": ""})
            if fn == "dir_my_club" and s.moderated:
                s.calls.append((fn, a)); return J({"exists": True, "can_edit": True, "slug": "da-club-test-grigny", "status": "hidden", "moderated": True, "name": "DA Club test", "insee": "91286", "commune": "Grigny (91)",
                          "address": "", "disciplines": ["jjb_gi"], "description": "", "website": "", "instagram": "", "phone": "", "email": "", "welcome": {}, "slots": []})
        return super().handle(route)

def to_clubs(pg, mob):
    go_feed(pg, mob); tab(pg, "Clubs")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("mob", {"width": 390, "height": 844}), ("desk", {"width": 1280, "height": 900})]:
        mob = name == "mob"
        # ------------------------------------------------------------ menu renommé
        m = AdminMock(ctx("solo")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000f1", "solo@test.fr", "Léa Solo"), vp, mob)
        if mob: pg.locator(".mobile-bottom-nav button", has_text="Plus").click(); pg.wait_for_timeout(300)
        nav = pg.inner_text(".primary-nav")
        check(f"[{name}] menu : « Tatami » remplace « Fil du club »", "Tatami" in nav and "Fil du club" not in nav, nav)
        pg.locator(".nav-item", has_text="Tatami").first.click(); pg.wait_for_timeout(1500)
        check(f"[{name}] Tatami : 3 volets, Fil par défaut, fil existant affiché", pg.locator(".uzu-lib-volets button").count() == 3 and pg.locator(".uzu-lib-volets button.on").inner_text() == "Fil" and "Ton fil" in content(pg))
        tab(pg, "Clubs")
        check(f"[{name}] pratiquant sans rôle : pas d'espace référent, aucun outil appelé", pg.get_by_role("button", name="Espace référent UZU").count() == 0 and not [n for n in m.names() if n.startswith("dir_admin_")])
        c.close()
        # ------------------------------------------------------------ administrateur plateforme sans rôle ; base sans uzu-14a2
        for label, mk in [("admin plateforme sans rôle", AdminMock(ctx("solo"), moderator=False)), ("base sans uzu-14a2", AdminMock(ctx("solo"), v14a2=False))]:
            c, pg, errs = open_page(b, mk, sess("00000000-0000-0000-0000-0000000000a9", "pa@test.fr", "PA"), vp, mob); to_clubs(pg, mob)
            check(f"[{name}] {label} : pas d'espace référent, aucune erreur", pg.get_by_role("button", name="Espace référent UZU").count() == 0 and not errs, errs)
            c.close()
        # ------------------------------------------------------------ référent UZU
        m = AdminMock(ctx("solo"), moderator=True); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000e1", "ref@test.fr", "Référent"), vp, mob)
        to_clubs(pg, mob)
        btn = pg.get_by_role("button", name="Espace référent UZU")
        check(f"[{name}] référent : bouton « Espace référent UZU » sous la recherche", btn.count() == 1)
        btn.click(); pg.wait_for_timeout(1200)
        t = content(pg)
        check(f"[{name}] espace référent : 2 propositions à traiter (nouveau club, correction)", "Nouveau club · Club du coin" in t and "Correction · DA Club test" in t and pg.locator(".uzu-lib-volets button").count() == 3, t[:400])
        if mob: pg.screenshot(path=SHOTS + "5-referent-propositions-mobile.png", full_page=True)
        pg.get_by_role("button", name="Créer la fiche").click(); pg.wait_for_timeout(600)
        form = pg.locator("form[aria-label='Nouvelle fiche référencée']")
        check(f"[{name}] « Créer la fiche » : formulaire prérempli (nom) et rappel de la proposition", form.count() == 1 and form.locator("#adm-name").input_value() == "Club du coin" and "Open mat le dimanche 10 h" in form.inner_text())
        form.get_by_role("button", name="Créer la fiche").click(); pg.wait_for_timeout(400)
        check(f"[{name}] sans commune : refusé à l'écran, rien d'envoyé", "Choisis la commune" in pg.inner_text("body") and not m.last("dir_admin_save"))
        form.locator("#adm-commune").fill("Grig"); pg.wait_for_timeout(900); pg.get_by_role("option", name="Grigny 91 · 91350").click(); pg.wait_for_timeout(300)
        form.get_by_role("button", name="No-Gi / Grappling").first.click()
        form.get_by_role("button", name="Ajouter un créneau").click(); pg.wait_for_timeout(200)
        form.locator("#adm-s0-d").select_option("6"); form.locator("#adm-s0-s").fill("10:00"); form.locator("#adm-s0-e").fill("12:00")
        form.locator("input[aria-label='Tarif du créneau 1']").fill("Gratuit")
        form.get_by_role("group", name="État de la fiche").get_by_role("button", name="Publiée").click()
        if not mob: form.screenshot(path=SHOTS + "6-referent-nouvelle-fiche-ordinateur.png")
        form.get_by_role("button", name="Créer la fiche").click(); pg.wait_for_timeout(1200)
        sv = (m.last("dir_admin_save") or [{}])[-1].get("p", {})
        check(f"[{name}] fiche créée : nom, commune, discipline, créneau dimanche 10:00–12:00 open mat, publiée",
              sv.get("name") == "Club du coin" and sv.get("insee") == "91286" and sv.get("disciplines") == ["grappling_nogi"] and sv.get("status") == "published" and "slug" not in sv
              and sv.get("sessions") == [{"d": 6, "s": "10:00", "e": "12:00", "disc": None, "kind": "open_mat", "price": "Gratuit", "notes": ""}], sv)
        check(f"[{name}] la proposition d'origine est marquée traitée", {"p_id": "s-new", "p_status": "accepted"} in m.last("dir_admin_resolve") and "Fiche créée et publiée" in pg.inner_text("body"))
        pg.get_by_role("button", name="Rejeter").first.click(); pg.wait_for_timeout(800)
        check(f"[{name}] « Rejeter » : proposition rejetée, liste vidée", {"p_id": "s-fix", "p_status": "rejected"} in m.last("dir_admin_resolve") and "Aucune proposition à traiter" in content(pg))
        # Fiches
        pg.get_by_role("group", name="Rubriques du référent").get_by_role("button", name="Fiches").click(); pg.wait_for_timeout(800)
        check(f"[{name}] fiches : 3 fiches, badges Club UZU / Référencé, état Brouillon", pg.locator(".uzu-dir-admin .uzu-dir-card").count() == 3 and "Brouillon" in content(pg) and "◆ Club UZU" in content(pg))
        pg.get_by_role("button", name="Val-de-Marne (94)").click(); pg.wait_for_timeout(800)
        check(f"[{name}] filtre 94 transmis au serveur : 1 fiche", m.last("dir_admin_list")[-1]["p_dep"] == "94" and pg.locator(".uzu-dir-admin .uzu-dir-card").count() == 1)
        pg.get_by_role("button", name="Tous", exact=True).click(); pg.wait_for_timeout(800)
        pg.locator(".uzu-dir-admin .uzu-dir-card", has_text="Club référencé Évry").click(); pg.wait_for_timeout(1000)
        form = pg.locator("form[aria-label='Modifier la fiche référencée']")
        check(f"[{name}] fiche référencée : chargée pour modification avec son créneau", form.count() == 1 and form.locator("#adm-name").input_value() == "Club référencé Évry" and form.locator("#adm-s0-s").input_value() == "20:00")
        pg.wait_for_timeout(4700)  # laisse disparaître le message précédent (minuterie existante de 4,5 s)
        form.locator("#adm-s0-s").fill("2000"); form.get_by_role("button", name="Enregistrer la fiche").click(); pg.wait_for_timeout(400)
        check(f"[{name}] heure mal saisie : refusée à l'écran", "HH:MM" in pg.inner_text("body") and len(m.last("dir_admin_save")) == 1)
        pg.wait_for_timeout(4700)
        form.locator("#adm-s0-s").fill("20:00"); form.get_by_role("group", name="État de la fiche").get_by_role("button", name="Masquée").click()
        form.get_by_role("button", name="Enregistrer la fiche").click(); pg.wait_for_timeout(1200)
        sv = m.last("dir_admin_save")[-1]["p"]
        check(f"[{name}] modification : envoyée avec l'identifiant de la fiche, état Masquée", sv.get("slug") == "club-reference-evry" and sv.get("status") == "hidden" and sv["sessions"][0]["s"] == "20:00", sv)
        # Fiche cliente
        pg.get_by_role("group", name="Rubriques du référent").get_by_role("button", name="Fiches").click(); pg.wait_for_timeout(800)
        pg.locator(".uzu-dir-admin .uzu-dir-card", has_text="DA Club test").click(); pg.wait_for_timeout(1000)
        sec = pg.locator("section[aria-label=\"Modération d'une fiche de club UZU\"]")
        check(f"[{name}] fiche d'un club UZU : aucun formulaire de modification, masquage seulement", sec.count() == 1 and pg.locator("form[aria-label='Modifier la fiche référencée']").count() == 0)
        sec.get_by_role("button", name="Masquer la fiche (modération)").click(); pg.wait_for_timeout(400)
        check(f"[{name}] masquage sans motif : refusé à l'écran", not m.last("dir_admin_set_status") and "motif" in pg.inner_text("body"))
        pg.wait_for_timeout(4700)
        sec.locator("#adm-mod-note").fill("Horaires trompeurs signalés"); sec.get_by_role("button", name="Masquer la fiche (modération)").click(); pg.wait_for_timeout(900)
        check(f"[{name}] masquage avec motif envoyé", m.last("dir_admin_set_status")[-1] == {"p_slug": "da-club-test-grigny", "p_status": "moderated", "p_note": "Horaires trompeurs signalés"})
        pg.get_by_role("button", name="Retour", exact=True).click(); pg.wait_for_timeout(600)
        pg.get_by_role("group", name="Rubriques du référent").get_by_role("button", name="Journal").click(); pg.wait_for_timeout(800)
        lg = pg.locator(".uzu-dir-log").inner_text()
        check(f"[{name}] journal : actions lisibles, auteur affiché sans adresse électronique", "Masquage de modération" in lg and "Fiche créée" in lg and "Référent UZU · Test" in lg and "@" not in lg, lg)
        if mob: pg.screenshot(path=SHOTS + "7-referent-journal-mobile.png", full_page=True)
        pg.get_by_role("button", name="Retour à la recherche").click(); pg.wait_for_timeout(800)
        check(f"[{name}] retour à la recherche publique", pg.locator("#dir-commune").count() + pg.locator(".uzu-dir-commune").count() >= 1)
        check(f"[{name}] référent : aucune erreur de page", not errs, errs)
        c.close()
        # ------------------------------------------------------------ responsable : fiche masquée par la modération
        m = AdminMock(ctx("owner"), moderated=True); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a1", "resp@test.fr", "Paul Resp"), vp, mob)
        if mob:
            pg.locator(".mobile-switcher button").click(); pg.wait_for_timeout(1200); pg.locator(".mobile-menu-trigger").click(); pg.wait_for_timeout(300)
        else: pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1200)
        pg.locator(".primary-nav .nav-item", has_text="Mon académie").first.click(); pg.wait_for_timeout(1500)
        check(f"[{name}] responsable : bandeau « Fiche masquée par l'équipe UZU »", "Fiche masquée par l'équipe UZU" in content(pg))
        check(f"[{name}] responsable : aucune erreur de page", not errs, errs)
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} contrôles réussis"); sys.exit(0 if all(R) else 1)
