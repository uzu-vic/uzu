"use client"
// « Où rouler ? » étape 2 — partenaires de roulage (script uzu-14b). Tout passe par des fonctions serveur :
// les règles de visibilité, de majorité, de blocage et de limites sont vérifiées côté serveur.
import { uzu } from "./client"
import type { DirDisc } from "./directory"

export type Intensity = "technique" | "modere" | "intense"
export type Part = "matin" | "midi" | "soir"
export type Place = "club" | "open_mat" | "a_convenir"
export type Visibility = "hidden" | "clubs" | "uzu"
export type Belt = "blanche" | "bleue" | "violette" | "marron" | "noire"

export type RoulerProfile = {
  status: "active" | "paused"; visibility: Visibility; home_insee: string; home_commune: string | null
  disciplines: DirDisc[]; intensities: Intensity[]; show_belt: boolean; show_club_id: string | null; years: number | null; adult_declared_at: string
}
export type MyAvailability = {
  id: string; insee: string; commune: string | null; is_travel: boolean; starts_on: string; ends_on: string; days: number[]; parts: Part[]
  disciplines: DirDisc[]; intensities: Intensity[]; places: Place[]; note: string; state: "current" | "upcoming"
}
export type RoulerMe = { minor: boolean; name: string; belt: Belt | null; clubs: { id: string; name: string }[]; profile: RoulerProfile | null; availabilities: MyAvailability[] }
export type Partner = {
  handle: string; name: string; belt: Belt | null; years: number | null; club: string | null; commune: string; dep: string; band: string
  starts_on: string; ends_on: string; days: number[]; parts: Part[]; disciplines: DirDisc[]; intensities: Intensity[]; places: Place[]; note: string
}
export type PartnerSearch = { need?: "activate" | "adult" | "paused" | "visible"; commune?: { insee: string; nom: string; dep: string }; radius?: number; from?: string; to?: string; results?: Partner[] }
export type BlockedPartner = { key: string; name: string; at: string }
export type RoulerReport = { key: string; name: string; profile_status: "active" | "paused" | "deleted"; count: number; reporters: number; reasons: Record<string, number>; last_at: string; last_details: string }

type R<T> = { ok: true; data: T } | { ok: false; msg: string }
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: /function .* does not exist|Could not find the function|PGRST202|schema cache/i.test(error.message) ? "Les partenaires de roulage ne sont pas encore disponibles" : error.message || "Action refusée" }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: /failed to fetch|network/i.test((e as Error).message || "") ? "Pas de réseau : réessaie avec une connexion" : (e as Error).message || "Réseau indisponible" } }
}

export const INT_LBL: Record<Intensity, string> = { technique: "Technique", modere: "Modéré", intense: "Intense" }
export const PART_LBL: Record<Part, string> = { matin: "Matin", midi: "Midi", soir: "Soir" }
export const PLACE_LBL: Record<Place, string> = { club: "Dans un club", open_mat: "Open mat", a_convenir: "À convenir" }
export const VIS_LBL: Record<Visibility, string> = { hidden: "Personne", clubs: "Mes clubs", uzu: "Tout UZU" }
export const BELTS: Belt[] = ["blanche", "bleue", "violette", "marron", "noire"]
export const BELT_LBL: Record<Belt, string> = { blanche: "Blanche", bleue: "Bleue", violette: "Violette", marron: "Marron", noire: "Noire" }
export const REASONS: [string, string][] = [["inapproprie", "Comportement inapproprié"], ["harcelement", "Harcèlement"], ["faux", "Faux profil"], ["mineur", "Mineur"], ["autre", "Autre"]]
export const DMIN = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"]

export const roulerMe = () => rpc<RoulerMe>("rouler_me")
export const roulerActivate = (p: Record<string, unknown>) => rpc<RoulerMe>("rouler_activate", { p })
export const roulerSaveProfile = (p: Record<string, unknown>) => rpc<RoulerMe>("rouler_save_profile", { p })
export const roulerSetVisibility = (v: Visibility) => rpc<RoulerMe>("rouler_set_visibility", { p_visibility: v })
export const roulerDeleteProfile = () => rpc<boolean>("rouler_delete_profile")
export const roulerSaveAvailability = (p: Record<string, unknown>) => rpc<RoulerMe>("rouler_save_availability", { p })
export const roulerEndAvailability = (id: string) => rpc<RoulerMe>("rouler_end_availability", { p_id: id })
export const roulerSearch = (a: { insee: string; radius: number; from?: string | null; to?: string | null; disc?: DirDisc | null; beltMin?: Belt | null; beltMax?: Belt | null; intensity?: Intensity | null }) =>
  rpc<PartnerSearch>("rouler_search", { p_insee: a.insee, p_radius: a.radius, p_from: a.from || null, p_to: a.to || null, p_disc: a.disc || null, p_belt_min: a.beltMin || null, p_belt_max: a.beltMax || null, p_intensity: a.intensity || null })
export const roulerBlock = (handle: string) => rpc<boolean>("rouler_block", { p_handle: handle })
export const roulerMyBlocks = () => rpc<BlockedPartner[]>("rouler_my_blocks")
export const roulerUnblock = (key: string) => rpc<boolean>("rouler_unblock", { p_key: key })
export const roulerReport = (handle: string, reason: string, details: string) => rpc<boolean>("rouler_report", { p_handle: handle, p_reason: reason, p_details: details.trim().slice(0, 500) })
export const roulerAdminReports = (status: string | null) => rpc<RoulerReport[]>("rouler_admin_reports", { p_status: status })
export const roulerAdminResolve = (key: string, decision: "keep" | "restore" | "dismiss") => rpc<boolean>("rouler_admin_resolve", { p_key: key, p_decision: decision })

// Dates : chaînes AAAA-MM-JJ en heure locale
export const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
export const addDays = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); return isoDay(new Date(y, m - 1, d + n)) }
export const today = () => isoDay(new Date())
export const fmtDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) }
export const fmtRange = (a: string, b: string) => a === b ? fmtDay(a) : `${fmtDay(a)} → ${fmtDay(b)}`
export const daysLine = (days: number[]) => days.length === 7 ? "tous les jours" : [...days].sort((a, b) => a - b).map(d => DMIN[d]).join(", ")
