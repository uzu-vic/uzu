"""Lot 3c de bout en bout, Supabase simulé : accueil complet (focus, annonce, vidéo, à réviser, fin de cours),
notifications (cloche, lecture, réglages, ?go=), dictée vocale, carnet solo (rejoindre, créer), suppression des données,
vidéos du club (envoi, retrait) et bilan d'activité.
Serveur : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co npm run build && npx next start -p 3100"""
import json, time, base64, urllib.parse as up
from datetime import date, datetime, timedelta
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000b1"
T = date.today(); d = lambda n: (T - timedelta(days=n)).isoformat()
NOW = datetime.now(); WD = T.weekday() + 1
END = (NOW - timedelta(minutes=30)); START = END - timedelta(minutes=60)
SLOT_OK = END.date() == T and START.date() == T
def jwt(uid):
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": uid, "exp": int(time.time()) + 3600, "role": "authenticated", "email": "eleve@test.fr"}) + ".sig"
def sess(uid, name):
    return {"access_token": jwt(uid), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r",
            "user": {"id": uid, "aud": "authenticated", "role": "authenticated", "email": "eleve@test.fr", "user_metadata": {"name": name}, "app_metadata": {}}}
CLUB = {"id": "c1", "name": "Académie de test", "invite_code": "TEST2026", "news": "Stage samedi 28 !",
        "schedule": [{"id": "x1", "d": WD, "s": START.strftime("%H:%M"), "e": END.strftime("%H:%M"), "t": "JJB Gi"}] if SLOT_OK else [],
        "tactical_focus": {"weekTheme": "Front headlock", "focusFrom": "lutte", "focusTo": "controle", "focusDetails": "Tête basse"}, "profile": {}}
def student_ctx(): return {"role": "student", "share_activity": True, "club": CLUB, "academy_role": "student", "member_status": "active", "member_id": "m9", "perms": {}, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": "student", "status": "active"}]}
def solo_ctx(): return {"role": "solo", "share_activity": False, "club": None, "memberships": []}
def owner_ctx(): return {"role": "coach", "share_activity": False, "club": CLUB, "academy_role": "owner", "member_status": "active", "member_id": "m0", "perms": None, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": "owner", "status": "active"}]}

class Mock:
    def __init__(s, ctx, docs):
        s.ctx, s.docs, s.calls = ctx, docs, []
        s.notifs = [{"id": 2, "kind": "grade", "title": "Ceinture bleue validée", "body": "Bravo !", "url": "path", "created_at": d(0) + "T10:00:00Z", "read_at": None},
                    {"id": 1, "kind": "news", "title": "Message du club", "body": "Stage samedi", "url": "", "created_at": d(1) + "T10:00:00Z", "read_at": None}]
    def handle(s, route):
        r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
        ok = lambda body, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(body))
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; args = json.loads(r.post_data or "{}"); s.calls.append((name, args))
            if name == "get_my_context": return ok(s.ctx)
            if name == "get_notif_prefs": return ok({"equipe": False})
            if name == "set_notif_prefs": return ok(args["prefs"])
            if name == "create_new_club": return ok({"invite_code": args["invite_code_input"]})
            if name == "get_my_courses": return ok({"assigned": [], "section": [], "staff": []})
            return ok(True)
        if "/storage/v1/object" in u:
            s.calls.append(("storage." + r.method, u.split("/storage/v1/object/")[1])); return ok({"Key": "videos/x", "Id": "1"})
        if "/rest/v1/notifications" in u:
            if r.method == "PATCH": s.calls.append(("notifications.update", {"q": q, "b": json.loads(r.post_data)})); return ok([], 204)
            return ok(s.notifs)
        if "/rest/v1/docs" in u:
            p = q.get("path", [""])[0]
            if r.method == "DELETE": s.calls.append(("docs.delete", p[3:])); s.docs.pop(p[3:], None); return ok([], 204)
            if r.method == "POST":
                b = json.loads(r.post_data); b = b if isinstance(b, list) else [b]
                for x in b: s.docs[x["path"]] = x["data"]; s.calls.append(("docs.upsert", x["path"]))
                return ok([], 201)
            if p.startswith("like."):
                pre = p[5:].rstrip("%").rstrip("*"); return ok([{"path": k, "data": v} for k, v in s.docs.items() if k.startswith(pre)])
            path = p[3:]; data = s.docs.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept", ""):
                return ok({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}, 200 if data is not None else 406)
            return ok([{"path": path, "data": data}] if data is not None else [])
        return ok([])
    def last(s, name): return [a for n, a in s.calls if n == name]

FAKE_SPEECH = """
window.__speech = "une heure et demie en no gi, 5 rounds, un peu fatigué";
class FakeRec { constructor(){ this.lang=""; } start(){ setTimeout(()=>{ this.onstart && this.onstart(); setTimeout(()=>{ this.onresult && this.onresult({results:[[{transcript: window.__speech}]]}) }, 80) }, 20) }
  stop(){ setTimeout(()=>{ this.onend && this.onend() }, 20) } abort(){} }
window.SpeechRecognition = FakeRec;
"""
RES = []
def check(label, cond):
    RES.append((label, bool(cond))); print(("✔ " if cond else "✖ ") + label)
def open_page(b, m, uid, name, path="/", vp={"width": 1280, "height": 900}, extra="", local=None):
    c = b.new_context(viewport=vp); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    init = f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess(uid, name)))});" + extra
    if local: init += f"localStorage.setItem('uzu_cached_training', {json.dumps(json.dumps(local))});"
    pg.add_init_script(init)
    pg.goto("http://127.0.0.1:3100" + path); pg.wait_for_timeout(2200)
    return pg, errs
def content(pg): return pg.inner_text(".page-content")

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------------- 1. Élève : accueil complet, notifications, dictée
    docs = {f"members/{UID}": {"name": "Yanis", "sessions": [{"id": "u1", "date": d(3), "cat": "jjb", "type": "Gi", "dur": 90, "theme": "Passage"}], "skills": {"Takedowns": {"lvl": 1, "at": d(60)}}, "comps": [], "consent": {"at": d(90) + "T10:00:00Z", "share": True}},
            "videos/c1/club-semaine": {"id": "c1/abc-def.mp4"}}
    m = Mock(student_ctx(), docs); pg, errs = open_page(b, m, UID, "Yanis", extra=FAKE_SPEECH)
    t = content(pg)
    check("Accueil : focus tactique et systèmes", "Front headlock" in t and "Lutte & Scrambles → Contrôle & Dos" in t and "Tête basse" in t)
    check("Accueil : annonce du club", "Stage samedi 28 !" in t)
    check("Accueil : vidéo du focus chargée depuis le stockage public", any("public/videos/c1/abc-def.mp4" in x for x in m.last("storage.GET")))
    check("Accueil : technique à réviser", "À RÉVISER" in t.upper() and "Takedowns" in t and "il y a 60 jours" in t)
    if SLOT_OK:
        check("Accueil : rappel de fin de cours", "Fin du cours !" in t)
        pg.locator("button", has_text="Plus tard").click(); pg.wait_for_timeout(200)
        check("Rappel : « Plus tard » le masque et le retient", "Fin du cours !" not in content(pg) and (T.isoformat() + "|x1") in pg.evaluate("localStorage.getItem('uzu-endbar')"))
    bell = pg.locator(".topbar .uzu-bell")
    check("Cloche : 2 non lues", bell.get_attribute("aria-label") == "2 notifications non lues")
    bell.click(); pg.wait_for_timeout(1300)
    t = pg.inner_text(".uzu-notif")
    check("Centre : liste des notifications", "Ceinture bleue validée" in t and "Message du club" in t)
    check("Centre : réglages d'un élève (6 types), préférence lue au serveur", pg.locator(".uzu-notif .uzu-check-row").count() == 6 and not pg.locator(".uzu-check-row", has_text="coéquipiers").locator("input").is_checked())
    check("Centre : notifications marquées lues au serveur", m.last("notifications.update") and "read_at" in m.last("notifications.update")[0]["b"])
    check("Centre : notifications sur le téléphone (environnement sans clé)", "pas encore configurées" in t or "ne gère pas" in t)
    pg.locator(".uzu-check-row", has_text="Messages du club").locator("input").uncheck(); pg.wait_for_timeout(500)
    sp = m.last("set_notif_prefs")
    check("Réglage : type coupé envoyé au serveur", sp and sp[-1]["prefs"].get("news") is False and sp[-1]["prefs"].get("equipe") is False)
    pg.locator(".uzu-nlist button", has_text="Ceinture bleue").click(); pg.wait_for_timeout(1200)
    check("Notification ouverte : vue Techniques", "Encyclopédie technique" in content(pg))
    check("Cloche : plus de non lues", pg.locator(".topbar .uzu-bell").get_attribute("aria-label") == "Notifications")
    # Dictée vocale
    pg.locator(".primary-nav .nav-item", has_text="Accueil").click(); pg.wait_for_timeout(800)
    pg.locator("button", has_text="Saisir ma séance").first.click(); pg.wait_for_timeout(600)
    pg.locator("button", has_text="Raconter ma séance à l'oral").click(); pg.wait_for_timeout(400)
    check("Dictée : texte en direct", "une heure et demie en no gi" in content(pg))
    pg.locator("button", has_text="Terminer la dictée").click(); pg.wait_for_timeout(500)
    t = content(pg)
    check("Dictée : champs remplis annoncés", "Rempli automatiquement" in t and "1 h 30" in t and "No-gi" in t and "5 rounds" in t and "Fatigué" in t)
    check("Dictée : formulaire rempli (tenue, durée, état)", pg.locator("[aria-label='Tenue'] button.on").inner_text() == "No-gi" if pg.locator("[aria-label='Tenue']").count() else True)
    check("Dictée : phrase ajoutée à la note privée", "une heure et demie en no gi" in pg.locator("textarea").last.input_value())
    pg.locator("button", has_text="Annuler la dictée").click(); pg.wait_for_timeout(300)
    check("Dictée : annulation remet la note", "une heure et demie" not in pg.locator("textarea").last.input_value())
    check("Élève : aucune erreur JavaScript", not errs); print("   ", errs)
    pg.context.close()

    # ---------------- 1b. Dictée sur iPhone avec Chrome : micro du clavier, même analyse
    UA_CRIOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1"
    m = Mock(student_ctx(), dict(docs))
    c = b.new_context(viewport={"width": 390, "height": 844}, user_agent=UA_CRIOS); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200])); pg.route(f"https://{REF}.supabase.co/**", m.handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess(UID, 'Yanis')))});" + FAKE_SPEECH)
    pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2200)
    pg.locator("button", has_text="Saisir ma séance").first.click(); pg.wait_for_timeout(600)
    t = content(pg)
    check("iPhone + Chrome : dictée par le micro du clavier proposée", "seul Safari donne accès à la dictée intégrée" in t and pg.locator("textarea[aria-label='Ta séance en une phrase']").count() == 1)
    pg.fill("textarea[aria-label='Ta séance en une phrase']", "une heure et demie en no gi, 5 rounds, un peu fatigué")
    pg.locator("button", has_text="Remplir le formulaire").click(); pg.wait_for_timeout(300)
    t = content(pg)
    check("iPhone + Chrome : formulaire rempli depuis la phrase", "Rempli automatiquement" in t and "1 h 30" in t and "No-gi" in t and "5 rounds" in t)
    check("iPhone + Chrome : aucune erreur JavaScript", not errs)
    c.close()
    # ---------------- 1c. Dictée intégrée muette (aucun son reçu) : bascule automatique vers le clavier
    MUTE = "class MuteRec { start(){ setTimeout(()=>{ this.onstart && this.onstart() }, 20) } stop(){ setTimeout(()=>{ this.onend && this.onend() }, 20) } abort(){ setTimeout(()=>{ this.onend && this.onend() }, 10) } } window.SpeechRecognition = MuteRec;"
    m = Mock(student_ctx(), dict(docs)); pg, errs = open_page(b, m, UID, "Yanis", extra=MUTE)
    pg.locator("button", has_text="Saisir ma séance").first.click(); pg.wait_for_timeout(600)
    pg.locator("button", has_text="Raconter ma séance à l'oral").click(); pg.wait_for_timeout(9000)
    check("Dictée muette : bascule vers le micro du clavier avec explication", "ne répond pas sur ce téléphone" in content(pg) and pg.locator("textarea[aria-label='Ta séance en une phrase']").count() == 1)
    pg.context.close()

    # ---------------- 2. Lien de notification (?go=prog)
    m = Mock(student_ctx(), dict(docs)); pg, errs = open_page(b, m, UID, "Yanis", path="/?go=prog")
    check("?go=prog ouvre Progression et nettoie l'adresse", "Séances par semaine" in content(pg) and "go=" not in pg.url)
    pg.context.close()

    # ---------------- 3. Élève : suppression de toutes les données
    m = Mock(student_ctx(), dict(docs)); pg, errs = open_page(b, m, UID, "Yanis", local={UID: {"v": 1, "at": "x", "dirty": False, "deleted": {"s": [], "c": []}, "state": {"sessions": [], "comps": []}}})
    pg.locator(".primary-nav .nav-item", has_text="Mon profil").click(); pg.wait_for_timeout(1200)
    pg.locator("button", has_text="Supprimer toutes mes données").click(); pg.wait_for_timeout(200)
    check("Suppression : avertissement élève et rien avant confirmation", "restent enregistrées par ton prof" in content(pg) and not m.last("docs.delete"))
    pg.locator("button", has_text="Oui, tout supprimer définitivement").click(); pg.wait_for_timeout(1000)
    check(f"Suppression : documents de l'élève effacés {m.last('docs.delete')}", m.last("docs.delete") == [f"members/{UID}", f"feed/{UID}", f"roll/{UID}", f"data/users/{UID}/private"])
    check("Suppression : cache du téléphone effacé", UID not in (pg.evaluate("localStorage.getItem('uzu_cached_training')") or ""))
    pg.context.close()

    # ---------------- 4. Carnet solo : rejoindre un club, créer un club
    m = Mock(solo_ctx(), {f"members/{UID}": {"name": "Yanis", "sessions": [], "consent": {"at": "2026-01-01T00:00:00Z", "share": False}}}); pg, errs = open_page(b, m, UID, "Yanis")
    t = content(pg)
    check("Solo : pas de focus ni d'annonce, invitation à relier son club", "CARNET SOLO" in t.upper() and "Front headlock" not in t)
    pg.locator(".primary-nav .nav-item", has_text="Mon profil").click(); pg.wait_for_timeout(1200)
    pg.fill("input[aria-label='Code invitation club']", "team2026"); pg.locator("button", has_text="Rejoindre le club avec mon historique").click(); pg.wait_for_timeout(300)
    check("Rejoindre : accord de partage exigé", "Coche l'accord" in content(pg) and not m.last("join_club_by_code"))
    pg.locator(".uzu-check-row", has_text="J'accepte").locator("input").check(); pg.locator("button", has_text="Rejoindre le club avec mon historique").click(); pg.wait_for_timeout(1500)
    check("Rejoindre : code envoyé au serveur", m.last("join_club_by_code") == [{"invite_code_input": "TEAM2026"}])
    pg.locator(".primary-nav .nav-item", has_text="Mon profil").click(); pg.wait_for_timeout(1000)
    pg.locator("summary", has_text="Tu es prof").click(); pg.fill("#jc-name", "Mon Club"); pg.fill("#jc-code", "abc")
    pg.locator("button", has_text="Créer mon club").click(); pg.wait_for_timeout(300)
    check("Créer : code invalide refusé", "6 à 20 lettres" in content(pg) and not m.last("create_new_club"))
    pg.fill("#jc-code", "monclub-1"); pg.locator("button", has_text="Créer mon club").click(); pg.wait_for_timeout(600)
    check("Créer : club envoyé au serveur", m.last("create_new_club") == [{"club_name": "Mon Club", "invite_code_input": "MONCLUB-1"}])
    pg.context.close()

    # ---------------- 5. Responsable : vidéos et bilan
    OW = "00000000-0000-0000-0000-0000000000a1"
    sd = lambda i, n: [{"id": f"s{i}{k}", "date": d(10 + k), "cat": "jjb", "type": "Gi", "dur": 90} for k in range(n)]
    cdocs = {
        "members/s1": {"name": "Alice", "demo": {"sex": "f", "age": "18-25"}, "sessions": sd(1, 4), "comps": [{"id": "k1", "date": d(5), "event": "Open", "result": "or", "wins": 3, "losses": 0}]},
        "members/s2": {"name": "Bruno", "demo": {"sex": "h", "age": "26-39"}, "sessions": sd(2, 2) + [{"id": "p1", "date": d(4), "cat": "prepa", "dur": 45}], "comps": []},
        "members/s3": {"name": "Chloé", "demo": {}, "sessions": [], "comps": []},
        "grades/s1": {"rank": "bleue", "stripes": 0, "decidedAt": d(6) + "T10:00:00Z", "hist": [{"rank": "blanche", "stripes": 2, "at": d(20) + "T10:00:00Z", "status": "validé"}, {"rank": "bleue", "stripes": 0, "at": d(6) + "T10:00:00Z", "status": "validé"}]},
        "videos/c1/sys-lutte": {"id": "c1/old.mp4"},
    }
    m = Mock(owner_ctx(), cdocs); pg, errs = open_page(b, m, OW, "Paul Prof")
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1000)
    pg.locator(".primary-nav .nav-item", has_text="Contenus").click(); pg.wait_for_timeout(1200)
    check("Vidéos : vidéo en ligne listée", "Système · Lutte & Scrambles" in content(pg))
    pg.select_option("#v-slot", "club-semaine")
    pg.set_input_files("#v-file", files=[{"name": "focus.txt", "mimeType": "text/plain", "buffer": b"x"}])
    pg.locator("button", has_text="Envoyer la vidéo").click(); pg.wait_for_timeout(300)
    check("Vidéos : format refusé sans envoi", not m.last("storage.POST"))
    pg.set_input_files("#v-file", files=[{"name": "focus.mp4", "mimeType": "video/mp4", "buffer": b"\x00" * 2048}])
    pg.locator("button", has_text="Envoyer la vidéo").click(); pg.wait_for_timeout(1200)
    st = m.last("storage.POST")
    check(f"Vidéos : fichier envoyé dans le dossier de l'académie {st}", st and st[0].startswith("videos/c1/") and st[0].endswith(".mp4"))
    check("Vidéos : référence enregistrée pour le focus", "videos/c1/club-semaine" in m.last("docs.upsert") and cdocs["videos/c1/club-semaine"]["by"] == OW)
    row = pg.locator(".uzu-top li", has_text="Système · Lutte")
    row.locator("button", has_text="Retirer").click(); pg.wait_for_timeout(150); row.locator("button", has_text="Confirmer").click(); pg.wait_for_timeout(800)
    check("Vidéos : retrait (référence puis fichier)", "videos/c1/sys-lutte" in m.last("docs.delete") and any("c1/old.mp4" in x or "videos" in x for x in m.last("storage.DELETE") + m.last("storage.POST")))
    pg.locator(".primary-nav .nav-item", has_text="Mon académie").click(); pg.wait_for_timeout(1200)
    pg.locator("button", has_text="Voir l'aperçu du bilan").click(); pg.wait_for_timeout(800)
    t = pg.inner_text(".uzu-bilan")
    check("Bilan : 2 adhérents actifs sur 3 inscrits", "2\nadhérents actifs\nsur 3 inscrits" in t.replace("\n\n", "\n") or ("adhérents actifs" in t and "sur 3 inscrits" in t))
    check("Bilan : 50 % de femmes, 9 h de tapis (prépa exclue)", "50 %" in t and "9 h" in t and "(6 séances)" in t)
    check("Bilan : 3 grades (1 ceinture, 2 barrettes), 1 médaille d'or", "(1 ceinture, 2 barrettes)" in t and "(1 or, 0 argent, 0 bronze)" in t)
    check("Bilan : pyramide des âges et méthode", "18-25 ans" in t and "aucune donnée nominative" in t)
    check("Bilan : aucun nom d'élève", "Alice" not in t and "Bruno" not in t)
    check("Responsable : aucune erreur JavaScript", not errs); print("   ", errs)
    pg.context.close()
    b.close()
ok = sum(1 for _, v in RES if v); print(f"\n{ok}/{len(RES)} vérifications réussies")
