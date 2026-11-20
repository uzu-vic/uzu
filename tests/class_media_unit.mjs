// Class Media — tests de la fonction serveur et du module de formats, sans réseau (node tests/class_media_unit.mjs)
import { detectMime, photoHasMetadata, moovHasLocation, neutralizeLocation, findTopBox, parseRange } from "../supabase/functions/_shared/media-format.ts"
import { makeHandler } from "../supabase/functions/class-media/handler.ts"
import { storeTicket, relayVideo } from "../lib/uzu/cm-proxy.ts"

const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + JSON.stringify(g))) }
const enc = s => Array.from(s, c => c.charCodeAt(0) & 0xff)
const be32 = n => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const box = (type, ...parts) => { const p = parts.flat(); return [...be32(8 + p.length), ...enc(type), ...p] }
const cat = (...a) => new Uint8Array(a.flat())

// Échantillons
const jpegClean = cat([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], enc("JFIF\0"), [1, 1, 0, 0, 1, 0, 1, 0, 0], [0xff, 0xda, 0x00, 0x04, 0, 0], [0x12, 0x34], [0xff, 0xd9])
const jpegExif = cat([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10], enc("Exif\0\0"), [0, 0, 0, 0, 0, 0, 0, 0], [0xff, 0xda, 0x00, 0x04, 0, 0], [0xff, 0xd9])
const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const chunk = (t, d) => [...be32(d.length), ...enc(t), ...d, 0, 0, 0, 0]
const png = cat(pngSig, chunk("IHDR", new Array(13).fill(0)), chunk("IEND", []))
const pngExif = cat(pngSig, chunk("IHDR", new Array(13).fill(0)), chunk("eXIf", [1, 2, 3, 4]), chunk("IEND", []))
const le32 = n => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]
const webp = cat(enc("RIFF"), le32(12), enc("WEBP"), enc("VP8 "), le32(4), [0, 0, 0, 0])
const webpExif = cat(enc("RIFF"), le32(24), enc("WEBP"), enc("VP8 "), le32(4), [0, 0, 0, 0], enc("EXIF"), le32(4), [1, 2, 3, 4])
const webm = cat([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x84], enc("webm"), new Array(20).fill(0))
const mkv = cat([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], enc("matroska"), new Array(20).fill(0))
const ftyp = (major, ...compat) => box("ftyp", enc(major), [0, 0, 2, 0], ...compat.map(enc))
const mdatWithDecoys = box("mdat", [0xa9, 0x78, 0x79, 0x7a], enc("loci+48.8566+002.3522/"), new Array(64).fill(7))
const xyz = (txt) => [...be32(8 + 4 + txt.length), 0xa9, 0x78, 0x79, 0x7a, 0, (txt.length), 0x15, 0xc7, ...enc(txt)]
const mp4Loc = cat(ftyp("isom", "isom", "mp41"), box("moov", box("mvhd", new Array(20).fill(0)), box("udta", xyz("+48.8566+002.3522/"))), mdatWithDecoys)
const mp4Clean = cat(ftyp("mp42", "isom"), box("moov", box("mvhd", new Array(20).fill(0)), box("udta", box("name", enc("Cours")))), box("mdat", new Array(64).fill(1)))
const keyEntry = n => [...be32(8 + n.length), ...enc("mdta"), ...enc(n)]
const qtMeta = box("meta", box("hdlr", new Array(24).fill(0)),
  box("keys", [0, 0, 0, 0], be32(2), keyEntry("com.apple.quicktime.make"), keyEntry("com.apple.quicktime.location.ISO6709")),
  box("ilst", [...be32(8 + 16 + 5), ...be32(1), ...be32(16 + 5), ...enc("data"), 0, 0, 0, 1, 0, 0, 0, 0, ...enc("Apple")],
              [...be32(8 + 16 + 18), ...be32(2), ...be32(16 + 18), ...enc("data"), 0, 0, 0, 1, 0, 0, 0, 0, ...enc("+48.8566+002.3522/")]))
const movLoc = cat(ftyp("qt  ", "qt  "), box("wide", []), box("mdat", new Array(64).fill(3)), box("moov", box("mvhd", new Array(20).fill(0)), qtMeta))
const heic = cat(ftyp("heic", "mif1", "heic"), new Array(16).fill(0))

// ---------- Formats
ok("JPEG, PNG, WebP, WebM reconnus par leurs premiers octets", detectMime(jpegClean) === "image/jpeg" && detectMime(png) === "image/png" && detectMime(webp) === "image/webp" && detectMime(webm) === "video/webm")
ok("MP4 et MOV (iPhone) distingués par la marque ftyp", detectMime(mp4Clean) === "video/mp4" && detectMime(movLoc) === "video/quicktime")
ok("Matroska, HEIC et octets quelconques : refusés", detectMime(mkv) === null && detectMime(heic) === null && detectMime(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])) === null)
ok("10 · une image PNG renommée en .mp4 est reconnue comme PNG", detectMime(png) !== "video/mp4")
ok("photo : métadonnées EXIF détectées (JPEG, PNG, WebP)", photoHasMetadata(jpegExif, "image/jpeg") && photoHasMetadata(pngExif, "image/png") && photoHasMetadata(webpExif, "image/webp"))
ok("photo sans métadonnées : acceptée", !photoHasMetadata(jpegClean, "image/jpeg") && !photoHasMetadata(png, "image/png") && !photoHasMetadata(webp, "image/webp"))
const moovOf = f => { const b = findTopBox(f, "moov"); return f.subarray(b.start, b.start + b.size) }
ok("vidéo : position ©xyz détectée dans moov (MP4)", moovHasLocation(moovOf(mp4Loc)))
ok("vidéo : clé Apple de localisation détectée (MOV d'iPhone)", moovHasLocation(moovOf(movLoc)))
ok("vidéo sans position : acceptée", !moovHasLocation(moovOf(mp4Clean)))
{ const f = mp4Loc.slice(), len = f.length, mdat0 = Array.from(f.subarray(f.length - 98)), n = neutralizeLocation(f)
  ok("neutralisation MP4 : position effacée, taille et données image inchangées", n >= 1 && !moovHasLocation(moovOf(f)) && f.length === len && detectMime(f) === "video/mp4"
    && JSON.stringify(Array.from(f.subarray(f.length - 98))) === JSON.stringify(mdat0), n) }
{ const f = movLoc.slice(), n = neutralizeLocation(f), txt = String.fromCharCode(...f)
  ok("neutralisation MOV : clé masquée et valeur effacée, autres métadonnées gardées", n >= 2 && !moovHasLocation(moovOf(f)) && !txt.includes("48.8566") && txt.includes("Apple") && txt.includes("com.apple.quicktime.make"), n) }
// Fichiers vidéo réels (produits par ffmpeg avec une position) : MOV façon iPhone, MP4 façon Android, WebM
{ const fs = await import("fs")
  for (const [f, mime] of [["iphone_like.mov", "video/quicktime"], ["android_like.mp4", "video/mp4"]]) {
    const b = new Uint8Array(fs.readFileSync(new URL("./fixtures/class-media/" + f, import.meta.url))), len = b.length
    const before = moovHasLocation(moovOf(b)), n = neutralizeLocation(b)
    ok(`fichier réel ${f} : type ${mime}, position détectée puis neutralisée, taille inchangée`, detectMime(b) === mime && before && n >= 1 && !moovHasLocation(moovOf(b)) && b.length === len, { before, n })
  }
  ok("fichier réel WebM : reconnu", detectMime(new Uint8Array(fs.readFileSync(new URL("./fixtures/class-media/clip.webm", import.meta.url)))) === "video/webm") }
ok("Range : sonde Safari bytes=0-1", JSON.stringify(parseRange("bytes=0-1", 1000, 2097152)) === '{"start":0,"end":1}')
ok("Range : morceau plafonné à 2 Mo", parseRange("bytes=0-", 50e6, 2097152).end === 2097151 && parseRange(null, 50e6, 2097152).end === 2097151)
ok("Range : suffixe et fin de fichier", JSON.stringify(parseRange("bytes=-100", 1000, 2097152)) === '{"start":900,"end":999}' && parseRange("bytes=990-", 1000, 2097152).end === 999)
ok("Range : demandes invalides refusées", parseRange("bytes=1000-", 1000, 10) === null && parseRange("bytes=abc", 1000, 10) === null && parseRange("bytes=-", 1000, 10) === null)

// ---------- Fonction serveur, avec une base et un stockage simulés
const URL0 = "https://projet-test.supabase.co", SVC = "sb_secret_simule_ne_doit_pas_fuiter", CRON = "c".repeat(64)
const logs = [], calls = []
const files = new Map([["class-media/club/sess/m1.mp4", new Uint8Array(5 * 1024 * 1024).map((_, i) => i % 251)]])
const db = { allowed: true, finalize: null }
const tokenOk = "a".repeat(64)
let moveWorks = true
const fake = async (url, init = {}) => {
  const u = new URL(url), h = new Headers(init.headers || {}), body = init.body ? JSON.parse(init.body) : null
  calls.push({ path: u.pathname, method: init.method || "GET", body, apikey: h.get("apikey"), auth: h.get("Authorization") })
  const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } })
  if (u.pathname === "/auth/v1/user") return h.get("Authorization") === "Bearer jeton-utilisateur" ? J({ id: "u-staff" }) : J({ msg: "invalid" }, 401)
  if (u.pathname.startsWith("/rest/v1/rpc/")) {
    const fn = u.pathname.split("/").pop()
    if (fn === "media_stream_check") {
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tokenOk)))).map(b => b.toString(16).padStart(2, "0")).join("")
      if (body.p_token_hash !== sha || !db.allowed) return J({ ok: false, code: "denied" })
      return J({ ok: true, media: "m1", kind: db.kind || "video", bucket: "class-media", path: db.path || "club/sess/m1.mp4", mime: db.mime || "video/mp4", size: files.get("class-media/" + (db.path || "club/sess/m1.mp4")).length, chunk: 2097152 })
    }
    if (fn === "media_finalize_info") return J(db.finalize ? { ok: true, max_bytes: 52428800, ...db.finalize } : { ok: false })
    if (fn === "media_mark_ready") return J({ ok: true, validation: "approved" })
    if (fn === "media_mark_failed" || fn === "media_set_location") return J(true)
    if (fn === "media_reconcile") return J(db.acts || [])
    if (fn === "media_purge") return J({ expired: 0 })
    if (fn === "class_media_cron_ok") {
      const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(CRON)))).map(b => b.toString(16).padStart(2, "0")).join("")
      return J(body.p_hash === sha)
    }
    return J({}, 404)
  }
  if (u.pathname.startsWith("/storage/v1/object/authenticated/")) {
    const key = decodeURIComponent(u.pathname.replace("/storage/v1/object/authenticated/", "")), f = files.get(key)
    if (!f) return J({ error: "not found" }, 400)
    const m = /bytes=(\d+)-(\d+)/.exec(h.get("Range") || ""), s = m ? +m[1] : 0, e = m ? Math.min(+m[2], f.length - 1) : f.length - 1
    return new Response(f.slice(s, e + 1), { status: m ? 206 : 200 })
  }
  if (u.pathname.startsWith("/storage/v1/object/list/")) {
    const b = u.pathname.split("/").pop(), key = b + "/" + body.prefix + body.search, f = files.get(key)
    return J(f ? [{ name: body.search, metadata: { size: f.length } }] : [])
  }
  if (u.pathname === "/storage/v1/object/move") { if (!moveWorks) return J({ error: "x" }, 400); files.set(body.destinationBucket + "/" + body.destinationKey, files.get(body.bucketId + "/" + body.sourceKey)); files.delete(body.bucketId + "/" + body.sourceKey); return J({ message: "ok" }) }
  if (u.pathname === "/storage/v1/object/copy") { files.set(body.destinationBucket + "/" + body.destinationKey, files.get(body.bucketId + "/" + body.sourceKey)); return J({ Key: "x" }) }
  if (u.pathname.startsWith("/storage/v1/object/") && init.method === "DELETE") { const b = u.pathname.split("/").pop(); for (const p of body.prefixes) files.delete(b + "/" + p); return J([]) }
  return J({}, 404)
}
const handle = makeHandler({ url: URL0, anonKey: "sb_publishable_simule", serviceKey: SVC, origins: ["https://uzu.example"] }, fake, o => logs.push(JSON.stringify(o)))
const get = (q, headers = {}) => handle(new Request(`${URL0}/functions/v1/class-media/stream${q}`, { headers }))
const post = (a, body, headers = {}) => handle(new Request(`${URL0}/functions/v1/class-media/${a}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }))

let r = await get("", { "x-media-ticket": tokenOk, Range: "bytes=0-" })
let buf = new Uint8Array(await r.arrayBuffer())
ok("stream : morceau de 2 Mo au plus (206, Content-Range)", r.status === 206 && buf.length === 2097152 && r.headers.get("Content-Range") === `bytes 0-2097151/${5 * 1024 * 1024}` && buf[300] === 300 % 251)
ok("stream : aucune mise en cache (no-store, private), nosniff", /no-store/.test(r.headers.get("Cache-Control")) && /private/.test(r.headers.get("Cache-Control")) && r.headers.get("X-Content-Type-Options") === "nosniff")
ok("stream : aucun chemin ni adresse de stockage dans la réponse", ![...r.headers.values()].some(v => v.includes("club/sess") || v.includes("/storage/")))
r = await get("", { "x-media-ticket": tokenOk, Range: "bytes=0-1" })
ok("iPhone · sonde bytes=0-1 : 206 avec 2 octets et taille totale", r.status === 206 && (await r.arrayBuffer()).byteLength === 2 && r.headers.get("Content-Range") === `bytes 0-1/${5 * 1024 * 1024}` && r.headers.get("Accept-Ranges") === "bytes")
r = await handle(new Request(`${URL0}/functions/v1/class-media/stream`, { method: "HEAD", headers: { "x-media-ticket": tokenOk, Range: "bytes=0-1" } }))
ok("HEAD : en-têtes sans corps", r.status === 206 && r.headers.get("Content-Length") === "2")
const n0 = calls.filter(c => c.path.endsWith("media_stream_check")).length
await get("", { "x-media-ticket": tokenOk, Range: "bytes=2097152-" }); await get("", { "x-media-ticket": tokenOk, Range: "bytes=4194304-" })
ok("chaque morceau déclenche un contrôle en base", calls.filter(c => c.path.endsWith("media_stream_check")).length === n0 + 2)
db.allowed = false
r = await get("", { "x-media-ticket": tokenOk, Range: "bytes=2097152-" })
ok("R-1 · droits retirés en base : le morceau suivant est refusé (403)", r.status === 403 && /no-store/.test(r.headers.get("Cache-Control")))
r = await get("", { "x-media-ticket": tokenOk, Range: "bytes=0-" })
ok("R-3 · la même requête rejouée : refusée, rien servi", r.status === 403 && (await r.json()).code === "denied")
db.allowed = true
const before = calls.length
r = await get("", { "x-media-ticket": "zz" })
ok("jeton mal formé : refusé sans interroger la base", r.status === 403 && calls.length === before)
r = await get("?t=" + tokenOk, { Range: "bytes=0-" })
ok("jeton dans l'adresse (stream?t=…) : refusé (400) sans interroger la base ni servir de fichier", r.status === 400 && (await r.json()).code === "token_in_url" && calls.length === before)
r = await get("", { "x-media-ticket": tokenOk, Range: "bytes=999999999-" })
ok("plage hors du fichier : 416", r.status === 416)
files.set("class-media/club/sess/p1.jpg", jpegClean); db.kind = "photo"; db.path = "club/sess/p1.jpg"; db.mime = "image/jpeg"
r = await get("", { "x-media-ticket": tokenOk, Origin: "https://uzu.example" })
ok("photo : jeton dans un en-tête (pas dans l'adresse), fichier entier, CORS limité au site", r.status === 200 && (await r.arrayBuffer()).byteLength === jpegClean.length && r.headers.get("Access-Control-Allow-Origin") === "https://uzu.example")
r = await get("", { "x-media-ticket": tokenOk, Origin: "https://autre.example" })
ok("autre site : aucune autorisation CORS", !r.headers.get("Access-Control-Allow-Origin"))
db.kind = db.path = db.mime = undefined

// finalize
ok("finalize sans session : 401", (await post("finalize", { media: "00000000-0000-0000-0000-000000000001" })).status === 401)
const A = { Authorization: "Bearer jeton-utilisateur" }
const fin = async (name, bytes, mime, kind, size) => { files.set("class-media/club/sess/" + name, bytes); db.finalize = { bucket: "class-media", path: "club/sess/" + name, kind, mime, size: size ?? bytes.length }; return post("finalize", { media: "00000000-0000-0000-0000-000000000001" }, A) }
const failed = () => calls.filter(c => c.path.endsWith("media_mark_failed")).length
let f0 = failed()
r = await fin("x.mp4", png, "video/mp4", "video")
ok("10 · finalize : PNG annoncé en MP4 → refusé, fichier effacé, refus tracé", r.status === 422 && failed() === f0 + 1 && !files.has("class-media/club/sess/x.mp4"))
r = await fin("e.jpg", jpegExif, "image/jpeg", "photo")
ok("finalize : photo avec EXIF → refusée", r.status === 422 && /métadonnées/.test((await r.json()).error))
r = await fin("l.mov", movLoc, "video/quicktime", "video")
ok("finalize : MOV avec localisation → refusé", r.status === 422 && /position/.test((await r.json()).error))
{ const f = movLoc.slice(); neutralizeLocation(f); r = await fin("c.mov", f, "video/quicktime", "video") }
ok("D3 · finalize : MOV d'iPhone neutralisé → accepté", r.status === 200 && (await r.json()).validation === "approved")
r = await fin("s.jpg", jpegClean, "image/jpeg", "photo", jpegClean.length + 5)
ok("finalize : taille différente de l'annonce → refusé", r.status === 422)
r = await fin("w.webm", webm, "video/webm", "video")
ok("finalize : WebM accepté", r.status === 200)
db.finalize = { bucket: "class-media", path: "club/sess/absent.mp4", kind: "video", mime: "video/mp4", size: 10 }
ok("finalize : fichier absent → refusé", (await post("finalize", { media: "00000000-0000-0000-0000-000000000001" }, A)).status === 422)

// Tâches planifiées et quarantaine
ok("sweep sans le secret : refusé", (await post("sweep", {}, { "x-cron-secret": "faux" })).status === 403 && (await post("sweep", {})).status === 403)
ok("sweep avec un mauvais secret de bonne forme : refusé", (await post("sweep", {}, { "x-cron-secret": "d".repeat(64) })).status === 403)
ok("secret : seule son empreinte est envoyée à la base, jamais la valeur", calls.filter(c => c.path.endsWith("class_media_cron_ok")).every(c => !JSON.stringify(c.body).includes("d".repeat(64)) && /^[0-9a-f]{64}$/.test(c.body.p_hash)))
files.set("class-media/club/sess/q1.mp4", mp4Clean)
db.acts = [{ media: "q1", op: "move", from_bucket: "class-media", from_path: "club/sess/q1.mp4", to_bucket: "class-media-quarantine", to_path: "club/q1.mp4", to_location: "quarantine" }]
r = await post("sweep", {}, { "x-cron-secret": CRON }); db.acts = []
ok("quarantaine : fichier déplacé vers l'espace de quarantaine, emplacement enregistré", r.status === 200 && files.has("class-media-quarantine/club/q1.mp4") && !files.has("class-media/club/sess/q1.mp4")
  && calls.some(c => c.path.endsWith("media_set_location") && c.body.p_location === "quarantine"))
moveWorks = false; files.set("class-media/club/sess/q2.mp4", mp4Clean)
db.acts = [{ media: "q2", op: "move", from_bucket: "class-media", from_path: "club/sess/q2.mp4", to_bucket: "class-media-quarantine", to_path: "club/q2.mp4", to_location: "quarantine" }]
await post("reconcile", { session: "00000000-0000-0000-0000-000000000002" }, A); db.acts = []; moveWorks = true
ok("quarantaine : repli copie puis effacement si le déplacement est refusé", files.has("class-media-quarantine/club/q2.mp4") && !files.has("class-media/club/sess/q2.mp4"))
ok("reconcile sans session : 401", (await post("reconcile", { session: "00000000-0000-0000-0000-000000000002" })).status === 401)
ok("purge : appelle la purge puis le rapprochement", (await post("purge", {}, { "x-cron-secret": CRON })).status === 200 && calls.some(c => c.path.endsWith("media_purge")))

// Relais vidéo du site (lib/uzu/cm-proxy.ts) : aucun jeton dans une adresse, de bout en bout
{
  const SITE = "https://uzu.example", MID = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9"
  const tk = (body, headers = {}) => storeTicket(new Request(SITE + "/api/cm/ticket", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-proto": "https", host: "uzu.example", ...headers }, body: JSON.stringify(body) }))
  ok("relais · jeton confié par un autre site : refusé", (await tk({ media: MID, token: tokenOk, expires_in: 900 }, { Origin: "https://autre.example" })).status === 403)
  ok("relais · jeton confié sans origine : refusé", (await tk({ media: MID, token: tokenOk, expires_in: 900 })).status === 403)
  ok("relais · jeton ou identifiant mal formé : refusé", (await tk({ media: MID, token: "zz", expires_in: 900 }, { Origin: SITE })).status === 400 && (await tk({ media: "../x", token: tokenOk, expires_in: 900 }, { Origin: SITE })).status === 400)
  r = await tk({ media: MID, token: tokenOk, expires_in: 5000 }, { Origin: SITE })
  const sc = r.headers.get("set-cookie") || ""
  ok("relais · cookie HttpOnly, Secure, SameSite=Strict, limité à cette vidéo, 15 min au plus", r.status === 204 && /HttpOnly/.test(sc) && /Secure/.test(sc) && /SameSite=Strict/.test(sc) && sc.includes("Path=/api/cm/video/" + MID + ";") && /Max-Age=900;/.test(sc) && /no-store/.test(r.headers.get("cache-control")))
  db.kind = "video"; db.path = "club/sess/m1.mp4"; db.mime = "video/mp4"; db.allowed = true
  const seen = []
  const up = (url, init) => { seen.push({ url, h: new Headers(init.headers) }); return handle(new Request(url, init)) }
  const play = (cookie, range = "bytes=0-", method = "GET") => relayVideo(new Request(SITE + "/api/cm/video/" + MID + "?n=1", { method, headers: { ...(cookie ? { cookie } : {}), range } }), MID, URL0, up)
  r = await play("")
  ok("relais · sans cookie : refusé, rien demandé à la fonction", r.status === 403 && seen.length === 0)
  r = await play("autre=1; uzu_cmv=" + tokenOk, "bytes=2097152-")
  buf = new Uint8Array(await r.arrayBuffer())
  ok("relais · lecture par morceaux : 206, plage transmise, aucune mise en cache", r.status === 206 && r.headers.get("content-range") === `bytes 2097152-4194303/${5 * 1024 * 1024}` && buf.length === 2097152 && /no-store/.test(r.headers.get("cache-control")) && r.headers.get("x-content-type-options") === "nosniff")
  ok("relais · vers la fonction : jeton en en-tête, adresse SANS jeton ni paramètre", seen.every(x => !x.url.includes("?") && !x.url.includes(tokenOk) && x.h.get("x-media-ticket") === tokenOk))
  ok("relais · réponse au navigateur : ni jeton ni chemin de stockage dans les en-têtes", ![...r.headers.values()].some(v => v.includes(tokenOk) || v.includes("club/sess") || v.includes("supabase.co")))
  r = await play("uzu_cmv=" + tokenOk, "bytes=0-1", "HEAD")
  ok("relais · HEAD (sonde iPhone) : en-têtes sans corps", r.status === 206 && r.body === null && r.headers.get("content-length") === "2")
  r = await play("uzu_cmv=" + tokenOk, "n'importe quoi")
  ok("relais · plage invalide : non transmise", r.status === 206 && !seen[seen.length - 1].h.has("range"))
  db.allowed = false
  r = await play("uzu_cmv=" + tokenOk, "bytes=4194304-")
  ok("relais · R-1 : droits retirés en base, le morceau suivant est refusé", r.status === 403 && /no-store/.test(r.headers.get("cache-control")))
  db.allowed = true
  ok("relais · identifiant de vidéo invalide : refusé", (await relayVideo(new Request(SITE + "/api/cm/video/x", { headers: { cookie: "uzu_cmv=" + tokenOk } }), "../x", URL0, up)).status === 400)
  ok("relais · méthode autre que GET/HEAD : refusée", (await relayVideo(new Request(SITE + "/api/cm/video/" + MID, { method: "POST", headers: { cookie: "uzu_cmv=" + tokenOk } }), MID, URL0, up)).status === 405)
}

// Journaux et secrets
const all = logs.join("\n")
ok("9 · journaux : aucun jeton, chemin, adresse, clé ni secret", !all.includes(tokenOk) && !all.includes("club/sess") && !all.includes("supabase.co") && !all.includes(SVC) && !all.includes(CRON) && logs.length > 5, all.slice(0, 300))
ok("clé de service : envoyée seulement à Supabase, jamais renvoyée au navigateur", calls.filter(c => c.apikey === SVC).every(c => !c.path.startsWith("/auth/")) && !calls.some(c => c.auth === "Bearer " + SVC))
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`); process.exit(R.every(Boolean) ? 0 : 1)
