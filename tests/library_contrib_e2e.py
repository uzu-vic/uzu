# Bibliothèque technique (lot C) — contributions et gestion du club, base simulée.
# Lancer après un build simulé et : npx next start -p 3100
import json, time, base64, urllib.parse as up
from datetime import date, timedelta
from playwright.sync_api import sync_playwright
REF="abcdefghijkltest"; UID="00000000-0000-0000-0000-0000000000b1"
CAT=json.load(open("db/bibliotheque/catalogue.json"))
def jwt(email):
    e=lambda o: base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
    return e({"alg":"HS256","typ":"JWT"})+"."+e({"sub":UID,"exp":int(time.time())+3600,"role":"authenticated","email":email})+".sig"
def sess(email,name): return {"access_token":jwt(email),"token_type":"bearer","expires_in":3600,"expires_at":int(time.time())+3600,"refresh_token":"r","user":{"id":UID,"aud":"authenticated","role":"authenticated","email":email,"user_metadata":{"name":name},"app_metadata":{}}}
T=date.today(); d=lambda n: (T-timedelta(days=n)).isoformat()
CLUB={"id":"c1","name":"AG Academie","schedule":[],"tactical_focus":{},"profile":{}}
def ctx(role):
    return {"role":"student" if role=="student" else "coach","share_activity":False,"academy_role":role,"member_status":"active","member_id":"m1","section_id":None,"perms":None,
            "memberships":[{"academy_id":"c1","name":CLUB["name"],"role":role,"status":"active"}],"club":CLUB}
TABLES={
 "lib_disciplines":[dict(id=x["id"],label=x["label"],long_label=x["long"],position=x["pos"]) for x in CAT["disciplines"] if x["active"]],
 "lib_categories":[dict(id=c["id"],discipline_id=c["discipline"],position=c["pos"],label=c["label"]) for c in CAT["categories"]],
 "lib_techniques":[dict(id=t["id"],discipline_id=t["discipline"],category_id=t["category"],position=t["pos"],name=t["name"],aliases=t["aliases"],source_text=t["source_text"],proposed_text=t["proposed_text"],origin=t["origin"],level=t["level"],validation_status="a_valider",validation_refs=t["validation_refs"],restricted=t["restricted"],uzu_links=t["links"]) for t in CAT["techniques"] if t["origin"]=="document"],
 "lib_flows":[dict(id=f["id"],discipline_id=f["discipline"],position=f["pos"],title=f["title"],intro=f["intro"]) for f in CAT["flows"]],
 "lib_flow_steps":[dict(id=s["id"],flow_id=s["flow"],position=s["pos"],parent_id=s["parent"],kind=s["kind"],branch_label=s["branch"],label=s["text"],origin=s["origin"]) for s in CAT["steps"] if s["origin"]=="document"],
 "lib_flow_step_techniques":[dict(step_id=s["id"],technique_id=x["t"],position=i+1,origin=x["o"]) for s in CAT["steps"] if s["origin"]=="document" for i,x in enumerate(s["techs"]) if x["o"]=="document"],
}
class Mock:
    def __init__(s, role, can_review=False, can_manage=False, can_configure=False):
        s.role=role; s.calls=[]
        s.libctx={"academy":"c1","disciplines":["jjb_gi","grappling_nogi"],"configured":False,"can_review":can_review,"can_manage":can_manage,"can_configure":can_configure,"hidden":[],"pending":1 if can_review else 0}
        s.mine=[{"id":"m1","kind":"variante","technique_id":"G18","discipline_id":"jjb_gi","title":"Knee Cut avec underhook","body":"Ancien texte","url":None,"status":"a_completer","published_at":None,"review_note":"Précise la position de la tête","updated_at":d(1)+"T10:00:00Z","rights_declared_at":None},
                {"id":"m2","kind":"question","technique_id":None,"discipline_id":"grappling_nogi","title":"Question en attente","body":"","url":None,"status":"en_attente","published_at":None,"review_note":"","updated_at":d(2)+"T10:00:00Z","rights_declared_at":None}]
        s.queue=[{"id":"q1","kind":"lien","technique_id":"N27","discipline_id":"grappling_nogi","title":"RNC vue de face","body":"Vidéo du cours de mardi","url":"https://youtu.be/xyz","rights_declared_at":d(1)+"T09:00:00Z","submitted_at":d(1)+"T09:00:00Z","author_name":"Yanis B.","author_role":"student","status":"en_attente","published_at":None}]
        s.collections=[]; s.collitems=[]; s.details=None
    def handle(s, route):
        r=route.request; u=r.url; body=r.post_data_json if r.method=="POST" and r.post_data else None
        J=lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if "/rpc/" in u:
            name=u.split("/rpc/")[1].split("?")[0]; s.calls.append((name, body))
            if name=="get_my_context": return J(ctx(s.role))
            if name=="library_context": return J(s.libctx)
            if name=="library_save_item":
                st="brouillon" if not body["p_submit"] else ("publie" if s.libctx["can_review"] else "en_attente")
                return J({"id":body["p_id"] or "new1","status":st})
            if name=="library_review_queue": return J(s.queue)
            if name=="library_review_item":
                s.queue=[q for q in s.queue if q["id"]!=body["p_id"]]
                return J({"publier":"publie","refuser":"refuse","preciser":"a_completer"}[body["p_decision"]])
            if name=="library_save_collection":
                s.collections=[{"id":"col1","name":body["p_name"],"description":body["p_description"],"position":1}]
                s.collitems=[{"collection_id":"col1","position":i+1,"technique_id":x["t"],"item_id":None} for i,x in enumerate(body["p_items"])]
                return J("col1")
            if name=="library_set_hidden":
                h=set(s.libctx["hidden"]); (h.add if body["p_hidden"] else h.discard)(body["p_technique"]); s.libctx["hidden"]=sorted(h); return J(body["p_hidden"])
            if name=="library_set_disciplines": s.libctx["disciplines"]=body["p_disciplines"]; return J(body["p_disciplines"])
            if name=="library_archive_item": return J(True)
            if name=="library_set_details": s.details={"technique_id":body["p_technique"],"steps":body["p_steps"],"vigilance":body["p_vigilance"],"level":body["p_level"]}; return J(True)
            return J(None)
        for tb,rows in TABLES.items():
            if f"/rest/v1/{tb}?" in u: return J(rows)
        if "/rest/v1/club_lib_collections?" in u: return J(s.collections)
        if "/rest/v1/club_lib_technique_details?" in u: return J([s.details] if s.details else [])
        if "/rest/v1/club_lib_collection_items?" in u: return J(s.collitems)
        if "/rest/v1/club_lib_items?" in u:
            q=up.unquote(u)
            if "author_id=eq." in q: return J(s.mine)
            if "status=in." in q: return J([{"id":"p1","kind":"variante","technique_id":"G17","discipline_id":"jjb_gi","title":"Toreando du club","body":"","url":None,"status":"publie","published_at":d(3)+"T10:00:00Z","review_note":"","updated_at":d(3)+"T10:00:00Z"}])
            return J([])
        if "/rest/v1/docs" in u and r.method=="POST": return J([], 201)
        if "/rest/v1/docs" in u:
            path=up.parse_qs(up.urlparse(u).query).get("path",["eq."])[0][3:]
            data={"consent":{"at":"2026-01-01T00:00:00Z","share":True},"sessions":[]} if path==f"members/{UID}" else None
            if "vnd.pgrst.object" in r.headers.get("accept",""): return J({"path":path,"data":data}) if data else J({"code":"PGRST116","message":"0 rows"}, 406)
            return J([{"path":path,"data":data}] if data else [])
        return J([] if "/rest/v1/" in u else {})

R=[]
def check(label, ok, got=""):
    R.append(bool(ok)); print(("✔ " if ok else "✖ ")+label+("" if ok else " → "+str(got)[:300]))
def open_page(b, m, email, name, vp):
    c=b.new_context(viewport=vp); pg=c.new_page(); errs=[]
    pg.on("pageerror",lambda e: errs.append(str(e)[:300])); pg.on("dialog", lambda dlg: dlg.accept())
    pg.route(f"https://{REF}.supabase.co/**", m.handle)
    pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess(email,name)))});")
    pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2200)
    return c, pg, errs
def last(m, name): return [b for n,b in m.calls if n==name]

with sync_playwright() as p:
    b=p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------------- Élève (téléphone)
    m=Mock("student"); c,pg,errs=open_page(b,m,"eleve@test.fr","Yanis Bernard",{"width":390,"height":844})
    pg.locator(".mobile-bottom-nav button", has_text="Techniques").click(); pg.wait_for_timeout(1800)
    pg.locator(".uzu-lib-volets button", has_text="Bibliothèque").click(); pg.wait_for_timeout(500)
    check("élève : boutons « Proposer un contenu » et « Mes contributions »", pg.get_by_role("button", name="Proposer un contenu").count()==1 and pg.get_by_role("button", name="Mes contributions").count()==1)
    pg.fill(".uzu-lib-search input","mata leao"); pg.wait_for_timeout(300); pg.locator(".uzu-lib-card").first.click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name="Proposer un lien vidéo").click(); pg.wait_for_timeout(500)
    f=pg.locator(".uzu-lib-form")
    check("fiche → proposer une vidéo : type « Vidéo ou lien » et fiche N27 préremplis", f.locator("input[type=radio]:checked").locator("xpath=..").inner_text().strip()=="Vidéo ou lien" and f.locator("select").first.input_value()=="N27")
    check("élève : pas de type « Annotation » (réservé à l'équipe)", "Annotation" not in f.inner_text())
    f.get_by_label("Titre").fill("RNC vu de face")
    f.locator("input[type=url]").fill("https://evil.example/x"); f.get_by_role("button", name="Envoyer pour validation").click(); pg.wait_for_timeout(400)
    check("lien hors YouTube/Instagram refusé avant envoi", "YouTube ou Instagram" in f.inner_text() and not last(m,"library_save_item"))
    f.locator("input[type=url]").fill("https://youtu.be/xyz"); f.get_by_role("button", name="Envoyer pour validation").click(); pg.wait_for_timeout(400)
    check("sans la déclaration d'accord : envoi bloqué", "accord" in f.locator("[role=alert]").inner_text() and not last(m,"library_save_item"))
    f.locator(".uzu-lib-consent input").check(); f.get_by_role("button", name="Envoyer pour validation").click(); pg.wait_for_timeout(1500)
    sv=last(m,"library_save_item")
    check("envoi : contribution transmise au serveur (type lien, N27, accord déclaré, envoi)", sv and sv[-1]["p_item"]["kind"]=="lien" and sv[-1]["p_item"]["technique_id"]=="N27" and sv[-1]["p_item"]["rights"] is True and sv[-1]["p_submit"] is True, sv)
    t=pg.inner_text(".page-content")
    check("après envoi : « Mes contributions » avec statuts En attente / À compléter et message du professeur", "Mes contributions" in t and "En attente" in t and "À compléter" in t and "Précise la position de la tête" in t, t[:400])
    pg.get_by_role("button", name="Compléter et renvoyer").click(); pg.wait_for_timeout(500)
    f=pg.locator(".uzu-lib-form")
    check("« Compléter et renvoyer » : formulaire prérempli avec le message du professeur", f.get_by_label("Titre").input_value()=="Knee Cut avec underhook" and "Précise la position de la tête" in f.inner_text())
    f.get_by_label("Explication").fill("Tête collée contre son épaule"); f.get_by_role("button", name="Envoyer pour validation").click(); pg.wait_for_timeout(1200)
    sv=last(m,"library_save_item")
    check("renvoi de la même contribution (même identifiant)", sv[-1]["p_id"]=="m1" and sv[-1]["p_submit"] is True and sv[-1]["p_item"]["body"]=="Tête collée contre son épaule", sv[-1])
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(400)
    if pg.locator(".uzu-lib-fiche .uzu-lib-back").count(): pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(400)
    pg.get_by_role("button", name="Proposer un contenu").click(); pg.wait_for_timeout(400)
    f=pg.locator(".uzu-lib-form"); f.get_by_text("Question", exact=True).click()
    check("question pédagogique : fiche facultative, discipline à choisir", "(facultatif)" in f.inner_text() and f.get_by_label("Discipline").count()==1)
    f.get_by_label("Titre").fill("Quand préférer le Knee Cut ?"); f.get_by_role("button", name="Enregistrer le brouillon").click(); pg.wait_for_timeout(1200)
    sv=last(m,"library_save_item")
    check("brouillon de question : sans fiche, avec discipline, non envoyé", sv[-1]["p_item"]["kind"]=="question" and sv[-1]["p_item"]["technique_id"] is None and sv[-1]["p_item"]["discipline_id"]=="jjb_gi" and sv[-1]["p_submit"] is False, sv[-1])
    pg.screenshot(path="/tmp/lib_mine_mob.png", full_page=True)
    check("élève : aucun accès à la validation", not last(m,"library_review_queue") and pg.locator(".space-picker").count()==0)
    check("élève : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Responsable (ordinateur) : espace club
    m=Mock("owner", True, True, True); c,pg,errs=open_page(b,m,"prof@test.fr","Paul Prof",{"width":1280,"height":900})
    pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1500)
    pg.locator(".primary-nav .nav-item", has_text="Contenus").first.click(); pg.wait_for_timeout(2000)
    sec=pg.locator("section", has=pg.locator("#club-lib-title"))
    check("Contenus : section Bibliothèque avec À valider (1), Contenus du club, Collections, Réglages", sec.count()==1 and all(x in sec.inner_text() for x in ["À valider (1)","Contenus du club","Collections","Réglages"]), sec.inner_text()[:300] if sec.count() else "")
    q=sec.locator(".uzu-lib-queue").first
    check("file : proposition, lien YouTube avec date d'accord, auteur et rôle", "RNC vue de face" in q.inner_text() and "Accord des personnes filmées déclaré" in q.inner_text() and "Yanis B. · élève" in q.inner_text(), q.inner_text())
    q.get_by_role("button", name="Refuser").click(); pg.wait_for_timeout(300)
    q.get_by_role("button", name="Confirmer le refus").click(); pg.wait_for_timeout(600)
    check("refus sans motif : bloqué avant envoi", not last(m,"library_review_item") and q.count()==1)
    q.get_by_label("Motif (obligatoire, envoyé à l'auteur)").fill("Vidéo floue, refais-la de face"); q.get_by_role("button", name="Confirmer le refus").click(); pg.wait_for_timeout(800)
    rv=last(m,"library_review_item")
    check("refus avec motif transmis", rv and rv[-1]["p_decision"]=="refuser" and rv[-1]["p_note"]=="Vidéo floue, refais-la de face", rv)
    m.queue=[{"id":"q2","kind":"variante","technique_id":"G18","discipline_id":"jjb_gi","title":"Variante à corriger","body":"texte","url":None,"rights_declared_at":None,"submitted_at":d(1)+"T09:00:00Z","author_name":"Inès","author_role":"student","status":"en_attente","published_at":None}]
    sec.get_by_role("button", name="Contenus du club").click(); pg.wait_for_timeout(500)
    check("contenus du club : publiés avec statut « Validée »", "Toreando du club" in sec.inner_text() and "Validée" in sec.inner_text())
    sec.get_by_role("button", name="À valider").click(); pg.wait_for_timeout(800)
    q=sec.locator(".uzu-lib-queue").first
    q.get_by_role("button", name="Corriger avant de publier").click(); pg.wait_for_timeout(300)
    q.get_by_label("Titre corrigé").fill("Variante corrigée"); q.get_by_role("button", name="Publier la version corrigée").click(); pg.wait_for_timeout(800)
    rv=last(m,"library_review_item")
    check("correction avant publication : décision « publier » avec titre corrigé", rv[-1]["p_decision"]=="publier" and rv[-1]["p_patch"]["title"]=="Variante corrigée", rv[-1])
    check("file vide après décision", "Aucune proposition en attente" in sec.inner_text())
    sec.get_by_role("button", name="Collections").click(); pg.wait_for_timeout(300)
    sec.get_by_role("button", name="Nouvelle collection").click(); pg.wait_for_timeout(300)
    sec.get_by_label("Nom").fill("Programme ceinture bleue")
    sec.get_by_placeholder("Chercher une fiche").fill("G04"); pg.wait_for_timeout(200); sec.locator(".uzu-lib-picks input").first.check()
    sec.get_by_placeholder("Chercher une fiche").fill("G17"); pg.wait_for_timeout(200); sec.locator(".uzu-lib-picks input").first.check()
    sec.get_by_role("button", name="Enregistrer la collection").click(); pg.wait_for_timeout(1500)
    sc=last(m,"library_save_collection")
    check("collection enregistrée dans l'ordre choisi (G04 puis G17)", sc and sc[-1]["p_name"]=="Programme ceinture bleue" and sc[-1]["p_items"]==[{"t":"G04"},{"t":"G17"}], sc)
    sec=pg.locator("section", has=pg.locator("#club-lib-title"))
    sec.get_by_role("button", name="Réglages").click(); pg.wait_for_timeout(300)
    sec.get_by_placeholder("Chercher une fiche").fill("N28"); pg.wait_for_timeout(400)
    sec.locator(".uzu-lib-picks input").first.click(); pg.wait_for_timeout(1200)
    sh=last(m,"library_set_hidden")
    check("réglages : masquer N28 pour le club", sh and sh[-1]=={"p_technique":"N28","p_hidden":True}, sh)
    sec=pg.locator("section", has=pg.locator("#club-lib-title"))
    sec.get_by_role("button", name="Réglages").click(); pg.wait_for_timeout(300)
    boxes=sec.locator(".uzu-lib-kinds input[type=checkbox]")
    boxes.nth(0).uncheck(); boxes.nth(1).uncheck(); pg.wait_for_timeout(200)
    check("réglages : impossible de fermer toutes les disciplines", sec.locator(".uzu-lib-kinds button").is_disabled())
    boxes.nth(1).check(); sec.locator(".uzu-lib-kinds button").click(); pg.wait_for_timeout(1200)
    check("réglages : seul le Grappling No-Gi ouvert", last(m,"library_set_disciplines")[-1]=={"p_disciplines":["grappling_nogi"]})
    pg.screenshot(path="/tmp/lib_club_desk.png", full_page=True)
    # D3 : le responsable complète les repères pédagogiques d'une fiche (pour son club)
    pg.locator(".space-option", has_text="Athlete").click(); pg.wait_for_timeout(1200)
    pg.locator(".primary-nav .nav-item", has_text="Techniques").first.click(); pg.wait_for_timeout(1500)
    pg.locator(".uzu-lib-volets button", has_text="Bibliothèque").click(); pg.wait_for_timeout(400)
    pg.fill(".uzu-lib-search input","knee cut"); pg.wait_for_timeout(300); pg.locator(".uzu-lib-card", has_text="Knee Cut Pass").first.click(); pg.wait_for_timeout(500)
    f=pg.locator(".uzu-lib-fiche")
    check("D3 : fiche vide « pas encore renseignés », bouton « Compléter la fiche » pour le responsable", "pas encore renseignés" in f.inner_text() and f.get_by_role("button", name="Compléter la fiche").count()==1)
    f.get_by_role("button", name="Compléter la fiche").click(); pg.wait_for_timeout(300)
    f.get_by_label("Étapes pédagogiques").fill("1. Saisir le col\n2. Couper le genou"); f.get_by_label("Points de vigilance").fill("Garder la tête haute"); f.get_by_label("Niveau").select_option("2")
    f.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(1000)
    sd=last(m,"library_set_details")
    check("D3 : repères enregistrés pour le club (fiche, étapes, vigilance, niveau)", sd and sd[-1]["p_technique"] in ("G18","N18") and sd[-1]["p_level"]==2 and "Couper le genou" in sd[-1]["p_steps"], sd)
    check("D3 : repères affichés dans la fiche", "Repères du club" in f.inner_text() and "Garder la tête haute" in f.inner_text() and "Niveau ★★" in f.inner_text(), f.inner_text()[:400])
    check("responsable : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Prof sans droit bibliothèque : pas de section
    m=Mock("instructor"); c,pg,errs=open_page(b,m,"prof2@test.fr","Prof Deux",{"width":1280,"height":900})
    if pg.locator(".space-option", has_text="Club").count():
        pg.locator(".space-option", has_text="Club").click(); pg.wait_for_timeout(1200)
        if pg.locator(".primary-nav .nav-item", has_text="Contenus").count():
            pg.locator(".primary-nav .nav-item", has_text="Contenus").first.click(); pg.wait_for_timeout(1500)
    check("prof sans droit : pas de section Bibliothèque côté club", pg.locator("#club-lib-title").count()==0 and not last(m,"library_review_queue"))
    c.close(); b.close()
print(f"\n{sum(R)}/{len(R)} vérifications réussies")
