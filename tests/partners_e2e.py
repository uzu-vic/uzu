# Partenaires d'entraînement et Story avec photo — Supabase simulé.
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
import struct, zlib, os
SARAH="00000000-0000-0000-0000-0000000000c9"; KARIM="00000000-0000-0000-0000-0000000000d4"
CANDS=[{"user_id":SARAH,"name":"Sarah M."},{"user_id":KARIM,"name":"Karim B."}]
TAGS={}   # clé de séance -> liste
INBOX=[{"id":"t1","author_id":SARAH,"author_name":"Sarah M.","date":d(1),"summary":"Gi · 1 h 30 · Contrôle & Dos","status":"pending"}]
ALLOW={"v":True}; CALLS=[]
def handle2(route):
    r=route.request; u=r.url
    if "/rpc/" in u:
        name=u.split("/rpc/")[1].split("?")[0]; a=json.loads(r.post_data or "{}")
        ok=lambda b: route.fulfill(status=200, content_type="application/json", body=json.dumps(b))
        if name=="list_tag_candidates": return ok(CANDS)
        if name=="set_session_partners":
            CALLS.append((name,a)); TAGS[a["p_key"]]=[{"user_id":i,"name":next(c["name"] for c in CANDS if c["user_id"]==i),"status":"pending"} for i in a["p_partners"]]; return ok(TAGS[a["p_key"]])
        if name=="my_session_partners": return ok(TAGS)
        if name=="tags_for_me": return ok(INBOX)
        if name=="answer_tag":
            CALLS.append((name,a)); INBOX[0]["status"]="confirmed" if a["p_ok"] else "declined"; return ok(a["p_ok"])
        if name=="get_allow_tag": return ok(ALLOW["v"])
        if name=="set_allow_tag": CALLS.append((name,a)); ALLOW["v"]=a["p_on"]; return ok(a["p_on"])
    return handle(route)
def check(l,c,g=""): results.append((l,bool(c))); print(("OK    " if c else "ÉCHEC ")+l+("" if c else f"  → {g}"))
def png(path, w=60, h=90):
    raw=b"".join(b"\x00"+bytes([200,40,60]*w) for _ in range(h))
    ch=lambda t,dta: struct.pack(">I",len(dta))+t+dta+struct.pack(">I",zlib.crc32(t+dta)&0xffffffff)
    open(path,"wb").write(b"\x89PNG\r\n\x1a\n"+ch(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))+ch(b"IDAT",zlib.compress(raw))+ch(b"IEND",b""))
png("/tmp/uzu-photo-test.png")
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", handle2)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto(BASE); pg.wait_for_timeout(2000)
    nav=lambda t: (pg.locator(".mobile-bottom-nav button", has_text="Plus").click(), pg.wait_for_timeout(300), pg.locator(".nav-item", has_text=t).click(), pg.wait_for_timeout(1800))
    # ---- Fil : séance où l'on m'a identifié
    nav("Fil du club"); box=pg.locator("section[aria-label='Séances où tu as été identifié']")
    check("fil : séance à confirmer (auteur, date, résumé)", box.count()==1 and "Sarah M." in box.inner_text() and "Contrôle & Dos" in box.inner_text())
    box.get_by_role("button", name="Confirmer").click(); pg.wait_for_timeout(1500)
    check("confirmer : appel serveur", any(n=="answer_tag" and a["p_ok"] is True and a["p_id"]=="t1" for n,a in CALLS))
    box=pg.locator("section[aria-label='Séances où tu as été identifié']")
    check("après confirmation : validation ★★ de la technique demandée par ce partenaire proposée", "Confirmée" in box.inner_text() and box.get_by_role("button", name="Je valide aussi ★★ : Back attack").count()==1, box.inner_text())
    box.get_by_role("button", name="Je valide aussi ★★ : Back attack").click(); pg.wait_for_timeout(1500)
    fd=DOCS.get(f"feed/{UID}",{}); check("★★ validée depuis la confirmation", f"{SARAH}|Back attack" in fd.get("vals",{}), fd.get("vals"))
    # ---- Profil : réglage
    nav("Mon profil"); lab=pg.get_by_label("Mes partenaires du club peuvent m'identifier sur leurs séances")
    check("profil : réglage « m'identifier » activé par défaut", lab.count()==1 and lab.is_checked())
    lab.uncheck(); pg.wait_for_timeout(800)
    check("profil : refus d'être identifié enregistré", any(n=="set_allow_tag" and a["p_on"] is False for n,a in CALLS))
    # ---- Formulaire : identifier des partenaires
    pg.locator(".mobile-bottom-nav button", has_text="Accueil").click(); pg.wait_for_timeout(1200)
    pg.get_by_role("button", name="Saisir ma séance").first.click(); pg.wait_for_timeout(1200)
    fld=pg.locator(".uzu-partners")
    check("formulaire : champ partenaires", fld.count()==1)
    srch=pg.get_by_label("Chercher un partenaire du club"); srch.fill("sar"); pg.wait_for_timeout(200)
    check("recherche sans accents ni majuscules", pg.get_by_role("option", name="Sarah M.").count()==1 and pg.get_by_role("option", name="Karim B.").count()==0)
    pg.get_by_role("option", name="Sarah M.").click(); srch.fill("KAR"); pg.get_by_role("option", name="Karim B.").click()
    check("deux partenaires choisis", pg.locator(".uzu-partner-chip").count()==2)
    pg.get_by_role("button", name="Retirer Karim B.").click()
    check("retirer un partenaire", pg.locator(".uzu-partner-chip").count()==1)
    pg.screenshot(path="/tmp/partners_form.png", full_page=True)
    pg.locator("button.uzu-submit-main").click(); pg.wait_for_timeout(2500)
    sp=[a for n,a in CALLS if n=="set_session_partners"]
    check("enregistrement : partenaires envoyés avec la séance (clé, date, résumé)", sp and sp[-1]["p_partners"]==[SARAH] and sp[-1]["p_key"] and sp[-1]["p_date"]==T.isoformat() and "Gi" in sp[-1]["p_summary"], sp)
    det=pg.locator(".uzu-detail")
    check("séance enregistrée : partenaires affichés (en attente)", det.count()==1 and "Sarah M." in det.inner_text() and "en attente" in det.inner_text(), det.inner_text()[:300] if det.count() else "")
    # ---- Story avec photo
    det.locator("input[type=file]").set_input_files("/tmp/uzu-photo-test.png"); pg.wait_for_timeout(1500)
    imgs=det.locator(".uzu-story img")
    check("photo ajoutée : aperçu de la Story généré", imgs.count()==1 and det.get_by_role("button", name="Changer la photo").count()==1)
    check("message : photo ni envoyée ni enregistrée", "ni envoyée ni enregistrée" in det.inner_text())
    px=pg.evaluate("""async () => { const im = document.querySelector('.uzu-story img'); await im.decode(); const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d'); x.drawImage(im, 0, 0); const d = x.getImageData(20, 20, 1, 1).data; return [c.width, c.height, d[0], d[1], d[2]] }""")
    check("Story 1080 × 1920 avec la photo en fond (teinte rouge assombrie)", px[0]==1080 and px[1]==1920 and px[2] > px[3] + 20, px)
    pg.screenshot(path="/tmp/partners_story.png", full_page=True)
    st_png=pg.evaluate("async () => { const im = document.querySelector('.uzu-story img'); const c = document.createElement('canvas'); c.width = 540; c.height = 960; c.getContext('2d').drawImage(im, 0, 0, 540, 960); return c.toDataURL('image/png') }")
    import base64 as b64; open("/tmp/story_render.png","wb").write(b64.b64decode(st_png.split(",")[1]))
    det.get_by_role("button", name="Retirer la photo").click(); pg.wait_for_timeout(1000)
    check("retirer la photo : Story sans photo", det.get_by_role("button", name="Ajouter une photo").count()==1)
    up=[x for x in pg.evaluate("performance.getEntriesByType('resource').map(e => e.name)") if "/storage/" in x]
    check("aucune photo envoyée au serveur", not up, up)
    check("aucune erreur", not errs, errs)
    b.close()
f=[l for l,ok in results if not ok]; print(f"\n{len(results)-len(f)}/{len(results)} vérifications réussies"); sys.exit(1 if f else 0)
