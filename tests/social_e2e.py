# Fil du club, profil, modification et suppression — Supabase simulé.
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
def check(l,c,g=""): results.append((l,bool(c))); print(("OK    " if c else "ÉCHEC ")+l+("" if c else f"  → {g}"))
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto(BASE); pg.wait_for_timeout(2000)
    nav=lambda t: (pg.locator(".mobile-bottom-nav button", has_text="Plus").click(), pg.wait_for_timeout(300), pg.locator(".nav-item", has_text=t).click(), pg.wait_for_timeout(1800))
    print("# Fil du club")
    nav("Fil du club"); t=pg.inner_text(".page-content"); pg.screenshot(path="/tmp/feed_mob.png", full_page=True)
    check("activité d'un coéquipier affichée", "Sarah M." in t and "Séance validée" in t, t[:300])
    check("ma propre activité affichée (partage activé)", "(toi)" in t)
    check("encouragement reçu compté sur ma séance", "👊 1" in t)
    check("demande ★★ d'un coéquipier affichée", "Back attack" in t)
    check("défi collectif : heures du mois cumulées (4 h, 2 membres)", "4 h" in t and "2 membres actifs" in t, t[:400])
    n0=len(WR); pg.get_by_role("button", name="Check 👊").first.click(); pg.wait_for_timeout(1500)
    fd=DOCS.get(f"feed/{UID}",{}); check("encouragement : publié dans mon document du fil", any(k.startswith(OTHER+"|") for k in fd.get("checks",{})), fd.get("checks"))
    pg.get_by_role("button", name="je valide ★★").click(); pg.wait_for_timeout(1500)
    fd=DOCS.get(f"feed/{UID}",{}); check("validation ★★ publiée", f"{OTHER}|Back attack" in fd.get("vals",{}), fd.get("vals"))
    print("# Carnet : modification et suppression")
    pg.locator(".mobile-bottom-nav button", has_text="Carnet").click(); pg.wait_for_timeout(1500)
    pg.locator(".session-card", has_text="Takedowns").get_by_role("button", name="Modifier").click(); pg.wait_for_timeout(1800)
    t=pg.inner_text(".page-content")
    check("formulaire de modification prérempli", "Modifier la séance" in t and pg.locator(".uzu-stepper", has_text="Rounds").locator("output").inner_text()=="4")
    check("note privée reprise", pg.get_by_placeholder("Ex. : genou sensible").input_value()=="note u1")
    pg.get_by_role("button", name="Plus : Rounds").click(); pg.get_by_role("button", name="Enregistrer les modifications").click(); pg.wait_for_timeout(2000)
    m=DOCS[f"members/{UID}"]; s1=[x for x in m["sessions"] if x["id"]=="u1"]
    check("séance modifiée sous le même identifiant (rounds 5)", len(s1)==1 and s1[0]["rounds"]==5 and len(m["sessions"])==2, s1)
    check("note privée conservée après modification", DOCS[f"data/users/{UID}/private"]["s"].get("u1",{}).get("n")=="note u1")
    pg.locator(".session-card", has_text="Wrestle-up").get_by_role("button", name="Supprimer").click(); pg.wait_for_timeout(300)
    pg.locator(".session-card", has_text="Wrestle-up").get_by_role("button", name="Supprimer").click(); pg.wait_for_timeout(2000)
    m=DOCS[f"members/{UID}"]; check("suppression en deux temps : séance retirée de la fiche", not any(x["id"]=="u2" for x in m["sessions"]), [x["id"] for x in m["sessions"]])
    pg.reload(); pg.wait_for_timeout(2500); pg.locator(".mobile-bottom-nav button", has_text="Carnet").click(); pg.wait_for_timeout(1500)
    check("séance supprimée non réapparue après rechargement", "Wrestle-up" not in pg.inner_text(".page-content"))
    print("# Profil")
    nav("Mon profil"); pg.screenshot(path="/tmp/profile_mob.png", full_page=True)
    pg.get_by_label("Nom et prénom").fill("Yanis B."); pg.get_by_label("Âge (tranche)").select_option("18-25"); pg.get_by_role("button", name="Enregistrer", exact=True).click(); pg.wait_for_timeout(1800)
    m=DOCS[f"members/{UID}"]; check("nom et tranche d'âge enregistrés", m.get("name")=="Yanis B." and m.get("demo",{}).get("age")=="18-25", (m.get("name"), m.get("demo")))
    pg.get_by_role("switch", name="Partager mon activité dans le fil").click(); pg.wait_for_timeout(1800)
    check("désactivation du fil : réglage serveur appelé", any(r0=="set_share_activity" and '"on_off":false' in (body or "") for r0,body in RPC), RPC)
    check("désactivation du fil : mon document du fil supprimé", f"feed/{UID}" in DEL, DEL)
    check("aucune erreur de page", not errs, errs)
    b.close()
ok=sum(1 for _,c in results if c); print(f"\n{ok}/{len(results)} vérifications réussies"); sys.exit(0 if ok==len(results) else 1)
