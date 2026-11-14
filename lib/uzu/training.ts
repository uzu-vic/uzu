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

export type Slot = { id: string; d: number; s: string; e: string; t: string }
export function normSched(a: unknown): Slot[] {
  return Array.isArray(a) ? a.filter((x): x is Slot => !!x && !!x.id && x.d >= 1 && x.d <= 7 && /^\d\d:\d\d$/.test(x.s) && /^\d\d:\d\d$/.test(x.e)).slice(0, 30)
    .map(x => ({ id: String(x.id).slice(0, 20), d: +x.d, s: x.s, e: x.e, t: String(x.t || "Cours").slice(0, 40) })) : []
}
const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1
/** Prochains cours du planning du club (même calcul que l'ancienne application). */
export function nextClasses(schedule: unknown, n: number, now = new Date()): { slot: Slot; date: Date; inDays: number }[] {
  const sorted = normSched(schedule).sort((a, b) => a.d - b.d || (a.s < b.s ? -1 : 1))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  const out: { slot: Slot; date: Date; inDays: number }[] = []
  for (let k = 0; k < 14 && out.length < n; k++) {
    const dd = new Date(today); dd.setDate(dd.getDate() + k)
    for (const x of sorted) if (x.d === isoDay(dd) && (k > 0 || x.e >= hm) && out.length < n) out.push({ slot: x, date: dd, inDays: k })
  }
  return out
}
