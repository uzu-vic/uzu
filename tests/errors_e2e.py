# Filet d'erreur, signalement automatique des plantages, retrait de /legacy/ — Supabase simulé.
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
import urllib.request
ERR=[]
def handle2(route):
    r=route.request; u=r.url
    if "/rpc/log_client_error" in u: ERR.append(json.loads(r.post_data or "{}")); return route.fulfill(status=200, content_type="application/json", body="true")
    return handle(route)
def check(l,c,g=""): results.append((l,bool(c))); print(("OK    " if c else "ÉCHEC ")+l+("" if c else f"  → {g}"))
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k): return None
op=urllib.request.build_opener(NoRedirect)
def get(path):
    try: x=op.open(BASE.rstrip("/")+path); return x.status, x.headers.get("Location",""), x.read().decode("utf8","replace")
    except urllib.error.HTTPError as e: return e.code, e.headers.get("Location",""), ""
for p in ["/legacy", "/legacy/", "/legacy/index.html"]:
    st,loc,_=get(p); check(f"{p} : renvoie vers l'application", st in (307,308) and loc.rstrip("/") in ("", BASE.rstrip("/")), (st,loc))
st,loc,_=get("/legacy/manifest.webmanifest"); check("ancien manifeste : renvoie vers le manifeste de l'application", st in (307,308) and loc.endswith("/manifest.webmanifest"), (st,loc))
st,_,body=get("/legacy/sw.js"); check("relais des notifications servi sur /legacy/sw.js (ouvre l'application)", st==200 and "showNotification" in body and '"/" + (go ? "?go="' in body, st)
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", handle2)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto(BASE+"?invite=SECRET-TOKEN-1234567890abcdef"); pg.wait_for_timeout(2500)
    check("accueil affiché normalement, aucun rapport", "Salut Yanis" in pg.inner_text(".page-content") and not ERR, ERR)
    # Erreur hors rendu (gestionnaire, minuterie)
    pg.evaluate("setTimeout(() => { throw new Error('Test UZU minuterie') }, 0)"); pg.wait_for_timeout(1200)
    e1=[x for x in ERR if x.get("p_message")=="Test UZU minuterie"]
    check("erreur hors rendu : signalée au serveur (type, page sans paramètres, navigateur, version)", e1 and e1[0]["p_kind"]=="error" and e1[0]["p_page"]=="/" and "Chrome" in e1[0]["p_agent"] and e1[0]["p_version"], e1)
    pg.evaluate("setTimeout(() => { Promise.reject(new Error('Test UZU promesse')) }, 0)"); pg.wait_for_timeout(1200)
    check("promesse non traitée : signalée", any(x.get("p_message")=="Test UZU promesse" and x["p_kind"]=="promise" for x in ERR))
    pg.evaluate("setTimeout(() => { throw new Error('Test UZU minuterie') }, 0)"); pg.wait_for_timeout(800)
    check("même erreur : un seul rapport par ouverture", sum(1 for x in ERR if x.get("p_message")=="Test UZU minuterie")==1)
    pg.evaluate("setTimeout(() => { Promise.reject(new TypeError('Failed to fetch')) }, 0)"); pg.wait_for_timeout(800)
    check("coupure réseau : pas de rapport (bruit)", not any("Failed to fetch" in x.get("p_message","") for x in ERR))
    # Plantage d'un écran : filet d'erreur
    pg.evaluate("() => { window.__tld = Date.prototype.toLocaleDateString; Date.prototype.toLocaleDateString = function(){ throw new Error('Test UZU rendu') }; }")
    pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1500)
    t=pg.inner_text("body")
    check("écran planté : page de secours au lieu d'une page blanche", "Cet écran a rencontré un problème" in t and pg.locator(".mobile-bottom-nav").count()==1, t[:200])
    pg.screenshot(path="/tmp/crash_mob.png")
    e2=[x for x in ERR if x.get("p_message")=="Test UZU rendu"]
    check("plantage de l'écran : signalé avec la pile des composants", e2 and e2[0]["p_kind"]=="render" and len(e2[0]["p_stack"])>20, e2[:1])
    pg.evaluate("() => { Date.prototype.toLocaleDateString = window.__tld; }")
    pg.get_by_role("button", name="Réessayer").click(); pg.wait_for_timeout(1500)
    check("« Réessayer » : l'écran se rétablit", "Cet écran a rencontré un problème" not in pg.inner_text("body") and pg.locator(".page-content h1").count()>0)
    pg.locator(".mobile-bottom-nav button", has_text="Accueil").click(); pg.wait_for_timeout(1200)
    check("le reste de l'application reste utilisable", "Salut Yanis" in pg.inner_text(".page-content"))
    check("aucun rapport ne contient le jeton d'invitation", not any("SECRET-TOKEN" in json.dumps(x) for x in ERR))
    b.close()
f=[l for l,ok in results if not ok]; print(f"\n{len(results)-len(f)}/{len(results)} vérifications réussies"); sys.exit(1 if f else 0)
