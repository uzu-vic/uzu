"use client"
// Class Media : photos et vidéos privées des séances (script uzu-13 + fonction serveur class-media).
// Le navigateur ne reçoit jamais de lien de stockage pour lire un fichier : il demande un jeton de 15 min
// (media_ticket), puis la fonction serveur revérifie les droits en base à chaque requête de lecture.
import { uzu } from "./client"
import { SUPABASE_URL } from "./env"
import { HDR_MSG, detectMime, neutralizeLocation, videoCodec, videoIsHdr10, type MediaMime } from "../../supabase/functions/_shared/media-format"

export type MediaItem = {
  id: string; kind: "photo" | "video"; position: number; created_at: string; viewable: boolean
  state?: "uploading" | "ready" | "quarantined" | "deleted"; location?: string; validation?: "pending_validation" | "approved" | "rejected"
  mime?: string; size?: number; quarantine_reason?: string | null; verify_error?: string | null; mine?: boolean
  can_remove?: boolean; can_validate?: boolean; can_restore?: boolean; can_handle?: boolean
  request?: { id: string; status: "requested" | "processing" | "completed" | "rejected"; reason: string; created_at: string } | null
}
export type SessionMedia = { max: number; max_bytes: number; minors: boolean; can_add: boolean; can_validate: boolean; used: number; items: MediaItem[] }
export type QueueItem = { type: "validation" | "request"; media: string; request?: string; status?: string; reason?: string; session: string; session_date: string; theme: string; group: string; kind: string; at: string }

type R<T> = { ok: true; data: T } | { ok: false; msg: string; absent?: boolean }
const absent = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function|schema cache/i.test(e.message || "")
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée", absent: absent(error) }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}
export const FN_URL = SUPABASE_URL + "/functions/v1/class-media"
const authHeader = async (): Promise<Record<string, string>> => {
  const { data } = await uzu().auth.getSession()
  return data.session ? { Authorization: "Bearer " + data.session.access_token } : {}
}
async function fn<T>(action: string, body: Record<string, unknown>): Promise<R<T>> {
  try {
    const r = await fetch(`${FN_URL}/${action}`, { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeader()) }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    return r.ok ? { ok: true, data: j as T } : { ok: false, msg: (j as { error?: string }).error || "Action refusée" }
  } catch { return { ok: false, msg: "Service des médias indisponible" } }
}

export const sessionMedia = (session: string) => rpc<SessionMedia>("session_media", { p_session: session })
export const mediaQueue = () => rpc<QueueItem[]>("media_queue")
export const validateMedia = (media: string, decision: "approved" | "rejected", note = "") => rpc<boolean>("media_validate", { p_media: media, p_decision: decision, p_note: note })
export const removeMedia = async (media: string, session: string, reason = "") => { const r = await rpc<boolean>("media_remove", { p_media: media, p_reason: reason }); if (r.ok) reconcileSession(session); return r }
export const requestRemoval = async (media: string, session: string, reason = "") => { const r = await rpc<string>("media_request_removal", { p_media: media, p_reason: reason }); if (r.ok) reconcileSession(session); return r }
export const handleRequest = async (request: string, session: string, status: "processing" | "completed" | "rejected", note = "") => { const r = await rpc<boolean>("media_handle_request", { p_request: request, p_status: status, p_note: note }); if (r.ok) reconcileSession(session); return r }
export const restoreMedia = async (media: string, session: string, rights: boolean, minors: boolean, note = "") => { const r = await rpc<boolean>("media_restore", { p_media: media, p_rights: rights, p_minors: minors, p_note: note }); if (r.ok) reconcileSession(session); return r }
export const sectionMinorsList = () => rpc<{ can_update: boolean; sections: { id: string; name: string; minors: boolean }[] }>("section_minors_list")
export const setSectionMinors = (section: string, minors: boolean) => rpc<number>("set_section_minors", { p_section: section, p_minors: minors })
/** Mise en quarantaine ou retour des fichiers d'une séance (la base a déjà coupé les accès) */
export const reconcileSession = (session: string) => fn<{ done: number }>("reconcile", { session })

export type Ticket = { token: string; expires_in: number; kind: string; mime: string; size: number }
export const mediaTicket = (media: string) => rpc<Ticket>("media_ticket", { p_media: media })
/** Adresse de lecture vidéo : relais du site, sans jeton (ni lien ni chemin de stockage) dans l'adresse.
 *  Le jeton est confié au site, qui le garde dans un cookie HttpOnly limité à cette vidéo (lib/uzu/cm-proxy.ts). */
export async function videoSrc(media: string, t: Ticket, n: number): Promise<string | null> {
  try {
    const r = await fetch("/api/cm/ticket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, token: t.token, expires_in: t.expires_in }), cache: "no-store", credentials: "same-origin" })
    return r.ok ? `/api/cm/video/${media}?n=${n}` : null
  } catch { return null }
}
/** Après une erreur de lecture : accès retiré (403) ou format que l'appareil ne sait pas décoder ? */
export async function probeVideo(src: string): Promise<"denied" | "format" | "network"> {
  try { const r = await fetch(src, { headers: { Range: "bytes=0-1" }, cache: "no-store", credentials: "same-origin" }); return r.ok ? "format" : r.status === 403 ? "denied" : "network" }
  catch { return "network" }
}
export const HEVC_NOTE = "Vidéo au format HEVC (réglage « Haute efficacité » de l'iPhone) : certains téléphones Android anciens ne pourront pas la lire. Sur iPhone, Réglages › Appareil photo › Formats › « Le plus compatible » enregistre des vidéos lisibles partout."
export const FORMAT_MSG = "Cette vidéo ne peut pas être lue sur cet appareil : son format (HEVC, enregistré par un iPhone) n'est pas pris en charge ici. Elle reste lisible sur iPhone et sur la plupart des téléphones récents."
/** Photo : jeton passé dans un en-tête, image gardée en mémoire le temps de l'affichage */
export async function photoBlobUrl(token: string): Promise<{ ok: true; url: string } | { ok: false; code: string }> {
  try {
    const r = await fetch(`${FN_URL}/stream`, { headers: { "x-media-ticket": token }, cache: "no-store" })
    if (!r.ok) { const j = await r.json().catch(() => ({})) as { code?: string }; return { ok: false, code: j.code || "denied" } }
    return { ok: true, url: URL.createObjectURL(await r.blob()) }
  } catch { return { ok: false, code: "network" } }
}

// ---------- Préparation avant l'envoi
const PHOTO_MAX = 1600
/** Photo recompressée en JPEG (1600 px au plus, proportions gardées) : toutes les métadonnées disparaissent */
export async function preparePhoto(file: File): Promise<{ ok: true; blob: Blob; mime: MediaMime } | { ok: false; msg: string }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions)
    const k = Math.min(1, PHOTO_MAX / Math.max(bmp.width, bmp.height))
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k))
    const c = document.createElement("canvas"); c.width = w; c.height = h
    const g = c.getContext("2d"); if (!g) return { ok: false, msg: "Préparation de la photo impossible sur cet appareil" }
    g.drawImage(bmp, 0, 0, w, h); bmp.close?.()
    const blob = await new Promise<Blob | null>(res => c.toBlob(res, "image/jpeg", 0.85))
    if (!blob) return { ok: false, msg: "Préparation de la photo impossible" }
    return { ok: true, blob, mime: "image/jpeg" }
  } catch { return { ok: false, msg: "Photo illisible : choisis une photo JPG, PNG, WebP ou HEIC" } }
}
/** Vidéo : type réel lu dans le fichier, localisation neutralisée (MP4, MOV), aucune conversion */
export async function prepareVideo(file: File, maxBytes: number): Promise<{ ok: true; blob: Blob; mime: MediaMime; hevc?: boolean } | { ok: false; msg: string }> {
  if (file.size > maxBytes) return { ok: false, msg: "Vidéo trop lourde : 50 Mo au plus. Raccourcis-la ou filme en 720p" }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const mime = detectMime(bytes.subarray(0, 65536))
  if (mime !== "video/mp4" && mime !== "video/quicktime" && mime !== "video/webm") return { ok: false, msg: "Format non accepté : vidéo MP4, MOV ou WebM" }
  if (mime !== "video/webm" && videoIsHdr10(bytes)) return { ok: false, msg: HDR_MSG }
  if (mime !== "video/webm") neutralizeLocation(bytes)
  return { ok: true, blob: new Blob([bytes], { type: mime }), mime, hevc: mime !== "video/webm" && videoCodec(bytes) === "hevc" }
}

export type UploadStep = "prepare" | "reserve" | "upload" | "verify" | "done"
/** Réserver, envoyer à l'emplacement réservé, puis faire vérifier par la fonction serveur */
export async function addMedia(session: string, file: File, kind: "photo" | "video", rights: boolean, minors: boolean, maxBytes: number, step: (s: UploadStep) => void): Promise<R<{ validation: string; hevc: boolean }>> {
  step("prepare")
  const prep = kind === "photo" ? await preparePhoto(file) : await prepareVideo(file, maxBytes)
  if (!prep.ok) return { ok: false, msg: prep.msg }
  if (prep.blob.size > maxBytes) return { ok: false, msg: "Fichier trop lourd : 50 Mo au plus" }
  step("reserve")
  const res = await rpc<{ id: string; bucket: string; path: string }>("media_reserve", { p_session: session, p_kind: kind, p_mime: prep.mime, p_size: prep.blob.size, p_rights: rights, p_minors: minors })
  if (!res.ok) return res
  step("upload")
  const up = await uzu().storage.from(res.data.bucket).upload(res.data.path, prep.blob, { contentType: prep.mime, upsert: false, cacheControl: "0" })
  if (up.error) return { ok: false, msg: /size|large|413/i.test(up.error.message) ? "Fichier trop lourd pour le serveur" : "Envoi impossible pour l'instant" }
  step("verify")
  const v = await fn<{ ok: boolean; validation: string }>("finalize", { media: res.data.id })
  if (!v.ok) return v
  step("done")
  return { ok: true, data: { validation: v.data.validation, hevc: "hevc" in prep && !!prep.hevc } }
}

export const STATE_LBL: Record<string, string> = { uploading: "Envoi en cours", ready: "En ligne", quarantined: "Retiré (quarantaine)", deleted: "Effacé" }
export const VALID_LBL: Record<string, string> = { pending_validation: "En attente de validation", approved: "Validé", rejected: "Refusé" }
export const REQ_LBL: Record<string, string> = { requested: "Demande de retrait reçue", processing: "Demande en cours de traitement", completed: "Retrait effectué", rejected: "Demande refusée" }
