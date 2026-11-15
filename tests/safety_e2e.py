# Sécurité et conformité : signaler, masquer, supprimer son compte, modération du club, pages publiques — Supabase simulé.
import json, time, base64, sys, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
REF="abcdefghijkltest"; UID="00000000-0000-0000-0000-0000000000b1"; OTHER="00000000-0000-0000-0000-0000000000c9"; BASE="http://127.0.0.1:3100/"
def jwt():
    e=lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg":"HS256"})+"."+e({"sub":UID,"exp":int(time.time())+3600,"role":"authenticated"})+".sig"
SESS={"access_token":jwt(),"token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"refresh_token":"r","user":{"id":UID,"aud":"authenticated","role":"authenticated","email":"eleve@test.fr","user_metadata":{"name":"Yanis Bernard"},"app_metadata":{}}}
T=date.today(); d=lambda n:(T-timedelta(days=n)).isoformat()
CTX={"role":"student","share_activity":True,"academy_role":"student","member_status":"active","perms":None,"memberships":[{"academy_id":"c1","name":"AG","role":"student","status":"active"}],"club":{"id":"c1","name":"AG Academie","schedule":[]}}
DOCS={f"members/{UID}":{"consent":{"at":"2026-01-01T00:00:00Z","share":True},"name":"Yanis","acct":"club","feed":{"on":True,"at":"x"},"sessions":[{"id":"u1","date":d(2),"cat":"jjb","kind":"cours","type":"Gi","dur":90,"theme":"Takedowns","sys":"lutte","rounds":4},{"id":"u2","date":d(1),"cat":"jjb","kind":"cours","type":"No-gi","dur":60,"theme":"Wrestle-up","sys":"lutte"}],"comps":[{"id":"k1","date":d(9),"event":"Open test","type":"Gi","result":"bronze","wins":1,"losses":1,"subs":0}],"skills":{"Wrestle-up":{"lvl":1,"at":d(1),"partner":None,"rev":"","legacy":False}}},
      f"data/users/{UID}/private":{"s":{"u1":{"n":"note u1","f":"ok"}}},
      f"grades/{UID}":{"rank":"bleue","stripes":1},
      f"feed/{OTHER}":{"on":True,"name":"Sarah M.","belt":{"rank":"violette","stripes":2},"ev":[{"id":"s:x1","t":"s","d":d(1),"dur":90,"gi":"Gi","sys":"controle","k":"cours","ef":""},{"id":"r:Back attack","t":"r","d":d(0),"at":"z","tech":"Back attack"}],"checks":{f"{UID}|s:u2":{"at":"z"}},"vals":{}}}
WR=[]; RPC=[]; DEL=[]
def handle(route):
    r=route.request; u=r.url
    if "/auth/v1/user" in u:
        usr=dict(SESS["user"])
        if r.method=="PUT":
            d=json.loads(r.post_data or "{}").get("data") or {}; usr["user_metadata"]={**usr["user_metadata"],**d}; SESS["user"]=usr; RPC.append(("auth.updateUser", r.post_data))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(usr))
    if "/rpc/get_my_context" in u: return route.fulfill(status=200, content_type="application/json", body=json.dumps(CTX))
    if "/rpc/" in u: RPC.append((u.split("/rpc/")[1], r.post_data)); return route.fulfill(status=200, content_type="application/json", body="true")
    if "/rest/v1/docs" in u:
        q=up.parse_qs(up.urlparse(u).query)
        if r.method=="POST":
            body=json.loads(r.post_data); body=body if isinstance(body,list) else [body]
            for b in body: WR.append(b); DOCS[b["path"]]=b["data"]
            return route.fulfill(status=201, content_type="application/json", body="[]")
        if r.method=="DELETE":
            p=q.get("path",["eq."])[0][3:]; DEL.append(p); DOCS.pop(p,None); return route.fulfill(status=204, body="")
        pq=q.get("path",["eq."])[0]
        if pq.startswith("like."):
            pre=pq[5:].replace("*","").replace("%","")
            return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"path":k,"data":v} for k,v in DOCS.items() if k.startswith(pre)]))
        p=pq[3:]; data=DOCS.get(p)
        if "vnd.pgrst.object" in r.headers.get("accept",""):
            return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path":p,"data":data} if data is not None else {"code":"PGRST116"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"path":p,"data":data}] if data is not None else []))
    return route.fulfill(status=200, content_type="application/json", body="{}")
results=[]
BLOCKS=[]; REPORTS=[{"id":"r1","target_id":OTHER,"target_name":"Sarah M.","item_text":"Séance validée · 1 h 30","reason":"faux","details":"Elle n'était pas au cours","status":"open","at":d(1)+"T19:00:00Z","reporter":"Yanis B.","resolved_at":None},
                    {"id":"r2","target_id":None,"target_name":"Compte supprimé","item_text":"","reason":"autre","details":"","status":"resolved","at":d(9)+"T19:00:00Z","reporter":"Un membre","resolved_at":d(8)}]
SAFE={"ok": True}
def handle2(route):
    r=route.request; u=r.url
    if "/rpc/" in u:
        name=u.split("/rpc/")[1].split("?")[0]; args=json.loads(r.post_data or "{}")
        ok=lambda b: route.fulfill(status=200, content_type="application/json", body=json.dumps(b))
        if name=="report_content": RPC.append((name, r.post_data)); return ok("rep-1")
        if name=="set_user_block":
            RPC.append((name, r.post_data))
            if args["p_on"]: BLOCKS.append({"user_id":args["p_target"],"name":"Sarah M.","at":"x"}); DOCS.pop(f"feed/{OTHER}", None)
            else: BLOCKS[:]=[b for b in BLOCKS if b["user_id"]!=args["p_target"]]
            return ok(args["p_on"])
        if name=="list_my_blocks": return ok(BLOCKS)
        if name=="list_reports": return ok(REPORTS)
        if name=="resolve_report": RPC.append((name, r.post_data)); return ok(True)
        if name=="delete_my_account":
            RPC.append((name, r.post_data))
            if not SAFE["ok"]: return route.fulfill(status=400, content_type="application/json", body=json.dumps({"code":"P0001","message":"Tu es le seul responsable d'un club qui a d'autres membres : nomme d'abord un autre responsable (Club > Équipe)."}))
            return ok(True)
    return handle(route)
def check(l,c,g=""): results.append((l,bool(c))); print(("OK    " if c else "ÉCHEC ")+l+("" if c else f"  → {g}"))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------- Pages publiques, sans connexion
    c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]; pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    for path, h in [("confidentialite","Politique de confidentialité"),("conditions","Conditions d'utilisation"),("suppression-compte","Supprimer son compte"),("aide","Aide")]:
        resp=pg.goto(BASE+path); t=pg.inner_text("main")
        check(f"page publique /{path} : accessible sans compte", resp.status==200 and h in t and "Ouvrir l'application" in t and "Confidentialité" in t, t[:120])
    t=pg.inner_text("main"); pg.goto(BASE+"confidentialite"); t=pg.inner_text("main"); pg.screenshot(path="/tmp/legal_mob.png", full_page=True)
    check("confidentialité : données de santé visibles par l'élève seul, prestataires nommés, droits et CNIL", "toi seul peux lire" in t and "Supabase" in t and "Vercel" in t and "CNIL" in t)
    pg.goto(BASE+"suppression-compte"); t=pg.inner_text("main")
    check("suppression : étapes, ce qui est effacé, cas du responsable", "SUPPRIMER" in t and "Ce qui est effacé" in t and "seul responsable" in t)
    pg.goto(BASE); pg.wait_for_timeout(1500); t=pg.inner_text("body")
    check("écran de connexion : liens vers les pages légales", pg.locator(".uzu-legal-links--login a").count()==4 and "Confidentialité" in t, t[:200])
    check("pages publiques : aucune erreur", not errs, errs); c.close()

    # ---------- Élève : signaler, masquer, supprimer son compte
    c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", handle2)
    pg.add_init_script(f"if (!sessionStorage.getItem('uzu-test-init')) {{ sessionStorage.setItem('uzu-test-init','1'); localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))}); }}")
    pg.goto(BASE); pg.wait_for_timeout(2000)
    nav=lambda t: (pg.locator(".mobile-bottom-nav button", has_text="Plus").click(), pg.wait_for_timeout(300), pg.locator(".nav-item", has_text=t).click(), pg.wait_for_timeout(1800))
    nav("Fil du club")
    flags=pg.locator(".uzu-fc-flag")
    check("fil : « Signaler » sur les publications des autres seulement", flags.count()==2 and pg.locator(".uzu-fcard.mine .uzu-fc-flag").count()==0, flags.count())
    flags.first.click(); pg.wait_for_timeout(200)
    check("signaler : motifs proposés", pg.locator(".uzu-report input[type=radio]").count()==4)
    pg.get_by_role("button", name="Envoyer le signalement").click(); pg.wait_for_timeout(200)
    check("signaler : motif obligatoire, rien d'envoyé", "Choisis un motif" in pg.inner_text(".uzu-report") and not any(n=="report_content" for n,_ in RPC))
    pg.get_by_label("Informations fausses (séance, grade, résultat)").check(); pg.locator(".uzu-report textarea").fill("Pas au cours ce jour-là")
    pg.screenshot(path="/tmp/report_mob.png", full_page=True)
    pg.get_by_role("button", name="Envoyer le signalement").click(); pg.wait_for_timeout(1200)
    rc=[json.loads(x) for n,x in RPC if n=="report_content"]
    check(f"signalement envoyé au serveur (membre, motif, publication, précisions)", rc and rc[0]["p_target"]==OTHER and rc[0]["p_reason"]=="faux" and rc[0]["p_details"]=="Pas au cours ce jour-là" and rc[0]["p_item_text"]=="Demande une validation ★★ · Back attack" and rc[0]["p_item_key"].endswith("|r:Back attack"), rc)
    check("signalement : confirmation et panneau refermé", pg.locator(".uzu-report").count()==0)
    pg.locator(".uzu-fc-flag").first.click(); pg.wait_for_timeout(200)
    pg.get_by_role("button", name="Masquer Sarah sans signaler").click(); pg.wait_for_timeout(2000)
    t=pg.inner_text(".page-content")
    check("masquer : appel serveur et fil rechargé sans ce membre", any(n=="set_user_block" and '"p_on":true' in x for n,x in RPC) and "Sarah M." not in t, t[:200])
    nav("Mon profil"); pg.wait_for_timeout(800); t=pg.inner_text(".page-content")
    check("profil : membres masqués listés", "Membres masqués dans le fil" in t and "Sarah M." in t)
    check("profil : liens vers les pages légales", pg.locator(".page-content .uzu-legal-links a").count()==4)
    pg.get_by_role("button", name="Ne plus masquer").click(); pg.wait_for_timeout(1200)
    check("ne plus masquer : appel serveur et liste vidée", any(n=="set_user_block" and '"p_on":false' in x for n,x in RPC) and pg.locator("section[aria-label='Membres masqués']").count()==0)
    sec=pg.locator("section[aria-label='Supprimer mon compte']")
    sec.get_by_role("button", name="Supprimer mon compte").click(); pg.wait_for_timeout(200)
    sec.get_by_role("button", name="Supprimer définitivement mon compte").click(); pg.wait_for_timeout(300)
    check("suppression : refusée sans le mot SUPPRIMER", "Tape SUPPRIMER" in sec.inner_text() and not any(n=="delete_my_account" for n,_ in RPC))
    SAFE["ok"]=False; sec.get_by_label("Tape SUPPRIMER pour confirmer").fill("supprimer"); sec.get_by_role("button", name="Supprimer définitivement mon compte").click(); pg.wait_for_timeout(1200)
    check("suppression : refus du serveur affiché tel quel", "seul responsable" in sec.inner_text())
    SAFE["ok"]=True; pg.screenshot(path="/tmp/delete_mob.png", full_page=True)
    sec.get_by_role("button", name="Supprimer définitivement mon compte").click(); pg.wait_for_timeout(3500)
    t=pg.inner_text("body")
    check("suppression : compte supprimé, session fermée, retour à la connexion", sum(1 for n,_ in RPC if n=="delete_my_account")==2 and "Se connecter" in t and pg.evaluate(f"localStorage.getItem('sb-{REF}-auth-token')") is None, t[:200])
    check("élève : aucune erreur", not errs, errs); c.close()

    # ---------- Responsable : signalements du fil
    CTX.update({"role":"coach","academy_role":"owner","perms":None})
    c=b.new_context(viewport={"width":1280,"height":900}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200])); pg.route(f"https://{REF}.supabase.co/**", handle2)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto(BASE+"?go=reports"); pg.wait_for_timeout(3000)
    t=pg.inner_text(".page-content")
    check("notification « reports » : ouvre Mon académie", "Mon académie" in t and "Signalements du fil (1)" in t, t[:200])
    card=pg.locator("section[aria-label='Signalements du fil']"); ct=card.inner_text()
    check("signalement en attente : membre, motif, publication, précisions, auteur", "Sarah M." in ct and "Informations fausses" in ct and "Séance validée" in ct and "Elle n'était pas au cours" in ct and "Signalé par Yanis B." in ct)
    check("signalements traités repliés", "Compte supprimé" not in ct and "Voir les signalements traités (1)" in ct)
    card.screenshot(path="/tmp/reports_desk.png")
    card.get_by_role("button", name="Traité", exact=True).click(); pg.wait_for_timeout(1000)
    check("traiter : appel serveur", any(n=="resolve_report" and '"p_status":"resolved"' in x and '"p_id":"r1"' in x for n,x in RPC))
    check("responsable : aucune erreur", not errs, errs); c.close()
    b.close()
f=[l for l,ok in results if not ok]; print(f"\n{len(results)-len(f)}/{len(results)} vérifications réussies"); sys.exit(1 if f else 0)
