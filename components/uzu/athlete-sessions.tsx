"use client"
// Espace Athlete — Entraînements (à venir, journal, compétitions, calendrier) et Statistiques,
// au design de la maquette, sur les vraies données du carnet et du planning du club.
import { useMemo, useState } from "react"
import { ArrowUpRight, Award, CalendarDays, ChevronRight, Clock3, Dumbbell, Eye, Flame, MapPin, Pencil, Plus, Trash2, Trophy } from "lucide-react"
import { deleteEntry } from "@/lib/uzu/journal"
import type { UzuContext } from "@/lib/uzu/context"
import { closureOn, closureTxt, closuresOf, compResult, durTxt, frDate, nextClasses, normSched, slotOpenOn, parseYmd, sessionKind, sessionMeta, sessionTitle, slotTag, ymd, type Session } from "@/lib/uzu/training"
import { useTraining } from "@/components/uzu/athlete"
import { SessionDetail } from "@/components/uzu/session-detail"
import { CombatMapCard, useFullSessions } from "@/components/uzu/combat-map"
import { Calendar, type CalItem } from "@/components/uzu/calendar"
import { GroupJournal, useJournalGroups } from "@/components/uzu/class-journal"

const DSHORT = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const isPrepa = (s: Session) => s.cat === "prepa"
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const monday = (d: Date) => addDays(dayOf(d), -((d.getDay() + 6) % 7))
const slotMin = (s: string, e: string) => { const a = s.split(":"), b = e.split(":"); return (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]) }

function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div> }
function Loading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) return <div className="uzu-banner uzu-banner--error" role="alert">Lecture impossible : {error} <button className="text-link" onClick={onRetry}>Réessayer</button></div>
  return <div className="uzu-banner" aria-busy="true">Chargement de vos entraînements…</div>
}

// ================================================================ Entraînements
type Tab = "next" | "journal" | "group" | "comps" | "calendar"
export function AthleteSessions({ uid, ctx, onCompose, onEdit, onToast, initialTab }: { uid: string; ctx: UzuContext | null; initialTab?: string; onCompose: () => void; onEdit: (kind: "s" | "c", id: string) => void; onToast: (m: string) => void }) {
  const { data, error, reload } = useTraining(uid, ctx)
  const solo = !ctx?.club || ctx.role === "solo"
  const it = (initialTab || "").split(":")[0]
  const [tab, setTab] = useState<Tab>(it === "journal" || it === "group" || it === "comps" || it === "calendar" ? it : solo ? "journal" : "next")
  // « Cours du groupe » : seulement si le Journal des cours est en place et que l'adhérent a un groupe
  const JG = useJournalGroups(solo ? null : ctx)
  const hasGroup = JG.status === "ok" && JG.groups.some(g => g.mine)
  const [confirm, setConfirm] = useState("")
  // Après une nouvelle saisie : fiche « Séance enregistrée ✓ » avec partage en Story (comme l'ancienne application)
  const [view, setView] = useState((initialTab || "").split(":")[1] || "")
  const [saved, setSaved] = useState(!!(initialTab || "").split(":")[1])
  const now = new Date()
  const del = async (kind: "s" | "c", id: string) => {
    if (confirm !== kind + id) { setConfirm(kind + id); window.setTimeout(() => setConfirm(c => (c === kind + id ? "" : c)), 3500); return }
    setConfirm("")
    const r = await deleteEntry(uid, ctx, kind, id)
    if (!r.ok) { onToast(r.msg); return }
    onToast(kind === "s" ? (r.synced ? "Séance supprimée" : "Séance supprimée sur ce téléphone : synchronisation au retour du réseau") : (r.synced ? "Compétition supprimée" : "Compétition supprimée sur ce téléphone : synchronisation au retour du réseau"))
    reload()
  }
  const Acts = ({ kind, id, roll }: { kind: "s" | "c"; id: string; roll?: boolean }) => <div className="uzu-acts" onClick={e => e.stopPropagation()}>
    {kind === "s" && <button type="button" onClick={() => { setSaved(false); setView(id) }} aria-label="Aperçu"><Eye size={14} /><span>Aperçu</span></button>}
    {!roll && <><button type="button" onClick={() => onEdit(kind, id)} aria-label="Modifier"><Pencil size={14} /><span>Modifier</span></button>
    <button type="button" className={confirm === kind + id ? "danger" : ""} onClick={() => del(kind, id)} aria-label="Supprimer"><Trash2 size={14} /><span>{confirm === kind + id ? "Confirmer" : "Supprimer"}</span></button></>}
  </div>
  const months = useMemo(() => {
    const m = new Map<string, Session[]>()
    for (const s of data?.sessions ?? []) { const k = s.date.slice(0, 7); m.set(k, [...(m.get(k) ?? []), s]) }
    return [...m.entries()]
  }, [data])
  const upcoming = useMemo(() => (solo ? [] : nextClasses(ctx?.club?.schedule, 8, new Date(), ctx?.club)), [ctx, solo])
  const wk = monday(now), thisWeek = (data?.sessions ?? []).filter(s => s.date >= ymd(wk)).length
  const tabs: [Tab, string][] = [...(solo ? [] : [["next", "À venir"] as [Tab, string]]), ["journal", "Mon journal"], ...(hasGroup ? [["group", "Cours du groupe"] as [Tab, string]] : []), ["comps", `Compétitions${data?.comps.length ? ` (${data.comps.length})` : ""}`], ["calendar", "Calendrier"]]

  return <>
    <div className="page-heading"><div><Eyebrow>VOTRE PRATIQUE<span className="eyebrow-dot" />{now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).toUpperCase()}</Eyebrow><h1>Entraînements<span className="heading-period">.</span></h1><p>Le journal de vos efforts et des moments qui comptent.</p></div>
      <button className="button button--dark" onClick={onCompose}><Plus size={16} />Saisir ma séance</button></div>
    <div className="subnav"><div className="subnav-tabs">{tabs.map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}</div></div>
    {!data ? <Loading error={error} onRetry={reload} /> : <>
      {data.pendingLocal && <div className="uzu-banner">Des saisies faites sur ce téléphone attendent encore d'être envoyées. Elles partiront automatiquement à la prochaine connexion au réseau.</div>}

      {tab === "next" && <>
        {upcoming[0] ? (() => { const o = upcoming[0]; return <div className="upcoming-banner">
          <div className="upcoming-date"><strong>{o.date.getDate()}</strong><span>{o.date.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase()}</span></div>
          <div className="upcoming-copy"><span className="class-tag">{o.inDays === 0 ? "AUJOURD'HUI" : o.inDays === 1 ? "DEMAIN" : o.date.toLocaleDateString("fr-FR", { weekday: "long" }).toUpperCase()} · PROCHAIN COURS{slotTag(o.slot) ? " · " + slotTag(o.slot).toUpperCase() : ""}</span><h2>{o.slot.t}</h2>
            <p><Clock3 size={14} />{o.slot.s} – {o.slot.e} <i /> <MapPin size={14} />{ctx?.club?.name}</p></div>
          <button className="button button--light" onClick={onCompose}>Saisir après le cours<ChevronRight size={15} /></button></div> })()
          : <div className="panel uzu-panel"><p className="uzu-text">Aucun cours au planning du club pour les prochains jours.</p></div>}
        {!solo && (() => { const t = ymd(new Date()), lim = ymd(addDays(new Date(), 21)), c = closuresOf(ctx?.club).find(x => x.to >= t && x.from <= lim); return c ? <div className="uzu-banner uzu-hol-note" role="note">{c.from <= t ? "En ce moment" : "Bientôt"} : {c.label} {closureTxt(c)}. Pas de cours au club, sauf ceux maintenus.</div> : null })()}
        <div className="timeline-title"><h2>Vos prochains cours</h2><span>{thisWeek} séance{thisWeek > 1 ? "s" : ""} cette semaine</span></div>
        <div className="session-list">{upcoming.map((o, i) => <article className="session-card" key={o.slot.id + o.inDays}>
          <div className="session-date"><span>{DSHORT[o.slot.d - 1]}</span><strong>{o.date.getDate()}</strong></div>
          <span className={`session-marker session-marker--${i === 0 ? "wine" : i % 2 ? "sand" : "dark"}`} />
          <div className="session-main"><div className="session-card-top"><h3>{o.slot.t}</h3><span className={`session-label session-label--${o.inDays === 0 ? "soon" : "plain"}`}>{o.inDays === 0 ? "Aujourd'hui" : o.inDays === 1 ? "Demain" : `Dans ${o.inDays} jours`}</span></div>
            <div className="session-meta"><span><Clock3 size={14} />{o.slot.s} · {durTxt(Math.max(0, slotMin(o.slot.s, o.slot.e)))}</span>{slotTag(o.slot) && <span>{slotTag(o.slot)}</span>}<span><MapPin size={14} />{ctx?.club?.name}</span></div></div>
        </article>)}</div>
      </>}

      {tab === "journal" && (months.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Votre journal est vide pour l'instant.</p><button className="button button--dark" onClick={onCompose}><Plus size={15} />Saisir ma première séance</button></div>
        : months.map(([k, list]) => <section key={k} className="uzu-month">
          <div className="timeline-title"><h2>{cap(parseYmd(k + "-01").toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))}</h2><span>{list.length} séance{list.length > 1 ? "s" : ""} · {durTxt(list.reduce((a, s) => a + (Number(s.dur) || 0), 0))}</span></div>
          <div className="session-list">{list.map(s => <article className="session-card uzu-clickable" key={s.id} role="button" tabIndex={0} aria-label={`Aperçu de la séance du ${frDate(s.date, { day: "numeric", month: "long" })}`} onClick={() => { setSaved(false); setView(s.id) }} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setView(s.id) } }}>
            <div className="session-date"><span>{parseYmd(s.date).toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "").toUpperCase()}</span><strong>{parseYmd(s.date).getDate()}</strong></div>
            <span className={`session-marker session-marker--${isPrepa(s) ? "sand" : s.roll ? "dark" : "wine"}`} />
            <div className="session-main"><div className="session-card-top"><h3>{sessionTitle(s)}</h3><span className={`session-label session-label--${s.roll ? "plain" : "soon"}`}>{sessionKind(s)}</span></div>
              <div className="session-meta"><span><Clock3 size={14} />{Number(s.dur) ? durTxt(Number(s.dur)) : "Durée non précisée"}</span>{sessionMeta(s) && <span>{sessionMeta(s)}</span>}</div>
              <Acts kind="s" id={s.id} roll={s.roll} /></div>
          </article>)}</div>
        </section>))}

      {tab === "group" && (hasGroup ? <GroupJournal uid={uid} groups={JG.groups} /> : JG.status === "loading" ? <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p> : <div className="panel uzu-panel"><p className="uzu-text">Tu n'es rattaché à aucun groupe pour l'instant.</p></div>)}
      {tab === "comps" && (data.comps.length === 0 ? <div className="panel uzu-panel"><p className="uzu-text">Aucune compétition enregistrée.</p><button className="button button--dark" onClick={onCompose}><Plus size={15} />Saisir un résultat</button></div>
        : <div className="session-list">{data.comps.map(c => <article className="session-card" key={c.id}>
          <div className="session-date"><span>{parseYmd(c.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase()}</span><strong>{parseYmd(c.date).getDate()}</strong></div>
          <span className="session-marker session-marker--wine" />
          <div className="session-main"><div className="session-card-top"><h3>{c.event || "Compétition"}</h3>{compResult(c) && <span className="session-label session-label--soon"><Trophy size={11} /> {compResult(c)}</span>}</div>
            <div className="session-meta">{c.type && <span>{c.type}</span>}<span>{Number(c.wins) || 0} victoire{(Number(c.wins) || 0) > 1 ? "s" : ""} · {Number(c.losses) || 0} défaite{(Number(c.losses) || 0) > 1 ? "s" : ""}</span><span>{frDate(c.date, { day: "numeric", month: "long", year: "numeric" })}</span></div>
            <Acts kind="c" id={c.id} /></div>
        </article>)}</div>)}

      {tab === "calendar" && <CalendarWeek sessions={data.sessions} schedule={solo ? [] : ctx?.club?.schedule} club={solo ? null : ctx?.club} />}
    </>}
    {view && <SessionDetail uid={uid} ctx={ctx} id={view} saved={saved} onClose={() => { setView(""); setSaved(false) }} onEdit={id => { setView(""); onEdit("s", id) }} onComplete={() => { setView(""); onCompose() }} />}
  </>
}

/** Semaine : cours du planning du club (à venir) et séances saisies (faites). */
function CalendarWeek({ sessions, schedule, club }: { sessions: Session[]; schedule: unknown; club: unknown }) {
  const today = dayOf(new Date()), sched = useMemo(() => normSched(schedule), [schedule])
  const itemsOn = (d: Date, ds: string): CalItem[] => {
    const done = sessions.filter(s => s.date === ds), iso = ((d.getDay() + 6) % 7) + 1
    const out: CalItem[] = done.map(s => ({ key: s.id, title: sessionTitle(s), sub: (Number(s.dur) ? durTxt(Number(s.dur)) : "") + (s.roll ? " · appel" : ""), tone: isPrepa(s) ? "sand" : "wine" }))
    if (d >= today && !done.some(s => !isPrepa(s))) sched.filter(x => x.d === iso).forEach(x => {
      if (slotOpenOn(club, x, ds)) out.push({ key: x.id, title: x.t, sub: x.s + (slotTag(x) ? " · " + slotTag(x) : ""), tone: "dark" })
      else if (!closureOn(club, ds)) out.push({ key: x.id, title: x.t, sub: x.s, tone: "dark", off: "Annulé" })
    })
    return out
  }
  return <Calendar eyebrow="VOTRE PLANNING" storeKey="uzu-cal-athlete" itemsOn={itemsOn} closedOn={ds => (sched.length ? closureOn(club, ds)?.label || null : null)}
    legend={<div className="chart-legend uzu-cal-legend"><span><i className="lg-wine" />Séance saisie</span><span><i className="lg-sand" />Prépa physique</span>{sched.length > 0 && <span><i className="lg-dark" />Cours prévu au club</span>}{sched.length > 0 && closuresOf(club).length > 0 && <span><i className="lg-hol" />Vacances, pas de cours</span>}</div>} />
}

// ================================================================ Statistiques
type Period = "season" | "prev" | "12m" | "all"
const seasonStart = (d: Date) => new Date(d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1, 8, 1)

export function AthleteStats({ uid, ctx, onCompose }: { uid: string; ctx: UzuContext | null; onCompose: () => void }) {
  const { data, error, reload } = useTraining(uid, ctx)
  const full = useFullSessions(uid, ctx)
  const [period, setPeriod] = useState<Period>("season")
  const today = dayOf(new Date())
  const st = useMemo(() => {
    if (!data) return null
    const S = data.sessions.filter(s => !s.sample)
    const ss = seasonStart(today)
    let from: Date, to: Date, label: string
    if (period === "season") { from = ss; to = today; label = `SAISON ${ss.getFullYear()}–${String(ss.getFullYear() + 1).slice(2)}` }
    else if (period === "prev") { from = new Date(ss.getFullYear() - 1, 8, 1); to = addDays(ss, -1); label = `SAISON ${ss.getFullYear() - 1}–${String(ss.getFullYear()).slice(2)}` }
    else if (period === "12m") { from = addDays(today, -364); to = today; label = "12 DERNIERS MOIS" }
    else { const first = S.length ? parseYmd(S[S.length - 1].date) : today; from = first < today ? first : today; to = today; label = "DEPUIS LE DÉBUT" }
    const span = Math.max(1, Math.round((+to - +from) / 864e5) + 1)
    const inP = (s: Session, a: Date, b: Date) => s.date >= ymd(a) && s.date <= ymd(b)
    const P = S.filter(s => inP(s, from, to))
    const prevFrom = addDays(from, -span), prevTo = addDays(from, -1), Q = period === "all" ? [] : S.filter(s => inP(s, prevFrom, prevTo))
    const mins = P.reduce((a, s) => a + (Number(s.dur) || 0), 0), qMins = Q.reduce((a, s) => a + (Number(s.dur) || 0), 0)
    // Semaines (lundi → dimanche)
    const wkKey = (s: Session) => ymd(monday(parseYmd(s.date)))
    const allWeeks = new Set(S.map(wkKey)), pWeeks = new Set(P.map(wkKey))
    const nWeeks = Math.max(1, Math.round((+monday(to) - +monday(from)) / (7 * 864e5)) + 1)
    // Série en cours (semaines consécutives avec au moins une séance) et record
    let cur = 0, w = monday(today)
    if (!allWeeks.has(ymd(w))) w = addDays(w, -7)
    while (allWeeks.has(ymd(w))) { cur++; w = addDays(w, -7) }
    const sorted = [...allWeeks].sort(); let best = 0, run = 0, prev = ""
    for (const k of sorted) { run = prev && ymd(addDays(parseYmd(prev), 7)) === k ? run + 1 : 1; best = Math.max(best, run); prev = k }
    // 8 dernières semaines (mini-barres)
    const last8 = [...Array(8)].map((_, i) => { const a = addDays(monday(today), -7 * (7 - i)), b = addDays(a, 6); const L = S.filter(s => inP(s, a, b)); return { n: L.length, m: L.reduce((x, s) => x + (Number(s.dur) || 0), 0) } })
    const pct = (v: number[]) => { const mx = Math.max(1, ...v); return v.map(x => Math.max(6, Math.round(x / mx * 100))) }
    // Séances par mois (période, 12 mois au plus)
    const mStart = new Date(from.getFullYear(), from.getMonth(), 1), months: { k: string; d: Date; n: number }[] = []
    for (let d = new Date(mStart); d <= to; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push({ k: ymd(d).slice(0, 7), d: new Date(d), n: 0 })
    const ML = months.slice(-12); P.forEach(s => { const m = ML.find(x => x.k === s.date.slice(0, 7)); if (m) m.n++ })
    // Répartition
    const rep: [string, number][] = [["Gi", 0], ["No-gi", 0], ["Open mat", 0], ["Prépa physique", 0]]
    P.forEach(s => { const i = isPrepa(s) ? 3 : s.kind === "open" ? 2 : /no.?gi/i.test(s.type || "") ? 1 : 0; rep[i][1]++ })
    const delta = (a: number, b: number, unit = "") => (period === "all" ? "" : a - b > 0 ? `+${a - b}${unit}` : a - b < 0 ? `${a - b}${unit}` : "=")
    return { label, P, Q, mins, qMins, pWeeks: pWeeks.size, nWeeks, cur, best, last8, pct, ML, rep, delta, fromS: ymd(from), toS: ymd(to) }
  }, [data, period]) // eslint-disable-line react-hooks/exhaustive-deps

  const heading = <div className="page-heading"><div><Eyebrow>VOS REPÈRES{st ? <><span className="eyebrow-dot" />{st.label}</> : null}</Eyebrow><h1>Les chiffres racontent<span className="heading-period">.</span></h1><p>Une pratique régulière, mesurée à votre façon.</p></div>
    <label className="panel-select uzu-period"><CalendarDays size={14} /><select aria-label="Période" value={period} onChange={e => setPeriod(e.target.value as Period)}><option value="season">Cette saison</option><option value="prev">Saison passée</option><option value="12m">12 derniers mois</option><option value="all">Depuis le début</option></select></label></div>
  if (!data || !st) return <>{heading}<Loading error={error} onRetry={reload} /></>
  const cmp = period === "all" ? "" : period === "prev" ? "vs. saison d'avant" : period === "season" ? "vs. même durée avant" : "vs. 12 mois d'avant"
  const h = Math.round(st.mins / 60), qh = Math.round(st.qMins / 60)
  const Metric = ({ label, value, unit, delta, caption, icon: Icon, bars }: { label: string; value: string; unit?: string; delta: string; caption: string; icon: typeof Dumbbell; bars: number[] }) =>
    <article className="metric-card"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon size={16} /></span></div><div className="metric-main"><strong>{value}</strong>{unit && <span>{unit}</span>}</div>
      <div className="metric-footer">{delta && <span className="positive-change"><ArrowUpRight size={13} />{delta}</span>}<span className="metric-caption">{caption}</span><div className="mini-bars mini-bars--wine" role="img" aria-label="Huit dernières semaines">{bars.map((v, i) => <span key={i} style={{ height: `${v}%` }} />)}</div></div></article>
  const total = st.rep.reduce((a, r) => a + r[1], 0)
  const avg = st.ML.length ? Math.round(st.ML.reduce((a, m) => a + m.n, 0) / st.ML.length * 10) / 10 : 0
  if (!data.sessions.length) return <>{heading}<div className="panel uzu-panel"><p className="uzu-text">Vos statistiques apparaîtront après vos premières séances.</p><button className="button button--dark" onClick={onCompose}><Plus size={15} />Saisir ma séance</button></div></>
  return <>
    {heading}
    <div className="metric-grid stats-metrics">
      <Metric label="Séances suivies" value={String(st.P.length)} unit={st.P.length > 1 ? "séances" : "séance"} delta={st.delta(st.P.length, st.Q.length)} caption={cmp || "au total"} icon={Dumbbell} bars={st.pct(st.last8.map(x => x.n))} />
      <Metric label="Temps de pratique" value={String(h)} unit="h" delta={st.delta(h, qh, " h")} caption={cmp || "au total"} icon={Clock3} bars={st.pct(st.last8.map(x => x.m))} />
      <Metric label="Semaines actives" value={String(st.pWeeks)} unit={`/ ${st.nWeeks}`} delta={`${Math.round(st.pWeeks / st.nWeeks * 100)} %`} caption="des semaines de la période" icon={Flame} bars={st.last8.map(x => (x.n ? 90 : 12))} />
      <Metric label="Série en cours" value={String(st.cur)} unit={st.cur > 1 ? "semaines" : "semaine"} delta={`Record : ${st.best}`} caption="semaines d'affilée" icon={Award} bars={st.last8.map(x => (x.n ? 90 : 12))} />
    </div>
    {full ? <CombatMapCard C={full.C} S={full.S} from={st.fromS} to={st.toS} /> : <div className="uzu-banner" aria-busy="true">Calcul de ta carte de combat…</div>}
    <section className="panel stats-chart-panel">
      <div className="panel-header"><div className="section-title"><h2>La régularité dans le temps</h2></div><span className="uzu-muted uzu-small">Par mois</span></div>
      {(() => { const n = st.ML.reduce((a, m) => a + m.n, 0); return <div className="chart-summary"><strong>{n}<span> séance{n > 1 ? "s" : ""}</span></strong><span>sur {st.ML.length === 12 && period === "all" ? "les 12 derniers" : st.ML.length} mois</span></div> })()}
      <MonthChart months={st.ML} />
      <div className="chart-legend"><span><i />Entraînements effectués</span><span>Moyenne : {String(avg).replace(".", ",")} par mois</span></div>
    </section>
    <div className="content-grid stats-bottom">
      <section className="panel"><div className="panel-header"><div className="section-title"><h2>Répartition des séances</h2></div></div>
        {total ? st.rep.filter(r => r[1]).map(r => <div className="distribution-row" key={r[0]}><span className={`distribution-dot dot-${({ Gi: 0, "Prépa physique": 1, "No-gi": 2, "Open mat": 3 } as Record<string, number>)[r[0]]}`} /><span>{r[0]}</span><small>{r[1]} séance{r[1] > 1 ? "s" : ""}</small><strong>{Math.round(r[1] / total * 100)} %</strong></div>)
          : <p className="uzu-text uzu-muted">Aucune séance sur cette période.</p>}
      </section>
      <section className="quote-card"><Eyebrow>UN JOUR À LA FOIS</Eyebrow><blockquote>« Le vrai progrès, c'est de revenir sur le tatami. »</blockquote><span>— The mat doesn&apos;t lie</span><div className="quote-lines"><i /><i /><i /></div></section>
    </div>
  </>
}

/** Courbe des séances par mois (même rendu que la maquette, sur les vraies valeurs). */
function MonthChart({ months }: { months: { k: string; d: Date; n: number }[] }) {
  const mx = Math.max(4, ...months.map(m => m.n)), n = months.length
  const xs = months.map((_, i) => (n === 1 ? 196 : 18 + i * (350 / (n - 1))))
  const ys = months.map(m => 95 - (m.n / mx) * 80)
  const line = months.map((_, i) => `${xs[i].toFixed(1)},${ys[i].toFixed(1)}`).join(" ")
  const ticks = [mx, Math.round(mx * .75), Math.round(mx * .5), Math.round(mx * .25)]
  const step = n > 8 ? 2 : 1
  return <div className="trend-chart" role="img" aria-label={`Séances par mois : ${months.map(m => m.n).join(", ")}`}>
    <div className="chart-y">{ticks.map((t, i) => <span key={i}>{t}</span>)}</div>
    <svg viewBox="0 0 388 100" preserveAspectRatio="none" aria-hidden="true">
      <defs><linearGradient id="stats-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#941B2B" stopOpacity=".17" /><stop offset="100%" stopColor="#941B2B" stopOpacity="0" /></linearGradient></defs>
      <path className="chart-grid" d="M10 20H382M10 45H382M10 70H382M10 95H382" />
      <polygon points={`${xs[0].toFixed(1)},100 ${line} ${xs[n - 1].toFixed(1)},100`} fill="url(#stats-fill)" />
      <polyline points={line} fill="none" stroke="#941B2B" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={xs[n - 1]} cy={ys[n - 1]} r="4" fill="#941B2B" stroke="#fff" strokeWidth="2" />
    </svg>
    <div className="chart-x">{months.map((m, i) => <span key={m.k}>{i % step === 0 || i === n - 1 ? m.d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "").toUpperCase() : ""}</span>)}</div>
  </div>
}
