# Bibliothèque — vidéos pédagogiques des fiches et des enchaînements (uzu-9b), sur base simulée.
# Lancer après : NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijkltest.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_mocktest npx next build && npx next start -p 3100
# Ordinateur (1280 px) et téléphone (390 px) ; élève (lecture seule) puis professeur autorisé (ajout, titre, ordre, remplacement, suppression).
import json, re, time, base64, shutil, urllib.parse as up
from playwright.sync_api import sync_playwright
REF = "abcdefghijkltest"; UID = "00000000-0000-0000-0000-0000000000b1"
CAT = json.load(open("db/bibliotheque/catalogue.json"))
FX = "tests/fixtures/class-media/"
MP4 = open(FX + "h264_control.mp4", "rb").read(); JPG = open(FX + "clean.jpg", "rb").read()
shutil.copy(FX + "clean.jpg", "/tmp/pas-une-video.mp4")
def jwt():
    h = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).decode().rstrip("=")
    p = base64.urlsafe_b64encode(json.dumps({"sub": UID, "exp": int(time.time()) + 3600, "role": "authenticated", "email": "prof@test.fr"}).encode()).decode().rstrip("=")
    return h + "." + p + ".sig"
sess = {"access_token": jwt(), "token_type": "bearer", "expires_in": 3600, "expires_at": int(time.time()) + 3600, "refresh_token": "r", "user": {"id": UID, "aud": "authenticated", "role": "authenticated", "email": "prof@test.fr", "user_metadata": {"name": "Yanis Bernard"}, "app_metadata": {}}}
CTX = {"role": "student", "share_activity": False, "academy_role": "student", "member_status": "active", "member_id": "m1", "section_id": None, "perms": None, "memberships": [{"academy_id": "c1", "name": "AG Academie", "role": "student", "status": "active"}],
       "club": {"id": "c1", "name": "AG Academie", "schedule": [], "tactical_focus": {}, "profile": {}}}
DOCS = {f"members/{UID}": {"consent": {"at": "2026-01-01T00:00:00Z", "share": True}, "sessions": [], "skills": {}, "belt": {"rank": "bleue"}}, f"grades/{UID}": {"rank": "bleue", "stripes": 1, "since": "2026-03-01"}}
TECH = [dict(id=t["id"], discipline_id=t["discipline"], category_id=t["category"], position=t["pos"], name=t["name"], aliases=t["aliases"], source_text=t["source_text"], proposed_text=t["proposed_text"], origin=t["origin"], level=t["level"], validation_status="a_valider", validation_refs=t["validation_refs"], restricted=t["restricted"], uzu_links=t["links"]) for t in CAT["techniques"] if t["origin"] == "document"]
TABLES = {
 "lib_disciplines": [dict(id=x["id"], label=x["label"], long_label=x["long"], position=x["pos"]) for x in CAT["disciplines"] if x["active"]],
 "lib_categories": [dict(id=c["id"], discipline_id=c["discipline"], position=c["pos"], label=c["label"]) for c in CAT["categories"]],
 "lib_techniques": TECH,
 "lib_flows": [dict(id=f["id"], discipline_id=f["discipline"], position=f["pos"], title=f["title"], intro=f["intro"]) for f in CAT["flows"]],
 "lib_flow_steps": [dict(id=s["id"], flow_id=s["flow"], position=s["pos"], parent_id=s["parent"], kind=s["kind"], branch_label=s["branch"], label=s["text"], origin=s["origin"]) for s in CAT["steps"] if s["origin"] == "document"],
 "lib_flow_step_techniques": [dict(step_id=s["id"], technique_id=x["t"], position=i + 1, origin=x["o"]) for s in CAT["steps"] if s["origin"] == "document" for i, x in enumerate(s["techs"]) if x["o"] == "document"],
 "club_lib_items": [],
}
def V(id, tk, tid, title, pos, poster=True):
    return {"id": id, "target_kind": tk, "technique_id": tid if tk == "technique" else None, "flow_id": tid if tk == "flow" else None, "title": title,
            "path": f"c1/lib/{id}.mp4", "poster_path": f"c1/lib/{id}.jpg" if poster else None, "mime": "video/mp4", "size_bytes": len(MP4), "duration_s": 6.0, "width": 640, "height": 360, "position": pos}

class Mock:
    def __init__(s, can):
        s.can = can; s.n = 0
        s.vids = [V("v1", "technique", "G17", "Démonstration de face", 1), V("v2", "technique", "G17", "", 2, poster=False), V("f1", "flow", "FC1", "Le système complet", 1)]
        s.rpc = []; s.uploads = {}; s.deleted = []; s.signs = []; s.other = []
    def handle(s, route):
        r = route.request; u = r.url
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", body=json.dumps(o))
        if "class-media" in u: s.other.append(u); return J({"error": "interdit"}, 400)
        if "/storage/v1/object/sign/videos/" in u:
            p = up.unquote(u.split("/storage/v1/object/sign/videos/")[1].split("?")[0])
            if r.method == "POST": s.signs.append(p); return J({"signedURL": f"/object/sign/videos/{p}?token=tok"})
            data, ct = (JPG, "image/jpeg") if p.endswith(".jpg") else (MP4, "video/mp4")
            if p in s.uploads and s.uploads[p].get("body"): data, ct = s.uploads[p]["body"], s.uploads[p]["ctype"]
            rg = re.match(r"bytes=(\d+)-(\d*)", r.headers.get("range", "") or "bytes=0-"); a = int(rg.group(1)); e = min(int(rg.group(2) or len(data) - 1), len(data) - 1)
            return route.fulfill(status=206, headers={"Content-Type": ct, "Content-Range": f"bytes {a}-{e}/{len(data)}", "Accept-Ranges": "bytes"}, body=data[a:e + 1])
        if "/storage/v1/object/videos" in u:
            if r.method == "DELETE": s.deleted += json.loads(r.post_data or "{}").get("prefixes", []); return J([])
            if r.method == "POST":
                p = up.unquote(u.split("/storage/v1/object/videos/")[1].split("?")[0]); ct = r.headers.get("content-type", "")
                raw = r.post_data_buffer or b""; body, ftype = raw, ct
                if ct.startswith("multipart/form-data"):
                    bd = ("--" + ct.split("boundary=")[1]).encode()
                    for part in raw.split(bd):
                        if b"\r\n\r\n" not in part: continue
                        hd, val = part.split(b"\r\n\r\n", 1); val = val[:-2] if val.endswith(b"\r\n") else val
                        if b"filename" in hd or b'name=""' in hd: body = val; ftype = (re.search(rb"Content-Type: ([^\r]+)", hd) or [None, b""])[1].decode()
                s.uploads[p] = {"ctype": ftype, "size": len(body), "body": body}
                return J({"Key": "videos/" + p, "Id": "o" + p})
            s.other.append(u); return J({"error": "inattendu"}, 400)
        if "/rpc/" in u:
            fn = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}"); s.rpc.append((fn, a))
            if fn == "get_my_context": return J(CTX)
            if fn == "library_context": return J({"academy": "c1", "disciplines": ["jjb_gi", "grappling_nogi"], "configured": False, "can_review": s.can, "can_manage": False, "can_configure": False, "hidden": [], "pending": 0})
            if fn == "library_video_reserve":
                if not s.can: return J({"code": "P0001", "message": "Action non autorisée"}, 400)
                s.n += 1; i = f"n{s.n}"; ext = ".webm" if a["p_mime"] == "video/webm" else ".mp4"
                s.pending = getattr(s, "pending", {}); s.pending[i] = a
                return J({"id": i, "bucket": "videos", "path": f"c1/lib/{i}{ext}", "poster_path": f"c1/lib/{i}.jpg"})
            if fn == "library_video_confirm":
                i = a["p_id"]; res = s.pending[i]; ext = ".webm" if res["p_mime"] == "video/webm" else ".mp4"
                if f"c1/lib/{i}{ext}" not in s.uploads: return J({"ok": False, "msg": "Fichier non reçu : relance l'envoi", "cleanup": []})
                old = next((v for v in s.vids if v["id"] == res.get("p_replaces")), None); clean = []
                tgt = [v for v in s.vids if v["target_kind"] == res["p_target_kind"] and (v["technique_id"] or v["flow_id"]) == res["p_target"]]
                nv = V(i, res["p_target_kind"], res["p_target"], res["p_title"] or (old["title"] if old else ""), old["position"] if old else max([v["position"] for v in tgt] or [0]) + 1,
                       poster=f"c1/lib/{i}.jpg" in s.uploads)
                nv.update(path=f"c1/lib/{i}{ext}", mime=res["p_mime"], duration_s=a["p_duration"], width=a["p_width"], height=a["p_height"])
                if old: s.vids.remove(old); clean = [old["path"]] + ([old["poster_path"]] if old["poster_path"] else [])
                s.vids.append(nv); return J({"ok": True, "id": i, "cleanup": clean})
            if fn == "library_video_remove":
                v = next(v for v in s.vids if v["id"] == a["p_id"]); s.vids.remove(v); return J({"ok": True, "cleanup": [v["path"]] + ([v["poster_path"]] if v["poster_path"] else [])})
            if fn == "library_video_update":
                v = next(v for v in s.vids if v["id"] == a["p_id"])
                if a.get("p_title") is not None: v["title"] = a["p_title"]
                if a.get("p_move"):
                    L = sorted([x for x in s.vids if x["target_kind"] == v["target_kind"] and (x["technique_id"] or x["flow_id"]) == (v["technique_id"] or v["flow_id"])], key=lambda x: x["position"])
                    k = L.index(v); j = k + a["p_move"]
                    if 0 <= j < len(L): L[k]["position"], L[j]["position"] = L[j]["position"], L[k]["position"]
                return J(True)
            return J({} if fn != "get_my_context" else CTX)
        if "/rest/v1/club_lib_videos?" in u:
            q = up.parse_qs(up.urlparse(u).query); L = list(s.vids)
            if "technique_id" in q: L = [v for v in L if v["technique_id"] == q["technique_id"][0][3:]]
            if "flow_id" in q: L = [v for v in L if v["flow_id"] == q["flow_id"][0][3:]]
            return J(sorted(L, key=lambda v: v["position"]))
        for tb, rows in TABLES.items():
            if f"/rest/v1/{tb}?" in u: return J(rows)
        if "/rest/v1/docs" in u and r.method == "POST": return route.fulfill(status=201, content_type="application/json", body="[]")
        if "/rest/v1/docs" in u:
            q = up.parse_qs(up.urlparse(u).query); path = q.get("path", ["eq."])[0][3:]; data = DOCS.get(path)
            if "vnd.pgrst.object" in r.headers.get("accept", ""):
                return route.fulfill(status=200 if data is not None else 406, content_type="application/json", body=json.dumps({"path": path, "data": data} if data is not None else {"code": "PGRST116", "message": "0 rows"}))
            return J([{"path": path, "data": data}] if data is not None else [])
        return route.fulfill(status=200, content_type="application/json", body="[]" if "/rest/v1/" in u else "{}")

R = []
def check(label, ok, got=""):
    R.append(bool(ok)); print(("✔ " if ok else "✖ ") + label + ("" if ok else " → " + str(got)[:300]))
def open_fiche(pg, name, cat, card):
    (pg.locator(".nav-item", has_text="Techniques").click() if name == "desk" else pg.locator(".mobile-bottom-nav button", has_text="Techniques").click()); pg.wait_for_timeout(1800)
    pg.locator(".uzu-lib-volets button", has_text="Bibliothèque").click(); pg.wait_for_timeout(500)
    pg.get_by_role("button", name=cat).click(); pg.wait_for_timeout(300)
    pg.locator(".uzu-lib-card", has_text=card).first.click(); pg.wait_for_timeout(900)
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    for name, vp in [("mob", {"width": 390, "height": 844}), ("desk", {"width": 1280, "height": 900})]:
        # ------------------------------------------------------------ élève : lecture seule
        m = Mock(False); c = b.new_context(viewport=vp, has_touch=name == "mob", is_mobile=name == "mob"); pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.route(f"https://{REF}.supabase.co/**", m.handle)
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess))});")
        pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2000)
        (pg.locator(".nav-item", has_text="Techniques").click() if name == "desk" else pg.locator(".mobile-bottom-nav button", has_text="Techniques").click()); pg.wait_for_timeout(1800)
        pg.locator(".uzu-lib-volets button", has_text="Bibliothèque").click(); pg.wait_for_timeout(500)
        pg.get_by_role("button", name="Passages de garde").click(); pg.wait_for_timeout(300)
        tor = pg.locator(".uzu-lib-card", has_text="Torreando Pass").first
        check(f"[{name}] liste : la fiche Torreando signale « 2 vidéos »", "2 vidéos" in tor.inner_text(), tor.inner_text())
        pg.get_by_role("button", name="Avec vidéo").click(); pg.wait_for_timeout(300)
        ct = " | ".join(pg.locator(".uzu-lib-card").all_inner_texts())
        check(f"[{name}] filtre « Avec vidéo » : retient les fiches avec vidéos importées", "Torreando Pass" in ct, ct[:200])
        pg.get_by_role("button", name="Avec vidéo").click(); pg.wait_for_timeout(200)
        tor.click(); pg.wait_for_timeout(1200)
        f = pg.locator(".uzu-lib-fiche"); sec = f.locator(".uzu-lib-vids")
        check(f"[{name}] élève : section « Vidéos pédagogiques » avec 2 vidéos, dans l'ordre", sec.count() == 1 and sec.locator(".uzu-lib-vcard").count() == 2 and "Démonstration de face" in sec.locator(".uzu-lib-vcard").first.inner_text(), sec.all_inner_texts())
        check(f"[{name}] miniature affichée (lien signé du stockage pédagogique), durée 0:06, vidéo sans titre nommée « Vidéo 2 »",
              sec.locator(".uzu-lib-vcard").first.locator("img").count() == 1 and "0:06" in sec.inner_text() and "Vidéo 2" in sec.inner_text() and "c1/lib/v1.jpg" in m.signs, (m.signs, sec.inner_text()))
        check(f"[{name}] élève : aucun bouton d'ajout, de remplacement ni de suppression", sec.get_by_role("button", name="Ajouter une vidéo").count() == 0 and sec.locator(".uzu-lib-vtools").count() == 0)
        check(f"[{name}] aucun fichier vidéo chargé avant d'appuyer sur lecture", "c1/lib/v1.mp4" not in m.signs and f.locator("video").count() == 0)
        sec.get_by_role("button", name="Lire la vidéo « Démonstration de face »").click(); pg.wait_for_timeout(2500)
        vd = sec.locator("video").first
        st = vd.evaluate("v => ({w: v.videoWidth, rs: v.readyState, inl: v.hasAttribute('playsinline'), ctl: v.controls, src: v.currentSrc})") if vd.count() else {}
        check(f"[{name}] lecture dans la fiche : lecteur avec commandes, lecture intégrée au téléphone (playsinline), image décodée", st.get("w") == 640 and st.get("rs", 0) >= 1 and st.get("inl") and st.get("ctl") and "/storage/v1/object/sign/videos/c1/lib/v1.mp4" in st.get("src", ""), st)
        box = pg.locator(".uzu-lib-vframe").first.bounding_box(); ow = pg.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        check(f"[{name}] lecteur adapté à l'écran (largeur ≤ écran, aucun défilement horizontal)", box and box["width"] <= vp["width"] and ow, (box, ow))
        if name == "mob": pg.screenshot(path="/tmp/libvid_eleve_mob.png", full_page=True)
        pg.locator(".uzu-lib-back").click(); pg.wait_for_timeout(300)
        pg.get_by_role("button", name="Passages de garde").click(); pg.wait_for_timeout(200)
        pg.locator(".uzu-lib-card", has_text="Knee Cut Pass").first.click(); pg.wait_for_timeout(700)
        check(f"[{name}] élève, fiche sans vidéo : pas de section vide", pg.locator(".uzu-lib-vids").count() == 0)
        pg.locator(".uzu-lib-back").click(); pg.wait_for_timeout(300)
        pg.locator(".uzu-lib-volets button", has_text="Enchaînements").click(); pg.wait_for_timeout(500)
        pg.locator(".uzu-lib-flowpick button", has_text="FC1").click(); pg.wait_for_timeout(700)
        fs = pg.locator(".uzu-lib-vids")
        check(f"[{name}] enchaînement FC1 : vidéo de la séquence complète, avant les étapes", fs.count() == 1 and "Le système complet" in fs.inner_text() and pg.locator(".uzu-lib-steps").count() == 1, fs.all_inner_texts())
        check(f"[{name}] élève : aucune requête vers Class Media, aucune erreur", not m.other and not errs, (m.other, errs))
        c.close()
        # ------------------------------------------------------------ professeur autorisé
        m = Mock(True); c = b.new_context(viewport=vp, has_touch=name == "mob", is_mobile=name == "mob"); pg = c.new_page(); errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:300]))
        pg.route(f"https://{REF}.supabase.co/**", m.handle)
        pg.add_init_script(f"localStorage.setItem('sb-{REF}-auth-token', {json.dumps(json.dumps(sess))});")
        pg.goto("http://127.0.0.1:3100/"); pg.wait_for_timeout(2000)
        open_fiche(pg, name, "Passages de garde", "Torreando Pass")
        sec = pg.locator(".uzu-lib-vids")
        check(f"[{name}] professeur : outils Monter, Descendre, Renommer, Remplacer, Supprimer ; bouton Ajouter", sec.locator(".uzu-lib-vtools").count() == 2 and sec.get_by_role("button", name="Ajouter une vidéo").count() == 1)
        sec.get_by_role("button", name="Ajouter une vidéo").click(); pg.wait_for_timeout(300)
        fm = sec.locator(".uzu-lib-vform")
        fm.locator("input[type=file]").set_input_files("/tmp/pas-une-video.mp4"); fm.locator("input[type=checkbox]").check()
        fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(800)
        check(f"[{name}] fichier qui n'est pas une vidéo (image renommée .mp4) : refusé avant tout envoi", "Format non accepté" in fm.inner_text() and not [x for x in m.rpc if x[0] == "library_video_reserve"], fm.inner_text())
        fm.locator("input[type=file]").set_input_files(FX + "hevc10_hdr_iphone_like.mov"); fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(1000)
        check(f"[{name}] vidéo HDR 10 bits (iPhone) : refusée avec explication, rien d'envoyé", "HDR" in fm.inner_text() and not m.uploads, fm.inner_text())
        fm.locator("input[type=file]").set_input_files(FX + "h264_control.mp4"); fm.locator("input[type=checkbox]").uncheck()
        fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(400)
        check(f"[{name}] sans la déclaration d'accord : envoi bloqué", "accord" in fm.inner_text() and not m.uploads)
        fm.locator("input[type=checkbox]").check(); fm.locator("input[maxlength='120']").fill("Vue de dos")
        fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(4000)
        res = [a for f_, a in m.rpc if f_ == "library_video_reserve"]
        up1 = m.uploads.get("c1/lib/n1.mp4", {}); upp = m.uploads.get("c1/lib/n1.jpg", {})
        check(f"[{name}] ajout : réservation (fiche G17, MP4, titre, accord), envoi dans le stockage pédagogique « videos », jamais Class Media",
              res and res[-1]["p_target"] == "G17" and res[-1]["p_target_kind"] == "technique" and res[-1]["p_mime"] == "video/mp4" and res[-1]["p_rights"] is True and up1.get("ctype") == "video/mp4" and not m.other, (res, m.uploads, m.other))
        conf = [a for f_, a in m.rpc if f_ == "library_video_confirm"]
        lum = 0
        if upp.get("body"):
            from PIL import Image; import io; im = Image.open(io.BytesIO(upp["body"])).convert("L"); lum = sum(im.getdata()) / (im.width * im.height)
        check(f"[{name}] miniature JPEG calculée sur l'appareil (vraie image de la vidéo, {upp.get('size', 0)} octets, luminosité {lum:.0f}) ; durée et dimensions transmises", upp.get("ctype") == "image/jpeg" and lum > 60 and conf and abs((conf[-1]["p_duration"] or 0) - 6) < 0.5 and conf[-1]["p_width"] == 640, (upp, conf))
        cards = sec.locator(".uzu-lib-vcard")
        check(f"[{name}] la nouvelle vidéo apparaît en 3e position avec sa miniature, message de confirmation", cards.count() == 3 and "Vue de dos" in cards.nth(2).inner_text() and cards.nth(2).locator("img").count() == 1 and "Vidéo ajoutée" in sec.inner_text(), sec.inner_text()[:300])
        # Renommer
        cards.nth(1).get_by_role("button", name="Renommer").click(); cards.nth(1).locator("input").fill("Saisie des genoux"); cards.nth(1).get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(800)
        check(f"[{name}] renommer : titre enregistré", "Saisie des genoux" in sec.locator(".uzu-lib-vcard").nth(1).inner_text() and ("library_video_update", {"p_id": "v2", "p_title": "Saisie des genoux", "p_move": 0}) in m.rpc)
        # Monter
        sec.get_by_role("button", name="Monter « Vue de dos »").click(); pg.wait_for_timeout(800)
        tt = [x.split("\n")[0] for x in sec.locator(".uzu-lib-vmeta b").all_inner_texts()]
        check(f"[{name}] monter « Vue de dos » d'un cran", tt == ["Démonstration de face", "Vue de dos", "Saisie des genoux"], tt)
        # Remplacer
        sec.locator(".uzu-lib-vcard").first.get_by_role("button", name="Remplacer").click(); pg.wait_for_timeout(300)
        fm = sec.locator(".uzu-lib-vform")
        check(f"[{name}] remplacer : formulaire dédié", "Remplacer « Démonstration de face »" in fm.inner_text())
        fm.locator("input[type=file]").set_input_files(FX + "clip.webm"); fm.locator("input[type=checkbox]").check()
        fm.get_by_role("button", name="Remplacer la vidéo").click(); pg.wait_for_timeout(4000)
        res = [a for f_, a in m.rpc if f_ == "library_video_reserve"][-1]
        tt = [x for x in sec.locator(".uzu-lib-vmeta b").all_inner_texts()]
        check(f"[{name}] remplacement (WebM) : même place, titre conservé, ancienne vidéo et miniature effacées du stockage",
              res["p_replaces"] == "v1" and res["p_mime"] == "video/webm" and tt[0] == "Démonstration de face" and sec.locator(".uzu-lib-vcard").count() == 3 and "c1/lib/v1.mp4" in m.deleted and "c1/lib/v1.jpg" in m.deleted and "Vidéo remplacée" in sec.inner_text(), (res, tt, m.deleted))
        # Supprimer
        c3 = sec.locator(".uzu-lib-vcard").nth(2); c3.get_by_role("button", name="Supprimer").click(); pg.wait_for_timeout(200)
        check(f"[{name}] supprimer : confirmation demandée", c3.get_by_role("button", name="Confirmer la suppression").count() == 1)
        c3.get_by_role("button", name="Confirmer la suppression").click(); pg.wait_for_timeout(900)
        check(f"[{name}] suppression : la vidéo disparaît, son fichier est effacé du stockage", sec.locator(".uzu-lib-vcard").count() == 2 and "c1/lib/v2.mp4" in m.deleted and "Saisie des genoux" not in sec.inner_text(), (m.deleted, sec.inner_text()[:200]))
        # Vidéo HEVC (iPhone « Haute efficacité ») acceptée avec avertissement
        sec.get_by_role("button", name="Ajouter une vidéo").click(); pg.wait_for_timeout(200)
        fm = sec.locator(".uzu-lib-vform"); fm.locator("input[type=file]").set_input_files(FX + "hevc_iphone_like.mov"); fm.locator("input[type=checkbox]").check()
        fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(4000)
        k = max(int(x.split("/n")[1].split(".")[0]) for x in m.uploads if x.endswith(".mp4"))
        check(f"[{name}] vidéo MOV HEVC de l'iPhone : acceptée, enregistrée en MP4, avertissement de compatibilité", f"c1/lib/n{k}.mp4" in m.uploads and m.uploads[f"c1/lib/n{k}.mp4"]["ctype"] == "video/mp4" and "HEVC" in sec.inner_text(), (m.uploads, sec.inner_text()[:300]))
        if name == "mob": pg.screenshot(path="/tmp/libvid_prof_mob.png", full_page=True)
        else: pg.screenshot(path="/tmp/libvid_prof_desk.png", full_page=True)
        # Repères de la fiche modifiés : vidéos toujours là
        n_before = sec.locator(".uzu-lib-vcard").count()
        pg.get_by_role("button", name="Compléter la fiche").click(); pg.wait_for_timeout(200)
        pg.locator(".uzu-lib-form textarea").first.fill("1. Saisir les genoux"); pg.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(800)
        check(f"[{name}] modifier les repères de la fiche : vidéos conservées", pg.locator(".uzu-lib-vids .uzu-lib-vcard").count() == n_before and n_before == 3)
        # Enchaînement : ajout
        pg.locator(".uzu-lib-back").click(); pg.wait_for_timeout(300)
        pg.locator(".uzu-lib-volets button", has_text="Enchaînements").click(); pg.wait_for_timeout(500)
        pg.locator(".uzu-lib-flowpick button", has_text="FC2").click(); pg.wait_for_timeout(600)
        fs = pg.locator(".uzu-lib-vids")
        check(f"[{name}] enchaînement sans vidéo (professeur) : invitation à en ajouter", fs.count() == 1 and "Aucune vidéo" in fs.inner_text())
        fs.get_by_role("button", name="Ajouter une vidéo").click(); fm = fs.locator(".uzu-lib-vform")
        fm.locator("input[type=file]").set_input_files(FX + "h264_control.mp4"); fm.locator("input[type=checkbox]").check(); fm.locator("input[maxlength='120']").fill("Transitions A et B")
        fm.get_by_role("button", name="Envoyer la vidéo").click(); pg.wait_for_timeout(4000)
        res = [a for f_, a in m.rpc if f_ == "library_video_reserve"][-1]
        check(f"[{name}] enchaînement FC2 : vidéo ajoutée et lisible", res["p_target_kind"] == "flow" and res["p_target"] == "FC2" and "Transitions A et B" in fs.inner_text(), (res, fs.inner_text()[:200]))
        fs.get_by_role("button", name="Lire la vidéo « Transitions A et B »").click(); pg.wait_for_timeout(2000)
        w = fs.locator("video").first.evaluate("v => v.videoWidth") if fs.locator("video").count() else 0
        check(f"[{name}] lecture de la vidéo d'enchaînement", w == 640, w)
        check(f"[{name}] professeur : aucune requête vers Class Media, aucune erreur", not m.other and not errs, (m.other, errs))
        c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} vérifications réussies")
