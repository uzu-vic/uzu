# « Où rouler ? » étape 2 — partenaires de roulage (uzu-14b), sur base simulée.
# Lancer après la construction simulée (voir tests/directory_e2e.py) et npx next start -p 3100.
# Profils : adhérent (parcours complet), indépendant, professeur, multi-club, mineur, profil en pause, référent UZU,
# base sans uzu-14b. Téléphone (390 px) et ordinateur (1280 px).
import json, sys, datetime
SRC = open("tests/directory_e2e.py").read()
exec(SRC[:SRC.index("with sync_playwright() as p:")])  # reprend les outils et la base simulée de l'annuaire

TODAY = datetime.date.today(); D = lambda n: (TODAY + datetime.timedelta(days=n)).isoformat()
CLUBS2 = [{"id": "c1", "name": "DA Club test"}, {"id": "c2", "name": "Autre club test"}]
PARTNERS = [
    {"handle": "h-sarah", "name": "Sarah B.", "belt": "bleue", "years": None, "club": None, "commune": "Grigny", "dep": "91", "band": "moins de 10 km",
     "starts_on": D(0), "ends_on": D(6), "days": [0, 1, 2, 3, 4, 5, 6], "parts": ["soir"], "disciplines": ["jjb_gi"], "intensities": ["technique", "modere"], "places": ["club", "open_mat"], "note": "Dispo le soir"},
    {"handle": "h-paul", "name": "Paul P.", "belt": "noire", "years": 15, "club": "DA Club test", "commune": "Évry-Courcouronnes", "dep": "91", "band": "moins de 10 km",
     "starts_on": D(1), "ends_on": D(8), "days": [5, 6], "parts": ["matin"], "disciplines": ["jjb_gi", "grappling_nogi"], "intensities": ["intense"], "places": ["open_mat"], "note": ""},
    {"handle": "h-lina", "name": "Lina M.", "belt": None, "years": None, "club": None, "commune": "Ris-Orangis", "dep": "91", "band": "10 à 25 km",
     "starts_on": D(0), "ends_on": D(3), "days": [1, 3], "parts": ["midi", "soir"], "disciplines": ["grappling_nogi"], "intensities": ["modere"], "places": ["a_convenir"], "note": ""}]
REPORTS = [{"key": "rk-1", "name": "Nadia A.", "profile_status": "paused", "count": 3, "reporters": 3, "reasons": {"inapproprie": 2, "harcelement": 1},
            "last_at": "2026-11-19T10:00:00Z", "last_details": "Insistant après un refus"}]
RANK = {"blanche": 1, "bleue": 2, "violette": 3, "marron": 4, "noire": 5}
FORBIDDEN = ["user_id", "@", "home_insee", "00000000-0000"]

class RMock(Mock):
    def __init__(s, c, name="Karim A.", minor=False, belt="violette", clubs=None, profile=None, avails=None, installed14b=True, moderator=False):
        super().__init__(c); s.name, s.minor, s.belt, s.clubs = name, minor, belt, clubs if clubs is not None else CLUBS2[:1]
        s.profile, s.avails, s.v14b, s.moderator = profile, avails or [], installed14b, moderator
        s.blocks, s.reports = [], json.loads(json.dumps(REPORTS))
    def me(s): return {"minor": s.minor, "name": s.name, "belt": s.belt, "clubs": s.clubs, "profile": s.profile, "availabilities": s.avails}
    def handle(s, route):
        r = route.request; u = r.url
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        E = lambda m: J({"code": "P0001", "message": m}, 400)
        if "/rpc/" in u:
            fn = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}")
            if fn == "dir_whoami": s.calls.append((fn, a)); return J({"moderator": s.moderator})
            if fn.startswith("rouler_"):
                s.calls.append((fn, a))
                if not s.v14b: return J({"code": "PGRST202", "message": f"Could not find the function public.{fn} in the schema cache"}, 404)
                if fn == "rouler_me": return J(s.me())
                if fn == "rouler_activate":
                    p = a["p"]
                    if s.minor: return E("Activation impossible : tu fais partie d'un groupe de mineurs dans ton club")
                    s.profile = {"status": "active", "visibility": p.get("visibility", "hidden"), "home_insee": p["home_insee"], "home_commune": "Grigny (91)",
                                 "disciplines": p["disciplines"], "intensities": p["intensities"], "show_belt": p["show_belt"], "show_club_id": p["show_club_id"], "years": p["years"], "adult_declared_at": "2026-11-20T10:00:00Z"}
                    return J(s.me())
                if fn == "rouler_save_profile": s.profile.update({k: v for k, v in a["p"].items() if k in s.profile}); return J(s.me())
                if fn == "rouler_set_visibility": s.profile["visibility"] = a["p_visibility"]; return J(s.me())
                if fn == "rouler_delete_profile": s.profile, s.avails = None, []; return J(True)
                if fn == "rouler_save_availability":
                    p = a["p"]
                    if len(s.avails) >= 3 and not p.get("id"): return E("3 disponibilités en cours au plus : arrête-en une d'abord")
                    av = {"id": p.get("id") or f"av-{len(s.avails) + 1}", "insee": p["insee"], "commune": "Grigny (91)" if not p["is_travel"] else "Annecy (74)", "is_travel": p["is_travel"],
                          "starts_on": p["starts_on"], "ends_on": p["ends_on"], "days": p["days"], "parts": p["parts"], "disciplines": p["disciplines"], "intensities": p["intensities"],
                          "places": p["places"], "note": p["note"], "state": "current" if p["starts_on"] <= D(0) else "upcoming"}
                    s.avails = [x for x in s.avails if x["id"] != av["id"]] + [av]; return J(s.me())
                if fn == "rouler_end_availability": s.avails = [x for x in s.avails if x["id"] != a["p_id"]]; return J(s.me())
                if fn == "rouler_search":
                    pr = s.profile
                    if not pr: return J({"need": "activate"})
                    if pr["status"] == "paused": return J({"need": "paused"})
                    if pr["visibility"] == "hidden": return J({"need": "visible"})
                    L = [x for x in PARTNERS if x["handle"] not in s.blocks and (not a.get("p_disc") or a["p_disc"] in x["disciplines"]) and (not a.get("p_intensity") or a["p_intensity"] in x["intensities"])]
                    if a.get("p_belt_min") or a.get("p_belt_max"):
                        L = [x for x in L if x["belt"] and RANK.get(a.get("p_belt_min") or "blanche", 1) <= RANK[x["belt"]] <= RANK.get(a.get("p_belt_max") or "noire", 5)]
                    return J({"commune": {"insee": a["p_insee"], "nom": "Grigny", "dep": "91"}, "radius": a["p_radius"], "from": a["p_from"], "to": a["p_to"], "results": L})
                if fn == "rouler_block": s.blocks.append(a["p_handle"]); return J(True)
                if fn == "rouler_my_blocks": return J([{"key": "k-" + h, "name": next(x["name"] for x in PARTNERS if x["handle"] == h), "at": "2026-11-20T10:00:00Z"} for h in s.blocks])
                if fn == "rouler_unblock": s.blocks = [h for h in s.blocks if "k-" + h != a["p_key"]]; return J(True)
                if fn == "rouler_report": return J(True)
                if fn in ("rouler_admin_reports", "rouler_admin_resolve"):
                    if not s.moderator: return E("Action réservée au référent UZU")
                    if fn == "rouler_admin_reports": return J([x for x in s.reports if a.get("p_status") != "open" or x["profile_status"] != "restored_done"])
                    s.reports = [x for x in s.reports if x["key"] != a["p_key"]]; return J(True)
                return J(True)
            if fn.startswith("dir_admin_"):
                s.calls.append((fn, a))
                if not s.moderator: return E("Action réservée au référent UZU")
                return J([])
        return super().handle(route)

def pick(pg, sel):
    pg.locator(sel).fill("Grig"); pg.wait_for_timeout(900)
    pg.get_by_role("option", name="Grigny 91 · 91350").click(); pg.wait_for_timeout(700)
def leaks(t): return [x for x in FORBIDDEN if x in t]
def go_partners(pg, mob):
    go_feed(pg, mob); tab(pg, "Partenaires"); pg.wait_for_timeout(500)
PROF = lambda **k: {**{"status": "active", "visibility": "clubs", "home_insee": "91286", "home_commune": "Grigny (91)", "disciplines": ["jjb_gi"], "intensities": ["technique"],
                       "show_belt": False, "show_club_id": None, "years": None, "adult_declared_at": "2026-11-20T10:00:00Z"}, **k}
SHOT = "/tmp/rouler-shots/"; os.makedirs(SHOT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("mob", {"width": 390, "height": 844}), ("desk", {"width": 1280, "height": 900})]:
        mob = name == "mob"; sh = lambda pg, f: pg.screenshot(path=SHOT + f + ("-mobile" if mob else "-ordinateur") + ".png", full_page=True)
        # ------------------------------------------------------------ 1. adhérent : parcours complet
        m = RMock(ctx("student")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        home = content(pg)
        check(f"[{name}] accueil : « Trouver un partenaire » et « Trouver un club », pas de rappel sans profil",
              pg.get_by_role("button", name="Trouver un partenaire").count() == 1 and pg.get_by_role("button", name="Trouver un club").count() == 1 and "Ta disponibilité" not in home, home[:300])
        pg.get_by_role("button", name="Trouver un partenaire").click(); pg.wait_for_timeout(1200)
        t = content(pg)
        check(f"[{name}] le bouton ouvre Tatami sur Partenaires : « Tu es invisible », ce qui est montré et jamais montré",
              pg.locator(".uzu-lib-volets button.on").inner_text() == "Partenaires" and "Tu es invisible" in t and "Ce qu'ils ne verront jamais" in t and "Réservé aux pratiquants majeurs" in t, t[:400])
        check(f"[{name}] consulter ne crée rien et ne lance aucune recherche", "rouler_activate" not in m.names() and "rouler_search" not in m.names())
        sh(pg, "1-presentation")
        pg.get_by_role("button", name="Activer mon profil de roulage").click(); pg.wait_for_timeout(500)
        pg.get_by_role("button", name="Continuer").click(); pg.wait_for_timeout(300)
        check(f"[{name}] activation sans cocher la majorité : refusée à l'écran", "18 ans ou plus" in pg.locator(".uzu-banner--error").inner_text() and "rouler_activate" not in m.names())
        for lb in ["J'ai 18 ans ou plus.", "J'accepte que", "J'ai lu les conseils"]:
            pg.locator("button[role=checkbox]", has_text=lb).click()
        sh(pg, "2-activation")
        pg.get_by_role("button", name="Continuer").click(); pg.wait_for_timeout(500)
        t = content(pg)
        check(f"[{name}] profil : visibilité « Personne » par défaut, aperçu « Karim A. », rien de montré par défaut",
              pg.get_by_role("group", name="Qui peut me voir ?").locator("button.on").inner_text() == "Personne" and "Karim A." in t
              and pg.locator("button[role=checkbox][aria-checked=true]").count() == 0, t[:500])
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(400)
        check(f"[{name}] sans ville habituelle : refusé à l'écran", "ville habituelle" in pg.locator(".uzu-banner--error").inner_text() and "rouler_activate" not in m.names())
        pick(pg, "#rl-home")
        sh(pg, "3-profil")
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1000)
        a = m.last("rouler_activate")[-1]["p"]
        check(f"[{name}] activation envoyée : 3 accords, invisible, ceinture/club/années non montrés",
              a["adult"] and a["consent"] and a["safety"] and a["visibility"] == "hidden" and a["show_belt"] is False and a["show_club_id"] is None and a["years"] is None and a["home_insee"] == "91286", a)
        t = content(pg)
        check(f"[{name}] après activation : invisible, aucune recherche, choix de visibilité proposé",
              "Tu es invisible. Pour voir les autres" in t and pg.get_by_role("button", name="Visible de mes clubs").count() == 1 and "rouler_search" not in m.names(), t[:400])
        pg.get_by_role("button", name="Visible de mes clubs").click(); pg.wait_for_timeout(1400)
        sa = m.last("rouler_search")
        check(f"[{name}] visible de mes clubs : recherche lancée sur la ville habituelle, sans aucun identifiant",
              m.last("rouler_set_visibility")[-1] == {"p_visibility": "clubs"} and sa and set(sa[-1]) == {"p_insee", "p_radius", "p_from", "p_to", "p_disc", "p_belt_min", "p_belt_max", "p_intensity"}
              and sa[-1]["p_insee"] == "91286" and sa[-1]["p_from"] == D(0) and sa[-1]["p_to"] == D(13), sa[-1:] )
        L = pg.locator(".uzu-dir-list").inner_text()
        check(f"[{name}] résultats : 3 partenaires, prénom et initiale, tranches de distance, ceinture si montrée",
              pg.locator(".uzu-dir-card").count() == 3 and "Sarah B." in L and "moins de 10 km" in L and "10 à 25 km" in L and "Bleue" in L and "DA Club test · 15 ans de pratique" in L, L[:500])
        check(f"[{name}] résultats : ni identifiant, ni courriel, ni ville habituelle", not leaks(L), leaks(L))
        sh(pg, "4-resultats")
        pg.get_by_label("Ceinture minimale").select_option("bleue"); pg.wait_for_timeout(1000)
        check(f"[{name}] filtre de niveau transmis ; sans ceinture affichée exclu, avec mention à l'écran",
              m.last("rouler_search")[-1]["p_belt_min"] == "bleue" and pg.locator(".uzu-dir-card").count() == 2 and "n'affichent pas leur ceinture sont exclus" in content(pg))
        pg.get_by_label("Ceinture minimale").select_option(""); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="No-Gi / Grappling", exact=True).click(); pg.wait_for_timeout(900)
        check(f"[{name}] filtre de discipline transmis", m.last("rouler_search")[-1]["p_disc"] == "grappling_nogi" and pg.locator(".uzu-dir-card").count() == 2)
        pg.get_by_role("button", name="Toutes", exact=True).click(); pg.wait_for_timeout(800)
        pg.locator(".uzu-dir-card", has_text="Sarah B.").click(); pg.wait_for_timeout(700)
        t = content(pg)
        check(f"[{name}] fiche partenaire : demande de roulage annoncée « bientôt » et désactivée, conseils de sécurité",
              pg.get_by_role("button", name="Proposer un roulage · bientôt").is_disabled() and "préviens un proche" in t, t[:400])
        sh(pg, "5-fiche-partenaire")
        pg.get_by_role("button", name="Signaler").click(); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Envoyer le signalement").click(); pg.wait_for_timeout(300)
        check(f"[{name}] signalement sans motif : refusé à l'écran", "motif" in pg.locator(".uzu-banner--error").inner_text() and "rouler_report" not in m.names())
        pg.get_by_role("radio", name="Harcèlement").click(); pg.locator("#rl-details").fill("Messages insistants")
        sh(pg, "6-signalement")
        pg.get_by_role("button", name="Envoyer le signalement").click(); pg.wait_for_timeout(900)
        check(f"[{name}] signalement envoyé avec la disponibilité (poignée), le motif et la précision",
              m.last("rouler_report")[-1] == {"p_handle": "h-sarah", "p_reason": "harcelement", "p_details": "Messages insistants"} and pg.locator(".uzu-dir-card").count() == 3)
        pg.wait_for_timeout(4700)
        pg.locator(".uzu-dir-card", has_text="Sarah B.").click(); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="Ne plus voir Sarah B.").click(); pg.wait_for_timeout(300)
        check(f"[{name}] blocage : explication « vous ne vous verrez plus, ni l'un ni l'autre »", "ni l'un ni l'autre" in content(pg))
        pg.get_by_role("button", name="Confirmer").click(); pg.wait_for_timeout(1200)
        check(f"[{name}] blocage envoyé avec la poignée ; Sarah disparaît des résultats",
              m.last("rouler_block")[-1] == {"p_handle": "h-sarah"} and pg.locator(".uzu-dir-card", has_text="Sarah B.").count() == 0 and pg.locator(".uzu-dir-card").count() == 2)
        pg.wait_for_timeout(4700)
        # Disponibilité
        pg.get_by_role("button", name="Je suis dispo").click(); pg.wait_for_timeout(600)
        check(f"[{name}] formulaire de disponibilité : dates proposées aujourd'hui → +6, expiration annoncée",
              pg.locator("input[type=date]").nth(0).input_value() == D(0) and pg.locator("input[type=date]").nth(1).input_value() == D(6) and "Expire seule le" in content(pg))
        pg.get_by_role("button", name="En déplacement").click(); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Publier ma disponibilité").click(); pg.wait_for_timeout(300)
        check(f"[{name}] déplacement sans ville : refusé à l'écran", "ville de ton déplacement" in pg.locator(".uzu-banner--error").inner_text() and "rouler_save_availability" not in m.names())
        pg.get_by_role("button", name="Dans ma ville · Grigny (91)").click(); pg.wait_for_timeout(300)
        pg.locator("input[type=date]").nth(1).fill(D(20)); pg.wait_for_timeout(200)
        pg.get_by_role("button", name="Publier ma disponibilité").click(); pg.wait_for_timeout(300)
        check(f"[{name}] plus de 14 jours : refusé à l'écran", "14 jours au plus" in pg.locator(".uzu-banner--error").inner_text() and "rouler_save_availability" not in m.names(), (pg.locator(".uzu-banner--error").inner_text(), pg.locator("input[type=date]").nth(1).input_value()))
        pg.locator("input[type=date]").nth(1).fill(D(6))
        pg.get_by_role("group", name="Moments").get_by_role("button", name="Soir").click()
        pg.get_by_role("button", name="Publier ma disponibilité").click(); pg.wait_for_timeout(300)
        check(f"[{name}] aucun moment : refusé à l'écran", "au moins un moment" in pg.locator(".uzu-banner--error").inner_text())
        pg.get_by_role("group", name="Moments").get_by_role("button", name="Matin").click()
        pg.locator("#rl-note").fill("Dispo le matin, open mat bienvenu")
        sh(pg, "7-disponibilite")
        pg.get_by_role("button", name="Publier ma disponibilité").click(); pg.wait_for_timeout(1000)
        a = m.last("rouler_save_availability")[-1]["p"]
        check(f"[{name}] disponibilité envoyée : ville habituelle, dates, jours, moment, lieux, mot",
              a["is_travel"] is False and a["insee"] == "91286" and a["starts_on"] == D(0) and a["ends_on"] == D(6) and a["parts"] == ["matin"] and len(a["days"]) == 7
              and a["places"] == ["club", "open_mat"] and a["note"] == "Dispo le matin, open mat bienvenu", a)
        t = content(pg)
        check(f"[{name}] retour à la recherche : rappel « active jusqu'au », bouton « Mes disponibilités (1) »", "est active jusqu'au" in t and pg.get_by_role("button", name="Mes disponibilités (1)").count() == 1, t[:400])
        pg.get_by_role("button", name="Mes disponibilités (1)").click(); pg.wait_for_timeout(1000)
        t = content(pg)
        check(f"[{name}] mes disponibilités : « 1 en cours sur 3 possibles », En cours, expiration automatique, Modifier et Arrêter",
              "1 en cours sur 3 possibles" in t and "En cours" in t and "Expire automatiquement" in t and pg.get_by_role("button", name="Arrêter").count() == 1, t[:500])
        check(f"[{name}] personnes que tu ne vois plus : Sarah B., annulable", "Personnes que tu ne vois plus" in t and "Sarah B." in t)
        sh(pg, "8-mes-disponibilites")
        pg.locator("section[aria-label='Personnes que tu ne vois plus']").get_by_role("button", name="Annuler").click(); pg.wait_for_timeout(900)
        check(f"[{name}] annulation du blocage envoyée par clé opaque", m.last("rouler_unblock")[-1] == {"p_key": "k-h-sarah"} and "Personnes que tu ne vois plus" not in content(pg))
        pg.get_by_role("button", name="Modifier").click(); pg.wait_for_timeout(500)
        pg.locator("#rl-note").fill("Finalement le soir"); pg.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(900)
        check(f"[{name}] modification envoyée sur la même disponibilité", m.last("rouler_save_availability")[-1]["p"]["id"] == "av-1" and m.last("rouler_save_availability")[-1]["p"]["note"] == "Finalement le soir")
        pg.get_by_role("button", name="Mes disponibilités (1)").click(); pg.wait_for_timeout(700)
        pg.get_by_role("button", name="Arrêter").click(); pg.wait_for_timeout(900)
        check(f"[{name}] arrêter : envoyé, plus de disponibilité en cours", m.last("rouler_end_availability")[-1] == {"p_id": "av-1"} and "Aucune disponibilité en cours" in content(pg))
        pg.get_by_role("button", name="Me rendre invisible").click(); pg.wait_for_timeout(800)
        check(f"[{name}] me rendre invisible : envoyé", m.last("rouler_set_visibility")[-1] == {"p_visibility": "hidden"} and "Ma visibilité : Personne" in content(pg))
        pg.get_by_role("button", name="Supprimer mon profil de roulage").click(); pg.wait_for_timeout(300)
        check(f"[{name}] suppression : confirmation expliquant que le compte, les séances et le club ne changent pas", "ne changent pas" in content(pg) and "rouler_delete_profile" not in m.names())
        pg.get_by_role("button", name="Oui, supprimer").click(); pg.wait_for_timeout(1000)
        check(f"[{name}] profil supprimé : retour à la présentation « Tu es invisible »", "rouler_delete_profile" in m.names() and "Tu es invisible" in content(pg))
        check(f"[{name}] adhérent : aucune erreur de page", not errs, errs)
        c.close()

        # ------------------------------------------------------------ 2. disponibilité en cours : rappel sur l'accueil
        av = {"id": "av-9", "insee": "74010", "commune": "Annecy (74)", "is_travel": True, "starts_on": D(0), "ends_on": D(5), "days": [0, 1], "parts": ["soir"], "disciplines": ["grappling_nogi"],
              "intensities": ["modere"], "places": ["open_mat"], "note": "", "state": "current"}
        m = RMock(ctx("student"), profile=PROF(), avails=[av]); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        home = content(pg)
        check(f"[{name}] accueil : rappel « Ta disponibilité à Annecy (74) est active jusqu'au … »", "Ta disponibilité à Annecy (74) est active jusqu" in home, home[:400])
        if mob: sh(pg, "9-accueil-rappel")
        pg.locator(".uzu-rl-remind").get_by_role("button", name="Voir").click(); pg.wait_for_timeout(1200)
        check(f"[{name}] « Voir » ouvre Partenaires", pg.locator(".uzu-lib-volets button.on").inner_text() == "Partenaires")
        c.close()

        # ------------------------------------------------------------ 3. indépendant, professeur, multi-club : options d'affichage
        m = RMock(ctx("solo"), name="Omar I.", clubs=[], belt=None); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000f1", "omar@test.fr", "Omar Independant"), vp, mob)
        go_partners(pg, mob); pg.get_by_role("button", name="Activer mon profil de roulage").click(); pg.wait_for_timeout(300)
        for lb in ["J'ai 18 ans ou plus.", "J'accepte que", "J'ai lu les conseils"]: pg.locator("button[role=checkbox]", has_text=lb).click()
        pg.get_by_role("button", name="Continuer").click(); pg.wait_for_timeout(400)
        check(f"[{name}] indépendant : pas d'option « Mon club », ceinture « aucune enregistrée »",
              pg.locator("button[role=checkbox]", has_text="Mon club").count() == 0 and "aucune ceinture enregistrée" in content(pg))
        pick(pg, "#rl-home"); pg.get_by_role("group", name="Qui peut me voir ?").get_by_role("button", name="Tout UZU").click()
        check(f"[{name}] « Tout UZU » : explication de la réciprocité", "qui ont aussi choisi « Tout UZU »" in content(pg))
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1200)
        check(f"[{name}] indépendant : activé « Tout UZU », recherche lancée", m.last("rouler_activate")[-1]["p"]["visibility"] == "uzu" and m.last("rouler_search"))
        check(f"[{name}] indépendant : aucune erreur de page", not errs, errs)
        c.close()

        m = RMock(ctx("instructor"), name="Paul P.", belt="noire"); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000c1", "paul@test.fr", "Paul Professeur"), vp, mob)
        go_partners(pg, mob); pg.get_by_role("button", name="Activer mon profil de roulage").click(); pg.wait_for_timeout(300)
        for lb in ["J'ai 18 ans ou plus.", "J'accepte que", "J'ai lu les conseils"]: pg.locator("button[role=checkbox]", has_text=lb).click()
        pg.get_by_role("button", name="Continuer").click(); pg.wait_for_timeout(400)
        pick(pg, "#rl-home")
        pg.locator("button[role=checkbox]", has_text="Ma ceinture").click(); pg.locator("button[role=checkbox]", has_text="Mon club").click()
        pg.locator("button[role=checkbox]", has_text="Mes années de pratique").click(); pg.get_by_label("Années de pratique").fill("99")
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(300)
        check(f"[{name}] professeur : années hors bornes refusées à l'écran", "entre 0 et 60" in pg.locator(".uzu-banner--error").inner_text() and "rouler_activate" not in m.names())
        pg.get_by_label("Années de pratique").fill("15")
        pv = pg.locator(".uzu-rl-preview").inner_text()
        check(f"[{name}] professeur : aperçu avec ceinture, club et années choisis", "Ceinture noire" in pv and "DA Club test" in pv and "15 ans de pratique" in pv, pv)
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1000)
        a = m.last("rouler_activate")[-1]["p"]
        check(f"[{name}] professeur : ceinture, club (c1) et années envoyés", a["show_belt"] is True and a["show_club_id"] == "c1" and a["years"] == 15, a)
        check(f"[{name}] professeur : aucune erreur de page", not errs, errs)
        c.close()

        m = RMock(ctx("assistant", memberships=[{"academy_id": "c1", "name": "DA Club test", "role": "assistant", "status": "active"}, {"academy_id": "c2", "name": "Autre club test", "role": "student", "status": "active"}]),
                  name="Lina M.", clubs=CLUBS2, profile=PROF(show_club_id="c1"))
        c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000d1", "lina@test.fr", "Lina Multiclub"), vp, mob)
        go_partners(pg, mob); pg.locator(".uzu-rl-menu").get_by_role("button", name="Mon profil").click(); pg.wait_for_timeout(500)
        check(f"[{name}] multi-club : choix du club affiché parmi ses deux clubs", pg.get_by_label("Club affiché").locator("option").count() == 2)
        pg.get_by_label("Club affiché").select_option("c2"); pg.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(900)
        check(f"[{name}] multi-club : club affiché changé (c2) et enregistré", m.last("rouler_save_profile")[-1]["p"]["show_club_id"] == "c2")
        check(f"[{name}] multi-club : aucune erreur de page", not errs, errs)
        c.close()

        # ------------------------------------------------------------ 4. mineur, profil en pause, base sans uzu-14b
        m = RMock(ctx("student"), name="Theo M.", minor=True); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000e1", "theo@test.fr", "Theo Mineur"), vp, mob)
        go_partners(pg, mob); t = content(pg)
        check(f"[{name}] mineur : fonction indisponible, aucun bouton d'activation", "groupe de mineurs" in t and pg.get_by_role("button", name="Activer mon profil de roulage").count() == 0, t[:300])
        c.close()
        m = RMock(ctx("student"), profile=PROF(status="paused")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        go_partners(pg, mob); t = content(pg)
        check(f"[{name}] profil en pause : message, aucune recherche", "en pause" in t and "rouler_search" not in m.names(), t[:300])
        c.close()
        m = RMock(ctx("student"), installed14b=False); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        home = content(pg); go_partners(pg, mob); t = content(pg)
        check(f"[{name}] base sans uzu-14b : accueil normal, volet Partenaires « pas encore disponibles », aucune erreur de page",
              "OÙ ROULER ?" in home and "pas encore disponibles" in t and not errs, (t[:200], errs))
        c.close()

        # ------------------------------------------------------------ 5. référent UZU : signalements
        m = RMock(ctx("solo"), name="Ref T.", clubs=[], moderator=True); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a9", "ref@test.fr", "Ref Test"), vp, mob)
        go_feed(pg, mob); tab(pg, "Clubs")
        pg.get_by_role("button", name="Espace référent UZU").click(); pg.wait_for_timeout(1000)
        rub = pg.get_by_role("group", name="Rubriques du référent")
        check(f"[{name}] référent : rubrique « Signalements · 1 »", rub.get_by_role("button", name="Signalements · 1").count() == 1)
        rub.get_by_role("button", name="Signalements · 1").click(); pg.wait_for_timeout(800)
        t = content(pg)
        check(f"[{name}] référent : prénom et initiale, en pause, 3 personnes, motifs, dernière précision ; aucune adresse électronique",
              "Nadia A." in t and "En pause" in t and "3 personnes" in t and "comportement inapproprié (2)" in t and "Insistant après un refus" in t and "@" not in pg.locator(".uzu-dir-admin").inner_text(), t[:600])
        sh(pg, "10-referent-signalements")
        pg.get_by_role("button", name="Maintenir la pause").click(); pg.wait_for_timeout(900)
        check(f"[{name}] référent : décision envoyée (maintenir la pause), liste mise à jour",
              m.last("rouler_admin_resolve")[-1] == {"p_key": "rk-1", "p_decision": "keep"} and "Aucun signalement à traiter" in content(pg))
        check(f"[{name}] référent : aucune erreur de page", not errs, errs)
        c.close()
        m = RMock(ctx("student")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        go_feed(pg, mob); tab(pg, "Clubs")
        check(f"[{name}] adhérent sans rôle : pas d'espace référent, aucun appel aux signalements",
              pg.get_by_role("button", name="Espace référent UZU").count() == 0 and "rouler_admin_reports" not in m.names())
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} contrôles réussis"); sys.exit(0 if all(R) else 1)
