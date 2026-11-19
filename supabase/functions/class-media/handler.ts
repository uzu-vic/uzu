// UZU — Class Media : fonction serveur (logique). Sans dépendance : testable hors de Supabase.
//
// Principe de sécurité : aucune lecture de fichier sans contrôle des droits EN BASE à chaque requête.
// - stream     : photo ou morceau de vidéo (2 Mo au plus), après media_stream_check, jamais mis en cache ;
// - finalize   : contrôle du type réel, de la taille et de la localisation, puis mise à disposition ;
// - reconcile  : quarantaine ou retour des fichiers d'une séance (après dépublication, retrait…) ;
// - sweep/purge: tâches planifiées (secret partagé), filet de sécurité et conservation.
// Journaux : jamais de jeton, d'adresse complète, de chemin de fichier ni de secret.
import { detectMime, kindOfMime, moovHasLocation, parseRange, photoHasMetadata, readBoxHeader } from "../_shared/media-format.ts"

export type Env = { url: string; anonKey: string; serviceKey: string; cronSecret: string; origins: string[] }
type Fetch = typeof fetch
type Json = Record<string, unknown>

const NO_STORE = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private, max-age=0",
  "Pragma": "no-cache", "Expires": "0",
  "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
}
const MAX_MOOV = 16 * 1024 * 1024

export function makeHandler(env: Env, fetchImpl: Fetch = fetch, log: (o: Json) => void = o => console.log(JSON.stringify(o))) {
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
  const sameSecret = (a: string, b: string) => { if (!a || !b || a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

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
    const tok = req.headers.get("x-media-ticket") || u.searchParams.get("t") || ""
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
    if (!sameSecret(req.headers.get("x-cron-secret") || "", env.cronSecret)) return json(req, 403, { error: "Accès refusé" })
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
