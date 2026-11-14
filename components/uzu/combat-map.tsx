"use client"
// Carte de combat (radar) : points forts, points faibles, ce qui manque, et rappels des domaines délaissés.
import { useEffect, useState } from "react"
import { AlarmClock, ArrowDownRight, ArrowUpRight, CircleDashed } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { loadCore } from "@/lib/uzu/journal"
import { combatMap, reminders, sinceTxt, type DomainStat } from "@/lib/uzu/combat-map"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** Séances complètes du carnet (règles extraites), rechargées si le compte ou l'académie change. */
export function useFullSessions(uid: string, ctx: UzuContext | null) {
  const [d, setD] = useState<{ C: Any; S: Any[] } | null>(null)
  useEffect(() => {
    if (!ctx) return
    let live = true
    loadCore(uid, ctx).then(r => { if (live) setD({ C: r.core, S: r.core.allSessions().filter((s: Any) => !s.sample) }) }, () => {})
    return () => { live = false }
  }, [uid, ctx])
  return d
}

function Radar({ map }: { map: DomainStat[] }) {
  const n = map.length, cx = 150, cy = 140, R = 100
  const pt = (i: number, v: number) => { const a = -Math.PI / 2 + i * 2 * Math.PI / n; return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] }
  const poly = map.map((d, i) => pt(i, Math.max(0.04, d.score / 100)).map(x => x.toFixed(1)).join(",")).join(" ")
  return <svg className="uzu-radar" viewBox="-48 -6 396 292" role="img" aria-label={"Carte de combat : " + map.map(d => `${d.short} ${d.score} sur 100`).join(", ")}>
    {[0.25, 0.5, 0.75, 1].map(r => <polygon key={r} points={map.map((_, i) => pt(i, r).join(",")).join(" ")} className="uzu-radar-ring" />)}
    {map.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} className="uzu-radar-axis" /> })}
    <polygon points={poly} className="uzu-radar-area" />
    {map.map((d, i) => { const [x, y] = pt(i, Math.max(0.04, d.score / 100)); return <circle key={d.k} cx={x} cy={y} r={3.2} className={d.worked ? "uzu-radar-dot" : "uzu-radar-dot off"} /> })}
    {map.map((d, i) => { const [x, y] = pt(i, 1.2); const anchor = Math.abs(x - cx) < 8 ? "middle" : x > cx ? "start" : "end"
      return <text key={d.k} x={x} y={y + 4} textAnchor={anchor} className={d.worked ? "uzu-radar-lbl" : "uzu-radar-lbl off"}>{d.short} {d.worked ? d.score : "–"}</text> })}
  </svg>
}

const why = (d: DomainStat) => {
  if (d.k === "prepa") return `${d.touched} séance${d.touched > 1 ? "s" : ""} sur la période`
  if (d.placed + d.suffered) return `${d.placed} placé${d.placed > 1 ? "s" : ""} · ${d.suffered} subi${d.suffered > 1 ? "s" : ""} · ${d.touched} séance${d.touched > 1 ? "s" : ""}`
  return `travaillé dans ${d.touched} séance${d.touched > 1 ? "s" : ""}, sans résultat noté`
}

export function CombatMapCard({ C, S, from, to }: { C: Any; S: Any[]; from: string; to: string }) {
  const map = combatMap(C, S, from, to)
  const worked = map.filter(d => d.worked)
  const strong = worked.filter(d => d.score >= 55).sort((a, b) => b.score - a.score).slice(0, 3)
  const weak = worked.filter(d => d.score < 50 && !strong.includes(d)).sort((a, b) => a.score - b.score).slice(0, 3)
  const missing = map.filter(d => !d.worked)
  // « À reprendre » : domaines déjà travaillés mais délaissés (ceux jamais notés sont dans « Ce qu'il te manque »)
  const rem = reminders(map, S.length > 0).filter(d => d.days !== null)
  return <section className="panel uzu-panel-col uzu-grid-gap uzu-map">
    <div className="section-title"><h2>Ta carte de combat</h2><span className="uzu-muted uzu-small">sur la période choisie</span></div>
    <p className="uzu-text uzu-small uzu-muted">Calculée à partir de tes séances : ce que tu places face à ce que tu subis, et la place de chaque domaine dans ton entraînement. Plus la surface est grande et régulière, plus ton jeu est complet.</p>
    <div className="uzu-map-grid">
      <Radar map={map} />
      <div className="uzu-map-lists">
        <div><span className="uzu-sublabel uzu-good"><ArrowUpRight size={14} /> Points forts</span>
          {strong.length ? <ul className="uzu-top">{strong.map(d => <li key={d.k}><span>{d.n}<small>{why(d)}</small></span><b>{d.score}</b></li>)}</ul> : <p className="uzu-text uzu-small uzu-muted">Pas encore assez de séances pour dégager un point fort.</p>}</div>
        <div><span className="uzu-sublabel uzu-bad"><ArrowDownRight size={14} /> Points faibles</span>
          {weak.length ? <ul className="uzu-top">{weak.map(d => <li key={d.k}><span>{d.n}<small>{why(d)} — {d.tip}</small></span><b>{d.score}</b></li>)}</ul> : <p className="uzu-text uzu-small uzu-muted">Aucun point faible marqué sur la période.</p>}</div>
        {missing.length > 0 && <div><span className="uzu-sublabel"><CircleDashed size={14} /> Ce qu'il te manque</span>
          <ul className="uzu-top">{missing.map(d => <li key={d.k}><span>{d.n}<small>{d.tip}</small></span></li>)}</ul></div>}
      </div>
    </div>
    {rem.length > 0 && <div className="uzu-remind"><span className="uzu-sublabel"><AlarmClock size={14} /> À reprendre</span>
      <ul className="uzu-top">{rem.map(d => <li key={d.k}><span>{d.n}<small>{sinceTxt(d)}{d.last ? ` (dernière fois le ${C.frDate(d.last)})` : ""}</small></span></li>)}</ul></div>}
    <p className="uzu-text uzu-small uzu-muted">Pour affiner ta carte, note dans tes séances tes amenées au sol, passages, renversements et soumissions, placés comme subis.</p>
  </section>
}

/** Rappel sur l'Accueil : domaines délaissés depuis plus de 3 semaines (ou jamais notés). */
export function ReminderCard({ C, S, onOpen }: { C: Any; S: Any[]; onOpen: () => void }) {
  const t = C.ymd(C.TODAY), map = combatMap(C, S, C.ymd(C.addDays(C.TODAY, -90)), t)
  const rem = reminders(map, S.length > 0).slice(0, 3)
  if (!rem.length) return null
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="eyebrow">À REPRENDRE</div>
    <p className="uzu-text">{rem.length > 1 ? "Ces domaines n'ont pas été travaillés depuis un moment" : "Ce domaine n'a pas été travaillé depuis un moment"} : pense à {rem.length > 1 ? "les" : "le"} remettre au programme.</p>
    <ul className="uzu-top">{rem.map(d => <li key={d.k}><span>{d.n}<small>{sinceTxt(d)}</small></span></li>)}</ul>
    <button className="button button--outline uzu-small-btn" onClick={onOpen}>Voir ma carte de combat</button>
  </section>
}

