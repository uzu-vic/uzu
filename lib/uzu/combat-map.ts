"use client"
// Carte de combat de l'athlète : points forts, points faibles, domaines non travaillés et rappels.
// Calculée uniquement à partir des séances saisies (et notées à l'appel), avec les règles du carnet.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

export type DomainKey = "lutte" | "garde" | "passages" | "renversements" | "soumissions" | "controle" | "jambes" | "prepa"
export const DOMAINS: { k: DomainKey; n: string; short: string; tip: string }[] = [
  { k: "lutte", n: "Lutte et amenées au sol", short: "Lutte", tip: "Prévois un round debout ou un travail de takedowns." },
  { k: "garde", n: "Garde (rétentions)", short: "Garde", tip: "Fais des rounds en partant sur le dos pour garder ta garde." },
  { k: "passages", n: "Passages de garde", short: "Passages", tip: "Commence tes rounds au-dessus pour travailler tes passages." },
  { k: "renversements", n: "Renversements", short: "Renvers.", tip: "Cherche tes sweeps depuis la garde en sparring." },
  { k: "soumissions", n: "Soumissions", short: "Soumissions", tip: "Fixe-toi une finition à placer à chaque round." },
  { k: "controle", n: "Contrôle et dos", short: "Contrôle", tip: "Travaille la stabilisation et la prise de dos." },
  { k: "jambes", n: "Jeux de jambes", short: "Jambes", tip: "Ajoute un peu de jeu de jambes (entrées et défenses)." },
  { k: "prepa", n: "Préparation physique", short: "Prépa", tip: "Une séance de prépa par semaine suffit à progresser." },
]
export type DomainStat = { k: DomainKey; n: string; short: string; tip: string; placed: number; suffered: number; touched: number; score: number; worked: boolean; last: string; days: number | null }

/** Pour une séance : ce qu'elle apporte à chaque domaine (placé, subi, travaillé). */
function contrib(C: Any, s: Any): Record<DomainKey, { p: number; s: number; t: boolean }> {
  const z = () => ({ p: 0, s: 0, t: false })
  const o: Record<DomainKey, { p: number; s: number; t: boolean }> = { lutte: z(), garde: z(), passages: z(), renversements: z(), soumissions: z(), controle: z(), jambes: z(), prepa: z() }
  if (C.isPrepa(s)) { o.prepa.p = 1; o.prepa.t = true; return o }
  if (s.prepa) { o.prepa.p = 1; o.prepa.t = true }
  const td = C.actOf(s, "lucha_takedowns_done"), ts = C.actOf(s, "lucha_takedowns_suffered"), gr = C.actOf(s, "guard_retentions")
  const gm = C.gmOf(s), tot = (f: string) => C.gmTotal(gm[f] || {})
  const sp = tot("sweeps_placed") || C.actOf(s, "sweeps_done"), ss = tot("sweeps_suffered") || C.actOf(s, "sweeps_suffered")
  const pp = tot("passes_placed") || C.actOf(s, "guard_passes_done"), ps = tot("passes_suffered") || C.actOf(s, "guard_passes_suffered")
  o.lutte.p += td; o.lutte.s += ts
  o.garde.p += gr; o.garde.s += ps
  o.passages.p += pp; o.passages.s += ps
  o.renversements.p += sp; o.renversements.s += ss
  C.subsOf(s).forEach((x: Any) => { if (x.d === "placee") o.soumissions.p += x.n; else o.soumissions.s += x.n })
  C.sessBlocks(s).forEach((b: Any) => {
    const key: DomainKey | null = b.sys === "lutte" ? "lutte" : b.sys === "controle" ? "controle" : b.sys === "jambes" ? "jambes" : null
    if (!key) return
    o[key].t = true
    if (key !== "lutte") { if (b.flow === "impose") o[key].p++; else if (b.flow === "subi") o[key].s++ }
  })
  ;(Object.keys(o) as DomainKey[]).forEach(k => { if (o[k].p || o[k].s) o[k].t = true })
  return o
}

/** Carte sur une période : score 0-100 par domaine (60 % efficacité placé/subi, 40 % volume de pratique). */
export function combatMap(C: Any, sessions: Any[], from: string, to: string, today = new Date()): DomainStat[] {
  const P = sessions.filter(s => s.date >= from && s.date <= to)
  const mat = P.filter(s => !C.isPrepa(s)).length
  const acc: Record<string, { p: number; s: number; t: number }> = {}
  DOMAINS.forEach(d => { acc[d.k] = { p: 0, s: 0, t: 0 } })
  P.forEach(s => { const c = contrib(C, s); DOMAINS.forEach(d => { const x = c[d.k]; acc[d.k].p += x.p; acc[d.k].s += x.s; if (x.t) acc[d.k].t++ }) })
  // Dernière fois travaillé : tout l'historique
  const last: Record<string, string> = {}
  sessions.forEach(s => { const c = contrib(C, s); DOMAINS.forEach(d => { if (c[d.k].t && (!last[d.k] || s.date > last[d.k])) last[d.k] = s.date }) })
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return DOMAINS.map(d => {
    const a = acc[d.k], worked = a.t > 0
    const base = d.k === "prepa" ? Math.max(1, P.length * 0.25) : Math.max(4, mat * 0.3)
    const vol = Math.min(1, a.t / base)
    const eff = a.p + a.s ? a.p / (a.p + a.s) : 0.5
    const score = !worked ? 0 : d.k === "prepa" ? Math.round(100 * vol) : Math.round(100 * (0.6 * eff + 0.4 * vol))
    const l = last[d.k] || ""
    const days = l ? Math.round((+t0 - +C.parse(l)) / 864e5) : null
    return { ...d, placed: a.p, suffered: a.s, touched: a.t, score, worked, last: l, days }
  })
}

export const REMIND_DAYS = 21
/** Domaines pas travaillés depuis longtemps (ou jamais), du plus ancien au plus récent. Vide sans historique. */
export function reminders(map: DomainStat[], hasSessions: boolean): DomainStat[] {
  if (!hasSessions) return []
  return map.filter(d => d.days === null || d.days > REMIND_DAYS).sort((a, b) => (b.days ?? 99999) - (a.days ?? 99999))
}
export const sinceTxt = (d: DomainStat) => d.days === null ? "jamais noté dans ton carnet" : `pas travaillé depuis ${d.days} jours`
