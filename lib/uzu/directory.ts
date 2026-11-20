"use client"
// « Où rouler ? » — annuaire privé des clubs (scripts uzu-14a0, uzu-14a). Tout passe par des fonctions serveur.
import { uzu } from "./client"

export type DirDisc = "jjb_gi" | "grappling_nogi"
export type DirKind = "open_mat" | "open_class" | "trial"
export type Commune = { insee: string; nom: string; departement: string; code_postal: string }
export type DirSession = { d: number; s: string; e: string; disc: DirDisc | null; kind: DirKind; price: string; notes: string; title: string }
export type DirClubHit = { slug: string; name: string; uzu: boolean; commune: string; dep: string; band: string; disciplines: DirDisc[]; sessions: DirSession[]; n_sessions: number; price: string; verified_at: string | null }
export type DirSearch = { commune: { insee: string; nom: string; dep: string }; radius: number; clubs: DirClubHit[] }
export type Welcome = { price?: string; license?: string; rules?: string; contact_first?: boolean; notes?: string }
export type DirClub = { slug: string; name: string; uzu: boolean; status: string; commune: string; dep: string; insee: string; address: string; disciplines: DirDisc[]; description: string; website: string; instagram: string; phone: string; email: string; welcome: Welcome; verified_at: string | null; sessions: DirSession[] }
export type MySlot = { id: string; d: number; s: string; e: string; t: string; disc: DirDisc | null; course_kind: string; pub: boolean; kind: DirKind | null; price: string; notes: string }
export type MyDirClub = { exists: boolean; can_edit: boolean; slug: string | null; status: string; name: string; insee: string | null; commune: string | null; address: string; disciplines: DirDisc[]; description: string; website: string; instagram: string; phone: string; email: string; welcome: Welcome; slots: MySlot[] }

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
export const saveMyDirClub = (p: Record<string, unknown>) => rpc<{ ok: boolean; slug: string; slots: number }>("dir_my_club_save", { p })
export const suggestClub = (slug: string | null, p: { name?: string; commune?: string; details?: string; contact?: string }) => rpc<boolean>("dir_suggest", { p_slug: slug, p })

// Dernière commune cherchée, gardée sur cet appareil seulement
const LAST = "uzu.dir.commune"
export function lastCommune(): Commune | null { try { const v = localStorage.getItem(LAST); return v ? JSON.parse(v) as Commune : null } catch { return null } }
export function rememberCommune(c: Commune) { try { localStorage.setItem(LAST, JSON.stringify(c)) } catch { /* sans effet */ } }
