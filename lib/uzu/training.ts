"use client"
// Carnet d'entraînement : LECTURE SEULE (lot 2, étape 1).
// Reprend à l'identique les règles de l'ancienne application (legacy/index.html) :
//   - élève / compte solo : fiche members/<uid> (+ appel roll/<uid> et grade grades/<uid> en club)
//   - membre de l'équipe   : entraînement perso data/users/<uid>/training
//   - cache du téléphone   : localStorage « uzu_cached_training », entrée <uid> ou <uid>:coach ;
//     si des saisies y attendent encore d'être envoyées (dirty), elles sont affichées en priorité,
//     exactement comme le fait l'ancienne application (fusion par identifiant, la version locale gagne).
// Aucune écriture n'est faite ici : la saisie reste dans l'ancienne application tant que son
// portage n'a pas passé les tests d'équivalence.
import { uzu } from "./client"
import type { UzuContext } from "./context"

export type Belt = { rank: string; stripes: number; since: string }
export type Session = {
  id: string
  date: string
  cat?: string
  kind?: string
  type?: string
  dur?: number
  theme?: string
  sys?: string
  effort?: string
  rpe?: number
  rounds?: number
  placed?: number
  takenW?: number
  takenG?: number
  blocks?: { sys?: string; tech?: string; flow?: string }[]
  roll?: boolean
  slot?: string
  sample?: boolean
}
export type Comp = { id: string; date: string; event?: string; type?: string; result?: string; wins?: number; losses?: number; sample?: boolean }
type RawState = { belt?: Partial<Belt>; sessions?: Session[]; comps?: Comp[]; name?: string; acct?: string }
type RollEntry = { k: string; date: string; title?: string; dur?: number; theme?: string }

export type Training = {
  role: "teacher" | "student" | "solo"
  belt: Belt
  beltSource: "grade" | "declared"
  sessions: Session[] // séances personnelles + séances issues de l'appel du club, plus récentes d'abord
  comps: Comp[]
  pendingLocal: boolean // des saisies attendent encore sur ce téléphone
  source: "server" | "local" | "empty"
}

export const BELTS = [
  { k: "blanche", n: "Blanche", c: "#F4F4F0" },
  { k: "bleue", n: "Bleue", c: "#2F57C6" },
  { k: "violette", n: "Violette", c: "#6C3FA6" },
  { k: "marron", n: "Marron", c: "#7A4A2A" },
  { k: "noire", n: "Noire", c: "#151515" },
] as const

export const SYSTEMS: Record<string, string> = {
  fond: "Fondamentaux", lutte: "Lutte & Scrambles", controle: "Contrôle & Dos", jambes: "Jeux de jambes",
}
const KINDS: Record<string, string> = {
  cours: "Cours collectif", open: "Open mat / Libre", compet: "Compétition / Prépa", prive: "Cours privé", prepa: "Prépa physique",
}
const EFFORTS: Record<string, string> = { force: "Force", cardio: "Cardio", endurance: "Endurance" }
const RESULTS: Record<string, string> = { or: "Or", argent: "Argent", bronze: "Bronze" }

const CACHE_KEY = "uzu_cached_training"

function normBelt(b?: Partial<Belt> | null): Belt {
  const k = BELTS.some(x => x.k === b?.rank) ? String(b?.rank) : "blanche"
  return { rank: k, stripes: Math.max(0, Math.min(4, Number(b?.stripes) || 0)), since: typeof b?.since === "string" ? b.since : "" }
}
const notSample = (x: { sample?: boolean }) => !x.sample
const isPrepa = (x: Session) => x.cat === "prepa"

function unionById<T extends { id: string }>(local: T[], server: T[], deleted: string[]): T[] {
  const seen = new Set(local.map(x => x.id))
  return local.concat(server.filter(x => !seen.has(x.id) && !deleted.includes(x.id)))
}

function readLocal(id: string): { state: RawState; dirty: boolean; deleted: { s: string[]; c: string[] } } | null {
  try {
    const all = JSON.parse(localStorage.getItem(CACHE_KEY) || "null")
    const o = all && typeof all === "object" ? all[id] : null
    if (!o || !o.state) return null
    return { state: o.state, dirty: !!o.dirty, deleted: { s: o.deleted?.s ?? [], c: o.deleted?.c ?? [] } }
  } catch { return null }
}

async function getDoc<T>(path: string): Promise<T | null> {
  const { data, error } = await uzu().from("docs").select("path,data").eq("path", path).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data.data as T) : null
}

function rollToSession(r: RollEntry): Session {
  return { id: "r-" + r.k, date: r.date, type: /no.?gi/i.test(r.title || "") ? "No-gi" : "Gi", dur: Number(r.dur) || 90, theme: r.theme || r.title || "Cours du club", rounds: 0, placed: 0, takenW: 0, takenG: 0, roll: true, slot: r.title || "" }
}
function mergeRoll(own: Session[], rolls: RollEntry[]): Session[] {
  return (rolls || []).filter(r => r && r.date && !own.some(s => s.date === r.date && !isPrepa(s))).map(rollToSession).concat(own)
}

export function legacyRole(ctx: UzuContext | null): Training["role"] {
  if (ctx?.role === "coach") return "teacher"
  if (ctx?.role === "solo" || !ctx?.club) return "solo"
  return "student"
}

export async function loadTraining(uid: string, ctx: UzuContext | null): Promise<Training> {
  const role = legacyRole(ctx)
  const local = readLocal(role === "teacher" ? uid + ":coach" : uid)
  const ownPath = role === "teacher" ? `data/users/${uid}/training` : `members/${uid}`
  const [server, roll, grade] = await Promise.all([
    getDoc<RawState>(ownPath),
    role === "student" ? getDoc<{ s?: RollEntry[] }>(`roll/${uid}`) : Promise.resolve(null),
    role === "student" ? getDoc<Partial<Belt>>(`grades/${uid}`) : Promise.resolve(null),
  ])
  let st: RawState = {}
  let source: Training["source"] = "empty"
  if (local?.dirty) {
    const sv = server ?? {}
    st = {
      ...local.state,
      sessions: unionById((local.state.sessions ?? []).filter(notSample), (sv.sessions ?? []).filter(notSample), local.deleted.s),
      comps: unionById((local.state.comps ?? []).filter(notSample), (sv.comps ?? []).filter(notSample), local.deleted.c),
    }
    source = "local"
  } else if (server) { st = server; source = "server" }
  else if (local) { st = local.state; source = "local" }

  const own = (st.sessions ?? []).filter(notSample)
  const sessions = mergeRoll(own, role === "student" ? roll?.s ?? [] : []).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const comps = (st.comps ?? []).filter(notSample).sort((a, b) => (a.date < b.date ? 1 : -1))
  // En club, la ceinture affichée est celle validée par le professeur ; en solo ou pour l'équipe, celle déclarée.
  const belt = role === "student" ? normBelt(grade) : normBelt(st.belt)
  return { role, belt, beltSource: role === "student" ? "grade" : "declared", sessions, comps, pendingLocal: !!local?.dirty, source }
}

// ---------- Présentation ----------
export function sessionTitle(s: Session): string {
  if (isPrepa(s)) return "Prépa physique · " + (EFFORTS[s.effort ?? ""] ?? EFFORTS.force)
  const blocks = (s.blocks ?? []).filter(b => b && (b.tech || SYSTEMS[b.sys ?? ""]))
  const theme = blocks.length > 1 ? blocks.map(b => b.tech || SYSTEMS[b.sys ?? ""]).join(" · ") : s.theme
  if (s.kind === "open") return "Open mat"
  return theme || (s.roll ? "Cours du club" : "Séance")
}
export function sessionKind(s: Session): string {
  if (isPrepa(s)) return KINDS.prepa
  if (s.roll) return "Appel du club"
  return KINDS[s.kind ?? ""] ?? KINDS.cours
}
export function sessionMeta(s: Session): string {
  const parts: string[] = []
  if (!isPrepa(s) && s.type) parts.push(s.type)
  if (!isPrepa(s) && s.sys && SYSTEMS[s.sys]) parts.push(SYSTEMS[s.sys])
  if (isPrepa(s) && Number(s.rpe)) parts.push(`RPE ${Number(s.rpe)}/10`)
  if (!isPrepa(s) && Number(s.rounds)) parts.push(`${Number(s.rounds)} rounds`)
  return parts.join(" · ")
}
export function compResult(c: Comp): string { return RESULTS[c.result ?? ""] ?? (c.result ? String(c.result) : "") }
export function durTxt(m: number): string { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min` }
export function beltName(k: string): string { return BELTS.find(b => b.k === k)?.n ?? "Blanche" }
export function beltColor(k: string): string { return BELTS.find(b => b.k === k)?.c ?? "#F4F4F0" }

// ---------- Dates (calendrier local, comme l'ancienne application) ----------
export const pad = (n: number) => String(n).padStart(2, "0")
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = (s: string) => { const p = String(s || "").split("-"); return new Date(+p[0], +p[1] - 1, +p[2]) }
export const frDate = (s: string, opt: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) => parseYmd(s).toLocaleDateString("fr-FR", opt)

export type Slot = { id: string; d: number; s: string; e: string; t: string; disc?: CourseDisc; kind?: CourseKind; hol?: boolean; off?: string[] }
export type CourseDisc = "jjb" | "grappling"
export type CourseKind = "cours" | "open" | "compet" | "prive"
export const COURSE_DISC: [CourseDisc, string][] = [["jjb", "JJB"], ["grappling", "Grappling"]]
export const COURSE_KIND: [CourseKind, string][] = [["cours", "Cours collectif"], ["open", "Open mat"], ["compet", "Compétition / Prépa"], ["prive", "Cours privé"]]
export const discLabel = (d?: string) => COURSE_DISC.find(x => x[0] === d)?.[1] || ""
export const kindLabel = (k?: string) => COURSE_KIND.find(x => x[0] === k)?.[1] || ""
/** Discipline et type d'un cours en une ligne (« JJB · Open mat »), vide si non renseignés. */
export const slotTag = (x: Slot) => [discLabel(x.disc), kindLabel(x.kind)].filter(Boolean).join(" · ")
export function normSched(a: unknown): Slot[] {
  return Array.isArray(a) ? a.filter((x): x is Slot => !!x && !!x.id && x.d >= 1 && x.d <= 7 && /^\d\d:\d\d$/.test(x.s) && /^\d\d:\d\d$/.test(x.e)).slice(0, 30)
    .map(x => {
      const o: Slot = { id: String(x.id).slice(0, 20), d: +x.d, s: x.s, e: x.e, t: String(x.t || "Cours").slice(0, 40) }
      if (COURSE_DISC.some(c => c[0] === x.disc)) o.disc = x.disc
      if (COURSE_KIND.some(c => c[0] === x.kind)) o.kind = x.kind
      if (x.hol === true) o.hol = true
      const off = Array.isArray(x.off) ? [...new Set(x.off.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))))].sort().slice(-40) : []
      if (off.length) o.off = off
      return o
    }) : []
}
const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1
/** Prochains cours du planning du club (même calcul que l'ancienne application). */
// ---------- Vacances et fermetures du club ----------
// Périodes enregistrées dans le profil de l'académie (profile.closures). Pendant une fermeture, un cours
// n'a pas lieu sauf s'il est « maintenu pendant les vacances » (hol) ; une date peut aussi être annulée
// cours par cours (off).
export type Closure = { id: string; from: string; to: string; label: string }
const DRX = /^\d{4}-\d{2}-\d{2}$/
export function closuresOf(club: unknown): Closure[] {
  const c = (club as { profile?: { closures?: unknown } } | null)?.profile?.closures
  return Array.isArray(c) ? c.filter((x): x is Closure => !!x && DRX.test(x.from) && DRX.test(x.to) && x.from <= x.to)
    .map(x => ({ id: String(x.id || x.from), from: x.from, to: x.to, label: String(x.label || "Fermeture").slice(0, 60) })).sort((a, b) => (a.from < b.from ? -1 : 1)).slice(0, 60) : []
}
export function closureOn(club: unknown, ds: string): Closure | null { return closuresOf(club).find(x => x.from <= ds && ds <= x.to) || null }
/** Vacances scolaires officielles 2026-2027 (arrêté du 22 octobre 2025), du premier au dernier jour sans école. */
export type Zone = "A" | "B" | "C"
export const ZONES: [Zone, string][] = [["A", "Zone A"], ["B", "Zone B"], ["C", "Zone C (Paris, Île-de-France, Occitanie)"]]
const HOL: { id: string; label: string; z?: Zone; from: string; to: string }[] = [
  { id: "vs-toussaint-2026", label: "Vacances de la Toussaint", from: "2026-10-17", to: "2026-11-01" },
  { id: "vs-noel-2026", label: "Vacances de Noël", from: "2026-12-19", to: "2027-01-03" },
  { id: "vs-hiver-2027", label: "Vacances d'hiver", z: "A", from: "2027-02-13", to: "2027-02-28" },
  { id: "vs-hiver-2027", label: "Vacances d'hiver", z: "B", from: "2027-02-20", to: "2027-03-07" },
  { id: "vs-hiver-2027", label: "Vacances d'hiver", z: "C", from: "2027-02-06", to: "2027-02-21" },
  { id: "vs-printemps-2027", label: "Vacances de printemps", z: "A", from: "2027-04-10", to: "2027-04-25" },
  { id: "vs-printemps-2027", label: "Vacances de printemps", z: "B", from: "2027-04-17", to: "2027-05-02" },
  { id: "vs-printemps-2027", label: "Vacances de printemps", z: "C", from: "2027-04-03", to: "2027-04-18" },
  { id: "vs-ascension-2027", label: "Pont de l'Ascension", from: "2027-05-06", to: "2027-05-09" },
  { id: "vs-ete-2027", label: "Vacances d'été", from: "2027-07-03", to: "2027-09-01" },
]
/** Vacances scolaires à venir pour une zone (celles déjà terminées sont ignorées). */
export function schoolHolidays(zone: Zone, today = ymd(new Date())): Closure[] {
  return HOL.filter(h => (!h.z || h.z === zone) && h.to >= today).map(h => ({ id: h.id, from: h.from, to: h.to, label: h.label }))
}
export const zoneOf = (club: unknown): Zone => { const z = (club as { profile?: { zone?: unknown } } | null)?.profile?.zone; return z === "A" || z === "B" ? z : "C" }
export function closureTxt(c: Closure): string {
  const f = parseYmd(c.from), t = parseYmd(c.to), o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }
  return c.from === c.to ? f.toLocaleDateString("fr-FR", { weekday: "short", ...o }) : `du ${f.toLocaleDateString("fr-FR", o)} au ${t.toLocaleDateString("fr-FR", { ...o, year: f.getFullYear() !== t.getFullYear() ? "numeric" : undefined })}`
}

/** Le cours a-t-il lieu ce jour-là ? (date annulée, ou fermeture du club sauf cours maintenu) */
export function slotOpenOn(club: unknown, slot: Slot, ds: string): boolean {
  if (slot.off?.includes(ds)) return false
  return !!slot.hol || !closureOn(club, ds)
}

export function nextClasses(schedule: unknown, n: number, now = new Date(), club?: unknown): { slot: Slot; date: Date; inDays: number }[] {
  const sorted = normSched(schedule).sort((a, b) => a.d - b.d || (a.s < b.s ? -1 : 1))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const out: { slot: Slot; date: Date; inDays: number }[] = []
  // Jusqu'à 70 jours : on saute les vacances et les dates annulées
  for (let k = 0; k < 70 && out.length < n; k++) {
    const dd = new Date(today); dd.setDate(dd.getDate() + k)
    const ds = ymd(dd)
    for (const x of sorted) if (x.d === isoDay(dd) && (k > 0 || x.e >= hm) && (!club || slotOpenOn(club, x, ds)) && out.length < n) out.push({ slot: x, date: dd, inDays: k })
  }
  return out
}
