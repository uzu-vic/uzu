"use client"
// « Où rouler ? » étape 2 — partenaires de roulage (script uzu-14b). Tout passe par des fonctions serveur :
// les règles de visibilité, de majorité, de blocage et de limites sont vérifiées côté serveur.
import { uzu } from "./client"
import type { DirDisc } from "./directory"

export type Intensity = "technique" | "modere" | "intense"
export type Place = "club" | "open_mat" | "a_convenir"
export type Visibility = "hidden" | "clubs" | "uzu"
export type Belt = "blanche" | "bleue" | "violette" | "marron" | "noire"
export type When = "now" | "30" | "60" | "120" | "240" | "custom" | "slot"

export type RoulerProfile = {
  status: "active" | "paused"; visibility: Visibility; home_insee: string; home_commune: string | null; home_tz: string
  disciplines: DirDisc[]; intensities: Intensity[]; show_belt: boolean; show_club_id: string | null; years: number | null; adult_declared_at: string
}
// Créneau : début et fin en heure universelle (ISO), fuseau du lieu de roulage
export type MyAvailability = {
  id: string; insee: string; commune: string | null; tz: string; is_travel: boolean; starts_at: string; ends_at: string; minutes: number
  disciplines: DirDisc[]; intensities: Intensity[]; places: Place[]; note: string; state: "current" | "upcoming"; compatible: number
}
export type RoulerMe = { now: string; minor: boolean; name: string; belt: Belt | null; clubs: { id: string; name: string }[]; profile: RoulerProfile | null; availabilities: MyAvailability[] }
export type Partner = {
  handle: string; name: string; belt: Belt | null; years: number | null; club: string | null; commune: string; dep: string; band: string; tz: string; is_travel: boolean
  starts_at: string; ends_at: string; common_start: string; common_end: string; common_minutes: number
  disciplines: DirDisc[]; intensities: Intensity[]; places: Place[]; note: string
}
export type PartnerSearch = {
  need?: "activate" | "adult" | "paused" | "visible"; commune?: { insee: string; nom: string; dep: string; tz: string }; radius?: number
  when?: When; minutes?: number; required_minutes?: number; window?: { start: string; end: string; tz: string }; now?: string; results?: Partner[]
}
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
export const PLACE_LBL: Record<Place, string> = { club: "Dans un club", open_mat: "Open mat", a_convenir: "À convenir" }
export const VIS_LBL: Record<Visibility, string> = { hidden: "Personne", clubs: "Mes clubs", uzu: "Tout UZU" }
export const BELTS: Belt[] = ["blanche", "bleue", "violette", "marron", "noire"]
export const BELT_LBL: Record<Belt, string> = { blanche: "Blanche", bleue: "Bleue", violette: "Violette", marron: "Marron", noire: "Noire" }
export const REASONS: [string, string][] = [["inapproprie", "Comportement inapproprié"], ["harcelement", "Harcèlement"], ["faux", "Faux profil"], ["mineur", "Mineur"], ["autre", "Autre"]]
export const WHEN_LBL: Record<Exclude<When, "slot">, string> = { now: "Maintenant", "30": "Dans 30 min", "60": "Dans 1 h", "120": "Dans 2 h", "240": "Dans 4 h", custom: "Autre moment" }
export const WHEN_OFFSET: Record<string, number> = { now: 0, "30": 30, "60": 60, "120": 120, "240": 240 }
export const SLOT_MINUTES = [60, 90, 120, 180]
export const COMMON_MINUTES = [30, 60, 90, 120]

// Réponse vide ou inattendue (module absent, serveur ancien) : traitée comme « pas encore disponible », jamais comme un plantage
const meOk = (r: R<RoulerMe>): R<RoulerMe> => r.ok && (!r.data || typeof r.data !== "object" || !Array.isArray(r.data.availabilities)) ? { ok: false, msg: "Les partenaires de roulage ne sont pas encore disponibles" } : r
export const roulerMe = async () => meOk(await rpc<RoulerMe>("rouler_me"))
export const roulerActivate = async (p: Record<string, unknown>) => meOk(await rpc<RoulerMe>("rouler_activate", { p }))
export const roulerSaveProfile = async (p: Record<string, unknown>) => meOk(await rpc<RoulerMe>("rouler_save_profile", { p }))
export const roulerSetVisibility = async (v: Visibility) => meOk(await rpc<RoulerMe>("rouler_set_visibility", { p_visibility: v }))
export const roulerDeleteProfile = () => rpc<boolean>("rouler_delete_profile")
export const roulerSaveAvailability = async (p: Record<string, unknown>) => meOk(await rpc<RoulerMe>("rouler_save_availability", { p }))
export const roulerEndAvailability = async (id: string) => meOk(await rpc<RoulerMe>("rouler_end_availability", { p_id: id }))
export const roulerExtendAvailability = async (id: string) => meOk(await rpc<RoulerMe>("rouler_extend_availability", { p_id: id }))
export const roulerSearch = (p: { insee?: string | null; radius: number; when: When; minutes: number; slot?: string | null; date?: string; time?: string; disc?: DirDisc | null; intensity?: Intensity | null; belt_min?: Belt | null; belt_max?: Belt | null }) =>
  rpc<PartnerSearch>("rouler_search", { p: Object.fromEntries(Object.entries(p).filter(([, v]) => v !== null && v !== undefined && v !== "")) })
export const roulerBlock = (handle: string) => rpc<boolean>("rouler_block", { p_handle: handle })
const arr = <T,>(r: R<T[]>): R<T[]> => r.ok ? { ok: true, data: Array.isArray(r.data) ? r.data : [] } : r
export const roulerMyBlocks = async () => arr(await rpc<BlockedPartner[]>("rouler_my_blocks"))
export const roulerUnblock = (key: string) => rpc<boolean>("rouler_unblock", { p_key: key })
export const roulerReport = (handle: string, reason: string, details: string) => rpc<boolean>("rouler_report", { p_handle: handle, p_reason: reason, p_details: details.trim().slice(0, 500) })
export const roulerAdminReports = async (status: string | null) => arr(await rpc<RoulerReport[]>("rouler_admin_reports", { p_status: status }))
export const roulerAdminResolve = (key: string, decision: "keep" | "restore" | "dismiss") => rpc<boolean>("rouler_admin_resolve", { p_key: key, p_decision: decision })

// ---------------------------------------------------------------- Heures
// Toutes les heures s'affichent à l'heure du lieu de roulage (fuseau renvoyé par le serveur).
// L'écart entre l'horloge du téléphone et celle du serveur est corrigé pour les aperçus des raccourcis.
const PARIS = "Europe/Paris"
const TZ_NAME: Record<string, string> = { "America/Guadeloupe": "Guadeloupe", "America/Martinique": "Martinique", "America/Cayenne": "Guyane", "Indian/Reunion": "La Réunion", "Indian/Mayotte": "Mayotte", "America/Miquelon": "Saint-Pierre-et-Miquelon" }
export const tzOfDep = (dep: string | null | undefined) => ({ "971": "America/Guadeloupe", "972": "America/Martinique", "973": "America/Cayenne", "974": "Indian/Reunion", "975": "America/Miquelon", "976": "Indian/Mayotte" } as Record<string, string>)[dep || ""] || PARIS
export const tzName = (tz: string) => TZ_NAME[tz] || null
let skew = 0
export const syncClock = (serverIso: string | null | undefined) => { const t = serverIso ? Date.parse(serverIso) : NaN; if (!isNaN(t)) skew = t - Date.now() }
export const serverNow = () => new Date(Date.now() + skew)
const part = (d: Date, tz: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("fr-FR", { ...o, timeZone: tz }).format(d)
export const fmtTime = (iso: string | Date, tz: string) => part(typeof iso === "string" ? new Date(iso) : iso, tz, { hour: "2-digit", minute: "2-digit" })
export const localDate = (d: Date, tz: string) => { const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d); return f }
export const dayLabel = (iso: string | Date, tz: string) => {
  const d = typeof iso === "string" ? new Date(iso) : iso, n = serverNow()
  const ld = localDate(d, tz), today = localDate(n, tz), tomorrow = localDate(new Date(n.getTime() + 864e5), tz)
  if (ld === today) return "Aujourd'hui"
  if (ld === tomorrow) return "Demain"
  return part(d, tz, { weekday: "short", day: "numeric", month: "short" })
}
export const fmtMinutes = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? " " + String(m % 60).padStart(2, "0") : ""}`
export const rangeLine = (a: string, b: string, tz: string) => `${dayLabel(a, tz)} ${fmtTime(a, tz)} → ${fmtTime(b, tz)}`
// Équivalent à Paris, seulement si le lieu n'est pas à l'heure de Paris
export const parisNote = (a: string, b: string, tz: string) => tz === PARIS || fmtTime(a, tz) === fmtTime(a, PARIS) ? "" : `soit ${fmtTime(a, PARIS)} → ${fmtTime(b, PARIS)} à Paris`
export const inMinutes = (iso: string) => Math.round((Date.parse(iso) - serverNow().getTime()) / 60000)
export const untilLine = (iso: string) => { const m = inMinutes(iso); return m <= 0 ? "maintenant" : m < 60 ? `${m} min` : fmtMinutes(Math.round(m / 5) * 5) }
// Aperçu d'un raccourci : heure de début si l'on publie maintenant (minute entière, comme le serveur)
export const shortcutStart = (offset: number) => { const n = serverNow(); n.setSeconds(0, 0); return new Date(n.getTime() + offset * 60000) }
export const quarterTimes = () => Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`)
export const addDaysIso = (iso: string, n: number) => { const [y, m, d] = iso.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.toISOString().slice(0, 10) }
// Prochain quart d'heure (+1 h) à l'heure du lieu, pour pré-remplir « Autre moment »
export const nextQuarter = (tz: string) => {
  const d = new Date(serverNow().getTime() + 60 * 60000)
  const hm = fmtTime(d, tz).split(":").map(Number); let q = Math.ceil(hm[1] / 15) * 15, h = hm[0], date = localDate(d, tz)
  if (q === 60) { q = 0; h += 1 } if (h === 24) { h = 0; date = addDaysIso(date, 1) }
  return { date, time: `${String(h).padStart(2, "0")}:${String(q).padStart(2, "0")}` }
}
