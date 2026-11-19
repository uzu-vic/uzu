"use client"
// Journal des cours (lot J2) : séances collectives par groupe.
// Toutes les lectures et écritures passent par les fonctions serveur du script uzu-10 :
// académie active lue côté serveur, droits vérifiés à chaque appel. Sans le script, le Journal est absent.
import { uzu } from "./client"

export type JGroup = { id: string; name: string; discipline: string; mine: boolean; primary: boolean; courses: string[]; can_create: boolean; can_view: boolean; focus: { theme: string; from: string; to: string; details: string; published_at: string } | null }
export type JTech = { id: string | null; name: string | null; text: string | null }
export type JSession = {
  id: string; section_id: string | null; group_name: string; course_key: string | null; session_date: string; discipline_id: string | null
  theme: string; objective: string; exercises: string; comment: string; previous_session_id: string | null
  status: "brouillon" | "publie" | "depublie"; focus: { theme?: string; source?: string }; created_at: string; published_at: string | null
  mine: boolean; author_name: string; techniques: JTech[]; media: number; can_edit: boolean; can_publish: boolean
}
export type JInput = {
  section_id: string; course_key: string | null; session_date: string; discipline_id: string | null; theme: string
  objective: string; exercises: string; comment: string; previous_session_id: string | null; techniques: ({ t: string } | { text: string })[]
}
type R<T> = { ok: true; data: T } | { ok: false; msg: string; absent?: boolean }
const absent = (e: { code?: string; message?: string }) => e.code === "PGRST202" || e.code === "42883" || /could not find the function|does not exist|schema cache/i.test(e.message || "")
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée", absent: absent(error) }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}
export const journalGroups = () => rpc<JGroup[]>("journal_groups")
export type FeedFilter = { section?: string | null; discipline?: string | null; from?: string | null; to?: string | null; q?: string; limit?: number }
export const journalFeed = (f: FeedFilter = {}) => rpc<JSession[]>("journal_feed", { p_section: f.section || null, p_discipline: f.discipline || null, p_from: f.from || null, p_to: f.to || null, p_query: (f.q || "").trim() || null, p_limit: f.limit || 200 })
export const saveSession = (id: string | null, p: JInput, publish: boolean) => rpc<{ id: string; status: JSession["status"] }>("journal_save_session", { p_id: id, p, p_publish: publish })
export const setSessionStatus = (id: string, status: "publie" | "depublie") => rpc<string>("journal_set_status", { p_id: id, p_status: status })
export type StudentGroups = { member: string; student: boolean; primary: string | null; secondary: string[]; can_edit: boolean }
export const studentGroups = (user: string) => rpc<StudentGroups>("student_groups", { p_user: user })
export const setStudentGroups = (user: string, primary: string | null, secondary: string[]) => rpc<number>("set_student_groups", { p_user: user, p_primary: primary, p_secondary: secondary })
export const setMemberGroups = (member: string, sections: string[]) => rpc<number>("set_member_groups", { p_member: member, p_sections: sections })

/** Présences de l'adhérent connecté (appel du club) : « date|cours » présents et absents */
export async function myRollKeys(uid: string): Promise<{ present: Set<string>; absent: Set<string> }> {
  try {
    const { data } = await uzu().from("docs").select("data").eq("path", `roll/${uid}`).maybeSingle()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (data?.data || {}) as any
    return { present: new Set(((d.s || []) as { k: string }[]).map(x => x.k)), absent: new Set((d.a || []) as string[]) }
  } catch { return { present: new Set(), absent: new Set() } }
}

export const STATUS_LBL: Record<JSession["status"], string> = { brouillon: "Brouillon", publie: "Publiée", depublie: "Dépubliée" }
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"]
const DAYS = ["DIM.", "LUN.", "MAR.", "MER.", "JEU.", "VEN.", "SAM."]
const d0 = (iso: string) => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d) }
export const monthLabel = (iso: string) => { const d = d0(iso); return MONTHS[d.getMonth()].replace(/^./, c => c.toUpperCase()) + " " + d.getFullYear() }
export const dayBadge = (iso: string) => { const d = d0(iso); return { n: d.getDate(), wd: DAYS[d.getDay()] } }
export const longDate = (iso: string) => d0(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
export const shortDate = (iso: string) => d0(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
export function byMonth<T extends { session_date: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const s of list) { const k = s.session_date.slice(0, 7); m.set(k, [...(m.get(k) || []), s]) }
  return [...m.entries()]
}
/** Discipline de la Bibliothèque déduite de la discipline d'un cours du planning */
export const libDiscOfCourse = (disc?: string) => disc === "jjb" ? "jjb_gi" : disc === "grappling" ? "grappling_nogi" : null
