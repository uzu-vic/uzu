"use client"
// Vidéos pédagogiques du club : même stockage que l'ancienne application.
// Fichier : stockage « videos », chemin <académie>/<horodatage>-<aléa>.mp4|webm ; référence : document videos/<académie>/<emplacement>.
import { useEffect, useState } from "react"
import { uzu } from "./client"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export type VideoMap = Record<string, { id: string; uploadedAt?: string; by?: string }>
export const VIDEO_MAX = 50 * 1024 * 1024

export function videoSlots(C: Any): { k: string; label: string }[] {
  return [{ k: "club-semaine", label: "Focus tactique (tous les élèves)" }].concat((C.SYS_KEYS as string[]).map(k => ({ k: "sys-" + k, label: "Système · " + C.SYSTEMS[k].n })))
}
export async function loadVideos(clubId: string): Promise<VideoMap> {
  const pre = "videos/" + clubId + "/"
  const { data, error } = await uzu().from("docs").select("path,data").like("path", pre + "%")
  if (error) return {}
  const out: VideoMap = {}
  for (const r of (Array.isArray(data) ? data : []) as { path: string; data: Any }[]) { const k = r.path.slice(pre.length); if (k && !k.includes("/") && r.data?.id) out[k] = r.data }
  return out
}
/** Ancienne adresse publique : utilisée seulement en repli, tant que le stockage n'est pas passé en privé. */
export const videoUrl = (id: string) => uzu().storage.from("videos").getPublicUrl(id).data.publicUrl

// Stockage privé : lien signé valable 6 h, réservé aux membres connectés du club (règle serveur).
const signed = new Map<string, { url: string; exp: number }>()
export async function videoSignedUrl(id: string): Promise<string> {
  const c = signed.get(id); if (c && c.exp > Date.now()) return c.url
  try {
    const { data, error } = await uzu().storage.from("videos").createSignedUrl(id, 6 * 3600)
    if (!error && data?.signedUrl) { signed.set(id, { url: data.signedUrl, exp: Date.now() + 5 * 3600e3 }); return data.signedUrl }
  } catch { /* repli ci-dessous */ }
  return videoUrl(id)
}
export function useVideoUrl(id: string | null | undefined): string {
  const [url, setUrl] = useState("")
  useEffect(() => {
    if (!id) { setUrl(""); return }
    let live = true
    videoSignedUrl(id).then(u => { if (live) setUrl(u) })
    return () => { live = false }
  }, [id])
  return url
}

/** Type accepté (mêmes règles que l'ancienne application) ou message d'erreur. */
export function checkVideo(f: File): { type: string } | { msg: string } {
  const t = f.type === "video/webm" ? "video/webm" : (f.type === "video/mp4" || f.type === "video/quicktime" || /\.(mp4|m4v|mov)$/i.test(f.name)) ? "video/mp4" : ""
  if (!t) return { msg: "Format non accepté : envoie une vidéo MP4 ou WebM" }
  if (f.size > VIDEO_MAX) return { msg: "Vidéo trop lourde (50 Mo max) : raccourcis-la ou filme en 720p" }
  return { type: t }
}

export async function uploadVideo(clubId: string, slot: string, f: File, myUid: string, previous?: string): Promise<{ ok: true } | { ok: false; msg: string }> {
  const c = checkVideo(f); if ("msg" in c) return { ok: false, msg: c.msg }
  const sb = uzu(), p = clubId + "/" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8) + (c.type === "video/webm" ? ".webm" : ".mp4")
  const up = await sb.storage.from("videos").upload(p, f, { contentType: c.type, upsert: false })
  if (up.error) {
    const m = String((up.error as Any).statusCode || "") + " " + (up.error.message || "")
    return { ok: false, msg: /413|size|large/i.test(m) ? "Vidéo trop lourde pour le serveur" : /403|row-level|unauthori/i.test(m) ? "Envoi refusé : droit requis" : "Envoi impossible pour l'instant" }
  }
  const { error } = await sb.from("docs").upsert({ path: "videos/" + clubId + "/" + slot, data: { id: p, uploadedAt: new Date().toISOString(), by: myUid }, updated_at: new Date().toISOString() })
  if (error) { await sb.storage.from("videos").remove([p]).catch(() => {}); return { ok: false, msg: "Envoi refusé : droit requis" } }
  if (previous && previous !== p) sb.storage.from("videos").remove([previous]).catch(() => {})
  return { ok: true }
}
export async function removeVideo(clubId: string, slot: string, id: string): Promise<{ ok: true } | { ok: false; msg: string }> {
  const sb = uzu()
  const { error } = await sb.from("docs").delete().eq("path", "videos/" + clubId + "/" + slot)
  if (error) return { ok: false, msg: "Impossible de retirer la vidéo pour l'instant" }
  if (id) sb.storage.from("videos").remove([id]).catch(() => {})
  return { ok: true }
}
