// UZU — Class Media : fonction serveur en UN SEUL FICHIER, pour un déploiement depuis le tableau de bord Supabase
// (Edge Functions › Deploy a new function › Via Editor, nom : class-media). Fichier généré à partir de
// supabase/functions/_shared/media-format.ts, class-media/handler.ts et class-media/index.ts : ne pas le modifier à la main.
// Après le déploiement : désactiver « Verify JWT » dans les détails de la fonction.

// ===== media-format.ts =====
// UZU — Class Media : reconnaissance des formats et des métadonnées sensibles.
// Module pur (aucune API propre à Deno ni au navigateur) : utilisé par la fonction serveur class-media
// pour décider, et par l'application pour préparer les fichiers avant l'envoi.
// Le format est reconnu par les premiers octets du fichier, jamais par son nom ni par le type annoncé.

type MediaMime = "image/jpeg" | "image/png" | "image/webp" | "video/mp4" | "video/webm" | "video/quicktime"

const ascii = (b: Uint8Array, o: number, n: number) => { let s = ""; for (let i = 0; i < n && o + i < b.length; i++) s += String.fromCharCode(b[o + i]); return s }
const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]

// Marques ISO-BMFF reconnues comme MP4 (la marque « qt  » désigne le format MOV d'Apple)
const MP4_BRANDS = new Set(["isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9", "mp41", "mp42", "mp71", "avc1", "M4V ", "M4VP", "MSNV", "dash", "f4v ", "XAVC", "MiPr"])

/** Type réel d'après les premiers octets (64 octets au moins conseillés), ou null si non accepté. */
function detectMime(b: Uint8Array): MediaMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length >= 8 && b[0] === 0x89 && ascii(b, 1, 3) === "PNG" && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png"
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return "image/webp"
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) {
    // En-tête EBML : élément DocType (0x42 0x82) suivi de sa taille puis de « webm »
    for (let i = 4; i < Math.min(b.length - 6, 64); i++)
      if (b[i] === 0x42 && b[i + 1] === 0x82) { const n = b[i + 2] & 0x7f; return ascii(b, i + 3, Math.min(n, 8)) === "webm" ? "video/webm" : null }
    return null
  }
  if (b.length >= 12 && ascii(b, 4, 4) === "ftyp") {
    const size = u32(b, 0), major = ascii(b, 8, 4)
    if (major === "qt  ") return "video/quicktime"
    if (MP4_BRANDS.has(major)) return "video/mp4"
    for (let o = 16; o + 4 <= Math.min(size, b.length); o += 4) { const c = ascii(b, o, 4); if (MP4_BRANDS.has(c)) return "video/mp4" }
    return null // HEIC, AVIF, 3GP non pris en charge…
  }
  return null
}
const kindOfMime = (m: string) => m.startsWith("image/") ? "photo" : "video"

/** Photo contenant encore des métadonnées (EXIF ou XMP, où se trouve la position GPS) */
function photoHasMetadata(b: Uint8Array, mime: string): boolean {
  if (mime === "image/jpeg") {
    let o = 2
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) return false
      const m = b[o + 1]
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { o += 2; continue }
      if (m === 0xda || m === 0xd9) return false // début de l'image : plus de métadonnées après
      const len = (b[o + 2] << 8) + b[o + 3]
      if (m === 0xe1) { const id = ascii(b, o + 4, 29); if (id.startsWith("Exif") || id.startsWith("http://ns.adobe.com/xap")) return true }
      o += 2 + len
    }
    return false
  }
  if (mime === "image/png") {
    let o = 8
    while (o + 8 <= b.length) {
      const len = u32(b, o), type = ascii(b, o + 4, 4)
      if (type === "eXIf") return true
      if ((type === "iTXt" || type === "tEXt" || type === "zTXt") && ascii(b, o + 8, 17) === "XML:com.adobe.xmp") return true
      if (type === "IEND") return false
      o += 12 + len
    }
    return false
  }
  if (mime === "image/webp") {
    let o = 12
    while (o + 8 <= b.length) {
      const type = ascii(b, o, 4), len = b[o + 4] + (b[o + 5] << 8) + (b[o + 6] << 16) + (b[o + 7] << 24 >>> 0)
      if (type === "EXIF" || type === "XMP ") return true
      o += 8 + len + (len & 1)
    }
    return false
  }
  return false
}

type BoxHeader = { type: string; size: number; header: number }
/** En-tête de boîte ISO-BMFF à partir de 16 octets ; size = 0 → jusqu'à la fin (rest) */
function readBoxHeader(b: Uint8Array, rest: number): BoxHeader | null {
  if (b.length < 8) return null
  let size = u32(b, 0), header = 8
  const type = ascii(b, 4, 4)
  if (size === 1) { if (b.length < 16) return null; size = u32(b, 8) * 4294967296 + u32(b, 12); header = 16 }
  else if (size === 0) size = rest
  if (size < header) return null
  return { type, size, header }
}

// Localisation dans les métadonnées MP4 et MOV : on parcourt l'arbre des boîtes de la boîte moov
// (jamais les données image ni les tables d'échantillons) pour trouver :
//   « ©xyz » et « loci » dans udta ou meta ; la clé Apple « com.apple.quicktime.location.* » de meta/keys
//   et sa valeur dans meta/ilst ; et, par sécurité, une coordonnée écrite en clair dans udta ou meta.
const KEY_LOCATION = "com.apple.quicktime.location"
const COORD = /[+-]\d{1,2}\.\d{3,}[+-]\d{1,3}\.\d{3,}/
const CONTAINERS = new Set(["moov", "trak", "udta", "meta", "ilst", "mdia", "minf", "edts"])
type Found = { kind: "xyz" | "loci" | "keyname" | "value" | "text"; start: number; end: number; boxStart?: number }

function walk(m: Uint8Array, from: number, to: number, depth: number, inMeta: boolean, out: Found[], keys: number[]) {
  let o = from
  for (let n = 0; n < 500 && o + 8 <= to; n++) {
    let size = u32(m, o), header = 8
    const type = ascii(m, o + 4, 4)
    if (size === 1 && o + 16 <= to) { size = u32(m, o + 8) * 4294967296 + u32(m, o + 12); header = 16 }
    else if (size === 0) size = to - o
    if (size < header || o + size > to) return
    const p = o + header, e = o + size
    if (type === "\u00a9xyz") out.push({ kind: "xyz", start: p, end: e, boxStart: o })
    else if (type === "loci" && inMeta) out.push({ kind: "loci", start: p, end: e, boxStart: o })
    else if (type === "keys" && inMeta) {
      // fullbox : version/flags (4) + nombre d'entrées (4) puis [taille (4), espace (4), nom]
      let q = p + 8, idx = 0
      while (q + 8 <= e) { const es = u32(m, q); if (es < 8 || q + es > e) break; idx++
        const name = ascii(m, q + 8, es - 8)
        if (name.startsWith(KEY_LOCATION)) { keys.push(idx); out.push({ kind: "keyname", start: q + 8, end: q + es }) }
        q += es }
    } else if (type === "ilst") {
      // éléments : type = numéro de clé (1, 2, …) ; enfant « data » : type (4) + langue (4) + valeur
      let q = p
      while (q + 8 <= e) { const is = u32(m, q); if (is < 8 || q + is > e) break
        const keyIdx = u32(m, q + 4)
        let d = q + 8
        while (d + 16 <= q + is) { const ds = u32(m, d); if (ds < 16 || d + ds > q + is) break
          if (ascii(m, d + 4, 4) === "data") out.push({ kind: "value", start: d + 16, end: d + ds, boxStart: keyIdx })
          d += ds }
        q += is }
    } else if (CONTAINERS.has(type) && depth < 8) {
      let cp = p
      if (type === "meta" && ascii(m, p + 4, 4) !== "hdlr" && ascii(m, p + 8, 4) === "hdlr") cp = p + 4 // meta ISO : version/flags
      walk(m, cp, e, depth + 1, inMeta || type === "udta" || type === "meta", out, keys)
    }
    if ((type === "udta" || type === "meta") && COORD.test(latin1(m.subarray(p, e)))) out.push({ kind: "text", start: p, end: e })
    o = e
  }
}
const latin1 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, Array.from(b.subarray(i, i + 8192))); return s }
function findings(moov: Uint8Array): Found[] {
  const out: Found[] = [], keys: number[] = []
  walk(moov, 0, moov.length, 0, false, out, keys)
  // ne garder que les valeurs ilst rattachées à une clé de localisation
  return out.filter(f => f.kind !== "value" || keys.includes(f.boxStart as number))
}
const nonZero = (m: Uint8Array, a: number, b: number) => { for (let i = a; i < b; i++) if (m[i] !== 0) return true; return false }

/** La boîte moov (métadonnées), lue seule, contient-elle encore une position ? */
function moovHasLocation(moov: Uint8Array): boolean {
  return findings(moov).some(f => f.kind === "keyname" || f.kind === "text" || nonZero(moov, f.start, f.end))
}

/** Position d'une boîte de premier niveau dans un fichier entier (navigateur) */
function findTopBox(b: Uint8Array, type: string): { start: number; size: number; header: number } | null {
  let o = 0
  for (let n = 0; n < 200 && o + 8 <= b.length; n++) {
    const h = readBoxHeader(b.subarray(o, o + 16), b.length - o)
    if (!h) return null
    if (h.type === type) return { start: o, size: h.size, header: h.header }
    o += h.size
  }
  return null
}

/**
 * Neutralise la localisation d'une vidéo MP4 ou MOV, sur place, sans conversion ni changement de taille :
 * « ©xyz » et « loci » deviennent des boîtes « free » vidées, la clé Apple de localisation est masquée,
 * sa valeur effacée, et une coordonnée écrite en clair dans udta ou meta est remplacée par des zéros.
 * Renvoie le nombre de corrections.
 */
function neutralizeLocation(file: Uint8Array): number {
  const top = findTopBox(file, "moov")
  if (!top) return 0
  const m = file.subarray(top.start, top.start + top.size)
  let n = 0
  for (const f of findings(m)) {
    if ((f.kind === "xyz" || f.kind === "loci") && f.boxStart !== undefined) {
      m[f.boxStart + 4] = 0x66; m[f.boxStart + 5] = 0x72; m[f.boxStart + 6] = 0x65; m[f.boxStart + 7] = 0x65 // « free »
      m.fill(0, f.start, f.end); n++
    } else if (f.kind === "keyname") { m.fill(0x78, f.start, f.end); n++ }
    else if (f.kind === "value") { m.fill(0, f.start, f.end); n++ }
    else if (f.kind === "text") {
      const txt = latin1(m.subarray(f.start, f.end)), re = new RegExp(COORD.source, "g")
      for (let r = re.exec(txt); r; r = re.exec(txt)) { m.fill(0x30, f.start + r.index, f.start + r.index + r[0].length); n++ }
    }
  }
  return n
}

type ByteRange = { start: number; end: number }
/** Lecture « Range » : bytes=a-b, bytes=a-, bytes=-n ; plafonnée à `chunk` octets. null = demande invalide. */
function parseRange(h: string | null, size: number, chunk: number): ByteRange | null {
  if (size <= 0) return null
  if (!h) return { start: 0, end: Math.min(size, chunk) - 1 }
  const m = /^bytes=(\d*)-(\d*)$/.exec(h.trim())
  if (!m || (m[1] === "" && m[2] === "")) return null
  let start: number, end: number
  if (m[1] === "") { const n = Number(m[2]); if (!n) return null; start = Math.max(0, size - n); end = size - 1 }
  else { start = Number(m[1]); end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1) }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || end < start) return null
  return { start, end: Math.min(end, start + chunk - 1) }
}

// ===== handler.ts =====
// UZU — Class Media : fonction serveur (logique). Sans dépendance : testable hors de Supabase.
//
// Principe de sécurité : aucune lecture de fichier sans contrôle des droits EN BASE à chaque requête.
// - stream     : photo ou morceau de vidéo (2 Mo au plus), après media_stream_check, jamais mis en cache ;
// - finalize   : contrôle du type réel, de la taille et de la localisation, puis mise à disposition ;
// - reconcile  : quarantaine ou retour des fichiers d'une séance (après dépublication, retrait…) ;
// - sweep/purge: tâches planifiées (secret du coffre de la base), filet de sécurité et conservation.
// Journaux : jamais de jeton, d'adresse complète, de chemin de fichier ni de secret.

type Env = { url: string; anonKey: string; serviceKey: string; origins: string[] }
type Fetch = typeof fetch
type Json = Record<string, unknown>

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "Pragma": "no-cache", "Expires": "0",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
}
const MAX_MOOV = 16 * 1024 * 1024

function makeHandler(env: Env, fetchImpl: Fetch = fetch, log: (o: Json) => void = o => console.log(JSON.stringify(o))) {
  const svcHeaders = (extra: Record<string, string> = {}) => {
    const h: Record<string, string> = { apikey: env.serviceKey, ...extra }
    if (env.serviceKey.startsWith("eyJ")) h.Authorization = "Bearer " + env.serviceKey // ancienne clé (JWT) ; nouvelle clé : apikey seul
    return h
  }
  const rpc = async (fn: string, args: Json): Promise<unknown> => {
    const r = await fetchImpl(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(args) })
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`)
    return r.json()
  }
  const objUrl = (bucket: string, path: string) => `${env.url}/storage/v1/object/authenticated/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`
  const readRange = async (bucket: string, path: string, start: number, end: number) => {
    const r = await fetchImpl(objUrl(bucket, path), { headers: svcHeaders({ Range: `bytes=${start}-${end}`, "Cache-Control": "no-cache" }) })
    if (r.status !== 206 && r.status !== 200) throw new Error(`lecture ${r.status}`)
    return r
  }
  const readBytes = async (bucket: string, path: string, start: number, end: number) => new Uint8Array(await (await readRange(bucket, path, start, end)).arrayBuffer()).subarray(0, end - start + 1)
  const objectSize = async (bucket: string, path: string): Promise<number | null> => {
    const i = path.lastIndexOf("/")
    const r = await fetchImpl(`${env.url}/storage/v1/object/list/${bucket}`, { method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ prefix: path.slice(0, i + 1), search: path.slice(i + 1), limit: 2 }) })
    if (!r.ok) return null
    const list = await r.json() as { name: string; metadata?: { size?: number } }[]
    const f = Array.isArray(list) ? list.find(x => x.name === path.slice(i + 1)) : null
    return f && typeof f.metadata?.size === "number" ? f.metadata.size : null
  }
  const removeObject = async (bucket: string, path: string) => {
    const r = await fetchImpl(`${env.url}/storage/v1/object/${bucket}`, { method: "DELETE", headers: svcHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ prefixes: [path] }) })
    return r.ok
  }
  const moveObject = async (fromB: string, fromP: string, toB: string, toP: string) => {
    const body = JSON.stringify({ bucketId: fromB, sourceKey: fromP, destinationBucket: toB, destinationKey: toP })
    let r = await fetchImpl(`${env.url}/storage/v1/object/move`, { method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }), body })
    if (r.ok) return "move"
    // Repli : copie vers l'autre espace, puis effacement de l'original
    r = await fetchImpl(`${env.url}/storage/v1/object/copy`, { method: "POST", headers: svcHeaders({ "Content-Type": "application/json" }), body })
    if (r.ok && await removeObject(fromB, fromP)) return "copy"
    return null
  }
  const userId = async (req: Request): Promise<string | null> => {
    const a = req.headers.get("Authorization") || ""
    if (!/^Bearer [A-Za-z0-9._-]+$/.test(a)) return null
    const r = await fetchImpl(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: a } })
    if (!r.ok) return null
    const u = await r.json() as { id?: string }
    return typeof u.id === "string" ? u.id : null
  }
  const cors = (req: Request): Record<string, string> => {
    const o = req.headers.get("Origin") || ""
    if (!o || !env.origins.includes(o)) return {}
    return { "Access-Control-Allow-Origin": o, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-media-ticket, range, x-client-info",
             "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS", "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges", "Access-Control-Max-Age": "600" }
  }
  const json = (req: Request, status: number, body: Json) => new Response(JSON.stringify(body), { status, headers: { ...NO_STORE, ...cors(req), "Content-Type": "application/json; charset=utf-8" } })
  const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, "0")).join("")

  type Action = { media: string; op: "move" | "delete"; from_bucket: string; from_path: string; to_bucket: string; to_path: string; to_location: string }
  const apply = async (acts: Action[]) => {
    let done = 0
    for (const a of acts) {
      try {
        const ok = a.op === "delete" ? await removeObject(a.from_bucket, a.from_path) : !!(await moveObject(a.from_bucket, a.from_path, a.to_bucket, a.to_path))
        if (ok) { await rpc("media_set_location", { p_media: a.media, p_location: a.to_location }); done++ }
        else log({ a: "apply", media: a.media, op: a.op, ok: false })
      } catch (e) { log({ a: "apply", media: a.media, op: a.op, ok: false, err: (e as Error).name }) }
    }
    return done
  }

  // ---- stream : une requête = un contrôle en base
  const stream = async (req: Request, u: URL) => {
    const t0 = Date.now()
    // Jeton accepté UNIQUEMENT dans un en-tête : une adresse est conservée dans les journaux d'appels de la plateforme
    if (u.searchParams.has("t")) { log({ a: "stream", ok: false, code: "token_in_url" }); return json(req, 400, { error: "Jeton refusé dans l'adresse", code: "token_in_url" }) }
    const tok = req.headers.get("x-media-ticket") || ""
    if (!/^[0-9a-f]{64}$/.test(tok)) return json(req, 403, { error: "Accès refusé", code: "invalid" })
    const ck = await rpc("media_stream_check", { p_token_hash: await sha256(tok) }) as { ok: boolean; code?: string; media?: string; kind?: string; bucket?: string; path?: string; mime?: string; size?: number; chunk?: number }
    if (!ck.ok) { log({ a: "stream", ok: false, code: ck.code }); return json(req, 403, { error: "Accès refusé", code: ck.code || "denied" }) }
    const size = Number(ck.size), chunk = ck.kind === "photo" ? size : Number(ck.chunk)
    const range = parseRange(req.headers.get("Range"), size, chunk)
    if (!range) return new Response(null, { status: 416, headers: { ...NO_STORE, ...cors(req), "Content-Range": `bytes */${size}` } })
    const headers: Record<string, string> = { ...NO_STORE, ...cors(req), "Content-Type": String(ck.mime), "Accept-Ranges": "bytes",
      "Content-Disposition": "inline", "Content-Length": String(range.end - range.start + 1) }
    const partial = ck.kind === "video" || !!req.headers.get("Range")
    if (partial) headers["Content-Range"] = `bytes ${range.start}-${range.end}/${size}`
    if (req.method === "HEAD") return new Response(null, { status: partial ? 206 : 200, headers })
    const up = await readRange(String(ck.bucket), String(ck.path), range.start, range.end)
    log({ a: "stream", ok: true, media: ck.media, s: range.start, e: range.end, ms: Date.now() - t0 })
    return new Response(up.body, { status: partial ? 206 : 200, headers })
  }

  // ---- finalize : vérification après envoi
  const finalize = async (req: Request) => {
    const uid = await userId(req)
    if (!uid) return json(req, 401, { error: "Connexion requise" })
    const body = await req.json().catch(() => ({})) as { media?: string }
    if (!body.media || !/^[0-9a-f-]{36}$/.test(body.media)) return json(req, 400, { error: "Média inconnu" })
    const info = await rpc("media_finalize_info", { p_media: body.media, p_user: uid }) as { ok: boolean; bucket?: string; path?: string; kind?: string; mime?: string; size?: number; max_bytes?: number }
    if (!info.ok) return json(req, 404, { error: "Média inconnu ou déjà vérifié" })
    const b = String(info.bucket), p = String(info.path)
    const refuse = async (reason: string) => {
      await removeObject(b, p)
      await rpc("media_mark_failed", { p_media: body.media, p_error: reason })
      await rpc("media_set_location", { p_media: body.media, p_location: "none" })
      log({ a: "finalize", ok: false, media: body.media, reason })
      return json(req, 422, { error: reason })
    }
    const size = await objectSize(b, p)
    if (size === null) return refuse("Fichier absent du stockage")
    if (size > Number(info.max_bytes)) return refuse("Fichier trop lourd : 50 Mo au plus")
    if (size !== Number(info.size)) return refuse("Taille différente de celle annoncée")
    const head = await readBytes(b, p, 0, Math.min(size, 65536) - 1)
    const real = detectMime(head)
    if (!real || real !== info.mime || kindOfMime(real) !== info.kind) return refuse("Format réel non conforme au type annoncé")
    if (info.kind === "photo") {
      const all = size <= 65536 ? head : await readBytes(b, p, 0, size - 1)
      if (photoHasMetadata(all, real)) return refuse("La photo contient encore des métadonnées (position possible)")
    } else if (real !== "video/webm") {
      let o = 0, moov: Uint8Array | null = null
      for (let n = 0; n < 64 && o + 8 <= size; n++) {
        const hb = await readBytes(b, p, o, Math.min(size, o + 16) - 1)
        const h = readBoxHeader(hb, size - o)
        if (!h) break
        if (h.type === "moov") { if (h.size > MAX_MOOV) return refuse("Métadonnées vidéo trop volumineuses"); moov = await readBytes(b, p, o, o + h.size - 1); break }
        o += h.size
      }
      if (!moov) return refuse("Vidéo incomplète : métadonnées introuvables")
      if (moovHasLocation(moov)) return refuse("La vidéo contient encore une position (localisation)")
    }
    const r = await rpc("media_mark_ready", { p_media: body.media, p_mime: real, p_size: size }) as { ok: boolean; validation?: string; code?: string }
    if (!r.ok) return refuse("Vérification impossible : " + (r.code || "état"))
    log({ a: "finalize", ok: true, media: body.media, validation: r.validation })
    return json(req, 200, { ok: true, validation: r.validation })
  }

  // ---- reconcile : appelée par l'application après une dépublication, un retrait ou une demande de retrait
  const reconcile = async (req: Request) => {
    const uid = await userId(req)
    if (!uid) return json(req, 401, { error: "Connexion requise" })
    const body = await req.json().catch(() => ({})) as { session?: string }
    if (!body.session || !/^[0-9a-f-]{36}$/.test(body.session)) return json(req, 400, { error: "Séance inconnue" })
    const acts = await rpc("media_reconcile", { p_session: body.session, p_limit: 50 }) as Action[]
    const done = await apply(Array.isArray(acts) ? acts : [])
    log({ a: "reconcile", n: done })
    return json(req, 200, { ok: true, done })
  }

  const cron = async (req: Request, what: "sweep" | "purge") => {
    // Le secret n'est gardé qu'à un seul endroit : le coffre (Vault) de la base. La fonction n'en garde aucune copie :
    // elle envoie l'empreinte SHA-256 de ce qu'elle reçoit, et la base la compare à celle du secret du coffre.
    const got = req.headers.get("x-cron-secret") || ""
    const ok = /^[0-9a-f]{64}$/.test(got) && (await rpc("class_media_cron_ok", { p_hash: await sha256(got) })) === true
    if (!ok) { log({ a: what, ok: false, err: "secret" }); return json(req, 403, { error: "Accès refusé" }) }
    let purged: unknown = null
    if (what === "purge") purged = await rpc("media_purge", {})
    let total = 0
    for (let i = 0; i < 5; i++) {
      const acts = await rpc("media_reconcile", { p_session: null, p_limit: 200 }) as Action[]
      if (!Array.isArray(acts) || !acts.length) break
      const d = await apply(acts); total += d
      if (d < acts.length) break
    }
    log({ a: what, n: total })
    return json(req, 200, { ok: true, done: total, purged })
  }

  return async (req: Request): Promise<Response> => {
    const u = new URL(req.url)
    const action = u.pathname.split("/").filter(Boolean).pop() || ""
    try {
      if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors(req) } })
      if (action === "stream" && (req.method === "GET" || req.method === "HEAD")) return await stream(req, u)
      if (req.method !== "POST") return json(req, 405, { error: "Méthode non permise" })
      if (action === "finalize") return await finalize(req)
      if (action === "reconcile") return await reconcile(req)
      if (action === "sweep" || action === "purge") return await cron(req, action)
      return json(req, 404, { error: "Action inconnue" })
    } catch (e) {
      log({ a: action, ok: false, err: (e as Error).name })
      return json(req, 500, { error: "Erreur du serveur" })
    }
  }
}

// ===== index.ts =====
// UZU — Class Media : point d'entrée de la fonction serveur (Supabase Edge Function).
// Déploiement (base de TEST seulement) : supabase functions deploy class-media --no-verify-jwt --project-ref ntypsrdwxrkanahhuixx
// La vérification d'identité automatique est désactivée car un lecteur vidéo ne sait pas envoyer d'en-tête :
// « stream » s'authentifie par jeton, les autres actions vérifient elles-mêmes la session ou le secret.
// La clé de service est fournie par Supabase à la fonction ; elle n'est jamais renvoyée ni écrite au journal.

const env = {
  url: Deno.env.get("SUPABASE_URL") ?? "",
  anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "",
  origins: (Deno.env.get("CLASS_MEDIA_ALLOWED_ORIGINS") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
}
if (!env.url || !env.serviceKey || !env.anonKey) console.log(JSON.stringify({ a: "boot", ok: false, err: "configuration incomplète" }))

Deno.serve(makeHandler(env))
