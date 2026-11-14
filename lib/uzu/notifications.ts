"use client"
// Notifications : même tables et fonctions serveur que l'ancienne application (public.notifications,
// public.push_subscriptions, get_notif_prefs / set_notif_prefs, uzu_notify_test).
import { uzu } from "./client"
import { VAPID_PUBLIC_KEY } from "./env"
import type { UzuContext } from "./context"
import { legacyRole } from "./training"

export type Notif = { id: number | string; kind: string; title: string; body: string | null; url: string | null; created_at: string; read_at: string | null }
export const NKINDS: Record<string, { i: string; n: string }> = {
  grade: { i: "🥋", n: "Validations de ton prof (ceinture, ★★★)" }, coach: { i: "📋", n: "Demandes de ceinture et résumé du lundi" }, equipe: { i: "👊", n: "Tes coéquipiers (★★, checks)" },
  news: { i: "📣", n: "Messages du club" }, saisie: { i: "✍️", n: "Rappel de saisie après le cours" }, reviser: { i: "🔁", n: "Techniques à réviser (le lundi)" },
  relance: { i: "⏰", n: "Relance après 14 jours sans séance" }, test: { i: "✅", n: "" },
}
export function kindsFor(ctx: UzuContext | null): string[] {
  const r = legacyRole(ctx)
  return r === "teacher" ? ["coach", "news"] : r === "solo" ? ["reviser", "relance"] : ["grade", "equipe", "news", "saisie", "reviser", "relance"]
}
export async function listNotifs(): Promise<Notif[]> {
  const { data, error } = await uzu().from("notifications").select("id,kind,title,body,url,created_at,read_at").order("created_at", { ascending: false }).limit(60)
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data as Notif[]) : []
}
export async function markAllRead(): Promise<void> { await uzu().from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null) }
export function listenNotifs(uid: string, cb: (n: Notif) => void): () => void {
  const sb = uzu(), ch = sb.channel("uzu-notif-new-" + uid).on("postgres_changes" as never, { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + uid } as never, (pl: { new?: Notif }) => { if (pl && pl.new) cb(pl.new) }).subscribe()
  return () => { sb.removeChannel(ch) }
}
export async function getPrefs(): Promise<Record<string, boolean>> { const { data, error } = await uzu().rpc("get_notif_prefs"); if (error) throw new Error(error.message); return (data as Record<string, boolean>) || {} }
export async function setPrefs(p: Record<string, boolean>): Promise<Record<string, boolean>> { const { data, error } = await uzu().rpc("set_notif_prefs", { prefs: p }); if (error) throw new Error(error.message); return (data as Record<string, boolean>) || p }

// ---------- Notifications sur le téléphone (push) ----------
export type PushState = "ok" | "ios-install" | "unsupported" | "nokey" | "denied"
export function pushSupport(): PushState {
  const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/i.test(ua)
  const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true || (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches)
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !standalone ? "ios-install" : "unsupported"
  if (ios && !standalone) return "ios-install"
  if (!VAPID_PUBLIC_KEY) return "nokey"
  if (Notification.permission === "denied") return "denied"
  return "ok"
}
function b64u(s: string) { const p = "===".slice((s.length + 3) % 4), b = atob((s + p).replace(/-/g, "+").replace(/_/g, "/")), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a }
async function savePush(uid: string, sub: PushSubscription) {
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh: string; auth: string } }
  if (!j.keys) throw new Error("abonnement invalide")
  const { error } = await uzu().from("push_subscriptions").upsert({ endpoint: j.endpoint, user_id: uid, p256dh: j.keys.p256dh, auth: j.keys.auth, ua: String(navigator.userAgent || "").slice(0, 200), last_seen: new Date().toISOString() }, { onConflict: "endpoint" })
  if (error) throw new Error(error.message)
}
/** Abonnement actuel de ce téléphone (re-déclaré au serveur à chaque ouverture, comme l'ancienne application). */
export async function currentPush(uid: string): Promise<PushSubscription | null> {
  if (pushSupport() !== "ok" || Notification.permission !== "granted") return null
  try { const reg = await navigator.serviceWorker.getRegistration("/"); const sub = reg ? await reg.pushManager.getSubscription() : null; if (sub) savePush(uid, sub).catch(() => {}); return sub } catch { return null }
}
export async function enablePush(uid: string): Promise<{ ok: true } | { ok: false; msg: string }> {
  if (pushSupport() !== "ok") return { ok: false, msg: "Notifications indisponibles sur ce téléphone" }
  const perm = await Notification.requestPermission()
  if (perm !== "granted") return { ok: false, msg: "Notifications refusées sur ce téléphone" }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" })
    const reg = await navigator.serviceWorker.ready
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC_KEY) })
    await savePush(uid, sub)
    uzu().rpc("uzu_notify_test").then(() => {}, () => {})
    return { ok: true }
  } catch (e) { return { ok: false, msg: "Activation impossible : " + String((e as Error)?.message || e).slice(0, 80) } }
}
export async function disablePush(sub: PushSubscription | null): Promise<void> {
  if (!sub) return
  try { await uzu().from("push_subscriptions").delete().eq("endpoint", sub.endpoint) } catch { /* rien */ }
  try { await sub.unsubscribe() } catch { /* rien */ }
}
export async function testPush(): Promise<boolean> { const { error } = await uzu().rpc("uzu_notify_test"); return !error }
