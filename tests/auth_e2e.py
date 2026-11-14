"""Lot 3d : accès à l'application, Supabase simulé — connexion, création de compte (carnet solo, rejoindre un club,
créer un club), mot de passe oublié, nouveau mot de passe, lien d'invitation d'équipe, écran de bienvenue (accord).
Serveur : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co npm run build && npx next start -p 3100"""
import json, time, base64, urllib.parse as up
from playwright.sync_api import sync_playwright

REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000d1"
TOKEN = "A" * 20 + "b" * 20
def jwt():
    e = lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg": "HS256", "typ": "JWT"}) + "." + e({"sub": UID, "exp": int(time.time()) + 3600, "role": "authenticated", "email": "neo@test.fr"}) + ".sig"
USER = {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "neo@test.fr", "user_metadata": {"name": "Yanis B."}, "app_metadata": {}}
SESS = {"access_token": jwt(), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r", "user": USER}
CLUB = {"id": "c1", "name": "Académie de test", "schedule": [], "tactical_focus": {}, "profile": {}}

class Mock:
    def __init__(s, ctx, signup_session=False, code_free=True):
        s.ctx, s.calls, s.docs, s.signup_session, s.code_free = ctx, [], {}, signup_session, code_free
    def handle(s, route):
        r = route.request; u = r.url; q = up.parse_qs(up.urlparse(u).query)
        ok = lambda body, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(body))
        if "/auth/v1/signup" in u:
            s.calls.append(("signup", json.loads(r.post_data))); return ok(SESS if s.signup_session else USER)
        if "/auth/v1/token" in u:
            b = json.loads(r.post_data); s.calls.append(("signin", b))
            return ok(SESS) if b.get("password") == "bonmotdepasse" else ok({"error": "invalid_grant", "error_description": "Invalid login credentials", "msg": "Invalid login credentials"}, 400)
        if "/auth/v1/recover" in u: s.calls.append(("recover", json.loads(r.post_data))); return ok({})
        if "/auth/v1/user" in u:
            if r.method == "PUT": s.calls.append(("user.update", json.loads(r.post_data)))
            return ok(USER)
        if "/auth/v1/logout" in u: return ok({}, 204)
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; args = json.loads(r.post_data or "{}"); s.calls.append((name, args))
            if name == "get_my_context": return ok(s.ctx)
            if name == "invite_code_available": return ok(s.code_free)
            if name == "create_new_club":
                s.ctx = {"role": "coach", "share_activity": False, "club": {**CLUB, "name": args["club_name"]}, "academy_role": "owner", "member_status": "active", "perms": None, "memberships": [{"academy_id": "c1", "name": args["club_name"], "role": "owner", "status": "active"}]}
                return ok({"invite_code": args["invite_code_input"]})
            if name == "preview_invitation": return ok({"status": "pending", "academy": "Académie de test", "role": "instructor", "email_hint": "n***@test.fr"})
            if name == "accept_invitation":
                s.ctx = {"role": "coach", "share_activity": False, "club": CLUB, "academy_role": "instructor", "member_status": "active", "perms": {"dashboard": {"view": "academy"}}, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": "instructor", "status": "active"}]}
                return ok({"club": {"name": "Académie de test"}})
            if name == "get_notif_prefs": return ok({})
            return ok(True)
        if "/rest/v1/docs" in u:
            p = q.get("path", [""])[0]
            if r.method == "POST":
                b = json.loads(r.post_data); b = b if isinstance(b, list) else [b]
                for x in b: s.docs[x["path"]] = x["data"]; s.calls.append(("docs.upsert", x["path"]))
                return ok([], 201)
            if p.startswith("like."): pre = p[5:].rstrip("%*"); return ok([{"path": k, "data": v} for k, v in s.docs.items() if k.startswith(pre)])
            path = p[3:]; data = s.docs.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept", ""):
                return ok({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}, 200 if data is not None else 406)
            return ok([{"path": path, "data": data}] if data is not None else [])
        return ok([])
    def last(s, name): return [a for n, a in s.calls if n == name]

RES = []
def check(label, cond):
    RES.append((label, bool(cond))); print(("✔ " if cond else "✖ ") + label)
def page(b, m, url="/", logged=False):
    c = b.new_context(viewport={"width": 390, "height": 844}); pg = c.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    if logged: pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto("http://127.0.0.1:3100" + url); pg.wait_for_timeout(1500)
    return pg, errs
def txt(pg): return pg.inner_text("main")
SOLO = {"role": "solo", "share_activity": False, "club": None, "memberships": []}
STUDENT = {"role": "student", "share_activity": False, "club": CLUB, "academy_role": "student", "member_status": "active", "perms": {}, "memberships": [{"academy_id": "c1", "name": "Académie de test", "role": "student", "status": "active"}]}

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # 1. Rejoindre un club (confirmation par e-mail)
    m = Mock(STUDENT); pg, errs = page(b, m)
    check("Accueil : trois parcours", "Se connecter" in txt(pg) and "Créer mon carnet solo" in txt(pg) and "Rejoindre ou créer un club" in txt(pg))
    pg.locator(".uzu-path", has_text="Rejoindre ou créer un club").click()
    pg.fill("#lg-first", "yanis"); pg.fill("#lg-init", "b"); pg.fill("#uzu-email", "neo@test.fr"); pg.fill("#uzu-password", "motdepasse1"); pg.fill("#lg-code", "team2026")
    pg.select_option("#lg-age", "lt16"); pg.locator("[aria-label='Sexe'] button", has_text="Homme").click()
    pg.locator("button[type=submit]").click(); pg.wait_for_timeout(300)
    check("Moins de 16 ans : accord du représentant légal exigé", "représentant légal" in txt(pg) and not m.last("signup"))
    pg.locator(".uzu-check-row", has_text="représentant légal").locator("input").check()
    pg.locator("button[type=submit]").click(); pg.wait_for_timeout(300)
    check("Rejoindre : accord sur les données exigé", "Coche l'accord sur tes données" in txt(pg) and not m.last("signup"))
    pg.locator(".uzu-check-row", has_text="visibles par les profs").locator("input").check()
    pg.locator("button[type=submit]").click(); pg.wait_for_timeout(1000)
    su = m.last("signup")
    check("Rejoindre : compte créé avec code club et nom formaté", su and su[0]["email"] == "neo@test.fr" and su[0]["data"] == {"club_code": "TEAM2026", "name": "Yanis B."})
    sg = json.loads(pg.evaluate("localStorage.getItem('uzu-signup')") or "{}")
    check("Rejoindre : profil gardé pour la première ouverture", sg.get("name") == "Yanis B." and sg.get("acct") == "club" and sg.get("demo") == {"age": "lt16", "sex": "h"} and sg.get("parental") is True)
    check("Rejoindre : confirmation par e-mail annoncée, retour à la connexion", "Ouvre le lien de confirmation" in txt(pg) and "Content de te revoir" in txt(pg))
    # Connexion : mauvais puis bon mot de passe
    pg.fill("#uzu-email", "neo@test.fr"); pg.fill("#uzu-password", "faux"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(800)
    check("Connexion : message clair si mot de passe faux", "Adresse ou mot de passe incorrect." in txt(pg))
    pg.fill("#uzu-password", "bonmotdepasse"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(2500)
    w = m.last("docs.upsert")
    check("Première ouverture : accord et profil d'inscription enregistrés sans écran de bienvenue", f"members/{UID}" in w and m.docs[f"members/{UID}"].get("consent", {}).get("parental") is True and m.docs[f"members/{UID}"].get("name") == "Yanis B.")
    check("Première ouverture : application ouverte", pg.locator(".app-shell").count() == 1)
    check("Rejoindre/connexion : aucune erreur JavaScript", not errs); print("   ", errs)
    pg.context.close()

    # 2. Carnet solo avec session immédiate
    m = Mock(SOLO, signup_session=True); pg, errs = page(b, m)
    pg.locator(".uzu-path", has_text="Créer mon carnet solo").click()
    pg.fill("#lg-first", "Léa"); pg.fill("#lg-init", "M"); pg.fill("#uzu-email", "neo@test.fr"); pg.fill("#uzu-password", "court")
    pg.locator("button[type=submit]").click(); pg.wait_for_timeout(300)
    check("Solo : mot de passe trop court refusé", "8 caractères minimum" in txt(pg) and not m.last("signup"))
    pg.fill("#uzu-password", "motdepasse1"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(300)
    check("Solo : accord exigé", "Coche l'accord" in txt(pg) and not m.last("signup"))
    pg.locator(".uzu-check-row", has_text="Aucun prof ni club").locator("input").check(); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(3000)
    check("Solo : compte créé sans code club", m.last("signup") and m.last("signup")[0]["data"] == {"name": "Léa M."})
    md = m.docs.get(f"members/{UID}", {})
    check("Solo : carnet solo enregistré avec accord (sans partage)", md.get("acct") == "solo" and md.get("consent", {}).get("share") is False and md.get("name") == "Léa M.")
    check("Solo : application ouverte en carnet solo", pg.locator(".app-shell").count() == 1 and "CARNET SOLO" in pg.inner_text(".page-content").upper())
    check("Solo : aucune erreur JavaScript", not errs)
    pg.context.close()

    # 3. Créer un club
    m = Mock(SOLO, signup_session=True, code_free=False); pg, errs = page(b, m)
    pg.locator(".uzu-path", has_text="Rejoindre ou créer un club").click(); pg.locator("[role=tab]", has_text="Créer un club").click()
    pg.fill("#lg-club", "Mon Académie"); pg.fill("#lg-newcode", "monclub-26"); pg.fill("#lg-first", "Paul"); pg.fill("#lg-init", "P"); pg.fill("#uzu-email", "neo@test.fr"); pg.fill("#uzu-password", "motdepasse1")
    pg.locator("button[type=submit]").click(); pg.wait_for_timeout(800)
    check("Créer : code déjà pris refusé avant toute création de compte", "déjà utilisé" in txt(pg) and m.last("invite_code_available") == [{"code": "MONCLUB-26"}] and not m.last("signup"))
    m.code_free = True; pg.locator("button[type=submit]").click(); pg.wait_for_timeout(3500)
    check("Créer : compte créé puis club créé côté serveur", m.last("signup") and m.last("create_new_club") == [{"club_name": "Mon Académie", "invite_code_input": "MONCLUB-26"}])
    check("Créer : message avec le code invitation, espace Club disponible", "MONCLUB-26" in pg.inner_text(".page-content") and pg.locator(".space-option", has_text="Club").count() == 1)
    check("Créer : demande de création effacée du téléphone", pg.evaluate("localStorage.getItem('uzu-pending-club')") is None)
    pg.context.close()

    # 4. Mot de passe oublié
    m = Mock(STUDENT); pg, errs = page(b, m)
    pg.locator(".uzu-path", has_text="Se connecter").click(); pg.locator("button", has_text="Mot de passe oublié").click(); pg.wait_for_timeout(200)
    check("Oubli : e-mail exigé", "Indique d'abord ton e-mail" in txt(pg))
    pg.fill("#uzu-email", "neo@test.fr"); pg.locator("button", has_text="Mot de passe oublié").click(); pg.wait_for_timeout(800)
    rc = m.last("recover")
    check("Oubli : e-mail de réinitialisation demandé", rc and rc[0]["email"] == "neo@test.fr" and "e-mail de réinitialisation" in txt(pg))
    pg.context.close()

    # 5. Lien d'invitation d'équipe
    m = Mock(STUDENT); m.docs[f"members/{UID}"] = {"name": "Yanis B.", "consent": {"at": "2026-01-01T00:00:00Z", "share": True}}
    pg, errs = page(b, m, url=f"/?invite={TOKEN}")
    check("Invitation : adresse nettoyée, jeton gardé", "invite=" not in pg.url and pg.evaluate("localStorage.getItem('uzu-invite')") == TOKEN)
    check("Invitation : académie et rôle annoncés", "« Académie de test » comme Professeur" in txt(pg) and "n***@test.fr" in txt(pg))
    pg.locator(".uzu-path", has_text="Se connecter").click(); pg.fill("#uzu-email", "neo@test.fr"); pg.fill("#uzu-password", "bonmotdepasse"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(3000)
    check("Invitation : acceptée après connexion", m.last("accept_invitation") == [{"p_token": TOKEN}] and pg.evaluate("localStorage.getItem('uzu-invite')") is None)
    check("Invitation : bienvenue dans l'équipe et espace Club", "Bienvenue dans l'équipe" in pg.inner_text(".page-content") and pg.locator(".space-option", has_text="Club").count() == 1)
    pg.context.close()

    # 6. Écran de bienvenue (compte sans accord)
    m = Mock(STUDENT); pg, errs = page(b, m, logged=True); pg.wait_for_timeout(1000)
    check("Bienvenue : affiché pour un élève sans accord", "Ton suivi, de la blanche à la noire" in txt(pg) and pg.locator(".app-shell").count() == 0)
    check("Bienvenue : prénom repris du compte", pg.input_value("#w-name") == "Yanis B.")
    pg.locator("button", has_text="Commencer").click(); pg.wait_for_timeout(200)
    check("Bienvenue : accord exigé", "Coche l'accord" in txt(pg) and not m.last("docs.upsert"))
    pg.locator(".uzu-check-row", has_text="visibles par les profs").locator("input").check(); pg.select_option("#w-age", "26-39")
    pg.locator("button", has_text="Commencer").click(); pg.wait_for_timeout(1500)
    md = m.docs.get(f"members/{UID}", {})
    check("Bienvenue : accord, âge et nom enregistrés", md.get("consent", {}).get("share") is True and md.get("demo", {}).get("age") == "26-39" and md.get("name") == "Yanis B.")
    check("Bienvenue : application ouverte", pg.locator(".app-shell").count() == 1)
    pg.context.close()

    # 7. Responsable : jamais d'écran de bienvenue
    m = Mock({"role": "coach", "share_activity": False, "club": CLUB, "academy_role": "owner", "member_status": "active", "perms": None, "memberships": []}); pg, errs = page(b, m, logged=True); pg.wait_for_timeout(800)
    check("Responsable : pas d'écran de bienvenue", pg.locator(".app-shell").count() == 1)
    pg.context.close()

    # 8. Lien « mot de passe oublié » reçu par e-mail
    m = Mock(STUDENT); m.docs[f"members/{UID}"] = {"name": "Y", "consent": {"at": "2026-01-01T00:00:00Z", "share": True}}
    pg, errs = page(b, m, url=f"/#access_token={SESS['access_token']}&refresh_token=r&expires_in=3600&expires_at={SESS['expires_at']}&token_type=bearer&type=recovery"); pg.wait_for_timeout(1000)
    check("Nouveau mot de passe : écran affiché", "Nouveau mot de passe" in txt(pg))
    pg.fill("#rc-pw", "nouveau123"); pg.fill("#rc-pw2", "nouveau124"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(200)
    check("Nouveau mot de passe : confirmation différente refusée", "pas identiques" in txt(pg) and not m.last("user.update"))
    pg.fill("#rc-pw2", "nouveau123"); pg.locator("button[type=submit]").click(); pg.wait_for_timeout(1500)
    check("Nouveau mot de passe : enregistré, application ouverte", m.last("user.update") and m.last("user.update")[0].get("password") == "nouveau123" and "Mot de passe modifié" in pg.inner_text(".page-content"))
    pg.context.close()
    b.close()
ok = sum(1 for _, v in RES if v); print(f"\n{ok}/{len(RES)} vérifications réussies")
