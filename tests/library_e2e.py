# Bibliothèque technique (lot B) — parcours de consultation sur base simulée.
# Lancer après : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_mocktest npx next build && npx next start -p 3100
import json, time, base64, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
REF="abcdefghijkltest"; UID="00000000-0000-0000-0000-0000000000b1"
CAT=json.load(open("db/bibliotheque/catalogue.json"))
def jwt():
    h=base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).decode().rstrip("=")
    p=base64.urlsafe_b64encode(json.dumps({"sub":UID,"exp":int(time.time())+3600,"role":"authenticated","email":"eleve@test.fr"}).encode()).decode().rstrip("=")
    return h+"."+p+".sig"
sess={"access_token":jwt(),"token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"refresh_token":"r","user":{"id":UID,"aud":"authenticated","role":"authenticated","email":"eleve@test.fr","user_metadata":{"name":"Yanis Bernard"},"app_metadata":{}}}
T=date.today(); d=lambda n: (T-timedelta(days=n)).isoformat()
CTX={"role":"student","share_activity":False,"academy_role":"student","member_status":"active","member_id":"m1","section_id":None,"perms":None,"memberships":[{"academy_id":"c1","name":"AG Academie","role":"student","status":"active"}],
     "club":{"id":"c1","name":"AG Academie","schedule":[],"tactical_focus":{},"profile":{}}}
DOCS={f"members/{UID}":{"consent":{"at":"2026-01-01T00:00:00Z","share":True},"sessions":[{"id":"u1","date":d(2),"cat":"jjb","type":"Gi","dur":90,"theme":"Toreando pass","sys":"jambes","rounds":4}],
      "skills":{"Toreando pass":{"lvl":2,"at":d(2),"partner":None,"rev":d(2),"legacy":False}},"belt":{"rank":"bleue"}},
      f"grades/{UID}":{"rank":"bleue","stripes":1,"since":"2026-03-01"}}
LIBCTX={"academy":"c1","disciplines":["jjb_gi","grappling_nogi"],"configured":False,"can_review":False,"can_manage":False,"can_configure":False,"hidden":["G22"],"pending":0}
TECH=[dict(id=t["id"],discipline_id=t["discipline"],category_id=t["category"],position=t["pos"],name=t["name"],aliases=t["aliases"],source_text=t["source_text"],proposed_text=t["proposed_text"],origin=t["origin"],level=t["level"],validation_status="a_valider",validation_refs=t["validation_refs"],restricted=t["restricted"],uzu_links=t["links"]) for t in CAT["techniques"]]
TABLES={
 "lib_disciplines":[dict(id=x["id"],label=x["label"],long_label=x["long"],position=x["pos"]) for x in CAT["disciplines"] if x["active"]],
 "lib_categories":[dict(id=c["id"],discipline_id=c["discipline"],position=c["pos"],label=c["label"]) for c in CAT["categories"]],
 "lib_techniques":TECH,
 "lib_flows":[dict(id=f["id"],discipline_id=f["discipline"],position=f["pos"],title=f["title"],intro=f["intro"]) for f in CAT["flows"]],
 "lib_flow_steps":[dict(id=s["id"],flow_id=s["flow"],position=s["pos"],parent_id=s["parent"],kind=s["kind"],branch_label=s["branch"],label=s["text"],origin=s["origin"]) for s in CAT["steps"]],
 "lib_flow_step_techniques":[dict(step_id=s["id"],technique_id=x["t"],position=i+1,origin=x["o"]) for s in CAT["steps"] for i,x in enumerate(s["techs"])],
 "club_lib_items":[{"id":"i1","kind":"lien","technique_id":"N27","discipline_id":"grappling_nogi","title":"RNC du club","body":"","url":"https://www.youtube.com/watch?v=abc","status":"publie","published_at":"2026-11-10T10:00:00Z"},
                   {"id":"i2","kind":"variante","technique_id":"G17","discipline_id":"jjb_gi","title":"Toreando avec saisie des genoux","body":"Variante validée au club","url":None,"status":"publie","published_at":"2026-11-11T10:00:00Z"}],
}
MODE={"lib":True}
def handle(route):
    r=route.request; u=r.url
    if "/rpc/get_my_context" in u: return route.fulfill(status=200, content_type="application/json", body=json.dumps(CTX))
    if "/rpc/library_context" in u:
        if not MODE["lib"]: return route.fulfill(status=404, content_type="application/json", body=json.dumps({"code":"PGRST202","message":"Could not find the function public.library_context without parameters in the schema cache"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps(LIBCTX))
    for tb,rows in TABLES.items():
        if f"/rest/v1/{tb}?" in u: return route.fulfill(status=200, content_type="application/json", body=json.dumps(rows))
    if "/rest/v1/docs" in u and r.method=="POST": return route.fulfill(status=201, content_type="application/json", body="[]")
    if "/rest/v1/docs" in u:
        q=up.parse_qs(up.urlparse(u).query); path=q.get("path",["eq."])[0][3:]
        data=DOCS.get(path)
        if "vnd.pgrst.object" in r.headers.get("accept",""):
            return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path":path,"data":data} if data is not None else {"code":"PGRST116","message":"0 rows"}))
        return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"path":path,"data":data}] if data is not None else []))
    return route.fulfill(status=200, content_type="application/json", body="[]" if "/rest/v1/" in u else "{}")

R=[]
def check(label, ok, got=""):
    R.append(bool(ok)); print(("✔ " if ok else "✖ ")+label+("" if ok else " → "+str(got)[:300]))
with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name,vp in [("mob",{"width":390,"height":844}),("desk",{"width":1280,"height":900})]:
        c=b.new_context(viewport=vp); pg=c.new_page(); errs=[]
        pg.on("pageerror",lambda e: errs.append(str(e)[:300]))
        pg.route(f"https://{REF}.supabase.co/**", handle)
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess))});")
        MODE["lib"]=True
        pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2000)
        tech=lambda: (pg.locator(".nav-item", has_text="Techniques").click() if name=="desk" else pg.locator(".mobile-bottom-nav button", has_text="Techniques").click(), pg.wait_for_timeout(1800))
        tech()
        vol=pg.locator(".uzu-lib-volets")
        check(f"[{name}] Techniques : trois volets, « Ma progression » par défaut (écran existant inchangé)", vol.count()==1 and "Ma progression" in vol.inner_text() and pg.get_by_text("Tes systèmes").count()==1)
        ency=pg.locator(".uzu-ency li", has_text="Toreando pass").first.locator("i.on").count()
        vol.get_by_role("button", name="Bibliothèque").click(); pg.wait_for_timeout(500)
        txt=pg.inner_text(".page-content")
        check(f"[{name}] bascule Gi / No-Gi et 6 catégories Gi", pg.locator(".uzu-lib-disc button").count()==2 and pg.locator(".uzu-lib-cat").count()==6, txt[:300])
        pg.get_by_role("button", name="Passages de garde").click(); pg.wait_for_timeout(300)
        cards=pg.locator(".uzu-lib-card")
        ct=" | ".join(cards.all_inner_texts())
        check(f"[{name}] Passages de garde : 7 fiches (G22 masquée par le club), propositions G32/G34 signalées", cards.count()==7 and "Long Step" not in ct and ct.count("Proposée par UZU")==2, ct[:400])
        tor=cards.filter(has_text="Torreando Pass").first
        check(f"[{name}] Torreando : mêmes étoiles que dans Ma progression ({ency}), contenu du club signalé", ency>0 and tor.locator("i.on").count()==ency and "1 contenu du club" in tor.inner_text(), tor.inner_text())
        pg.fill(".uzu-lib-search input", "knee slice"); pg.wait_for_timeout(300)
        ct=" | ".join(pg.locator(".uzu-lib-card").all_inner_texts())
        check(f"[{name}] recherche par autre nom, toutes disciplines : G18 et N18", pg.locator(".uzu-lib-card").count()==2 and "Knee Cut Pass" in ct, ct[:300])
        pg.fill(".uzu-lib-search input", "mata leao"); pg.wait_for_timeout(300)
        pg.locator(".uzu-lib-card").first.click(); pg.wait_for_timeout(500)
        f=pg.locator(".uzu-lib-fiche"); ft=f.inner_text()
        check(f"[{name}] fiche N27 : texte du document intact + correction proposée distincte", "en alignant le coude avec sa trachée" in ft and "CORRECTION PROPOSÉE · À VALIDER PAR UN PROFESSEUR" in ft.upper() and "pas de pression sur la trachée" in ft.lower(), ft[:500])
        check(f"[{name}] fiche : badges Référence UZU + À valider, autres noms", "Référence UZU" in ft and "À valider" in ft and "RNC" in ft)
        check(f"[{name}] fiche : vidéo du club en lien externe (YouTube), aucune autre", f.locator("a[href='https://www.youtube.com/watch?v=abc'][target=_blank][rel*=noopener]").count()==1)
        check(f"[{name}] fiche : enchaînements FC3 et FC4", f.locator(".uzu-lib-row", has_text="FC3").count()==1 and f.locator(".uzu-lib-row", has_text="FC4").count()==1)
        if name=="mob": pg.screenshot(path="/tmp/lib_fiche_mob.png", full_page=True)
        f.locator(".uzu-lib-row", has_text="FC3").click(); pg.wait_for_timeout(600)
        st=pg.inner_text(".page-content")
        check(f"[{name}] FC3 ouvert depuis la fiche : intro du document, branche A par défaut avec suite proposée en pointillés", "Garde Assise, Wrestle-Up & Leg Locks" in st and pg.locator(".uzu-lib-step.prop").count()==1 and "suite proposée par uzu" in st.lower(), st[:400])
        pg.get_by_role("button", name="Réaction B : il avance et met son poids sur vous").click(); pg.wait_for_timeout(400)
        st=pg.inner_text(".page-content")
        check(f"[{name}] branche B : clés de jambes, avertissement clé de talon, alternative Crab Ride", "Inside Heel Hook" in st and "Clé de talon" in st and "Crab Ride" in st and pg.locator(".uzu-lib-step.prop").count()==0, st[:400])
        if name=="mob": pg.screenshot(path="/tmp/lib_flow_mob.png", full_page=True)
        pg.locator(".uzu-lib-chips button", has_text="N28").click(); pg.wait_for_timeout(500)
        ft=pg.locator(".uzu-lib-fiche").inner_text()
        check(f"[{name}] fiche N28 depuis l'enchaînement : avertissement clé de talon", "Clé de talon" in ft and "Inside Heel Hook" in ft)
        pg.locator(".uzu-lib-back").click(); pg.wait_for_timeout(300)
        pg.locator(".uzu-lib-volets button", has_text="Enchaînements").click(); pg.wait_for_timeout(300)
        pg.locator(".uzu-lib-flowpick button", has_text="FC4").click(); pg.wait_for_timeout(300)
        st=pg.inner_text(".page-content")
        check(f"[{name}] FC4 : branche Body Lock Pass par défaut (texte du document)", "Vous écrasez ses hanches" in st and "Seatbelt + Body Triangle" in st, st[:300])
        # Lien depuis une séance
        if name=="desk": pg.locator(".nav-item", has_text="Entraînements").click()
        else: pg.locator(".mobile-bottom-nav button", has_text="Séances").click()
        pg.wait_for_timeout(1500)
        pg.get_by_role("button", name="Mon journal").click(); pg.wait_for_timeout(800)
        pg.locator(".session-card").first.click(); pg.wait_for_timeout(1200)
        lk=pg.locator(".uzu-detail .uzu-det-fiche")
        check(f"[{name}] détail de séance : lien vers les fiches liées à « Toreando pass »", lk.count()==1 and "fiche" in lk.inner_text(), lk.all_inner_texts())
        if lk.count():
            lk.click(); pg.wait_for_timeout(1500)
            t=pg.inner_text(".page-content")
            check(f"[{name}] … ouvre la bibliothèque filtrée (G17 et N20)", "Liées à « Toreando pass »" in t and pg.locator(".uzu-lib-card").count()==2, t[:300])
        # Script absent : écran Techniques d'avant
        MODE["lib"]=False
        pg.evaluate("localStorage.clear(); sessionStorage.clear()"); pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess))});")
        pg.reload(); pg.wait_for_timeout(2000); tech()
        check(f"[{name}] base sans le script : aucun volet, écran Techniques inchangé", pg.locator(".uzu-lib-volets").count()==0 and pg.get_by_text("Encyclopédie technique").count()==1)
        check(f"[{name}] aucune erreur JavaScript", not errs, errs)
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} vérifications réussies")
