"""Entraînements (à venir, journal, compétitions, calendrier) et Statistiques de l'athlète, Supabase simulé.
Serveur : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co npm run build && npx next start -p 3100"""
import json, time, base64, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000e1"
T = date.today(); d = lambda n: (T - timedelta(days=n)).isoformat()
TOM = (T.weekday() + 1) % 7 + 1  # demain (1 = lundi)
def jwt():
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": UID, "exp": int(time.time()) + 3600, "role": "authenticated"}) + ".sig"
SESS = {"access_token": jwt(), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
        "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "e@test.fr", "user_metadata": {"name": "Yanis B."}, "app_metadata": {}}}
CTX = {"role": "student", "share_activity": False, "academy_role": "student", "member_status": "active", "perms": {}, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": "student", "status": "active"}],
       "club": {"id": "c1", "name": "Académie de test", "schedule": [{"id": "x1", "d": TOM, "s": "19:00", "e": "20:30", "t": "JJB Gi adultes"}], "tactical_focus": {}, "profile": {}}}
DOCS = {f"members/{UID}": {"consent": {"at": "2026-01-01T00:00:00Z", "share": True}, "name": "Yanis B.",
        "sessions": [{"id": "s1", "date": d(1), "cat": "jjb", "kind": "cours", "type": "Gi", "dur": 90, "theme": "Passage de garde", "sys": "lutte", "tech": "Takedowns", "rounds": 5, "subs": [{"t": "armbar", "d": "placee", "n": 2}], "lucha_takedowns_done": 3},
                     {"id": "s2", "date": d(3), "cat": "jjb", "kind": "cours", "type": "No-gi", "dur": 60, "theme": "Front headlock"},
                     {"id": "s3", "date": d(10), "cat": "jjb", "kind": "open", "type": "Gi", "dur": 60},
                     {"id": "s4", "date": d(40), "cat": "prepa", "effort": "cardio", "dur": 45, "rpe": 6},
                     {"id": "s5", "date": d(200), "cat": "jjb", "kind": "cours", "type": "Gi", "dur": 90, "theme": "Triangle"},
                     {"id": "s6", "date": d(400), "cat": "jjb", "kind": "cours", "type": "Gi", "dur": 90, "theme": "Armbar"}],
        "comps": [{"id": "k1", "date": d(20), "event": "Open de test", "type": "No-gi", "result": "or", "wins": 3, "losses": 0}]},
        f"data/users/{UID}/private": {"s": {"s1": {"n": "Genou un peu sensible", "f": "fatigue"}}},
        f"roll/{UID}": {"s": [{"k": d(5) + "|x1", "date": d(5), "title": "JJB No-gi", "dur": 60}]}}

def handle(route):
    r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
    ok = lambda body, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(body))
    if "/rpc/get_my_context" in u: return ok(CTX)
    if "/rest/v1/docs" in u:
        p = q.get("path", [""])[0]
        if p.startswith("like."): return ok([])
        path = p[3:]; data = DOCS.get(path)
        if "vnd.pgrst.object" in r.headers.get("accept", ""):
            return ok({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}, 200 if data is not None else 406)
        return ok([{"path": path, "data": data}] if data is not None else [])
    return ok([])

RES = []
def check(label, cond):
    RES.append((label, bool(cond))); print(("✔ " if cond else "✖ ") + label)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("bureau", {"width": 1280, "height": 900}), ("mobile", {"width": 390, "height": 844})]:
        c = b.new_context(viewport=vp); pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.route(f"https://{REF}.supabase.co/**", handle)
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
        pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2200)
        nav = (lambda t: pg.locator(".primary-nav .nav-item", has_text=t).first.click()) if name == "bureau" else (lambda t: (pg.locator(".mobile-menu-trigger").click(), pg.wait_for_timeout(300), pg.locator(".primary-nav .nav-item", has_text=t).first.click()))
        nav("Entraînements"); pg.wait_for_timeout(1300)
        t = pg.inner_text(".page-content")
        check(f"[{name}] Entraînements : titre et onglets", "Entraînements." in t and all(k in t for k in ["À venir", "Mon journal", "Compétitions (1)", "Calendrier"]))
        check(f"[{name}] À venir : prochain cours du planning", "JJB Gi adultes" in t and "DEMAIN · PROCHAIN COURS" in t and "19:00 – 20:30" in t and "Réserver" not in t)
        pg.screenshot(path=f"/tmp/ent_{name}.png", full_page=True)
        pg.locator(".subnav-tabs button", has_text="Mon journal").click(); pg.wait_for_timeout(300)
        t = pg.inner_text(".page-content")
        check(f"[{name}] Journal : séances, appel du club, prépa", "Passage de garde" in t and "Appel du club" in t and "Prépa physique" in t and "Open mat" in t)
        check(f"[{name}] Journal : aperçu partout, modifier et supprimer sauf sur les appels", pg.locator(".uzu-acts").count() == 7 and pg.locator(".uzu-acts button", has_text="Modifier").count() == 6 and pg.locator(".uzu-acts button", has_text="Aperçu").count() == 7)
        pg.locator(".session-card", has_text="Passage de garde").locator(".session-main h3").click(); pg.wait_for_timeout(800)
        dt = pg.inner_text(".uzu-detail")
        check(f"[{name}] Aperçu : séance complète en lecture seule", "LECTURE SEULE" in dt and "1 h 30 sur le tatami" in dt and "Rounds\n5" in dt.replace("\t", "\n") and "Lutte & Scrambles" in dt and "Clé de bras · placée × 2" in dt and "3 réussies" in dt)
        check(f"[{name}] Aperçu : état et note privée de l'élève, aucun champ modifiable", "Fatigué" in dt and "Genou un peu sensible" in dt and pg.locator(".uzu-detail input, .uzu-detail textarea, .uzu-detail select").count() == 0)
        pg.locator(".uzu-detail button", has_text="Fermer").last.click(); pg.wait_for_timeout(300)
        check(f"[{name}] Aperçu : fermeture sans rien enregistrer", pg.locator(".uzu-detail").count() == 0)
        pg.locator(".session-card", has_text="Appel du club").locator("button", has_text="Aperçu").click(); pg.wait_for_timeout(800)
        dt = pg.inner_text(".uzu-detail")
        check(f"[{name}] Aperçu d'une séance de l'appel", "Appel du prof" in dt and "Compléter ma séance" in dt and "Modifier cette séance" not in dt)
        pg.keyboard.press("Escape"); pg.wait_for_timeout(300)
        pg.locator(".subnav-tabs button", has_text="Compétitions").click(); pg.wait_for_timeout(200)
        check(f"[{name}] Compétitions", "Open de test" in pg.inner_text(".page-content") and "Or" in pg.inner_text(".page-content"))
        pg.locator(".subnav-tabs button", has_text="Calendrier").click(); pg.wait_for_timeout(300)
        cal = pg.inner_text(".calendar-panel")
        has_this_week = any(x in cal for x in ["Passage de garde", "Front headlock", "JJB No-gi", "JJB Gi adultes"])
        check(f"[{name}] Calendrier : semaine en cours (séances faites et cours prévus)", has_this_week and "Cours prévu au club" in cal)
        pg.locator("button[aria-label='Semaine précédente']").click(); pg.wait_for_timeout(200)
        check(f"[{name}] Calendrier : navigation par semaine", pg.inner_text(".calendar-panel") != cal)
        pg.screenshot(path=f"/tmp/cal_{name}.png", full_page=True)
        nav("Statistiques"); pg.wait_for_timeout(1300)
        pg.select_option("select[aria-label='Période']", "12m"); pg.wait_for_timeout(300)
        t = pg.inner_text(".page-content")
        nums = pg.locator(".stats-metrics .metric-main strong").all_inner_texts()
        check(f"[{name}] Stats 12 mois : 6 séances, 7 h {nums}", nums[:2] == ["6", "7"])
        check(f"[{name}] Stats : répartition Gi / No-gi / Open mat / Prépa", "Gi\n2 séances\n33 %" in t.replace("\t", "\n") or ("Gi" in t and "33 %" in t and "17 %" in t))
        check(f"[{name}] Stats : courbe par mois, série et record", pg.locator(".trend-chart polyline").count() == 1 and "Record :" in t and "Moyenne" in t)
        pg.select_option("select[aria-label='Période']", "all"); pg.wait_for_timeout(300)
        check(f"[{name}] Stats depuis le début : 7 séances", pg.locator(".stats-metrics .metric-main strong").first.inner_text() == "7")
        pg.screenshot(path=f"/tmp/stats_{name}.png", full_page=True)
        check(f"[{name}] aucune erreur JavaScript", not errs); print("   ", errs)
        c.close()
    b.close()
ok = sum(1 for _, v in RES if v); print(f"\n{ok}/{len(RES)} vérifications réussies")
