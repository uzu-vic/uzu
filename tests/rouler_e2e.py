# « Où rouler ? » étape 2, révision « court terme » (créneaux précis), sur base simulée.
# Lancer après la construction simulée (voir tests/directory_e2e.py) et npx next start -p 3100.
# L'heure du serveur simulé est figée (T) : les cas horaires sont donc exacts.
# Profils : adhérent (parcours complet : raccourcis, temps commun, Mon créneau, déplacement Grigny → Bordeaux),
# indépendant, professeur, multi-club, mineur, profil en pause, référent UZU, base sans le module.
import json, sys, datetime, os
from zoneinfo import ZoneInfo
SRC = open("tests/directory_e2e.py").read()
exec(SRC[:SRC.index("with sync_playwright() as p:")])  # outils et base simulée de l'annuaire
COMMUNES.extend([{"insee": "33063", "nom": "Bordeaux", "departement": "33", "code_postal": "33000"},
                 {"insee": "33281", "nom": "Mérignac", "departement": "33", "code_postal": "33700"}])
UTC, PARIS = datetime.timezone.utc, ZoneInfo("Europe/Paris")
iso = lambda d: d.astimezone(UTC).isoformat().replace("+00:00", "Z")
hm = lambda d: d.astimezone(PARIS).strftime("%H:%M")
M = lambda n: datetime.timedelta(minutes=n)
CLUBS2 = [{"id": "c1", "name": "DA Club test"}, {"id": "c2", "name": "Autre club test"}]
RANK = {"blanche": 1, "bleue": 2, "violette": 3, "marron": 4, "noire": 5}
COMMUNE_TZ = {"91286": ("Grigny", "91"), "33063": ("Bordeaux", "33"), "33281": ("Mérignac", "33")}
REPORTS = [{"key": "rk-1", "name": "Nadia A.", "profile_status": "paused", "count": 3, "reporters": 3, "reasons": {"inapproprie": 2, "harcelement": 1},
            "last_at": "2026-11-19T10:00:00Z", "last_details": "Insistant après un refus"}]
FORBIDDEN = ["user_id", "@", "home_insee", "00000000-0000"]

def partner(h, name, insee, a, b, belt=None, travel=False, note="", disc=("jjb_gi",)):
    nom, dep = COMMUNE_TZ[insee]
    return {"handle": h, "name": name, "belt": belt, "years": None, "club": None, "commune": nom, "dep": dep, "band": "moins de 10 km", "tz": "Europe/Paris",
            "is_travel": travel, "starts_at": a, "ends_at": b, "disciplines": list(disc), "intensities": ["modere"], "places": ["open_mat"], "note": note, "_insee": insee}

class RMock(Mock):
    def __init__(s, c, name="Karim A.", minor=False, belt="violette", clubs=None, profile=None, installed14b=True, moderator=False):
        super().__init__(c); s.name, s.minor, s.belt, s.clubs = name, minor, belt, clubs if clubs is not None else CLUBS2[:1]
        s.profile, s.v14b, s.moderator, s.avails, s.blocks, s.reports = profile, installed14b, moderator, [], [], json.loads(json.dumps(REPORTS))
        n = datetime.datetime.now(UTC); s.T = n.replace(second=0, microsecond=0)        # heure du serveur, figée
        q = s.T + M(60); q = q + M((15 - q.minute % 15) % 15); s.Q = q                   # « autre moment » utilisé pour le déplacement
        T = s.T
        s.partners = [partner("h-kevin", "Kevin T.", "91286", T - M(30), T + M(120), "violette"),
                      partner("h-lou", "Lou T.", "91286", T + M(20), T + M(90)),
                      partner("h-sam", "Sam T.", "91286", T - M(120), T + M(30)),
                      partner("h-ines", "Ines T.", "91286", T + M(90), T + M(210), disc=("grappling_nogi",)),
                      partner("h-lea", "Léa T.", "33063", q - M(30), q + M(90), travel=True, note="Je découvre la région", disc=("jjb_gi", "grappling_nogi"))]
    def me(s):
        L = []
        for a in s.avails:
            x = {k: v for k, v in a.items() if not k.startswith("_")}
            x["starts_at"], x["ends_at"] = iso(a["_a"]), iso(a["_b"]); x["state"] = "current" if a["_a"] <= s.T else "upcoming"
            x["compatible"] = len(s.match(a["insee"], max(a["_a"], s.T), a["_b"], min(M(60), a["_b"] - max(a["_a"], s.T))))
            L.append(x)
        return {"now": iso(s.T), "minor": s.minor, "name": s.name, "belt": s.belt, "clubs": s.clubs, "profile": s.profile, "availabilities": sorted(L, key=lambda x: x["starts_at"])}
    def match(s, insee, w0, w1, req):
        out = []
        for p in s.partners:
            if p["_insee"] != insee or p["handle"] in s.blocks or p["ends_at"] <= s.T: continue
            cs, ce = max(p["starts_at"], w0), min(p["ends_at"], w1)
            if ce > cs and ce - cs >= req:
                x = {k: v for k, v in p.items() if not k.startswith("_")}
                x.update(starts_at=iso(p["starts_at"]), ends_at=iso(p["ends_at"]), common_start=iso(cs), common_end=iso(ce), common_minutes=int((ce - cs).total_seconds() // 60))
                out.append(x)
        return out
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
                    s.profile = {"status": "active", "visibility": p.get("visibility", "hidden"), "home_insee": p["home_insee"], "home_commune": "Grigny (91)", "home_tz": "Europe/Paris",
                                 "disciplines": p["disciplines"], "intensities": p["intensities"], "show_belt": p["show_belt"], "show_club_id": p["show_club_id"], "years": p["years"], "adult_declared_at": "2026-11-20T10:00:00Z"}
                    return J(s.me())
                if fn == "rouler_save_profile": s.profile.update({k: v for k, v in a["p"].items() if k in s.profile}); return J(s.me())
                if fn == "rouler_set_visibility": s.profile["visibility"] = a["p_visibility"]; return J(s.me())
                if fn == "rouler_delete_profile": s.profile, s.avails = None, []; return J(True)
                if fn == "rouler_save_availability":
                    p = a["p"]; travel = bool(p.get("is_travel")); insee = p["insee"] if travel else s.profile["home_insee"]
                    if p["minutes"] not in (60, 90, 120, 180): return E("Durée : 1 h, 1 h 30, 2 h ou 3 h")
                    if p["when"] == "custom":
                        st = datetime.datetime.fromisoformat(f'{p["date"]}T{p["time"]}').replace(tzinfo=PARIS).astimezone(UTC)
                    else: st = s.T + M({"now": 0, "30": 30, "60": 60, "120": 120, "240": 240}[p["when"]])
                    en = st + M(p["minutes"])
                    others = [x for x in s.avails if x["id"] != p.get("id")]
                    if any(x["_a"] < en and x["_b"] > st for x in others): return E("Tu as déjà un créneau sur cet horaire")
                    if not p.get("id") and len(s.avails) >= 3: return E("3 créneaux en cours ou à venir au plus : arrête-en un d'abord")
                    nom, dep = COMMUNE_TZ[insee]
                    av = {"id": p.get("id") or f"av-{len(s.calls)}", "insee": insee, "commune": f"{nom} ({dep})", "tz": "Europe/Paris", "is_travel": travel, "minutes": p["minutes"],
                          "disciplines": p["disciplines"], "intensities": p["intensities"], "places": p["places"], "note": p["note"], "_a": st, "_b": en}
                    s.avails = others + [av]; return J(s.me())
                if fn == "rouler_end_availability": s.avails = [x for x in s.avails if x["id"] != a["p_id"]]; return J(s.me())
                if fn == "rouler_extend_availability":
                    for x in s.avails:
                        if x["id"] == a["p_id"]:
                            if x["_b"] + M(30) - x["_a"] > M(240): return E("Un créneau dure 4 h au plus")
                            x["_b"] += M(30); x["minutes"] += 30
                    return J(s.me())
                if fn == "rouler_search":
                    p, pr = a["p"], s.profile
                    if not pr: return J({"need": "activate"})
                    if pr["status"] == "paused": return J({"need": "paused"})
                    if pr["visibility"] == "hidden": return J({"need": "visible"})
                    mins, when = p.get("minutes", 60), p.get("when", "now")
                    if when == "slot":
                        sl = next(x for x in s.avails if x["id"] == p["slot"]); insee = p.get("insee") or sl["insee"]
                        w0 = max(sl["_a"], s.T); w1 = sl["_b"]; req = min(M(mins), w1 - w0)
                    else:
                        insee = p["insee"]
                        w0 = datetime.datetime.fromisoformat(f'{p["date"]}T{p["time"]}').replace(tzinfo=PARIS).astimezone(UTC) if when == "custom" else s.T + M({"now": 0, "30": 30, "60": 60, "120": 120, "240": 240}[when])
                        w1 = w0 + M(mins); req = M(mins)
                    L = s.match(insee, w0, w1, req)
                    if p.get("disc"): L = [x for x in L if p["disc"] in x["disciplines"]]
                    if p.get("belt_min") or p.get("belt_max"): L = [x for x in L if x["belt"] and RANK.get(p.get("belt_min") or "blanche") <= RANK[x["belt"]] <= RANK.get(p.get("belt_max") or "noire")]
                    nom, dep = COMMUNE_TZ.get(insee, ("Grigny", "91"))
                    return J({"commune": {"insee": insee, "nom": nom, "dep": dep, "tz": "Europe/Paris"}, "radius": p.get("radius", 25), "when": when, "minutes": mins,
                              "required_minutes": int(req.total_seconds() // 60), "window": {"start": iso(w0), "end": iso(w1), "tz": "Europe/Paris"}, "now": iso(s.T), "results": L})
                if fn == "rouler_block": s.blocks.append(a["p_handle"]); return J(True)
                if fn == "rouler_my_blocks": return J([{"key": "k-" + h, "name": next(x["name"] for x in s.partners if x["handle"] == h), "at": "2026-11-20T10:00:00Z"} for h in s.blocks])
                if fn == "rouler_unblock": s.blocks = [h for h in s.blocks if "k-" + h != a["p_key"]]; return J(True)
                if fn == "rouler_report": return J(True)
                if fn in ("rouler_admin_reports", "rouler_admin_resolve"):
                    if not s.moderator: return E("Action réservée au référent UZU")
                    if fn == "rouler_admin_reports": return J(s.reports)
                    s.reports = [x for x in s.reports if x["key"] != a["p_key"]]; return J(True)
                return J(True)
            if fn.startswith("dir_admin_"):
                s.calls.append((fn, a))
                if not s.moderator: return E("Action réservée au référent UZU")
                return J([])
        return super().handle(route)

def pick(pg, sel, q="Grig", opt="Grigny 91 · 91350"):
    pg.locator(sel).fill(q); pg.wait_for_timeout(900)
    pg.get_by_role("option", name=opt).click(); pg.wait_for_timeout(800)
def leaks(t): return [x for x in FORBIDDEN if x in t]
def go_partners(pg, mob): go_feed(pg, mob); tab(pg, "Partenaires"); pg.wait_for_timeout(600)
def names(pg): return sorted(x.strip() for x in pg.locator(".uzu-rl-name").all_inner_texts())
def quick(pg, label): pg.locator(".uzu-rl-quick button", has_text=label).first.click(); pg.wait_for_timeout(900)
def lastp(m, fn): return (m.last(fn) or [{}])[-1].get("p", {})
def activate(pg):
    pg.get_by_role("button", name="Activer mon profil de roulage").click(); pg.wait_for_timeout(300)
    for lb in ["J'ai 18 ans ou plus.", "J'accepte que", "J'ai lu les conseils"]: pg.locator("button[role=checkbox]", has_text=lb).click()
    pg.get_by_role("button", name="Continuer").click(); pg.wait_for_timeout(400)
PROF = lambda **k: {**{"status": "active", "visibility": "clubs", "home_insee": "91286", "home_commune": "Grigny (91)", "home_tz": "Europe/Paris", "disciplines": ["jjb_gi"], "intensities": ["technique"],
                       "show_belt": False, "show_club_id": None, "years": None, "adult_declared_at": "2026-11-20T10:00:00Z"}, **k}
SHOT = "/tmp/rouler-shots/"; os.makedirs(SHOT, exist_ok=True)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("mob", {"width": 390, "height": 844}), ("desk", {"width": 1280, "height": 900})]:
        mob = name == "mob"; sh = lambda pg, f: pg.screenshot(path=SHOT + f + ("-mobile" if mob else "-ordinateur") + ".png", full_page=True)
        # ------------------------------------------------------------ 1. adhérent : activation depuis un raccourci de l'Accueil
        m = RMock(ctx("student")); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000b1", "karim@test.fr", "Karim Adherent"), vp, mob)
        q = pg.locator(".uzu-rl-homeq button")
        check(f"[{name}] Accueil : 6 raccourcis « Je suis dispo » (Maintenant en premier, heure affichée), pas de rappel sans profil",
              q.count() == 6 and q.nth(0).inner_text().startswith("Maintenant") and hm(m.T + M(30)) in q.nth(1).inner_text() and pg.locator(".uzu-rl-remind").count() == 0, q.all_inner_texts())
        sh(pg, "1-accueil")
        q.nth(1).click(); pg.wait_for_timeout(1300)
        t = content(pg)
        check(f"[{name}] raccourci sans profil : Partenaires s'ouvre sur « Tu es invisible », rien n'est créé",
              pg.locator(".uzu-lib-volets button.on").inner_text() == "Partenaires" and "Tu es invisible" in t and "rouler_activate" not in m.names() and "rouler_save_availability" not in m.names(), t[:300])
        activate(pg)
        pick(pg, "#rl-home"); pg.get_by_role("group", name="Qui peut me voir ?").get_by_role("button", name="Mes clubs").click()
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1500)
        a = lastp(m, "rouler_activate")
        check(f"[{name}] activation : 3 accords, ville habituelle, visibilité « Mes clubs »", a.get("adult") and a.get("consent") and a.get("safety") and a.get("home_insee") == "91286" and a.get("visibility") == "clubs", a)
        # ------------------------------------------------------------ 2. recherche : raccourcis et temps commun
        sa = lastp(m, "rouler_search")
        check(f"[{name}] recherche par défaut : « Maintenant », 1 h en commun, ville habituelle, aucun identifiant", sa == {"insee": "91286", "radius": 25, "when": "now", "minutes": 60}, sa)
        check(f"[{name}] « Maintenant » : seulement Kevin (commencé, 1 h devant lui) ; Sam (30 min restantes) et Lou (pas commencé) exclus", names(pg) == ["Kevin T."], names(pg))
        card = pg.locator(".uzu-rl-card").first.inner_text() if pg.locator(".uzu-rl-card").count() else ""
        check(f"[{name}] carte : horaire du partenaire, temps en commun, frise toi / partenaire / commun, demande « bientôt » désactivée",
              f"{hm(m.T - M(30))} → {hm(m.T + M(120))}" in card and f"en commun · {hm(m.T)} → {hm(m.T + M(60))}" in card
              and pg.locator(".uzu-rl-card").first.locator(".uzu-rl-tr").count() == 3 and pg.get_by_role("button", name="Proposer un roulage · bientôt").first.is_disabled(), card[:300])
        check(f"[{name}] résultats : ni identifiant, ni courriel, ni ville habituelle", not leaks(card), leaks(card))
        sh(pg, "2-maintenant")
        quick(pg, "30 min")
        check(f"[{name}] « Dans 30 min » : Kevin et Lou", names(pg) == ["Kevin T.", "Lou T."] and lastp(m, "rouler_search").get("when") == "30", names(pg))
        quick(pg, "1 h")
        check(f"[{name}] « Dans 1 h » : Kevin seul (Lou n'aurait que 30 min)", names(pg) == ["Kevin T."], names(pg))
        quick(pg, "2 h")
        check(f"[{name}] « Dans 2 h » : Inès seule", names(pg) == ["Ines T."], names(pg))
        quick(pg, "4 h")
        t = content(pg)
        check(f"[{name}] « Dans 4 h » : personne, avec propositions (élargir, se déclarer dispo)", names(pg) == [] and "Personne avec au moins 1 h en commun" in t and pg.get_by_role("button", name="Élargir à 50 km").count() == 1, t[:200])
        pg.locator(".uzu-rl-now").click(); pg.wait_for_timeout(500)
        pg.get_by_role("group", name="Temps commun minimum").get_by_role("button", name="30 min").click(); pg.wait_for_timeout(900)
        check(f"[{name}] temps commun 30 min : « Maintenant » trouve Kevin et Sam", names(pg) == ["Kevin T.", "Sam T."] and lastp(m, "rouler_search").get("minutes") == 30, names(pg))
        pg.get_by_role("group", name="Temps commun minimum").get_by_role("button", name="1 h", exact=True).click(); pg.wait_for_timeout(600)
        pg.locator(".uzu-rl-quick button", has_text="Autre").click(); pg.wait_for_timeout(500)
        pg.locator("#rl-se-time").select_option("12:00"); pg.wait_for_timeout(900)
        sa = lastp(m, "rouler_search")
        check(f"[{name}] « Autre moment » : date et heure locales envoyées", sa.get("when") == "custom" and len(sa.get("date", "")) == 10 and sa.get("time") == "12:00", sa)
        sh(pg, "3-autre-moment-recherche")
        # ------------------------------------------------------------ 3. Je suis dispo : raccourcis, durée, publication, Mon créneau
        pg.locator(".uzu-rl-menu").get_by_role("button", name="Je suis dispo").click(); pg.wait_for_timeout(600)
        check(f"[{name}] Je suis dispo : « Maintenant » et 2 h par défaut, résumé « de … à … »",
              pg.locator(".uzu-rl-now").get_attribute("aria-pressed") == "true" and pg.get_by_role("group", name="Pendant").locator("button.on").inner_text() == "2 h" and " à " in pg.locator(".uzu-rl-sum").inner_text())
        quick(pg, "30 min")
        pg.get_by_role("group", name="Pendant").get_by_role("button", name="1 h 30").click(); pg.wait_for_timeout(300)
        s1 = pg.locator(".uzu-rl-sum").inner_text()
        check(f"[{name}] résumé mis à jour : début dans 30 min, durée 1 h 30", "de " in s1 and " à " in s1 and ("Aujourd'hui" in s1 or "Demain" in s1), s1)
        sh(pg, "4-je-suis-dispo")
        pg.get_by_role("button", name="Publier et voir les partenaires").click(); pg.wait_for_timeout(1500)
        a = lastp(m, "rouler_save_availability")
        check(f"[{name}] publication : « 30 », 1 h 30, ville habituelle, l'heure est fixée par le serveur",
              a.get("when") == "30" and a.get("minutes") == 90 and a.get("is_travel") is False and a.get("insee") == "91286" and not a.get("date"), a)
        sa = lastp(m, "rouler_search")
        check(f"[{name}] après publication : recherche sur « Mon créneau »", sa.get("when") == "slot" and str(sa.get("slot", "")).startswith("av-") and pg.locator(".uzu-rl-mine.on").count() == 1, sa)
        check(f"[{name}] Mon créneau ({hm(m.T + M(30))} → {hm(m.T + M(120))}) : Kevin et Lou ont au moins 1 h en commun",
              names(pg) == ["Kevin T.", "Lou T."] and f"{hm(m.T + M(30))} → {hm(m.T + M(120))}" in pg.locator(".uzu-rl-mine").inner_text(), names(pg))
        pg.locator(".uzu-rl-menu").get_by_role("button", name="Je suis dispo").click(); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="Publier et voir les partenaires").click(); pg.wait_for_timeout(900)
        check(f"[{name}] « Maintenant » 2 h par-dessus le créneau de 30 min : refusé (créneaux qui se chevauchent)",
              "déjà un créneau" in (pg.locator(".uzu-banner--error").inner_text() if pg.locator(".uzu-banner--error").count() else ""))
        pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(600)
        # ------------------------------------------------------------ 4. Mes créneaux
        if pg.locator(".uzu-rl-menu").count(): pg.locator(".uzu-rl-menu").get_by_role("button", name="Mes créneaux (1)").click(); pg.wait_for_timeout(700)
        t = content(pg)
        check(f"[{name}] Mes créneaux : « Dans 30 min », horaire, 2 partenaires compatibles, Modifier / Annuler",
              "Dans 30 min" in t and f"{hm(m.T + M(30))} → {hm(m.T + M(120))}" in t and "2 partenaires compatibles" in t and pg.get_by_role("button", name="Modifier").count() == 1, t[:500])
        sh(pg, "5-mes-creneaux")
        pg.locator("section[aria-label='Mes créneaux']").get_by_role("button", name="Annuler").click(); pg.wait_for_timeout(800)
        check(f"[{name}] annuler un créneau à venir : envoyé", str((m.last("rouler_end_availability") or [{}])[-1].get("p_id", "")).startswith("av-") and "Aucun créneau" in content(pg))
        pg.get_by_role("button", name="Nouveau").click(); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="Publier et voir les partenaires").click(); pg.wait_for_timeout(1200)
        pg.locator(".uzu-rl-menu").get_by_role("button", name="Mes créneaux (1)").click(); pg.wait_for_timeout(700)
        t = content(pg)
        check(f"[{name}] créneau « Maintenant » : En cours, se termine dans …, Prolonger et Je ne suis plus dispo", "En cours" in t and "se termine dans" in t and pg.get_by_role("button", name="Prolonger 30 min").count() == 1, t[:400])
        pg.get_by_role("button", name="Prolonger 30 min").click(); pg.wait_for_timeout(700)
        check(f"[{name}] prolonger : envoyé, fin repoussée de 30 min", f"→ {hm(m.T + M(150))}" in content(pg) and "rouler_extend_availability" in m.names())
        pg.get_by_role("button", name="Je ne suis plus dispo").click(); pg.wait_for_timeout(700)
        check(f"[{name}] « Je ne suis plus dispo » : le créneau disparaît", "Aucun créneau" in content(pg))
        pg.get_by_role("button", name="Retour à la recherche").click(); pg.wait_for_timeout(700)
        # ------------------------------------------------------------ 5. Déplacement : Grigny → Bordeaux, Mon créneau, Léa
        pg.locator(".uzu-rl-menu").get_by_role("button", name="Je suis dispo").click(); pg.wait_for_timeout(600)
        pg.get_by_role("group", name="Où veux-tu rouler ?").get_by_role("button", name="Ailleurs").click(); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Publier et voir les partenaires").click(); pg.wait_for_timeout(300)
        check(f"[{name}] ailleurs sans commune : refusé à l'écran", "commune où tu veux rouler" in pg.locator(".uzu-banner--error").inner_text())
        pick(pg, "#rl-travel", "Bor", "Bordeaux 33 · 33000")
        pg.locator(".uzu-rl-quick button", has_text="Autre").click(); pg.wait_for_timeout(300)
        Q = m.Q.astimezone(PARIS); pg.locator("#rl-av-date").fill(Q.strftime("%Y-%m-%d")); pg.locator("#rl-av-time").select_option(Q.strftime("%H:%M")); pg.wait_for_timeout(300)
        s2 = pg.locator(".uzu-rl-sum").inner_text()
        check(f"[{name}] autre moment : résumé « de {Q.strftime('%H:%M')} à {(Q + M(120)).strftime('%H:%M')} »", f"de {Q.strftime('%H:%M')} à {(Q + M(120)).strftime('%H:%M')}" in s2, s2)
        sh(pg, "6-autre-moment")
        pg.get_by_role("button", name="Publier et voir les partenaires").click(); pg.wait_for_timeout(1500)
        a = lastp(m, "rouler_save_availability")
        check(f"[{name}] créneau ailleurs : Bordeaux, date et heure locales, ville habituelle inchangée",
              a.get("is_travel") is True and a.get("insee") == "33063" and a.get("when") == "custom" and a.get("time") == Q.strftime("%H:%M") and m.profile["home_insee"] == "91286", a)
        t = content(pg)
        check(f"[{name}] bandeau : « Tu es en déplacement à Bordeaux (33) », ville habituelle Grigny inchangée, recherche active Bordeaux",
              "Tu es en déplacement à Bordeaux (33)" in t and "Grigny · inchangée, jamais montrée aux autres" in t and "Bordeaux (33) · 25 km" in t, t[:400])
        sa = lastp(m, "rouler_search")
        card = pg.locator(".uzu-rl-card").first.inner_text() if pg.locator(".uzu-rl-card").count() else ""
        check(f"[{name}] Mon créneau à Bordeaux : Léa trouvée avec 1 h 30 en commun, étiquette « De passage »",
              sa.get("when") == "slot" and names(pg) == ["Léa T."] and "1 h 30" in card and "De passage" in card and "Open mat" in card, card[:300])
        sh(pg, "7-deplacement")
        pg.locator("section[aria-label='Recherche de partenaires'] .uzu-dir-commune").click(); pg.wait_for_timeout(300)
        pick(pg, "#rl-search", "Mér", "Mérignac 33 · 33700"); pg.wait_for_timeout(700)
        sa = lastp(m, "rouler_search")
        check(f"[{name}] changer de commune : Mérignac recherchée sur le même créneau, ville habituelle et créneau inchangés",
              sa.get("when") == "slot" and sa.get("insee") == "33281" and "Mérignac (33) · 25 km" in content(pg) and m.profile["home_insee"] == "91286" and m.avails[-1]["insee"] == "33063", sa)
        # ------------------------------------------------------------ 6. fiche, signalement, blocage
        pg.locator(".uzu-rl-mine").click(); pg.wait_for_timeout(1000)
        pg.locator(".uzu-rl-name", has_text="Léa T.").click(); pg.wait_for_timeout(600)
        t = content(pg)
        check(f"[{name}] fiche : horaire, temps commun, « bientôt » désactivé, Léa devra accepter", "1 h 30 en commun" in t and "devra l'accepter" in t and pg.get_by_role("button", name="Proposer un roulage · bientôt").is_disabled(), t[:400])
        pg.get_by_role("button", name="Signaler").click(); pg.wait_for_timeout(300)
        pg.get_by_role("radio", name="Harcèlement").click(); pg.get_by_role("button", name="Envoyer le signalement").click(); pg.wait_for_timeout(900)
        check(f"[{name}] signalement envoyé avec la poignée du créneau", (m.last("rouler_report") or [{}])[-1] == {"p_handle": "h-lea", "p_reason": "harcelement", "p_details": ""})
        pg.wait_for_timeout(4700)
        pg.locator(".uzu-rl-name", has_text="Léa T.").click(); pg.wait_for_timeout(600)
        pg.get_by_role("button", name="Ne plus voir Léa T.").click(); pg.get_by_role("button", name="Confirmer").click(); pg.wait_for_timeout(1200)
        check(f"[{name}] blocage : Léa disparaît des résultats", (m.last("rouler_block") or [{}])[-1] == {"p_handle": "h-lea"} and names(pg) == [], names(pg))
        # ------------------------------------------------------------ 7. Accueil : rappel du créneau et raccourci
        pg.goto(BASE); pg.wait_for_timeout(2000)
        t = pg.locator(".uzu-rl-remind").inner_text() if pg.locator(".uzu-rl-remind").count() else ""
        check(f"[{name}] Accueil : rappel du créneau (Bordeaux, horaire)", "Bordeaux" in t and f"{Q.strftime('%H:%M')} → {(Q + M(120)).strftime('%H:%M')}" in t, t)
        if mob: sh(pg, "8-accueil-rappel")
        if t:
            pg.locator(".uzu-rl-remind").get_by_role("button", name="Voir").click(); pg.wait_for_timeout(1500)
        check(f"[{name}] « Voir » ouvre Partenaires sur ce créneau", pg.locator(".uzu-lib-volets button.on").count() == 1 and lastp(m, "rouler_search").get("when") == "slot")
        pg.goto(BASE); pg.wait_for_timeout(2000)
        pg.locator(".uzu-rl-homeq button").nth(2).click(); pg.wait_for_timeout(1300)
        on = pg.locator(".uzu-rl-quick button.on")
        check(f"[{name}] raccourci « Dans 1 h » de l'Accueil avec profil : formulaire avec « 1 h » choisi", on.count() == 1 and on.inner_text().startswith("1 h"))
        check(f"[{name}] adhérent : aucune erreur de page", not errs, errs)
        c.close()

        # ------------------------------------------------------------ 8. indépendant, professeur, multi-club : options d'affichage
        m = RMock(ctx("solo"), name="Omar I.", clubs=[], belt=None); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000f1", "omar@test.fr", "Omar Independant"), vp, mob)
        go_partners(pg, mob); activate(pg)
        check(f"[{name}] indépendant : pas d'option « Mon club », ceinture « aucune enregistrée »", pg.locator("button[role=checkbox]", has_text="Mon club").count() == 0 and "aucune ceinture enregistrée" in content(pg))
        pick(pg, "#rl-home"); pg.get_by_role("group", name="Qui peut me voir ?").get_by_role("button", name="Tout UZU").click()
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1300)
        check(f"[{name}] indépendant : activé « Tout UZU », recherche lancée", lastp(m, "rouler_activate").get("visibility") == "uzu" and m.last("rouler_search"))
        check(f"[{name}] indépendant : aucune erreur de page", not errs, errs)
        c.close()
        m = RMock(ctx("instructor"), name="Paul P.", belt="noire"); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000c1", "paul@test.fr", "Paul Professeur"), vp, mob)
        go_partners(pg, mob); activate(pg); pick(pg, "#rl-home")
        pg.locator("button[role=checkbox]", has_text="Ma ceinture").click(); pg.locator("button[role=checkbox]", has_text="Mon club").click()
        pg.locator("button[role=checkbox]", has_text="Mes années de pratique").click(); pg.get_by_label("Années de pratique").fill("15")
        pg.get_by_role("button", name="Activer mon profil").click(); pg.wait_for_timeout(1000)
        a = lastp(m, "rouler_activate")
        check(f"[{name}] professeur : ceinture, club et années envoyés", a.get("show_belt") is True and a.get("show_club_id") == "c1" and a.get("years") == 15, a)
        check(f"[{name}] professeur : aucune erreur de page", not errs, errs)
        c.close()
        m = RMock(ctx("assistant", memberships=[{"academy_id": "c1", "name": "DA Club test", "role": "assistant", "status": "active"}, {"academy_id": "c2", "name": "Autre club test", "role": "student", "status": "active"}]),
                  name="Lina M.", clubs=CLUBS2, profile=PROF(show_club_id="c1"))
        c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000d1", "lina@test.fr", "Lina Multiclub"), vp, mob)
        go_partners(pg, mob); pg.locator(".uzu-rl-menu").get_by_role("button", name="Mon profil").click(); pg.wait_for_timeout(500)
        pg.get_by_label("Club affiché").select_option("c2"); pg.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(900)
        check(f"[{name}] multi-club : choix du club affiché parmi ses deux clubs, enregistré", lastp(m, "rouler_save_profile").get("show_club_id") == "c2")
        check(f"[{name}] multi-club : aucune erreur de page", not errs, errs)
        c.close()

        # ------------------------------------------------------------ 9. mineur, profil en pause, base sans le module
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
        check(f"[{name}] base sans le module : Accueil normal, Partenaires « pas encore disponibles », aucune erreur de page",
              "OÙ ROULER ?" in home and "pas encore disponibles" in t and not errs, (t[:200], errs))
        c.close()

        # ------------------------------------------------------------ 10. référent UZU : signalements
        m = RMock(ctx("solo"), name="Ref T.", clubs=[], moderator=True); c, pg, errs = open_page(b, m, sess("00000000-0000-0000-0000-0000000000a9", "ref@test.fr", "Ref Test"), vp, mob)
        go_feed(pg, mob); tab(pg, "Clubs")
        pg.get_by_role("button", name="Espace référent UZU").click(); pg.wait_for_timeout(1000)
        rub = pg.get_by_role("group", name="Rubriques du référent")
        rub.get_by_role("button", name="Signalements · 1").click(); pg.wait_for_timeout(800)
        t = content(pg)
        check(f"[{name}] référent : signalement lisible (prénom et initiale, pause, motifs), aucune adresse électronique",
              "Nadia A." in t and "En pause" in t and "3 personnes" in t and "@" not in pg.locator(".uzu-dir-admin").inner_text(), t[:400])
        pg.get_by_role("button", name="Maintenir la pause").click(); pg.wait_for_timeout(900)
        check(f"[{name}] référent : décision envoyée", (m.last("rouler_admin_resolve") or [{}])[-1] == {"p_key": "rk-1", "p_decision": "keep"})
        check(f"[{name}] référent : aucune erreur de page", not errs, errs)
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} contrôles réussis"); sys.exit(0 if all(R) else 1)
