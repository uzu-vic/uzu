"use client"
// Partenaires d'entraînement : identifier les membres du club avec qui on a travaillé sur une séance.
// Le partenaire est notifié et confirme d'un geste ; chacun peut refuser d'être identifié.
// Contrôles côté serveur (script uzu-8-partenaires) : même club, réglage du partenaire, masquages.
import { uzu } from "./client"

type RpcResult<T> = { ok: true; data: T } | { ok: false; msg: string }
async function call<T>(name: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée" }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}

export type Candidate = { user_id: string; name: string }
export type Partner = Candidate & { status: "pending" | "confirmed" | "declined" }
export type TagForMe = { id: string; author_id: string; author_name: string; date: string; summary: string; status: "pending" | "confirmed" | "declined" }

const missing = (msg: string) => /could not find the function|PGRST202|schema cache/i.test(msg)
const arr = <T,>(r: RpcResult<T[]>): RpcResult<T[]> => r.ok ? { ok: true, data: Array.isArray(r.data) ? r.data : [] } : r

/** null = fonction absente du serveur (script pas encore appliqué) : le champ est masqué. */
export async function listCandidates(): Promise<Candidate[] | null> {
  const r = arr(await call<Candidate[]>("list_tag_candidates"))
  return r.ok ? r.data : missing(r.msg) ? null : []
}
export async function setSessionPartners(key: string, date: string, summary: string, ids: string[]): Promise<RpcResult<Partner[]>> {
  return arr(await call<Partner[]>("set_session_partners", { p_key: key, p_date: date, p_summary: summary.slice(0, 120), p_partners: ids }))
}
/** Partenaires de mes séances, par identifiant de séance. */
export async function mySessionPartners(since?: string): Promise<Record<string, Partner[]>> {
  const r = await call<Record<string, Partner[]>>("my_session_partners", { p_since: since || null })
  return r.ok && r.data && typeof r.data === "object" && !Array.isArray(r.data) ? r.data : {}
}
export async function tagsForMe(): Promise<TagForMe[]> {
  const r = arr(await call<TagForMe[]>("tags_for_me"))
  return r.ok ? r.data : []
}
export async function answerTag(id: string, ok: boolean): Promise<RpcResult<boolean>> { return call<boolean>("answer_tag", { p_id: id, p_ok: ok }) }
export async function getAllowTag(): Promise<boolean | null> {
  const r = await call<boolean>("get_allow_tag")
  return r.ok ? r.data !== false : null
}
export async function setAllowTag(on: boolean): Promise<RpcResult<boolean>> { return call<boolean>("set_allow_tag", { p_on: on }) }

/** « Gi · 1 h 30 · Lutte & Scrambles » : résumé envoyé au partenaire (aucune donnée privée). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function sessionSummary(C: any, s: any): string {
  if (C.isPrepa(s)) return "Prépa physique"
  const d = +s.dur || 0, h = Math.floor(d / 60), m = d % 60
  const dur = d ? (h ? `${h} h${m ? " " + String(m).padStart(2, "0") : ""}` : `${m} min`) : ""
  const sys = s.sys && C.SYSTEMS[s.sys] ? C.SYSTEMS[s.sys].n : ""
  return [s.kind === "open" ? "Open mat" : s.type || "Gi", dur, sys].filter(Boolean).join(" · ")
}
