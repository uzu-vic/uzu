"use client"
// « Où rouler ? » — annuaire privé des clubs (scripts uzu-14a0, uzu-14a, uzu-14a2). Tout passe par des fonctions serveur.
import { uzu } from "./client"

export type DirDisc = "jjb_gi" | "grappling_nogi"
export type DirKind = "open_mat" | "open_class" | "trial"
export type Commune = { insee: string; nom: string; departement: string; code_postal: string }
export type DirSession = { d: number; s: string; e: string; disc: DirDisc | null; kind: DirKind; price: string; notes: string; title: string }
export type DirClubHit = { slug: string; name: string; uzu: boolean; commune: string; dep: string; band: string; disciplines: DirDisc[]; sessions: DirSession[]; n_sessions: number; price: string; verified_at: string | null }
export type DirSearch = { commune: { insee: string; nom: string; dep: string }; radius: number; clubs: DirClubHit[] }
export type Welcome = { price?: string; license?: string; rules?: string; contact_first?: boolean; notes?: string }
export type DirClub = { slug: string; name: string; uzu: boolean; status: string; commune: string; dep: string; insee: string; address: string; disciplines: DirDisc[]; description: string; website: string; instagram: string; phone: string; email: string; welcome: Welcome; verified_at: string | null; sessions: DirSession[]; origin?: string; moderated?: boolean; moderation_note?: string }
export type MySlot = { id: string; d: number; s: string; e: string; t: string; disc: DirDisc | null; course_kind: string; pub: boolean; kind: DirKind | null; price: string; notes: string }
export type MyDirClub = { exists: boolean; can_edit: boolean; slug: string | null; status: string; name: string; insee: string | null; commune: string | null; address: string; disciplines: DirDisc[]; description: string; website: string; instagram: string; phone: string; email: string; welcome: Welcome; slots: MySlot[]; moderated?: boolean }

type R<T> = { ok: true; data: T } | { ok: false; msg: string }
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: /function .* does not exist|Could not find the function/i.test(error.message) ? "L'annuaire n'est pas encore disponible" : error.message || "Action refusée" }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}

export const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
export const DSHORT = ["Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam.", "Dim."]
export const DISC_LBL: Record<DirDisc, string> = { jjb_gi: "JJB Gi", grappling_nogi: "No-Gi / Grappling" }
export const KIND_LBL: Record<DirKind, string> = { open_mat: "Open mat", open_class: "Cours ouvert aux visiteurs", trial: "Cours d'essai" }
export const KIND_SHORT: Record<DirKind, string> = { open_mat: "Open mat", open_class: "Cours ouvert", trial: "Cours d'essai" }
export const sessionLine = (x: DirSession) => `${DSHORT[x.d] || ""} ${x.s}–${x.e}`

export const searchCommunes = (q: string) => rpc<Commune[]>("geo_commune_search", { p_q: q, p_limit: 8 })
export const searchClubs = (insee: string, radius: number, disc: DirDisc | null, kind: DirKind | null, day: number | null) =>
  rpc<DirSearch>("dir_search", { p_insee: insee, p_radius: radius, p_disc: disc, p_kind: kind, p_day: day })
export const getClub = (slug: string) => rpc<DirClub>("dir_get", { p_slug: slug })
export const myDirClub = () => rpc<MyDirClub>("dir_my_club")
export const saveMyDirClub = (p: Record<string, unknown>) => rpc<{ ok: boolean; slug: string; slots: number; moderated?: boolean }>("dir_my_club_save", { p })
export const suggestClub = (slug: string | null, p: { name?: string; commune?: string; details?: string; contact?: string }) => rpc<boolean>("dir_suggest", { p_slug: slug, p })

// ---------- Référent UZU (uzu-14a2) : les droits sont vérifiés par le serveur, l'écran ne fait qu'afficher
export type AdminClub = { slug: string; name: string; uzu: boolean; origin: string; status: "draft" | "published" | "hidden"; moderated: boolean; commune: string; dep: string; n_sessions: number; verified_at: string | null; open_suggestions: number }
export type Suggestion = { id: string; club: string | null; slug: string | null; uzu: boolean | null; payload: { name?: string; commune?: string; details?: string; contact?: string }; status: "open" | "accepted" | "rejected"; at: string; resolved_at: string | null }
export type ModLog = { id: number; action: string; target: string; details: Record<string, unknown>; at: string; actor: string }
export type StaffSession = { d: number; s: string; e: string; disc: DirDisc | null; kind: DirKind; price: string; notes: string }
export const dirWhoami = async () => { const r = await rpc<{ moderator: boolean }>("dir_whoami"); return r.ok && !!r.data?.moderator }
export const adminList = (dep: string | null, q: string, status: string | null) => rpc<AdminClub[]>("dir_admin_list", { p_dep: dep, p_q: q || null, p_status: status })
export const adminSave = (p: Record<string, unknown>) => rpc<{ ok: boolean; slug: string }>("dir_admin_save", { p })
export const adminSetStatus = (slug: string, status: string, note = "") => rpc<{ ok: boolean }>("dir_admin_set_status", { p_slug: slug, p_status: status, p_note: note })
export const adminSuggestions = (status: string | null) => rpc<Suggestion[]>("dir_admin_suggestions", { p_status: status })
export const adminResolve = (id: string, status: "accepted" | "rejected" | "open") => rpc<boolean>("dir_admin_resolve", { p_id: id, p_status: status })
export const adminLog = (limit = 50) => rpc<ModLog[]>("dir_admin_log", { p_limit: limit })
export const STATUS_LBL: Record<string, string> = { draft: "Brouillon", published: "Publiée", hidden: "Masquée" }

// Dernière commune cherchée, gardée sur cet appareil seulement
const LAST = "uzu.dir.commune"
export function lastCommune(): Commune | null { try { const v = localStorage.getItem(LAST); return v ? JSON.parse(v) as Commune : null } catch { return null } }
export function rememberCommune(c: Commune) { try { localStorage.setItem(LAST, JSON.stringify(c)) } catch { /* sans effet */ } }
