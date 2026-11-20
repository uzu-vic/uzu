"use client"
// Espace Athlete — Accueil et Carnet (lecture) ; la saisie passe par components/uzu/journal-form.tsx.
import { useEffect, useMemo, useState } from "react"
import { ArrowRight, ArrowUpRight, Award, CalendarDays, Clock3, Dumbbell, Flame, MapPin, Pencil, Plus, Trash2, Trophy } from "lucide-react"
import { deleteEntry, loadCore } from "@/lib/uzu/journal"
import { loadVideos } from "@/lib/uzu/videos"
import { ClubVideo } from "@/components/uzu/club-video"
import { Stars } from "@/components/uzu/progress"
import { ReminderCard } from "@/components/uzu/combat-map"
import type { UzuContext } from "@/lib/uzu/context"
import {
  beltColor, beltName, compResult, durTxt, frDate, loadTraining, nextClasses, normSched, slotOpenOn, parseYmd, sessionKind, sessionMeta, sessionTitle, ymd,
  type Session, type Training,
} from "@/lib/uzu/training"


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
  return <div className="uzu-banner">Des saisies faites sur ce téléphone attendent encore d'être envoyées. Elles sont affichées ici et partiront automatiquement à la prochaine connexion au réseau.</div>
}

const monthKey = (s: string) => s.slice(0, 7)

export function AthleteHome({ uid, ctx, name, onNavigate, onCompose }: { uid: string; ctx: UzuContext | null; name: string; onNavigate: (id: string, arg?: string) => void; onCompose: () => void }) {
  const { data, error, reload } = useTraining(uid, ctx)
  const today = new Date()
  const next = useMemo(() => (ctx?.club && data?.role !== "solo" ? nextClasses(ctx.club.schedule, 1, new Date(), ctx.club)[0] : undefined), [ctx, data])

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
    <div className="page-heading"><div><Eyebrow>{today.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).toUpperCase()}</Eyebrow><h1>{name ? `Salut ${name}` : "Salut"}<span className="heading-period">.</span></h1><p>Chaque séance vous rapproche de votre prochain grade.</p></div>
      <button className="button button--dark" onClick={onCompose}><Plus size={16} />Saisir ma séance</button></div>

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
        <button className="button button--light" onClick={() => onNavigate("log")}><span>Mes entraînements</span><ArrowRight size={16} /></button>
      </div>
    </section>

    {!data ? <Loading error={error} onRetry={reload} /> : <>
      <PendingNote data={data} />
      <HomeExtras uid={uid} ctx={ctx} solo={data.role === "solo"} sessions={data.sessions} onNavigate={onNavigate} onCompose={onCompose} />
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
        <div className="section-title"><h2>Activité récente</h2><button className="text-link" onClick={() => onNavigate("log")}>Tout le journal<ArrowRight size={14} /></button></div>
        {data.sessions.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Aucune séance pour l'instant. Saisissez votre premier entraînement pour lancer votre compteur.</p><button className="button button--dark" onClick={onCompose}><Plus size={15} />Saisir ma première séance</button></div>
          : <div className="recent-list">{data.sessions.slice(0, 5).map(s => <SessionRow key={s.id} s={s} />)}</div>}
      </section>
    </>}
  </>
}

// Focus tactique, actualités, vidéo, techniques à réviser, rappel de fin de cours, carnet solo (repris de l'accueil de l'ancienne application)
function HomeExtras({ uid, ctx, solo, sessions, onNavigate, onCompose }: { uid: string; ctx: UzuContext | null; solo: boolean; sessions: Session[]; onNavigate: (id: string, arg?: string) => void; onCompose: () => void }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [core, setCore] = useState<any>(null)
  const [vid, setVid] = useState("")
  const [endKey, setEndKey] = useState("")
  const club = ctx?.club, tf = (club?.tactical_focus || {}) as Record<string, string>
  useEffect(() => { let live = true; loadCore(uid, ctx).then(r => { if (live) setCore(r.core) }, () => {}); return () => { live = false } }, [uid, ctx])
  useEffect(() => { if (!club?.id || solo) return; let live = true; loadVideos(club.id).then(v => { if (live && v["club-semaine"]) setVid(v["club-semaine"].id) }); return () => { live = false } }, [club?.id, solo])
  // « Fin du cours ! » : dans les 3 h qui suivent la fin d'un cours du jour, si aucune séance n'est saisie pour aujourd'hui
  useEffect(() => {
    if (solo || !club) { setEndKey(""); return }
    const now = new Date(), today = ymd(now), dn = ((now.getDay() + 6) % 7) + 1, mins = now.getHours() * 60 + now.getMinutes()
    let best: { id: string; em: number } | null = null
    const S = normSched(club.schedule)
    S.forEach(x => { if (x.d !== dn || !/^\d\d:\d\d$/.test(String(x.e)) || !slotOpenOn(club, x, today)) return; const e = x.e.split(":"), em = +e[0] * 60 + +e[1]; if (mins >= em && mins - em <= 180 && (!best || em > best.em)) best = { id: x.id, em } })
    let dis: Record<string, number> = {}; try { dis = JSON.parse(localStorage.getItem("uzu-endbar") || "{}") || {} } catch { /* rien */ }
    const b = best as { id: string; em: number } | null, key = b ? today + "|" + b.id : ""
    setEndKey(b && !sessions.some(s => s.date === today && s.cat !== "prepa") && !dis[key] ? key : "")
  }, [club, solo, sessions])
  const later = () => { try { const d = JSON.parse(localStorage.getItem("uzu-endbar") || "{}") || {}; d[endKey] = 1; localStorage.setItem("uzu-endbar", JSON.stringify(d)) } catch { /* rien */ } setEndKey("") }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const review: any[] = core ? core.reviewList(core.me()) : []
  const sys = (k: string) => (core && k && core.SYSTEMS[k] ? core.SYSTEMS[k].n : "")
  return <>
    {endKey && <div className="uzu-banner uzu-endbar" role="status"><span>🥋 Fin du cours ! As-tu pensé à saisir ta séance pour ne rien oublier ? (10 secondes chrono)</span>
      <span className="uzu-actions uzu-actions--start"><button className="button button--dark uzu-small-btn" onClick={onCompose}>Saisir ma séance</button><button className="button button--outline uzu-small-btn" onClick={later}>Plus tard</button></span></div>}
    {!solo && club && <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col">
        <div className="eyebrow">FOCUS TACTIQUE DU MOMENT</div>
        <h2 className="uzu-h2">{tf.weekTheme || "Pas encore de focus publié"}</h2>
        {(tf.focusFrom || tf.focusTo) && <p className="uzu-text uzu-small">{[sys(tf.focusFrom), sys(tf.focusTo)].filter(Boolean).join(" → ")}</p>}
        <p className="uzu-text">{tf.focusDetails || (tf.weekTheme ? "" : "Ton prof n'a pas encore publié de focus. En attendant, travaille tes fondamentaux et les connexions entre tes 3 systèmes.")}</p>
        {vid && <ClubVideo id={vid} label="Vidéo du focus tactique" />}
      </section>
      {club.news ? <section className="panel uzu-panel-col"><div className="eyebrow">ACTUALITÉS · {(club.name || "club").toUpperCase()}</div><p className="uzu-text uzu-pre">{club.news}</p></section>
        : <section className="panel uzu-panel-col"><div className="eyebrow">ACTUALITÉS</div><p className="uzu-text uzu-muted">Aucune annonce du club pour l'instant.</p></section>}
    </div>}
    {review.length > 0 && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="eyebrow">À RÉVISER</div>
      <p className="uzu-text">{review.length} technique{review.length > 1 ? "s" : ""} non travaillée{review.length > 1 ? "s" : ""} depuis plus de {core.REVIEW_DAYS} jours. Remets-{review.length > 1 ? "les" : "la"} au programme de ton prochain entraînement.</p>
      <ul className="uzu-skill-list">{review.slice(0, 3).map(i => <li key={i.name}><span><b>{i.name}</b><small>{core.agoTxt(i.days)}</small></span><Stars lvl={i.lvl} /></li>)}</ul>
      <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("progress")}>Voir mes techniques</button>
    </section>}
    {core && <ReminderCard C={core} S={core.allSessions().filter((x: { sample?: boolean }) => !x.sample)} onOpen={() => onNavigate("stats")} />}
    <section className="panel uzu-panel-col uzu-grid-gap uzu-dir-home"><div className="eyebrow">OÙ ROULER ?</div>
      <p className="uzu-text">Open mats, cours ouverts aux visiteurs, clubs qui accueillent : trouve où t&apos;entraîner près de chez toi ou en déplacement.</p>
      <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("feed", "clubs")}>Trouver un club</button></section>
    {solo && <section className="panel uzu-panel-col uzu-grid-gap"><div className="eyebrow">CARNET SOLO</div>
      <p className="uzu-text">Tu t'entraînes dans un club ? Relie ton carnet : ton prof validera tes ceintures et tes techniques ★★★. Tout ton historique te suit.</p>
      <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("profile")}>J'ai un code d'invitation</button></section>}
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
