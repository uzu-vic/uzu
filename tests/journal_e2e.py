# Saisie de séance de bout en bout, Supabase simulé : documents envoyés, confidentialité, hors ligne, équipe.
import json, time, base64, sys
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
REF="abcdefghijkltest"; UID="00000000-0000-0000-0000-0000000000b1"; BASE="http://127.0.0.1:3100/"
def jwt():
    e=lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg":"HS256","typ":"JWT"})+"."+e({"sub":UID,"exp":int(time.time())+3600,"role":"authenticated"})+".sig"
SESS={"access_token":jwt(),"token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"refresh_token":"r","user":{"id":UID,"aud":"authenticated","role":"authenticated","email":"eleve@test.fr","user_metadata":{"name":"Yanis Bernard"},"app_metadata":{}}}
T=date.today(); d=lambda n:(T-timedelta(days=n)).isoformat()
def ctx(role): return {"role":role,"share_activity":False,"academy_role":"student" if role=="student" else "owner","member_status":"active","perms":None,"memberships":[{"academy_id":"c1","name":"AG","role":"student","status":"active"}],"club":{"id":"c1","name":"AG Academie","schedule":[]}}
results=[]
def check(label, cond, got=""):
    results.append((label,bool(cond))); print(("OK    " if cond else "ÉCHEC ")+label+("" if cond else f"  → {got}"))
def run(pw, role, offline=False):
    docs={f"members/{UID}":{"name":"Yanis","acct":"club","sessions":[{"id":"old1","date":d(5),"cat":"jjb","type":"Gi","dur":90,"theme":"Takedowns","sys":"lutte"}],"belt":{"rank":"noire"}},
          f"data/users/{UID}/private":{"s":{"old1":{"n":"ancienne note","f":"ok"}}},
          f"grades/{UID}":{"rank":"bleue","stripes":2,"since":"2026-03-01"},
          f"data/users/{UID}/training":{"sessions":[{"id":"t1","date":d(3),"cat":"jjb","dur":60,"theme":"Wrestle-up"}]}}
    writes=[]
    NET={"off":False}
    def handle(route):
        r=route.request; u=r.url
        if "/rpc/get_my_context" in u: return route.fulfill(status=200, content_type="application/json", body=json.dumps(ctx(role)))
        if "/rest/v1/docs" in u:
            if NET["off"]: return route.abort()
            if r.method=="POST":
                body=json.loads(r.post_data); body=body if isinstance(body,list) else [body]
                for b in body: writes.append(b); docs[b["path"]]=b["data"]
                return route.fulfill(status=201, content_type="application/json", body="[]")
            import urllib.parse as up
            q=up.parse_qs(up.urlparse(u).query); path=q.get("path",["eq."])[0][3:]; data=docs.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept",""):
                return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path":path,"data":data} if data is not None else {"code":"PGRST116"}))
            return route.fulfill(status=200, content_type="application/json", body=json.dumps([{"path":path,"data":data}] if data is not None else []))
        return route.fulfill(status=200, content_type="application/json", body="{}")
    b=pw.chromium.launch(executable_path="/usr/bin/google-chrome"); c=b.new_context(viewport={"width":390,"height":844}); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:200]))
    pg.route(f"https://{REF}.supabase.co/**", handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(SESS))});")
    pg.goto(BASE); pg.wait_for_timeout(2000)
    pg.get_by_role("button", name="Saisir ma séance").click(); pg.wait_for_timeout(500)
    pg.screenshot(path=f"/tmp/form_top_{role}.png")
    pg.get_by_role("button", name="No-gi").first.click()
    pg.get_by_role("button", name="1 h", exact=True).click()
    pg.get_by_role("button", name="Contrôle & Dos").click()
    pg.get_by_role("button", name="Je l'ai imposé").click()
    pg.get_by_role("button", name="Front headlock").click()
    for _ in range(3): pg.get_by_role("button", name="Plus : Rounds").click()
    pg.get_by_role("button", name="Guillotine", exact=True).click(); pg.get_by_role("button", name="Guillotine", exact=True).click()
    pg.get_by_role("button", name="Subie · gradé").click(); pg.get_by_role("button", name="Triangle", exact=True).click()
    pg.get_by_role("button", name="Scissor Sweep").click()
    pg.get_by_role("button", name="Plus : Amenées au sol réussies").click()
    pg.get_by_role("button", name="Fatigué").click()
    pg.get_by_placeholder("Ex. : genou sensible").fill("genou sensible")
    pg.screenshot(path=f"/tmp/form_filled_{role}.png", full_page=True)
    if offline: NET["off"]=True
    pg.get_by_role("button", name="Enregistrer la séance").click(); pg.wait_for_timeout(9000 if offline else 2500)
    toast=pg.locator(".toast-message").inner_text() if pg.locator(".toast-message").count() else ""
    cache=json.loads(pg.evaluate("localStorage.getItem('uzu_cached_training')") or "{}")
    back=None
    writes_before=list(writes)
    if offline:
        NET["off"]=False; pg.evaluate("window.dispatchEvent(new Event('online'))")
        seen=""
        for _ in range(30):
            pg.wait_for_timeout(200)
            if pg.locator(".toast-message").count(): seen=pg.locator(".toast-message").inner_text()
            if "synchronisées" in seen: break
        back={"writes":[x["path"] for x in writes],"cache":json.loads(pg.evaluate("localStorage.getItem('uzu_cached_training')") or "{}"),
              "toast":seen,
              "member":docs.get(f"members/{UID}",{})}
    log_txt=pg.inner_text(".page-content")
    pg.screenshot(path=f"/tmp/after_save_{role}{'_offline' if offline else ''}.png", full_page=True)
    b.close()
    return writes_before, toast, cache, errs, log_txt, back

with sync_playwright() as pw:
    print("# Élève de club")
    w,toast,cache,errs,txt,_=run(pw,"student")
    paths=[x["path"] for x in w]
    check("documents envoyés : fiche + données privées", sorted(paths)==sorted([f"members/{UID}",f"data/users/{UID}/private"]), paths)
    mem=next((x["data"] for x in w if x["path"]==f"members/{UID}"),{}); prv=next((x["data"] for x in w if x["path"].endswith("/private")),{})
    new=[s for s in mem.get("sessions",[]) if s["id"]!="old1"]
    check("ancienne séance conservée", any(s["id"]=="old1" for s in mem.get("sessions",[])))
    s=new[0] if new else {}
    check("séance : technique, système, sens, tenue, durée", (s.get("theme"),s.get("sys"),s.get("flow"),s.get("type"),s.get("dur"))==("Front headlock","controle","impose","No-gi",60), s)
    check("séance : rounds 3, 2 placées, 1 subie contre gradé, 1 renversement, 1 amenée", (s.get("rounds"),s.get("placed"),s.get("takenG"),s.get("sweeps_done"),s.get("lucha_takedowns_done"))==(3,2,1,1,1), s)
    check("confidentialité : ni note ni état physique dans la fiche lue par le prof", "note" not in s and "forme" not in s, s)
    check("note et état physique dans le document privé", prv.get("s",{}).get(s.get("id"))=={"n":"genou sensible","f":"fatigue"} and prv["s"].get("old1")=={"n":"ancienne note","f":"ok"}, prv)
    check("ceinture de la fiche = grade validé (bleue, 2 barrettes)", mem.get("belt",{}).get("rank")=="bleue" and mem["belt"].get("stripes")==2, mem.get("belt"))
    check("étoile ★ attribuée à la technique", mem.get("skills",{}).get("Front headlock",{}).get("lvl")==1, mem.get("skills"))
    check("cache du téléphone : synchronisé (dirty = false)", cache.get(UID,{}).get("dirty") is False, cache.get(UID,{}).get("dirty"))
    check("message de confirmation", "Séance enregistrée" in toast, toast)
    check("la séance apparaît dans le carnet", "Front headlock" in txt)
    check("aucune erreur de page", not errs, errs)
    print("# Membre de l'équipe (responsable)")
    w,toast,cache,errs,txt,_=run(pw,"coach")
    paths=[x["path"] for x in w]
    check("documents envoyés : entraînement perso + fil (sans activité), comme l'ancienne application", paths==[f"data/users/{UID}/training", f"feed/{UID}"], paths)
    fd=next((x["data"] for x in w if x["path"].startswith("feed/")),{})
    check("fil d'un membre de l'équipe : aucune activité publiée", fd.get("on") is False and fd.get("ev")==[] and fd.get("belt") is None, fd)
    tr=w[0]["data"] if w else {}
    check("entraînement perso : ancienne + nouvelle séance", len(tr.get("sessions",[]))==2, len(tr.get("sessions",[])))
    check("aucune fiche élève créée pour un membre de l'équipe", not any(p.startswith("members/") for p in paths))
    check("cache équipe sous la clé <uid>:coach", (UID+":coach") in cache and cache[UID+":coach"]["dirty"] is False, list(cache))
    print("# Hors ligne (envoi impossible)")
    w,toast,cache,errs,txt,back=run(pw,"student",offline=True)
    check("aucun document envoyé", len(w)==0, w)
    check("message : enregistrée sur ce téléphone", "sur ce téléphone" in toast, toast)
    check("saisie gardée sur le téléphone (dirty = true)", cache.get(UID,{}).get("dirty") is True and any(s.get("theme")=="Front headlock" for s in cache[UID]["state"]["sessions"]))
    print("# Retour du réseau")
    check("envoi automatique au retour du réseau (fiche + privé)", f"members/{UID}" in back["writes"] and f"data/users/{UID}/private" in back["writes"], back["writes"])
    check("la séance hors ligne est bien sur le serveur", any(x.get("theme")=="Front headlock" for x in back["member"].get("sessions",[])))
    check("cache du téléphone de nouveau synchronisé", back["cache"].get(UID,{}).get("dirty") is False)
    check("message de synchronisation", "synchronisées" in back["toast"], back["toast"])
ok=sum(1 for _,c in results if c); print(f"\n{ok}/{len(results)} vérifications réussies")
json.dump([{"test":l,"ok":c} for l,c in results], open("tests/journal_e2e_results.json","w"), ensure_ascii=False, indent=1)
sys.exit(0 if ok==len(results) else 1)
