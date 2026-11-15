"use client"
// Sécurité et conformité : masquer un membre du fil, signaler un contenu, modération par le club,
// suppression complète de son compte. Tout est contrôlé côté serveur (script uzu-6-securite) :
// ces fonctions ne font qu'appeler les fonctions serveur et traduire leurs messages.
import { uzu } from "./client"
import { call, type RpcResult } from "./club"
import { cacheClear } from "./journal"

export const REPORT_REASONS: [string, string][] = [
  ["inapproprie", "Contenu inapproprié ou choquant"],
  ["harcelement", "Harcèlement ou moquerie"],
  ["faux", "Informations fausses (séance, grade, résultat)"],
  ["autre", "Autre motif"],
]
export const reasonLabel = (k: string) => (REPORT_REASONS.find(x => x[0] === k) || ["", "Autre motif"])[1]

/** Message lisible : fonction absente (script serveur pas encore appliqué) ou réseau coupé. */
function human<T>(r: RpcResult<T>): RpcResult<T> {
  if (r.ok) return r
  if (/could not find the function|PGRST202|schema cache/i.test(r.msg)) return { ok: false, msg: "Fonction pas encore disponible sur le serveur : réessaie un peu plus tard" }
  if (/failed to fetch|network|réseau/i.test(r.msg)) return { ok: false, msg: "Pas de réseau : réessaie avec une connexion" }
  return r
}

export async function reportContent(target: string, itemKey: string, itemText: string, reason: string, details: string): Promise<RpcResult<string>> {
  return human(await call<string>("report_content", { p_target: target, p_item_key: itemKey.slice(0, 120), p_item_text: itemText.slice(0, 300), p_reason: reason, p_details: details.trim().slice(0, 500) }))
}
export async function setBlock(target: string, on: boolean): Promise<RpcResult<boolean>> {
  return human(await call<boolean>("set_user_block", { p_target: target, p_on: on }))
}
export type Blocked = { user_id: string; name: string; at: string }
export async function listBlocks(): Promise<RpcResult<Blocked[]>> {
  const r = human(await call<Blocked[]>("list_my_blocks"))
  return r.ok ? { ok: true, data: Array.isArray(r.data) ? r.data : [] } : r
}
export type Report = { id: string; target_id: string | null; target_name: string; item_text: string; reason: string; details: string; status: "open" | "resolved" | "dismissed"; at: string; reporter: string; resolved_at: string | null }
export async function listReports(): Promise<RpcResult<Report[]>> {
  const r = human(await call<Report[]>("list_reports"))
  return r.ok ? { ok: true, data: Array.isArray(r.data) ? r.data : [] } : r
}
export async function resolveReport(id: string, status: "resolved" | "dismissed" | "open"): Promise<RpcResult<boolean>> {
  return human(await call<boolean>("resolve_report", { p_id: id, p_status: status }))
}

/** Suppression définitive du compte : données, appartenances, puis compte de connexion. */
export async function deleteMyAccount(uid: string): Promise<RpcResult<boolean>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, msg: "Suppression impossible hors connexion : réessaie avec du réseau" }
  const r = human(await call<boolean>("delete_my_account"))
  if (!r.ok) return r
  try { cacheClear(uid); cacheClear(uid + ":coach"); ["uzu-signup", "uzu-solo", "uzu-owner", "uzu-endbar"].forEach(k => localStorage.removeItem(k)) } catch { /* rien */ }
  try { await uzu().auth.signOut({ scope: "local" }) } catch { /* la session locale est effacée quand même */ }
  return r
}
