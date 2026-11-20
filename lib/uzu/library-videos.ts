"use client"
// Bibliothèque : vidéos pédagogiques des fiches techniques et des enchaînements (script uzu-9b).
// Stockage : le stockage pédagogique EXISTANT « videos », sous-dossier <club>/lib/ (jamais Class Media).
// Envoi en trois temps : réservation par le serveur → dépôt du fichier à l'emplacement réservé →
// confirmation (le serveur vérifie la taille et le type du fichier réellement déposé).
// Lecture : lien signé du stockage pédagogique, comme les vidéos « focus » et « système ».
import { uzu } from "./client"
import { clearLibraryCache } from "./library"
import { HDR_MSG, detectMime, neutralizeLocation, videoCodec, videoIsHdr10 } from "../../supabase/functions/_shared/media-format"

export type LibVideoTarget = "technique" | "flow"
export type LibVideo = {
  id: string; target_kind: LibVideoTarget; technique_id: string | null; flow_id: string | null; title: string
  path: string; poster_path: string | null; mime: string; size_bytes: number; duration_s: number | null
  width: number | null; height: number | null; position: number
}
export const LIB_VIDEO_MAX = 50 * 1024 * 1024
export const LIB_VIDEO_PER_TARGET = 10
const BUCKET = "videos"
const COLS = "id,target_kind,technique_id,flow_id,title,path,poster_path,mime,size_bytes,duration_s,width,height,position"

type R<T> = { ok: true; data: T } | { ok: false; msg: string }
async function rpc<T>(name: string, args: Record<string, unknown>): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée" }
    clearLibraryCache()
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}

/** Vidéos en ligne du club (toutes cibles). Table absente (script non appliqué) : liste vide. */
export async function loadAllLibVideos(): Promise<LibVideo[]> {
  try {
    const { data, error } = await uzu().from("club_lib_videos").select(COLS).eq("status", "ready").order("position")
    return error ? [] : ((data || []) as LibVideo[]).map(norm)
  } catch { return [] }
}
/** Vidéos en ligne d'une fiche ou d'un enchaînement */
export async function loadLibVideos(kind: LibVideoTarget, target: string): Promise<LibVideo[]> {
  try {
    const { data, error } = await uzu().from("club_lib_videos").select(COLS).eq("status", "ready").eq(kind === "technique" ? "technique_id" : "flow_id", target).order("position")
    return error ? [] : ((data || []) as LibVideo[]).map(norm)
  } catch { return [] }
}
const norm = (v: LibVideo): LibVideo => ({ ...v, duration_s: v.duration_s == null ? null : Number(v.duration_s), size_bytes: Number(v.size_bytes) })
export const videosOf = (all: LibVideo[], kind: LibVideoTarget, target: string) =>
  all.filter(v => v.target_kind === kind && (kind === "technique" ? v.technique_id : v.flow_id) === target).sort((a, b) => a.position - b.position)

// ---------------------------------------------------------------- Lecture (liens signés, 6 h)
const signed = new Map<string, { url: string; exp: number }>()
export async function libSignedUrl(path: string): Promise<string> {
  const c = signed.get(path); if (c && c.exp > Date.now()) return c.url
  try {
    const { data, error } = await uzu().storage.from(BUCKET).createSignedUrl(path, 6 * 3600)
    if (!error && data?.signedUrl) { signed.set(path, { url: data.signedUrl, exp: Date.now() + 5 * 3600e3 }); return data.signedUrl }
  } catch { /* ci-dessous */ }
  return ""
}
export const fmtDuration = (s: number | null) => s == null ? "" : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`

// ---------------------------------------------------------------- Préparation du fichier
export const LIB_FORMAT_MSG = "Format non accepté : vidéo MP4, MOV (iPhone) ou WebM"
export type Prepared = { blob: Blob; mime: "video/mp4" | "video/webm"; hevc: boolean }
/** Contrôle du fichier choisi : vrai format (octets), 50 Mo, HDR 10 bits refusé, position GPS effacée */
export async function prepareLibVideo(file: File): Promise<{ ok: true; v: Prepared } | { ok: false; msg: string }> {
  if (file.size > LIB_VIDEO_MAX) return { ok: false, msg: "Vidéo trop lourde : 50 Mo au plus. Raccourcis-la ou filme en 720p" }
  if (!file.size) return { ok: false, msg: "Fichier vide" }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const real = detectMime(bytes.subarray(0, 65536))
  if (real !== "video/mp4" && real !== "video/quicktime" && real !== "video/webm") return { ok: false, msg: LIB_FORMAT_MSG }
  if (real !== "video/webm" && videoIsHdr10(bytes)) return { ok: false, msg: HDR_MSG }
  if (real !== "video/webm") neutralizeLocation(bytes)
  // MOV de l'iPhone : enregistré comme MP4 (même conteneur), comme les vidéos pédagogiques existantes
  const mime = real === "video/webm" ? "video/webm" : "video/mp4"
  return { ok: true, v: { blob: new Blob([bytes], { type: mime }), mime, hevc: real !== "video/webm" && videoCodec(bytes) === "hevc" } }
}

/** Miniature (image JPEG d'environ 1 s) et dimensions, calculées dans le navigateur. Jamais bloquant. */
export async function makePoster(blob: Blob): Promise<{ poster: Blob | null; duration: number | null; width: number | null; height: number | null }> {
  const none = { poster: null, duration: null, width: null, height: null }
  if (typeof document === "undefined") return none
  const url = URL.createObjectURL(blob)
  const v = document.createElement("video")
  v.muted = true; v.playsInline = true; v.preload = "auto"; v.setAttribute("playsinline", ""); v.setAttribute("muted", "")
  const wait = (ev: string, ms: number) => new Promise<boolean>(res => {
    const t = window.setTimeout(() => res(false), ms)
    v.addEventListener(ev, () => { window.clearTimeout(t); res(true) }, { once: true })
    v.addEventListener("error", () => { window.clearTimeout(t); res(false) }, { once: true })
  })
  try {
    v.src = url
    if (!(await wait("loadedmetadata", 8000))) return none
    const duration = isFinite(v.duration) ? v.duration : null, width = v.videoWidth || null, height = v.videoHeight || null
    if (!width || !height) return { poster: null, duration, width: null, height: null }
    v.currentTime = Math.min(1, (duration || 2) / 2)
    if (!(await wait("seeked", 8000))) return { poster: null, duration, width, height }
    const scale = Math.min(1, 640 / Math.max(width, height))
    const c = document.createElement("canvas"); c.width = Math.round(width * scale); c.height = Math.round(height * scale)
    const g = c.getContext("2d"); if (!g) return { poster: null, duration, width, height }
    g.drawImage(v, 0, 0, c.width, c.height)
    const poster = await new Promise<Blob | null>(res => c.toBlob(b => res(b), "image/jpeg", 0.75))
    return { poster: poster && poster.size <= 1024 * 1024 ? poster : null, duration, width, height }
  } catch { return none } finally { v.removeAttribute("src"); v.load(); URL.revokeObjectURL(url) }
}

// ---------------------------------------------------------------- Ajout, remplacement, retrait
export type LibUploadStep = "prepare" | "reserve" | "upload" | "verify" | "done"
const cleanup = (paths: string[] | undefined) => { if (paths?.length) uzu().storage.from(BUCKET).remove(paths).catch(() => {}) }
export async function addLibVideo(kind: LibVideoTarget, target: string, file: File, title: string, rights: boolean, replaces: string | null,
  step: (s: LibUploadStep) => void): Promise<R<{ id: string; hevc: boolean }>> {
  step("prepare")
  const p = await prepareLibVideo(file); if (!p.ok) return p
  if (!rights) return { ok: false, msg: "Confirme que les personnes filmées (et les représentants légaux des mineurs) ont donné leur accord" }
  const meta = await makePoster(p.v.blob)
  step("reserve")
  const res = await rpc<{ id: string; bucket: string; path: string; poster_path: string }>("library_video_reserve",
    { p_target_kind: kind, p_target: target, p_mime: p.v.mime, p_size: p.v.blob.size, p_title: title.trim(), p_rights: rights, p_replaces: replaces })
  if (!res.ok) return res
  step("upload")
  const st = uzu().storage.from(BUCKET)
  const up = await st.upload(res.data.path, p.v.blob, { contentType: p.v.mime, upsert: false, cacheControl: "3600" })
  if (up.error) {
    await rpc("library_video_remove", { p_id: res.data.id })
    return { ok: false, msg: /size|large|413/i.test(up.error.message) ? "Vidéo trop lourde pour le serveur" : /403|row-level|unauthori/i.test(up.error.message) ? "Envoi refusé : droit requis" : "Envoi impossible pour l'instant : vérifie la connexion et réessaie" }
  }
  if (meta.poster) await st.upload(res.data.poster_path, meta.poster, { contentType: "image/jpeg", upsert: false, cacheControl: "3600" }).catch(() => null)
  step("verify")
  const c = await rpc<{ ok: boolean; msg?: string; cleanup?: string[] }>("library_video_confirm",
    { p_id: res.data.id, p_duration: meta.duration, p_width: meta.width, p_height: meta.height })
  if (!c.ok) return c
  cleanup(c.data.cleanup)
  if (!c.data.ok) return { ok: false, msg: c.data.msg || "Vidéo refusée" }
  step("done")
  return { ok: true, data: { id: res.data.id, hevc: p.v.hevc } }
}
export async function removeLibVideo(id: string): Promise<R<true>> {
  const r = await rpc<{ ok: boolean; cleanup?: string[] }>("library_video_remove", { p_id: id })
  if (!r.ok) return r
  cleanup(r.data.cleanup)
  return { ok: true, data: true }
}
export const updateLibVideo = (id: string, title: string | null, move: -1 | 0 | 1 = 0) => rpc<boolean>("library_video_update", { p_id: id, p_title: title, p_move: move })
export const STEP_TXT: Record<LibUploadStep, string> = { prepare: "Vérification du fichier…", reserve: "Préparation de l'envoi…", upload: "Envoi de la vidéo…", verify: "Vérification par le serveur…", done: "Vidéo en ligne" }
