// Class Media : relais des vidéos par le site lui-même (même origine).
// Pourquoi : un lecteur vidéo ne sait pas envoyer d'en-tête ; mettre le jeton dans l'adresse (stream?t=…)
// le ferait enregistrer dans les journaux d'appels de Supabase (adresse complète conservée).
// Ici, le jeton n'apparaît dans AUCUNE adresse :
//   1. la page confie le jeton au site (POST, corps de requête) ; le site le range dans un cookie HttpOnly,
//      Secure, SameSite=Strict, limité à l'adresse de CETTE vidéo et à 15 minutes au plus ;
//   2. le lecteur demande /api/cm/video/<id> (aucun jeton dans l'adresse) ; le navigateur joint le cookie ;
//   3. le site relaie chaque requête (plage Range comprise) vers la fonction serveur avec le jeton en EN-TÊTE.
// La fonction revérifie les droits à chaque requête : la révocation immédiate est inchangée. Rien n'est mis
// en cache (no-store, private) ; rien n'est journalisé ici.
// Module sans dépendance à Next : testé directement par tests/class_media_unit.mjs.

export const TICKET_RE = /^[0-9a-f]{64}$/
export const MEDIA_RE = /^[0-9A-Za-z-]{1,64}$/  // identifiant de média (UUID en pratique) : caractères sûrs pour une adresse et un cookie
export const COOKIE = "uzu_cmv"
export const VIDEO_PATH = "/api/cm/video/"
const NO_STORE = { "Cache-Control": "no-store, private", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" }
const deny = (status: number, code: string) => new Response(JSON.stringify({ error: "Accès refusé", code }), { status, headers: { "Content-Type": "application/json", ...NO_STORE } })

/** Le jeton est-il confié depuis le site lui-même ? (refuse les autres sites) */
export function sameOrigin(req: Request): boolean {
  const o = req.headers.get("origin"); if (!o) return false
  try { const u = new URL(req.url), h = req.headers.get("x-forwarded-host") || req.headers.get("host") || u.host; return new URL(o).host === h } catch { return false }
}

/** POST /api/cm/ticket : { media, token, expires_in } → cookie limité à l'adresse de cette vidéo */
export async function storeTicket(req: Request): Promise<Response> {
  if (req.method !== "POST") return deny(405, "method")
  if (!sameOrigin(req)) return deny(403, "origin")
  let b: { media?: unknown; token?: unknown; expires_in?: unknown }
  try { b = await req.json() } catch { return deny(400, "body") }
  const media = String(b.media || ""), token = String(b.token || ""), ttl = Math.max(1, Math.min(900, Math.floor(Number(b.expires_in) || 0)))
  if (!MEDIA_RE.test(media) || !TICKET_RE.test(token)) return deny(400, "invalid")
  const secure = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")) === "https"
  const cookie = `${COOKIE}=${token}; Path=${VIDEO_PATH}${media}; Max-Age=${ttl}; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`
  return new Response(null, { status: 204, headers: { "Set-Cookie": cookie, ...NO_STORE } })
}

const readCookie = (req: Request) => {
  for (const part of (req.headers.get("cookie") || "").split(";")) { const [k, ...v] = part.trim().split("="); if (k === COOKIE) return v.join("=") }
  return ""
}

/** GET/HEAD /api/cm/video/<id> : relais vers la fonction serveur, jeton en en-tête */
export async function relayVideo(req: Request, media: string, supabaseUrl: string, f: typeof fetch = fetch): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") return deny(405, "method")
  if (!MEDIA_RE.test(media)) return deny(400, "invalid")
  const token = readCookie(req)
  if (!TICKET_RE.test(token)) return deny(403, "invalid")
  const h: Record<string, string> = { "x-media-ticket": token }
  const range = req.headers.get("range"); if (range && /^bytes=\d*-\d*$/.test(range)) h.range = range
  let up: Response
  try { up = await f(`${supabaseUrl}/functions/v1/class-media/stream`, { method: req.method, headers: h, cache: "no-store", redirect: "error" }) }
  catch { return deny(502, "upstream") }
  const out: Record<string, string> = { ...NO_STORE, "Content-Disposition": "inline" }
  for (const k of ["content-type", "content-length", "content-range", "accept-ranges"]) { const v = up.headers.get(k); if (v) out[k] = v }
  // MOV (iPhone) annoncé en MP4 : même structure de fichier ; Chrome (Android compris) refuse certains MOV annoncés video/quicktime
  if (out["content-type"] === "video/quicktime") out["content-type"] = "video/mp4"
  return new Response(req.method === "HEAD" ? null : up.body, { status: up.status, headers: out })
}
