# Class Media de bout en bout dans l'interface, base et fonction serveur simulées.
# Lancer après un build simulé et : npx next start -p 3100
# Vérifie : galerie équipe et adhérent, lecture par jeton (jamais de lien de stockage), photo par en-tête,
# vidéo par morceaux, coupure d'accès pendant la lecture, demande de retrait, validation, retrait, rétablissement,
# saisie (confirmations, groupe de mineurs, préparation photo et vidéo, envoi, vérification), dépublication,
# file « À traiter », option « Groupe de mineurs », absence du script.
import io, json, re, urllib.parse as up
from PIL import Image
from playwright.sync_api import sync_playwright
src = open("tests/class_journal_e2e.py").read().split("\nwith sync_playwright()")[0]
exec(src)  # Mock, S, ctx, open_page, courses… du parcours du Journal
_open_page = open_page
def open_page(b, m, *a, **k):
    c, pg, errs = _open_page(b, m, *a, **k); pg.route("**/api/cm/video/**", m.video); return c, pg, errs

FIX = "tests/fixtures/class-media/"
WEBM = open(FIX + "long.webm", "rb").read()  # 20 s : la lecture se fait en plusieurs morceaux
PNG = (lambda b: (Image.new("RGB", (40, 30), (148, 27, 43)).save(b, "PNG"), b.getvalue())[1])(io.BytesIO())
HEX = lambda i: (i.encode().hex() * 64)[:64]

class MediaMock(Mock):
    def __init__(s, role, media=True, minors=False, **k):
        super().__init__(role, **k)
        s.media_on, s.minors, s.denied, s.uploads, s.fn_calls, s.reads = media, minors, set(), [], [], []
        s.body_of = {}  # contenu vidéo servi par média (défaut : WebM lisible)
        s.items = {
            "s2": [dict(id="p1", kind="photo", position=1, state="ready", location="main", validation="approved", mime="image/png", size=len(PNG)),
                   dict(id="v1", kind="video", position=2, state="ready", location="main", validation="approved", mime="video/webm", size=len(WEBM)),
                   dict(id="v2", kind="video", position=3, state="ready", location="main", validation="pending_validation", mime="video/webm", size=len(WEBM)),
                   dict(id="r1", kind="photo", position=4, state="quarantined", location="quarantine", validation="approved", quarantine_reason="removal_request",
                        request=dict(id="q1", status="requested", reason="Je ne veux pas apparaître", created_at=d(1)))],
            "s3": [dict(id="d1", kind="photo", position=1, state="ready", location="main", validation="approved", mime="image/jpeg", size=1000)]}
    def visible(s, m): return m["state"] == "ready" and m["validation"] == "approved" and m["id"] not in s.denied and not m.get("request")
    def smedia(s, sess):
        staff = s.role != "student"; L = s.items.get(sess, [])
        out = []
        for m in L:
            if m["state"] == "deleted": continue
            if staff:
                x = dict(m, created_at=d(1), viewable=s.visible(m) or m["state"] == "ready", can_remove=m["state"] == "ready", can_handle=True,
                         can_validate=m["state"] == "ready" and m["validation"] == "pending_validation",
                         can_restore=m["state"] == "quarantined" and not (m.get("request") and m["request"]["status"] in ("requested", "processing")))
                x.setdefault("request", None); out.append(x)
            elif s.visible(m): out.append(dict(id=m["id"], kind=m["kind"], position=m["position"], created_at=d(1), viewable=True))
        used = len([m for m in L if m["state"] in ("ready", "quarantined", "uploading")])
        return dict(max=4, max_bytes=52428800, minors=s.minors, can_add=staff, can_validate=staff, used=used, items=out)
    def video(s, route):  # relais du site /api/cm/video/<id> : le navigateur n'envoie que le cookie, jamais de jeton dans l'adresse
        r = route.request; u = r.url; h = r.all_headers()
        mid = up.urlparse(u).path.split("/api/cm/video/")[1]
        ck = dict(x.strip().split("=", 1) for x in (h.get("cookie") or "").split(";") if "=" in x)
        s.fn_calls.append(("stream", r.method, {"range": h.get("range", ""), "x-media-ticket": ck.get("uzu_cmv", ""), "via": "site", "url": u}, None))
        tok = ck.get("uzu_cmv", "")
        if tok != HEX(mid) or mid in s.denied: return route.fulfill(status=403, content_type="application/json", headers={"Cache-Control": "no-store, private"}, body=json.dumps({"error": "Accès refusé", "code": "denied"}))
        data, ct = (s.body_of.get(mid) or (WEBM, "video/webm"))
        rg = re.match(r"bytes=(\d+)-(\d*)", h.get("range", "") or "bytes=0-"); a = int(rg.group(1)); e = min(int(rg.group(2) or len(data) - 1), a + 262143, len(data) - 1)
        return route.fulfill(status=206, headers={"Content-Type": ct, "Content-Range": f"bytes {a}-{e}/{len(data)}", "Accept-Ranges": "bytes", "Cache-Control": "no-store, private"}, body=data[a:e + 1])
    def handle(s, route):
        r = route.request; u = r.url
        J = lambda o, st=200: route.fulfill(status=st, content_type="application/json", headers={"Access-Control-Allow-Origin": "http://127.0.0.1:3100", "Access-Control-Allow-Headers": "*", "Cache-Control": "no-store, private"}, body=json.dumps(o))
        if "/storage/v1/object/" in u:
            s.reads.append((r.method, u.split("/storage/v1/object/")[1].split("?")[0]))
            if r.method == "POST" and "/storage/v1/object/class-media/" in u:
                raw, ct = r.post_data_buffer, r.headers.get("content-type", ""); body, cache, ftype = raw, r.headers.get("cache-control", ""), ct
                if ct.startswith("multipart/form-data"):  # storage-js envoie un Blob en multipart (champ cacheControl + fichier)
                    bd = ("--" + ct.split("boundary=")[1]).encode()
                    for part in raw.split(bd):
                        if b"\r\n\r\n" not in part: continue
                        hd, val = part.split(b"\r\n\r\n", 1); val = val[:-2] if val.endswith(b"\r\n") else val
                        if b'name="cacheControl"' in hd: cache = val.decode()
                        elif b"filename" in hd or b'name=""' in hd: body = val; ftype = (re.search(rb"Content-Type: ([^\r]+)", hd) or [None, b""])[1].decode()
                s.uploads.append({"path": up.unquote(u.split("/storage/v1/object/class-media/")[1]), "body": body, "ctype": ftype, "cache": cache})
                return J({"Key": "class-media/x", "Id": "o1"})
            return J({"error": "inattendu"}, 400)
        if "/functions/v1/class-media/" in u:
            act = u.split("/functions/v1/class-media/")[1].split("?")[0]
            if r.method == "OPTIONS": return J({}, 204)
            s.fn_calls.append((act, r.method, dict(r.headers), r.post_data))
            if act == "stream":
                q = up.parse_qs(up.urlparse(u).query); tok = (q.get("t") or [r.headers.get("x-media-ticket", "")])[0]
                mid = next((m["id"] for L in s.items.values() for m in L if HEX(m["id"]) == tok), None)
                if not mid or mid in s.denied: return J({"error": "Accès refusé", "code": "denied"}, 403)
                m = next(m for L in s.items.values() for m in L if m["id"] == mid)
                if m["kind"] == "photo": return route.fulfill(status=200, headers={"Content-Type": "image/png", "Cache-Control": "no-store, private", "Access-Control-Allow-Origin": "http://127.0.0.1:3100"}, body=PNG)
                rg = re.match(r"bytes=(\d+)-(\d*)", r.headers.get("range", "") or "bytes=0-"); a = int(rg.group(1)); e = min(int(rg.group(2) or len(WEBM) - 1), a + 262143, len(WEBM) - 1)  # petits morceaux : plusieurs requêtes, chacune contrôlée
                return route.fulfill(status=206, headers={"Content-Type": "video/webm", "Content-Range": f"bytes {a}-{e}/{len(WEBM)}", "Accept-Ranges": "bytes", "Cache-Control": "no-store, private"}, body=WEBM[a:e + 1])
            if act == "finalize": return J({"ok": True, "validation": "pending_validation" if s.minors else "approved"})
            if act == "reconcile": return J({"ok": True, "done": 0})
            return J({"error": "?"}, 404)
        if "/rpc/" in u:
            name = u.split("/rpc/")[1].split("?")[0]; a = json.loads(r.post_data or "{}")
            if name == "upsert_section": s.calls.append((name, a)); return J("sec-new")
            media_fns = {"session_media", "media_ticket", "media_reserve", "media_validate", "media_remove", "media_request_removal", "media_handle_request", "media_restore", "section_minors_list", "set_section_minors", "media_queue"}
            if name in media_fns:
                s.calls.append((name, a))
                if not s.media_on: return J({"code": "PGRST202", "message": "Could not find the function public." + name}, 404)
                if name == "session_media": return J(s.smedia(a["p_session"]))
                if name == "media_ticket":
                    m = next((m for L in s.items.values() for m in L if m["id"] == a["p_media"]), None)
                    if not m or (s.role == "student" and not s.visible(m)): return J({"code": "P0001", "message": "Média indisponible"}, 400)
                    return J({"token": HEX(m["id"]), "expires_in": 900, "kind": m["kind"], "mime": m["mime"], "size": m["size"]})
                if name == "media_reserve":
                    if s.role == "student": return J({"code": "P0001", "message": "Droit requis"}, 400)
                    if s.minors and not a["p_minors"]: return J({"code": "P0001", "message": "Groupe de mineurs : confirme"}, 400)
                    mid = "n%d" % len(s.uploads); s.items.setdefault(a["p_session"], []).append(dict(id=mid, kind=a["p_kind"], position=9, state="ready", location="main", validation="approved", mime=a["p_mime"], size=a["p_size"]))
                    return J({"id": "00000000-0000-0000-0000-00000000000%d" % len(s.uploads), "bucket": "class-media", "path": f"c1/{a['p_session']}/m{len(s.uploads)}.{a['p_mime'].split('/')[1]}", "expires_in": 1800})
                if name == "media_remove" or name == "media_request_removal":
                    s.denied.add(a["p_media"]); return J(True if name == "media_remove" else "q9")
                if name in ("media_validate", "media_handle_request", "media_restore", "set_section_minors"): return J(True if name != "set_section_minors" else 3)
                if name == "section_minors_list": return J({"can_update": s.role == "owner", "sections": [{"id": GI, "name": "Adultes Gi", "minors": False}, {"id": NG, "name": "No-Gi", "minors": True}]})
                if name == "media_queue": return J([{"type": "request", "media": "r1", "request": "q1", "status": "requested", "reason": "", "session": "s2", "session_date": d(14), "theme": "Passages de garde", "group": "Adultes Gi", "kind": "photo", "at": d(1)},
                                                    {"type": "validation", "media": "v2", "session": "s2", "session_date": d(14), "theme": "Passages de garde", "group": "Adultes Gi", "kind": "video", "at": d(1)}] if s.role == "owner" else [])
        return super().handle(route)

def jpeg_size(b):
    i = 2
    while i < len(b):
        if b[i] != 0xFF: return None
        m = b[i + 1]; ln = (b[i + 2] << 8) + b[i + 3]
        if m in (0xC0, 0xC2): return (b[i + 7] << 8) + b[i + 8], (b[i + 5] << 8) + b[i + 6]
        i += 2 + ln
    return None

with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    # ---------------- Responsable (ordinateur)
    m = MediaMock("owner"); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    pg.get_by_role("tab", name="Journal des cours").click(); pg.wait_for_timeout(1500)
    q = pg.locator(".uzu-cm-queue")
    check("Journal : bloc « Médias à traiter » (demande de retrait, média à valider)", q.count() == 1 and "Demande de retrait" in q.inner_text() and "À valider" in q.inner_text())
    q.locator("button").first.click(); pg.wait_for_timeout(2500)
    g = pg.locator(".uzu-cm")
    check("détail équipe : galerie avec statuts (en ligne, en attente, quarantaine, demande)", g.count() == 1 and g.locator(".uzu-cm-item").count() == 4 and "En attente de validation" in g.inner_text() and "Demande de retrait reçue" in g.inner_text() and "Je ne veux pas apparaître" in g.inner_text(), g.inner_text()[:400] if g.count() else "")
    img = g.locator("img.uzu-cm-photo").first
    check("photo : affichée depuis la mémoire (blob), jeton passé en en-tête", img.count() == 1 and img.get_attribute("src").startswith("blob:") and any(a == "stream" and h.get("x-media-ticket") == HEX("p1") and "t=" not in "" for a, _, h, _ in m.fn_calls))
    vid = g.locator("video.uzu-cm-video").first
    vs = vid.get_attribute("src") or ""
    check("vidéo : adresse du site SANS jeton (ni lien de stockage, ni adresse de la fonction)", re.fullmatch(r"/api/cm/video/v\d\?n=\d+", vs) is not None and HEX("v1") not in vs and HEX("v2") not in vs, vs)
    pg.wait_for_timeout(1500)
    check("vidéo : lecture par plages (Range) servies en 206, jeton dans un cookie du site", any(a == "stream" and h.get("via") == "site" and (h.get("range") or "").startswith("bytes=") and len(h.get("x-media-ticket", "")) == 64 for a, _, h, _ in m.fn_calls))
    check("vidéo : aucune requête portant un jeton dans l'adresse", not any("t=" in (h.get("url") or "") or "stream?t" in (h.get("url") or "") for a, _, h, _ in m.fn_calls) and not any("/functions/v1/class-media/stream?" in x for x in pg.evaluate("performance.getEntriesByType('resource').map(e => e.name)")))
    check("lecture : aucune requête de lecture vers le stockage depuis le navigateur", not [x for x in m.reads if x[0] == "GET"] and not any("sign" in x[1] for x in m.reads), m.reads)
    pg.screenshot(path="/tmp/cm_staff.png", full_page=True)
    it = g.locator(".uzu-cm-item").nth(2)
    it.get_by_role("button", name="Valider").click(); pg.wait_for_timeout(800)
    check("validation (groupe de mineurs) : envoyée au serveur", m.last("media_validate") and m.last("media_validate")[-1]["p_media"] == "v2" and m.last("media_validate")[-1]["p_decision"] == "approved")
    it = pg.locator(".uzu-cm-item").nth(3)
    it.get_by_role("button", name="Refuser la demande").click(); pg.wait_for_timeout(800)
    hr = m.last("media_handle_request")
    check("demande de retrait : refus envoyé, le média reste en quarantaine", hr and hr[-1] == {"p_request": "q1", "p_status": "rejected", "p_note": ""} and any(a == "reconcile" for a, *_ in m.fn_calls))
    it = pg.locator(".uzu-cm-item").first
    it.get_by_role("button", name="Retirer").click(); pg.wait_for_timeout(200)
    check("retrait : confirmation demandée d'abord", not m.last("media_remove") and it.get_by_role("button", name="Confirmer : retirer").count() == 1)
    it.get_by_role("button", name="Confirmer : retirer").click(); pg.wait_for_timeout(800)
    check("retrait : envoyé au serveur, puis quarantaine demandée", m.last("media_remove")[-1]["p_media"] == "p1" and sum(1 for a, *_ in m.fn_calls if a == "reconcile") >= 2)
    m.items["s2"][3]["request"] = None
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(800); pg.locator(".uzu-cm-queue button").first.click(); pg.wait_for_timeout(1500)
    it = pg.locator(".uzu-cm-item", has_text="En quarantaine").first
    it.get_by_role("button", name="Rétablir…").click(); pg.wait_for_timeout(200)
    rb = it.get_by_role("button", name="Rétablir", exact=True)
    check("rétablir : impossible sans la confirmation d'accord", rb.is_disabled())
    it.locator("input[type=checkbox]").first.check(); rb.click(); pg.wait_for_timeout(800)
    check("rétablir : confirmation transmise, décision explicite", m.last("media_restore") and m.last("media_restore")[-1]["p_rights"] is True)
    # Dépublication → quarantaine demandée
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(800)
    pg.locator(".uzu-jr-card", has_text="Gardes ouvertes").click(); pg.wait_for_timeout(800)
    n0 = sum(1 for a, *_ in m.fn_calls if a == "reconcile")
    pg.get_by_role("button", name="Dépublier").click(); pg.wait_for_timeout(1000)
    check("dépublication : la mise en quarantaine des fichiers est demandée aussitôt", sum(1 for a, *_ in m.fn_calls if a == "reconcile") == n0 + 1 and json.loads([x for x in m.fn_calls if x[0] == "reconcile"][-1][3])["session"] == "s1")
    # Saisie : nouvelle séance → pas de médias avant enregistrement
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(800)
    pg.get_by_role("button", name="Nouvelle séance").click(); pg.wait_for_timeout(800)
    pg.locator("summary", has_text="Plus de détails").click()
    check("V5 · nouvelle séance : médias proposés seulement après enregistrement", "enregistre d'abord la séance" in pg.locator("form.uzu-lib-form").inner_text())
    pg.locator(".uzu-lib-back").first.click(); pg.wait_for_timeout(800)
    pg.locator(".uzu-jr-todo button", has_text="Front headlock").click(); pg.wait_for_timeout(1200)
    pg.locator("summary", has_text="Plus de détails").click(); pg.wait_for_timeout(300)
    mm = pg.locator(".uzu-cm-manager")
    bp = mm.get_by_role("button", name="Ajouter une photo")
    check("saisie : compteur « 1 sur 4 », boutons bloqués sans la case d'accord", "1 sur 4" in mm.inner_text() and bp.is_disabled())
    mm.screenshot(path="/tmp/cm_hint.png")
    check("amélioration : message visible « Coche la case d'accord pour ajouter un média. »", mm.locator(".uzu-cm-hint").count() == 1 and "Coche la case d'accord pour ajouter un média." in mm.locator(".uzu-cm-hint").inner_text())
    mm.locator("input[type=checkbox]").first.check()
    check("amélioration : le message disparaît dès que la case est cochée", mm.locator(".uzu-cm-hint").count() == 0 and not bp.is_disabled())
    with pg.expect_file_chooser() as fc: bp.click()
    fc.value.set_files(FIX + "photo_gps.jpg"); pg.wait_for_timeout(2500)
    rs = m.last("media_reserve"); upl = m.uploads[-1] if m.uploads else {}
    w_h = jpeg_size(upl.get("body") or b"\xff\xd8")
    check("photo : réduite à 1600 px au plus (proportions gardées), JPEG, réservée puis envoyée", rs and rs[-1]["p_kind"] == "photo" and rs[-1]["p_mime"] == "image/jpeg" and rs[-1]["p_rights"] is True and w_h and max(w_h) == 1600 and abs(w_h[0] / w_h[1] - 1.5) < 0.01 and rs[-1]["p_size"] == len(upl["body"]), (rs[-1] if rs else None, w_h))
    check("photo : métadonnées et position GPS retirées avant l'envoi", b"Exif" not in upl["body"] and b"48.8566" not in upl["body"] and b"Exif" in open(FIX + "photo_gps.jpg", "rb").read())
    check("envoi : emplacement réservé, sans remplacement, cache désactivé", upl["path"].startswith("c1/s3/") and upl["ctype"] == "image/jpeg" and upl["cache"] in ("max-age=0", "0", "no-cache"), (upl.get("path"), upl.get("cache")))
    check("vérification par la fonction serveur demandée après l'envoi", any(a == "finalize" and h.get("authorization", "").startswith("Bearer ") for a, _, h, _ in m.fn_calls))
    bv = pg.locator(".uzu-cm-manager").get_by_role("button", name="Ajouter une vidéo")
    if not pg.locator(".uzu-cm-manager input[type=checkbox]").first.is_checked(): pg.locator(".uzu-cm-manager input[type=checkbox]").first.check()
    with pg.expect_file_chooser() as fc: bv.click()
    fc.value.set_files(FIX + "android_like.mp4"); pg.wait_for_timeout(2500)
    upv = m.uploads[-1]; orig = open(FIX + "android_like.mp4", "rb").read()
    check("D3 · vidéo : type réel lu (MP4), localisation neutralisée, taille et contenu image inchangés, sans conversion",
          m.last("media_reserve")[-1]["p_mime"] == "video/mp4" and len(upv["body"]) == len(orig) and b"earth" in orig and b"earth" not in upv["body"] and upv["body"][-2000:] == orig[-2000:] if orig.find(b"moov") < orig.find(b"mdat") else True)
    if not pg.locator(".uzu-cm-manager input[type=checkbox]").first.is_checked(): pg.locator(".uzu-cm-manager input[type=checkbox]").first.check()
    check("Android · vidéo H.264 : aucun avertissement de format", pg.locator(".uzu-cm-hevc").count() == 0)
    with pg.expect_file_chooser() as fc: pg.locator(".uzu-cm-manager").get_by_role("button", name="Ajouter une vidéo").click()
    fc.value.set_files(FIX + "hevc_iphone_like.mov"); pg.wait_for_timeout(2500)
    nt = pg.locator(".uzu-cm-hevc")
    check("Android · vidéo HEVC d'iPhone envoyée : avertissement et réglage « Le plus compatible » indiqués", m.last("media_reserve")[-1]["p_mime"] == "video/quicktime" and nt.count() == 1 and "HEVC" in nt.inner_text() and "Le plus compatible" in nt.inner_text())
    pg.screenshot(path="/tmp/cm_editor.png", full_page=True)
    # Équipe : groupes de mineurs
    pg.locator(".primary-nav .nav-item", has_text="Équipe").first.click(); pg.wait_for_timeout(1800)
    mg = pg.locator("section[aria-labelledby=gr-h]")
    check("Équipe : encadré « Groupes » visible (groupes, option mineurs, création)", mg.count() == 1 and "No-Gi" in mg.inner_text() and "Groupe de mineurs" in mg.inner_text() and mg.get_by_role("button", name="Créer le groupe").count() == 1)
    mg.get_by_label("Nouveau groupe").fill("Enfants"); mg.get_by_role("button", name="Créer le groupe").click(); pg.wait_for_timeout(800)
    cr = m.last("upsert_section")
    check("Groupes : création envoyée au serveur", cr and cr[-1] == {"p_id": None, "p_name": "Enfants", "p_discipline": ""}, cr[-1] if cr else None)
    mg.locator(".uzu-gr-row", has_text="Adultes Gi").get_by_role("button", name="Renommer").click()
    mg.get_by_label("Nouveau nom de Adultes Gi").fill("Adultes Gi avancés"); mg.get_by_role("button", name="Enregistrer").click(); pg.wait_for_timeout(800)
    rn = m.last("upsert_section")
    mg.screenshot(path="/tmp/cm_groups.png")
    check("Groupes : renommage envoyé au serveur, discipline conservée", rn and rn[-1]["p_id"] == GI and rn[-1]["p_name"] == "Adultes Gi avancés" and "p_discipline" in rn[-1], rn[-1] if rn else None)
    mg.get_by_role("button", name="Marquer comme groupe de mineurs").click(); mg.get_by_role("button", name="Confirmer : groupe de mineurs").click(); pg.wait_for_timeout(800)
    check("V3/V4 · option cochée avec confirmation, envoyée au serveur", m.last("set_section_minors")[-1] == {"p_section": GI, "p_minors": True})
    check("responsable : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Groupe de mineurs : deuxième confirmation
    m = MediaMock("owner", minors=True); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    pg.get_by_role("tab", name="Journal des cours").click(); pg.wait_for_timeout(1200)
    pg.locator(".uzu-jr-todo button", has_text="Front headlock").click(); pg.wait_for_timeout(1200)
    pg.locator("summary", has_text="Plus de détails").click(); pg.wait_for_timeout(300)
    mm = pg.locator(".uzu-cm-manager"); boxes = mm.locator("input[type=checkbox]")
    boxes.first.check()
    check("12 · groupe de mineurs : deuxième case obligatoire avant tout envoi", boxes.count() == 2 and mm.get_by_role("button", name="Ajouter une photo").is_disabled() and "autorisations écrites" in mm.inner_text())
    check("amélioration : message dédié tant que la case des autorisations écrites n'est pas cochée", "coche aussi la case des autorisations écrites" in mm.locator(".uzu-cm-hint").inner_text())
    boxes.nth(1).check()
    with pg.expect_file_chooser() as fc: mm.get_by_role("button", name="Ajouter une photo").click()
    fc.value.set_files(FIX + "photo_gps.jpg"); pg.wait_for_timeout(2500)
    check("D4 · groupe de mineurs : les deux confirmations transmises, média en attente de validation", m.last("media_reserve")[-1]["p_minors"] is True and "attente de validation" in pg.inner_text("body"))
    check("mineurs : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Adhérent (téléphone)
    m = MediaMock("student", uid=S1); c, pg, errs = open_page(b, m, S1, "alice@test.fr", "Alice Martin", {"width": 390, "height": 844})
    pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1500)
    pg.locator(".subnav-tabs button", has_text="Cours du groupe").click(); pg.wait_for_timeout(1200)
    pg.locator(".uzu-jr-card", has_text="Passages de garde").click(); pg.wait_for_timeout(2500)
    g = pg.locator(".uzu-cm")
    check("adhérent : seuls les médias visibles (2 sur 4), sans statut ni action d'équipe", g.locator(".uzu-cm-item").count() == 2 and "attente" not in g.inner_text() and g.get_by_role("button", name="Retirer").count() == 0 and g.get_by_role("button", name="Valider").count() == 0)
    vid = g.locator("video.uzu-cm-video")
    check("adhérent : vidéo lue dans l'application (playsinline), sans bouton de téléchargement", vid.count() == 1 and vid.get_attribute("playsinline") is not None and "nodownload" in (vid.get_attribute("controlslist") or ""))
    pg.screenshot(path="/tmp/cm_member.png", full_page=True)
    n_before = sum(1 for a, *_ in m.fn_calls if a == "stream")
    m.denied.add("v1")
    pg.evaluate("(() => { const v = document.querySelector('video.uzu-cm-video'); v.muted = true; v.currentTime = 16; return v.play().catch(() => 0) })()")
    pg.wait_for_timeout(3000)
    print("   morceaux demandés après la coupure :", sum(1 for a, *_ in m.fn_calls if a == "stream") - n_before)
    check("R-1 (interface) · accès retiré pendant la lecture : la vidéo s'arrête et l'indique", "Vidéo retirée ou plus accessible" in g.inner_text() or "Vidéo indisponible" in g.inner_text() or vid.count() == 0, g.inner_text()[:200])
    m.denied.discard("v1")
    it = g.locator(".uzu-cm-item").first
    it.get_by_role("button", name="Demander le retrait").click()
    it.locator("textarea").fill("Je ne souhaite pas apparaître")
    it.get_by_role("button", name="Confirmer la demande").click(); pg.wait_for_timeout(1000)
    rq = m.last("media_request_removal")
    check("D6 · demande de retrait : envoyée avec le motif, média masqué aussitôt", rq and rq[-1] == {"p_media": "p1", "p_reason": "Je ne souhaite pas apparaître"} and pg.locator(".uzu-cm-item").count() <= 1)
    check("lecture adhérent : aucune requête vers le stockage, aucune adresse signée", not m.reads, m.reads)
    check("adhérent : aucune action d'équipe tentée", not m.last("media_remove") and not m.last("media_validate") and not m.last("media_reserve"))
    check("adhérent : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Android : vidéo que l'appareil ne sait pas décoder (accès toujours autorisé)
    for label, body in (("contenu non décodable", (bytes(range(256)) * 400, "video/mp4")), ("HEVC d'iPhone (Chrome sans décodeur HEVC)", (open(FIX + "hevc_iphone_like.mov", "rb").read(), "video/mp4"))):
        m = MediaMock("student", uid=S1); m.body_of["v1"] = body; c, pg, errs = open_page(b, m, S1, "alice@test.fr", "Alice Martin", {"width": 390, "height": 844})
        pg.locator(".mobile-bottom-nav button", has_text="Séances").click(); pg.wait_for_timeout(1500)
        pg.locator(".subnav-tabs button", has_text="Cours du groupe").click(); pg.wait_for_timeout(1200)
        pg.locator(".uzu-jr-card", has_text="Passages de garde").click(); pg.wait_for_timeout(2500)
        pg.evaluate("(() => { const v = document.querySelector('video.uzu-cm-video'); if (v) { v.muted = true; return v.play().catch(() => 0) } })()"); pg.wait_for_timeout(3500)
        g = pg.locator(".uzu-cm"); txt = g.inner_text()
        played = pg.evaluate("(() => { const v = document.querySelector('video.uzu-cm-video'); return !!v && v.videoWidth > 0 && !v.error })()")
        if label.startswith("HEVC") and played: print("   (ce Chrome de test sait décoder le HEVC : la vidéo se lit, pas de message attendu)")
        else: check(f"Android · {label} : message « format non pris en charge », média non déclaré retiré", "ne peut pas être lue sur cet appareil" in txt and "retirée" not in txt and g.locator(".uzu-cm-item").count() == 2, txt[:300])
        check(f"Android · {label} : aucune demande de nouveau jeton en boucle", len(m.last("media_ticket")) <= 3, len(m.last("media_ticket")))
        check(f"Android · {label} : aucune erreur JavaScript", not errs, errs); c.close()

    # ---------------- Base sans le script Class Media
    m = MediaMock("owner", media=False); c, pg, errs = open_page(b, m, OWNER, "prof@test.fr", "Paul Prof", {"width": 1280, "height": 900}); courses(pg)
    pg.get_by_role("tab", name="Journal des cours").click(); pg.wait_for_timeout(1200)
    pg.locator(".uzu-jr-card", has_text="Gardes ouvertes").click(); pg.wait_for_timeout(1200)
    check("sans le script : ni galerie ni file, Journal inchangé", pg.locator(".uzu-cm").count() == 0 and pg.locator(".uzu-cm-queue").count() == 0 and pg.get_by_role("button", name="Dépublier").count() == 1)
    check("sans le script : aucune erreur JavaScript", not errs, errs); c.close()
    b.close()
print(f"\n{sum(R)}/{len(R)} vérifications réussies")
