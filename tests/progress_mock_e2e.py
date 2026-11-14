import json, time, base64
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
REF="abcdefghijkltest"; UID="00000000-0000-0000-0000-0000000000b1"
def jwt():
    h=base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).decode().rstrip("=")
    p=base64.urlsafe_b64encode(json.dumps({"sub":UID,"exp":int(time.time())+3600,"role":"authenticated","email":"eleve@test.fr"}).encode()).decode().rstrip("=")
    return h+"."+p+".sig"
sess={"access_token":jwt(),"token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"refresh_token":"r","user":{"id":UID,"aud":"authenticated","role":"authenticated","email":"eleve@test.fr","user_metadata":{"name":"Yanis Bernard"},"app_metadata":{}}}
T=date.today(); d=lambda n: (T-timedelta(days=n)).isoformat()
wd=(T.weekday()+1)%7+1  # demain (1=lundi)
CTX={"role":"student","share_activity":False,"academy_role":"student","member_status":"active","member_id":"m1","section_id":None,"perms":None,"memberships":[{"academy_id":"c1","name":"AG Academie","role":"student","status":"active"}],
     "club":{"id":"c1","name":"AG Academie","schedule":[{"id":"x1","d":wd,"s":"19:00","e":"20:30","t":"JJB Gi"}],"tactical_focus":{},"profile":{}}}
DOCS={f"members/{UID}":{"sessions":[{"id":"u1","date":d(3),"cat":"jjb","type":"Gi","dur":90,"theme":"Takedowns","sys":"lutte","rounds":5},{"id":"u2","date":d(40),"cat":"prepa","effort":"cardio","dur":45,"rpe":7}],"comps":[{"id":"c1","date":d(20),"event":"Open de l'Essonne","type":"No-gi","result":"bronze","wins":2,"losses":1}],"belt":{"rank":"noire"}},
      f"roll/{UID}":{"s":[{"k":"x1|"+d(10),"date":d(10),"title":"JJB No-gi","dur":60}]},
      f"grades/{UID}":{"rank":"bleue","stripes":2,"since":"2026-03-01"}}
LOCAL={UID:{"v":1,"at":"x","dirty":True,"deleted":{"s":[],"c":[]},"state":{"sessions":[{"id":"u9","date":d(1),"cat":"jjb","type":"No-gi","dur":60,"theme":"Front headlock","sys":"controle"}],"comps":[],"belt":{"rank":"blanche"}}}}
def handle(route):
    r=route.request; u=r.url
    if "/rpc/get_my_context" in u: return route.fulfill(status=200, content_type="application/json", body=json.dumps(CTX))
    if "/rest/v1/docs" in u and r.method=="POST":
        body=json.loads(r.post_data); body=body if isinstance(body,list) else [body]
        for b0 in body: DOCS[b0["path"]]=b0["data"]
        return route.fulfill(status=201, content_type="application/json", body="[]")
    if "/rest/v1/docs" in u:
        import urllib.parse as up
        q=up.parse_qs(up.urlparse(u).query); path=q.get("path",["eq."])[0][3:]
        data=DOCS.get(path)
        acc=r.headers.get("accept","")
        if "vnd.pgrst.object" in acc:
            return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path":path,"data":data} if data is not None else {"code":"PGRST116","message":"0 rows"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"path":path,"data":data}] if data is not None else []))
    return route.fulfill(status=200, content_type="application/json", body="{}")

import json as _j
L=_j.load(open("/tmp/legacy-out.json"))
rich=[x["item"] for x in L["sessions"]]
for i,it in enumerate(rich): it["id"]="r%d"%i; it.pop("note",None); it.pop("forme",None)
DOCS[f"members/{UID}"]={"sessions":rich+DOCS[f"members/{UID}"]["sessions"],"comps":[{"id":"c1","date":d(20),"event":"Open de l'Essonne","type":"No-gi","result":"argent","wins":3,"losses":1,"subs":2}],"skills":L["sessions"][1]["skills"],"belt":{"rank":"bleue"}}
DOCS[f"grades/{UID}"]={"rank":"bleue","stripes":2,"since":"2026-03-01","verified":{"Wrestle-up":{"verified_by_coach":True,"at":"2026-09-01","by":"Prof Malik"}}}
DOCS[f"data/users/{UID}/private"]={"s":{"r0":{"n":"genou","f":"douleur"},"r1":{"n":"","f":"ok"}}}
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name,vp in [("desk",{"width":1280,"height":900}),("mob",{"width":390,"height":844})]:
        c=b.new_context(viewport=vp); pg=c.new_page(); errs=[]
        pg.on("pageerror",lambda e: errs.append(str(e)[:300]))
        pg.route(f"https://{REF}.supabase.co/**", handle)
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess))});")
        pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2000)
        if name=="desk": pg.locator(".nav-item", has_text="Techniques").click()
        else: pg.locator(".mobile-bottom-nav button", has_text="Techniques").click()
        pg.wait_for_timeout(1500); t=pg.inner_text(".page-content")
        print(name,"TECH:", all(k in t for k in ["Ceinture bleue","2 barrettes","Lutte & Scrambles","Encyclopédie","Scissor sweep"]), "| ★★★ Wrestle-up:", pg.locator(".uzu-skill-list li", has_text="Wrestle-up").first.locator("i.on").count())
        pg.screenshot(path=f"/tmp/tech_{name}.png", full_page=True)
        if name=="desk": pg.locator(".nav-item", has_text="Progression").click()
        else: pg.locator(".mobile-bottom-nav button", has_text="Progression").click()
        pg.wait_for_timeout(1500); t=pg.inner_text(".page-content")
        print(name,"PROG:", all(k in t for k in ["Séances au total","Ratio à niveau égal","Mes armes","Guillotine","Palmarès","Open de l'Essonne","Dernière douleur"]))
        pg.screenshot(path=f"/tmp/prog_{name}.png", full_page=True)
        print(name,"errors:",errs)
    b.close()
