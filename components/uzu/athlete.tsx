"use client"
// Espace Athlete — écrans réels en lecture (Accueil, Carnet). La saisie reste dans l'ancienne
// application jusqu'au portage testé du formulaire.
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ArrowUpRight, Award, CalendarDays, Clock3, Dumbbell, Flame, MapPin, Plus, Trophy } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import {
  beltColor, beltName, compResult, durTxt, frDate, loadTraining, nextClasses, parseYmd, sessionKind, sessionMeta, sessionTitle, ymd,
  type Session, type Training,
} from "@/lib/uzu/training"

const LEGACY = "/legacy/"

export function useTraining(uid: string, ctx: UzuContext | null) {
  const [data, setData] = useState<Training | null>(null)
  const [error, setError] = useState("")
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!ctx) return
    let live = true
    setError("")
    loadTraining(uid, ctx).then(d => { if (live) setData(d) }, e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [uid, ctx, tick])
  // Relecture au retour sur l'onglet (ex. après une saisie dans l'application actuelle)
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") setTick(t => t + 1) }
    document.addEventListener("visibilitychange", f)
    return () => document.removeEventListener("visibilitychange", f)
  }, [])
  return { data, error, reload: () => setTick(t => t + 1) }
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div> }

function Metric({ label, value, unit, note, icon: Icon, trend }: { label: string; value: string; unit?: string; note: string; icon: typeof Dumbbell; trend?: "up" | "flat" }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={16} /></span></div>
    <div className="metric-main"><strong>{value}</strong>{unit && <span>{unit}</span>}</div>
    <div className="metric-footer">{trend === "up" ? <span className="positive-change"><ArrowUpRight size={13} />{note}</span> : <span className="metric-caption uzu-caption">{note}</span>}</div></article>
}

function BeltMark({ rank, stripes, large }: { rank: string; stripes: number; large?: boolean }) {
  const bar = rank === "noire" ? "#C8102E" : "#151515"
  return <span className={large ? "uzu-belt uzu-belt--large" : "uzu-belt"} aria-hidden="true">
    <span style={{ background: beltColor(rank) }} />
    <span className="uzu-belt-bar" style={{ background: bar }}>{[0, 1, 2, 3].map(i => <i key={i} className={i < stripes ? "on" : ""} />)}</span>
  </span>
}

function Loading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) return <div className="uzu-banner uzu-banner--error" role="alert">Lecture impossible : {error} <button className="text-link" onClick={onRetry}>Réessayer</button></div>
  return <div className="uzu-banner" aria-busy="true">Chargement de votre carnet…</div>
}

function PendingNote({ data }: { data: Training }) {
  if (!data.pendingLocal) return null
  return <div className="uzu-banner">Des saisies faites sur ce téléphone attendent encore d'être envoyées. Elles sont affichées ici et partiront automatiquement depuis l'application actuelle.</div>
}

const monthKey = (s: string) => s.slice(0, 7)

export function AthleteHome({ uid, ctx, name, onNavigate }: { uid: string; ctx: UzuContext | null; name: string; onNavigate: (id: string) => void }) {
  const { data, error, reload } = useTraining(uid, ctx)
  const today = new Date()
  const first = name.split(/[\s@]/)[0]
  const next = useMemo(() => (ctx?.club && data?.role !== "solo" ? nextClasses(ctx.club.schedule, 1)[0] : undefined), [ctx, data])

  const stats = useMemo(() => {
    if (!data) return null
    const S = data.sessions
    const thisM = ymd(today).slice(0, 7)
    const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const prevM = ymd(prev).slice(0, 7)
    const inM = S.filter(s => monthKey(s.date) === thisM)
    const inPrev = S.filter(s => monthKey(s.date) === prevM)
    const minutes = inM.reduce((a, s) => a + (Number(s.dur) || 0), 0)
    // Semaines actives sur les 8 dernières (lundi → dimanche)
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
    let active = 0
    for (let w = 0; w < 8; w++) {
      const a = new Date(monday); a.setDate(a.getDate() - 7 * w)
      const b = new Date(a); b.setDate(b.getDate() + 7)
      if (S.some(s => { const d = parseYmd(s.date); return d >= a && d < b })) active++
    }
    return { count: inM.length, diff: inM.length - inPrev.length, minutes, active, total: S.length }
  }, [data]) // eslint-disable-line react-hooks/exhaustive-deps

  return <>
    <div className="page-heading"><div><Eyebrow>{today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</Eyebrow><h1>Bonjour {first}<span className="heading-period">.</span></h1><p>Chaque séance vous rapproche de votre prochain grade.</p></div>
      <a className="button button--dark" href={LEGACY}><Plus size={16} />Saisir ma séance</a></div>

    <section className="athlete-hero">
      <div className="hero-copy">
        <Eyebrow>{next ? "VOTRE PROCHAIN COURS" : "VOTRE PRATIQUE"}</Eyebrow>
        {next ? <>
          <h2>{next.slot.t}<br /><em>{next.inDays === 0 ? "aujourd'hui." : next.inDays === 1 ? "demain." : next.date.toLocaleDateString("fr-FR", { weekday: "long" }) + "."}</em></h2>
          <div className="hero-session-info"><span><CalendarDays size={15} />{next.slot.s} – {next.slot.e}</span><i /><span><MapPin size={15} />{ctx?.club?.name}</span></div>
        </> : <>
          <h2>La progression<br />se joue <em>sur le tatami.</em></h2>
          <div className="hero-session-info"><span><Dumbbell size={15} />{data ? `${data.sessions.length} séance${data.sessions.length > 1 ? "s" : ""} dans votre carnet` : "Votre carnet"}</span></div>
        </>}
        <button className="button button--light" onClick={() => onNavigate("log")}><span>Ouvrir mon carnet</span><ArrowRight size={16} /></button>
      </div>
    </section>

    {!data ? <Loading error={error} onRetry={reload} /> : <>
      <PendingNote data={data} />
      <div className="metric-grid">
        <Metric label="Séances ce mois" value={String(stats!.count)} unit={stats!.count > 1 ? "séances" : "séance"} icon={Dumbbell}
          trend={stats!.diff > 0 ? "up" : "flat"} note={stats!.diff > 0 ? `+${stats!.diff} vs mois dernier` : stats!.diff < 0 ? `${stats!.diff} vs mois dernier` : "comme le mois dernier"} />
        <Metric label="Temps sur le tatami" value={stats!.minutes ? durTxt(stats!.minutes) : "0"} unit={stats!.minutes ? "" : "h"} icon={Clock3} note="ce mois-ci" />
        <Metric label="Semaines actives" value={String(stats!.active)} unit="/ 8" icon={Flame} note="sur les 8 dernières semaines" />
        <article className="rank-card"><div className="rank-top"><span>{data.beltSource === "grade" ? "GRADE VALIDÉ" : "GRADE DÉCLARÉ"}</span><Award size={17} /></div>
          <div className="rank-body"><BeltMark rank={data.belt.rank} stripes={data.belt.stripes} /><div><strong>Ceinture {beltName(data.belt.rank).toLowerCase()}</strong><small>{data.belt.stripes ? `${data.belt.stripes} barrette${data.belt.stripes > 1 ? "s" : ""}` : "Sans barrette"}{data.belt.since ? ` · depuis le ${frDate(data.belt.since, { day: "numeric", month: "short", year: "numeric" })}` : ""}</small></div></div>
          <button className="text-link" onClick={() => onNavigate("progress")}>Voir ma progression<ArrowRight size={14} /></button></article>
      </div>

      <section className="recent-section">
        <div className="section-title"><h2>Activité récente</h2><button className="text-link" onClick={() => onNavigate("log")}>Tout le carnet<ArrowRight size={14} /></button></div>
        {data.sessions.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Aucune séance pour l'instant. Saisissez votre premier entraînement pour lancer votre compteur.</p><a className="button button--dark" href={LEGACY}><Plus size={15} />Saisir ma première séance</a></div>
          : <div className="recent-list">{data.sessions.slice(0, 5).map(s => <SessionRow key={s.id} s={s} />)}</div>}
      </section>
    </>}
  </>
}

function SessionRow({ s }: { s: Session }) {
  return <div className="recent-row uzu-recent-row">
    <span className={`recent-icon ${s.cat === "prepa" ? "recent-icon--sand" : "recent-icon--wine"}`}>{s.cat === "prepa" ? <Flame size={16} /> : <Dumbbell size={16} />}</span>
    <div className="recent-description"><strong>{sessionTitle(s)}</strong><small>{[sessionKind(s), sessionMeta(s)].filter(Boolean).join(" · ")}</small></div>
    <span className="recent-date">{frDate(s.date)}</span>
    <span className="recent-duration">{Number(s.dur) ? durTxt(Number(s.dur)) : "—"}</span>
  </div>
}

export function AthleteLog({ uid, ctx }: { uid: string; ctx: UzuContext | null }) {
  const { data, error, reload } = useTraining(uid, ctx)
  const [tab, setTab] = useState<"sessions" | "comps">("sessions")
  const months = useMemo(() => {
    const m = new Map<string, Session[]>()
    for (const s of data?.sessions ?? []) { const k = monthKey(s.date); m.set(k, [...(m.get(k) ?? []), s]) }
    return [...m.entries()]
  }, [data])

  return <>
    <div className="page-heading"><div><Eyebrow>VOTRE PRATIQUE{data ? <><span className="eyebrow-dot" />{data.sessions.length} SÉANCE{data.sessions.length > 1 ? "S" : ""}</> : null}</Eyebrow><h1>Carnet<span className="heading-period">.</span></h1><p>Le journal de vos efforts et des moments qui comptent.</p></div>
      <a className="button button--dark" href={LEGACY}><Plus size={16} />Saisir une séance</a></div>
    <div className="subnav"><div className="subnav-tabs">
      <button className={tab === "sessions" ? "active" : ""} onClick={() => setTab("sessions")}>Séances</button>
      <button className={tab === "comps" ? "active" : ""} onClick={() => setTab("comps")}>Compétitions{data?.comps.length ? ` (${data.comps.length})` : ""}</button>
    </div></div>
    {!data ? <Loading error={error} onRetry={reload} /> : <>
      <PendingNote data={data} />
      {tab === "sessions" ? (months.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Votre carnet est vide pour l'instant.</p><a className="button button--dark" href={LEGACY}><Plus size={15} />Saisir ma première séance</a></div>
        : months.map(([k, list]) => <section key={k} className="uzu-month">
          <div className="timeline-title"><h2>{parseYmd(k + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^./, c => c.toUpperCase())}</h2><span>{list.length} séance{list.length > 1 ? "s" : ""} · {durTxt(list.reduce((a, s) => a + (Number(s.dur) || 0), 0))}</span></div>
          <div className="session-list">{list.map(s => <article className="session-card" key={s.id}>
            <div className="session-date"><span>{parseYmd(s.date).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "").toUpperCase()}</span><strong>{parseYmd(s.date).getDate()}</strong></div>
            <span className={`session-marker session-marker--${s.cat === "prepa" ? "sand" : s.roll ? "dark" : "wine"}`} />
            <div className="session-main"><div className="session-card-top"><h3>{sessionTitle(s)}</h3><span className={`session-label session-label--${s.roll ? "plain" : "soon"}`}>{sessionKind(s)}</span></div>
              <div className="session-meta"><span><Clock3 size={14} />{Number(s.dur) ? durTxt(Number(s.dur)) : "Durée non précisée"}</span>{sessionMeta(s) && <span>{sessionMeta(s)}</span>}</div></div>
          </article>)}</div>
        </section>))
        : (data.comps.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Aucune compétition enregistrée.</p></div>
          : <div className="session-list">{data.comps.map(c => <article className="session-card" key={c.id}>
            <div className="session-date"><span>{parseYmd(c.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase()}</span><strong>{parseYmd(c.date).getDate()}</strong></div>
            <span className="session-marker session-marker--wine" />
            <div className="session-main"><div className="session-card-top"><h3>{c.event || "Compétition"}</h3>{compResult(c) && <span className="session-label session-label--soon"><Trophy size={11} /> {compResult(c)}</span>}</div>
              <div className="session-meta">{c.type && <span>{c.type}</span>}<span>{Number(c.wins) || 0} victoire{(Number(c.wins) || 0) > 1 ? "s" : ""} · {Number(c.losses) || 0} défaite{(Number(c.losses) || 0) > 1 ? "s" : ""}</span><span>{frDate(c.date, { day: "numeric", month: "long", year: "numeric" })}</span></div></div>
          </article>)}</div>)}
    </>}
  </>
}
