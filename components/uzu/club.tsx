"use client"
// Espace Club — Accueil, Présences et Progression (grades). La fiche et la liste des élèves sont dans club-students.tsx.
// Les boutons sont masqués selon les droits pour la lisibilité ; chaque action est revérifiée par le serveur.
import { useCallback, useEffect, useMemo, useState } from "react"
import { Award, CalendarDays, CheckCircle2, ClipboardCheck, Search, Send, TrendingUp, UserPlus, Users } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { can } from "@/lib/uzu/permissions"
import { nextClasses } from "@/lib/uzu/training"
import {
  courseAllowed, decideGrade, getMyCourses, getRollStudents, hasAbs, hasRoll, listProposals, loadClubData, proposeGrade, reqText, rollOptions,
  rollSummary, saveAttendance, type ClubData, type MyCourses, type Proposal, type RollOption, type StudentRow,
} from "@/lib/uzu/club"
import { BeltMark } from "@/components/uzu/progress"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export type ClubProps = { uid: string; ctx: UzuContext | null; onToast: (m: string) => void; onNavigate: (id: string, arg?: string) => void }

const DSHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const RESULT: Record<string, string> = { or: "Or", argent: "Argent", bronze: "Bronze", aucun: "Sans podium" }
const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`
export const normTxt = (t: string) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
export const initialsOf = (n: string) => (n || "?").trim().split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase()

// ---------------------------------------------------------------- Données partagées
export function useClub(uid: string, ctx: UzuContext | null) {
  const [data, setData] = useState<ClubData | null>(null)
  const [mc, setMc] = useState<MyCourses>({ assigned: [], section: [], staff: [] })
  const [props, setProps] = useState<Proposal[]>([])
  const [error, setError] = useState("")
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!ctx?.club) return
    let live = true
    setError("")
    Promise.all([loadClubData(uid), getMyCourses(), can(ctx, "belts", "approve") ? listProposals(ctx.club.id) : Promise.resolve([])])
      .then(([d, m, p]) => { if (live) { setData(d); setMc(m); setProps(p) } }, e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [uid, ctx, tick])
  useEffect(() => {
    const f = () => { if (document.visibilityState === "visible") setTick(t => t + 1) }
    document.addEventListener("visibilitychange", f)
    return () => document.removeEventListener("visibilitychange", f)
  }, [])
  return { data, mc, props, error, reload: useCallback(() => setTick(t => t + 1), []) }
}

export function ClubLoading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) return <div className="uzu-banner uzu-banner--error" role="alert">Lecture impossible : {error} <button className="text-link" onClick={onRetry}>Réessayer</button></div>
  return <div className="uzu-banner" aria-busy="true">Chargement de l'académie…</div>
}
export function ClubHeading({ eyebrow, title, sub, children }: { eyebrow: string; title: React.ReactNode; sub: string; children?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}<span className="heading-period">.</span></h1><p>{sub}</p></div>{children}</div>
}

// ---------------------------------------------------------------- Accueil
export function ClubHome({ uid, ctx, onNavigate, name }: ClubProps & { name: string }) {
  const { data, error, reload } = useClub(uid, ctx)
  const [invite, setInvite] = useState(false)
  const club = ctx?.club, tf = (club?.tactical_focus || {}) as Any
  const first = name.split(/[\s@]/)[0]
  const rows = data?.rows ?? null
  const act = rows ? rows.filter(r => r.days <= 14).length : null, rq = rows ? rows.filter(r => r.req).length : null
  const next = useMemo(() => nextClasses(club?.schedule, 3), [club])
  const events = useMemo(() => (data ? activity(data, club?.schedule) : []), [data, club])
  const C = data?.C
  return <>
    <ClubHeading eyebrow={`ESPACE CLUB · ${(club?.name || "").toUpperCase()}`} title={<>Bonjour {first}</>} sub="Voici l'activité de ton académie." />
    {error && <ClubLoading error={error} onRetry={reload} />}
    <div className="metric-grid">
      {can(ctx, "students", "view") && <button className="metric-card uzu-metric-btn" onClick={() => onNavigate("students")}><div className="metric-top"><span>Élèves au total</span><span className="metric-icon"><Users size={16} /></span></div><div className="metric-main"><strong>{rows ? rows.length : "…"}</strong></div><div className="metric-footer"><span className="uzu-caption">rattachés à l'académie</span></div></button>}
      {can(ctx, "students", "view") && <button className="metric-card uzu-metric-btn" onClick={() => onNavigate("students", "active")}><div className="metric-top"><span>Élèves actifs</span><span className="metric-icon"><CheckCircle2 size={16} /></span></div><div className="metric-main"><strong>{act ?? "…"}</strong></div><div className="metric-footer"><span className="uzu-caption">une séance sur 14 jours</span></div></button>}
      {(can(ctx, "belts", "view") || can(ctx, "belts", "approve")) && <button className={`metric-card uzu-metric-btn ${rq ? "is-hot" : ""}`} onClick={() => onNavigate("progress")}><div className="metric-top"><span>Grades à valider</span><span className="metric-icon"><Award size={16} /></span></div><div className="metric-main"><strong>{rq ?? "…"}</strong></div><div className="metric-footer"><span className="uzu-caption">demandes des élèves</span></div></button>}
    </div>

    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Actions rapides</h2></div>
      <div className="uzu-qa">
        {can(ctx, "attendance", "create") && <button className="button button--dark" onClick={() => onNavigate("attendance")}><ClipboardCheck size={15} />Faire l'appel</button>}
        {can(ctx, "students", "create") && <button className="button button--outline" onClick={() => setInvite(v => !v)}><UserPlus size={15} />Ajouter un élève</button>}
        {(can(ctx, "belts", "approve") || can(ctx, "belts", "create")) && <button className="button button--outline" onClick={() => onNavigate("progress")}><Award size={15} />Valider un grade</button>}
      </div>
      {invite && <InvitePanel code={club?.invite_code || ""} clubName={club?.name || ""} />}
    </section>

    <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col">
        <div className="section-title"><h2>Focus tactique</h2><span className={`uzu-pill ${tf.weekTheme ? "done" : ""}`}>{tf.weekTheme ? "Publié" : "Non publié"}</span></div>
        <h3 className="uzu-h3">{tf.weekTheme || "Aucun focus publié"}</h3>
        <p className="uzu-text">{tf.weekTheme ? (tf.focusDetails || "") : "Publie un focus : tout le club le voit en ouvrant l'app."}</p>
        {C && [tf.focusFrom, tf.focusTo].filter((k: string) => k && C.SYSTEMS[k]).length > 0 && <p className="uzu-text uzu-small">{[tf.focusFrom, tf.focusTo].filter((k: string) => k && C.SYSTEMS[k]).map((k: string) => C.SYSTEMS[k].n).join(" → ")}</p>}
      </section>
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Prochains cours</h2><CalendarDays size={17} /></div>
        {next.length ? <ul className="uzu-top">{next.map(o => <li key={o.slot.id + o.inDays}><span>{o.slot.t}<small>{o.inDays === 0 ? "Aujourd'hui" : o.inDays === 1 ? "Demain" : DSHORT[o.slot.d - 1] + " " + o.date.getDate()} · {o.slot.s} – {o.slot.e}</small></span>
          {o.inDays === 0 && can(ctx, "attendance", "create") && <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("attendance")}>Appel</button>}</li>)}</ul>
          : <p className="uzu-text uzu-muted">Aucun cours au planning.</p>}
      </section>
    </div>

    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Activité récente</h2></div>
      {!data ? <p className="uzu-text uzu-muted">Chargement…</p> : events.length ? <ul className="uzu-top">{events.map((e, i) => <li key={i}><span className="uzu-ev">{e.h}</span><small>{C.frShort(e.d)}</small></li>)}</ul>
        : <p className="uzu-text uzu-muted">Rien de récent : les appels, grades validés, compétitions et nouveaux élèves apparaîtront ici.</p>}
    </section>
  </>
}

function activity(d: ClubData, schedule: unknown): { d: string; h: React.ReactNode }[] {
  const C = d.C, lim = C.ymd(C.addDays(C.TODAY, -60)), today = C.ymd(C.TODAY), ev: { d: string; h: React.ReactNode }[] = []
  d.rows.forEach(r => {
    r.hist.forEach((h: Any) => { const day = String(h.at || "").slice(0, 10); if (day >= lim) ev.push({ d: day, h: <><b>{r.name}</b>{h.status === "refusé" ? " : demande de grade refusée" : ` : ${C.beltShort(h)} validé`}</> }) })
    r.comps.forEach((c: Any) => { if (c.date >= lim && c.date <= today) ev.push({ d: c.date, h: <><b>{r.name}</b> : {c.event || "compétition"} · {RESULT[c.result] || ""}</> }) })
    if (r.joined && r.joined.slice(0, 10) >= lim) ev.push({ d: r.joined.slice(0, 10), h: <><b>{r.name}</b> a rejoint le club</> })
  })
  rollSummary(C, d.roll, schedule, 60).forEach(o => ev.push({ d: o.date, h: <>Appel {o.title} : <b>{o.p}</b> présent{o.p > 1 ? "s" : ""}{o.a ? ` · ${o.a} absent${o.a > 1 ? "s" : ""}` : ""}</> }))
  return ev.sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 8)
}

export function InvitePanel({ code, clubName }: { code: string; clubName: string }) {
  const [msg, setMsg] = useState("")
  const share = async () => {
    const text = `Rejoins ${clubName || "notre club"} sur UZU : crée ton compte, choisis « Rejoindre un club » et saisis le code ${code}.`
    try {
      if (navigator.share) { await navigator.share({ title: "UZU", text, url: window.location.origin + "/" }); return }
      await navigator.clipboard.writeText(text + " " + window.location.origin + "/"); setMsg("Invitation copiée")
    } catch { /* partage annulé */ }
  }
  return <div className="uzu-invite">
    <p className="uzu-text">Tes élèves rejoignent le club eux-mêmes : à la création de leur compte, ils choisissent « Rejoindre un club » et saisissent le code invitation. Ils apparaissent ensuite dans Élèves.</p>
    {code ? <><p className="uzu-text">Code invitation : <span className="uzu-code">{code}</span></p><button className="button button--dark" onClick={share}><Send size={15} />Partager l'invitation</button>{msg && <span className="uzu-small uzu-muted" role="status">{msg}</span>}</>
      : <p className="uzu-note wait">Aucun code invitation : choisis-en un dans Mon académie.</p>}
  </div>
}

// ---------------------------------------------------------------- Présences
export function ClubAttendance({ uid, ctx, onToast }: ClubProps) {
  const { data, mc, error, reload } = useClub(uid, ctx)
  const [tab, setTab] = useState<"call" | "log">("call")
  return <>
    <ClubHeading eyebrow="PRÉSENCES" title="Présences" sub="L'appel en quelques secondes, au bord du tatami." />
    <div className="uzu-seg uzu-grid-gap" role="group" aria-label="Présences"><button className={tab === "call" ? "on" : ""} aria-pressed={tab === "call"} onClick={() => setTab("call")}>Faire l'appel</button><button className={tab === "log" ? "on" : ""} aria-pressed={tab === "log"} onClick={() => setTab("log")}>Journal</button></div>
    {!data ? <ClubLoading error={error} onRetry={reload} />
      : tab === "call" ? <RollCall uid={uid} ctx={ctx} data={data} mc={mc} onToast={onToast} onSaved={reload} />
      : <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Historique des appels</h2><span className="uzu-muted uzu-small">30 jours</span></div>
        {(() => { const L = rollSummary(data.C, data.roll, ctx?.club?.schedule, 30); return L.length ? <ul className="uzu-top">{L.map(o => <li key={o.key}><span>{o.title}<small>{data.C.frDate(o.date)}</small></span><span className="uzu-right"><b>{pl(o.p, "présent")}</b><small>{pl(o.a, "absent")}</small></span></li>)}</ul> : <p className="uzu-text uzu-muted">Aucun appel enregistré sur 30 jours.</p> })()}
      </section>}
  </>
}

function RollCall({ uid, ctx, data, mc, onToast, onSaved }: { uid: string; ctx: UzuContext | null; data: ClubData; mc: MyCourses; onToast: (m: string) => void; onSaved: () => void }) {
  const opts = useMemo(() => rollOptions(ctx, mc), [ctx, mc])
  const [sel, setSel] = useState("")
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null)
  const [checked, setChecked] = useState<Record<string, boolean>>({})
  const [q, setQ] = useState("")
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState("")
  const o: RollOption | undefined = opts.find(x => x.key === sel) || opts[0]
  useEffect(() => {
    if (!o) return
    let live = true
    setList(null)
    getRollStudents(o.course, uid).then(L => {
      if (!live) return
      const c: Record<string, boolean> = {}
      L.forEach(st => { if (hasRoll(data.roll, st.id, o.key)) c[st.id] = true; else if (hasAbs(data.roll, st.id, o.key)) c[st.id] = false })
      setList(L); setChecked(c)
    })
    return () => { live = false }
  }, [o?.key, uid, data]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setDone("") }, [o?.key])

  if (!opts.length) return <section className="panel uzu-panel-col"><p className="uzu-text">Aucun cours ne t'est affecté.</p><p className="uzu-text uzu-muted uzu-small">Le responsable de l'académie t'affecte des cours dans Cours.</p></section>
  const L = list || [], p = L.filter(s => checked[s.id] === true).length, a = L.filter(s => checked[s.id] === false).length
  const canWrite = !!o && (o.course === "libre" || courseAllowed(ctx, mc, "attendance", "create", o.course))
  const allP = L.length > 0 && L.every(s => checked[s.id] === true)
  const nq = normTxt(q.trim())
  const mark = (id: string, v: boolean) => setChecked(c => { const n = { ...c }; if (n[id] === v) delete n[id]; else n[id] = v; return n })
  const save = async () => {
    if (!o) return
    if (!p && !a && !L.some(s => hasRoll(data.roll, s.id, o.key) || hasAbs(data.roll, s.id, o.key))) { onToast("Marque d'abord les élèves présents ou absents"); return }
    const marks: Record<string, "p" | "a" | null> = {}
    L.forEach(s => { const v = checked[s.id], want = v === true ? "p" : v === false ? "a" : null, cur = hasRoll(data.roll, s.id, o.key) ? "p" : hasAbs(data.roll, s.id, o.key) ? "a" : null; if (want !== cur) marks[s.id] = want })
    const msg = `${pl(p, "présent")} · ${pl(a, "absent")}`
    if (!Object.keys(marks).length) { setDone(`✓ Appel enregistré pour « ${o.label} » : ${msg}.`); onToast("Appel enregistré : " + msg); return }
    setBusy(true)
    const r = await saveAttendance(ctx, o, marks)
    setBusy(false)
    if (!r.ok) { onToast(r.msg); return }
    setDone(`✓ Appel enregistré pour « ${o.label} » : ${msg}.`); onToast("Appel enregistré : " + msg); onSaved()
  }
  return <section className="panel uzu-panel-col">
    <label className="uzu-label" htmlFor="roll-slot">Cours</label>
    <select id="roll-slot" className="uzu-input" value={o?.key} onChange={e => setSel(e.target.value)}>{opts.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
    <div className="uzu-counts"><div><b>{p}</b><small>présents</small></div><div><b>{a}</b><small>absents</small></div><div><b>{L.length - p - a}</b><small>non marqués</small></div></div>
    <div className="uzu-roll-tools"><span className="uzu-search"><Search size={15} /><input type="search" className="uzu-input" placeholder="Rechercher un élève" aria-label="Rechercher un élève dans l'appel" value={q} onChange={e => setQ(e.target.value)} /></span>
      {canWrite && <button className="button button--outline uzu-small-btn" onClick={() => { if (allP) setChecked({}); else { const c: Record<string, boolean> = {}; L.forEach(s => { c[s.id] = true }); setChecked(c) } }}>{allP ? "Tout effacer" : "Tout présent"}</button>}</div>
    {list === null ? <p className="uzu-text uzu-muted" aria-busy="true">Chargement des élèves…</p>
      : !L.length ? <p className="uzu-text uzu-muted">Aucun élève inscrit pour l'instant.</p>
      : <ul className="uzu-roll">{L.filter(s => !nq || normTxt(s.name).includes(nq)).map(s => { const v = checked[s.id], prev = o && (hasRoll(data.roll, s.id, o.key) || hasAbs(data.roll, s.id, o.key))
        return <li key={s.id}><span className="uzu-av" aria-hidden="true">{initialsOf(s.name)}</span><span className="uzu-roll-n"><b>{s.name}</b>{prev && <small>déjà noté pour ce cours</small>}</span>
          <span className="uzu-roll-btns" role="group" aria-label={s.name}><button type="button" className={v === false ? "abs" : ""} aria-pressed={v === false} disabled={!canWrite} onClick={() => mark(s.id, false)}>Absent</button><button type="button" className={v === true ? "pres" : ""} aria-pressed={v === true} disabled={!canWrite} onClick={() => mark(s.id, true)}>Présent</button></span></li> })}</ul>}
    {done && <p className="uzu-note ok" role="status">{done}</p>}
    {canWrite ? <button className="button button--dark uzu-wide" disabled={busy || list === null} onClick={save}>{busy ? "Enregistrement…" : p || a ? `Valider l'appel (${pl(p, "présent")}, ${pl(a, "absent")})` : "Valider l'appel"}</button>
      : <p className="uzu-note">Tu peux consulter cet appel mais pas le modifier.</p>}
    <p className="uzu-text uzu-small uzu-muted">Rien n'est enregistré avant « Valider l'appel ». Chaque élève présent reçoit une séance pré-remplie avec le focus du moment, qu'il pourra compléter.</p>
  </section>
}

// ---------------------------------------------------------------- Progression (grades)
export function ClubProgress({ uid, ctx, onToast, onNavigate }: ClubProps) {
  const { data, props, error, reload } = useClub(uid, ctx)
  const [comment, setComment] = useState<Record<string, string>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState("")
  const approve = can(ctx, "belts", "approve"), propose = can(ctx, "belts", "create")
  if (!data) return <><ClubHeading eyebrow="PROGRESSION" title="Progression" sub="Grades, promotions et suivi sportif du groupe." /><ClubLoading error={error} onRetry={reload} /></>
  const C = data.C, rows = data.rows, reqs = rows.filter(r => r.req), byId = (id: string) => rows.find(r => r.id === id)
  const run = async (key: string, fn: () => Promise<{ ok: boolean; msg?: string }>, ok: string) => {
    setBusy(key); const r = await fn(); setBusy("")
    onToast(r.ok ? ok : (r as Any).msg); if (r.ok) reload()
  }
  const curBelt = (id: string) => { const g = data.grades[id]; return g ? C.normBelt(g) : { rank: "blanche", stripes: 0, since: "" } }
  // Historique des promotions
  const promos: { r: StudentRow; h: Any }[] = []
  rows.forEach(r => r.hist.forEach((h: Any) => promos.push({ r, h })))
  promos.sort((a, b) => (String(a.h.at) < String(b.h.at) ? 1 : -1))
  const cnt: Record<string, number> = {}; rows.forEach(r => { cnt[r.belt.rank] = (cnt[r.belt.rank] || 0) + 1 })
  const mx = Math.max(0, ...Object.values(cnt)), act = rows.filter(r => r.days <= 14).length, tot = rows.reduce((a, r) => a + (r.n30 || 0), 0)
  const top = rows.slice().sort((a, b) => (b.n30 || 0) - (a.n30 || 0)).slice(0, 6), m2 = top.length ? top[0].n30 : 0
  const comps: { r: StudentRow; c: Any }[] = []; rows.forEach(r => r.comps.forEach((c: Any) => comps.push({ r, c }))); comps.sort((a, b) => (a.c.date < b.c.date ? 1 : -1))
  const who = (by: string) => (!by ? "" : by === uid ? "toi" : rows.find(r => r.id === by)?.name || "un prof du club")

  return <>
    <ClubHeading eyebrow="PROGRESSION" title="Progression" sub="Grades, promotions et suivi sportif du groupe." />
    <section className="panel uzu-panel-col">
      <div className="section-title"><h2>Demandes de grades</h2><span className={`uzu-pill ${reqs.length ? "now" : "done"}`}>{reqs.length}</span></div>
      {!reqs.length ? <p className="uzu-text uzu-muted">Aucune demande en attente.</p> : reqs.map(r => <div key={r.id} className="uzu-req">
        <div className="uzu-req-head"><b>{r.name}</b><small>{reqText(C, r.belt, r.req)}</small></div>
        <div className="uzu-req-chg"><BeltMark rank={r.belt.rank} stripes={r.belt.stripes} size={40} /><span>{C.beltShort(r.belt)}</span><span aria-hidden="true">→</span><BeltMark rank={r.req.rank} stripes={r.req.stripes} size={40} /><b>{C.beltShort(r.req)}</b></div>
        <button className="text-link uzu-small" aria-expanded={!!open[r.id]} onClick={() => setOpen(o => ({ ...o, [r.id]: !o[r.id] }))}>{open[r.id] ? "Masquer la fiche" : "Voir la fiche"}</button>
        {open[r.id] && <div className="uzu-fiche">
          <span><b>{r.hours} h</b> de tapis au total</span><span><b>{r.stars3}</b> {r.stars3 > 1 ? "techniques maîtrisées" : "technique maîtrisée"} (3 étoiles)</span>
          <span>Médailles : <b>{r.medals.or} or · {r.medals.argent} argent · {r.medals.bronze} bronze</b></span><span><b>{pl(r.n30, "séance")}</b> sur 30 jours</span>
          <span>Maîtrise des systèmes : <b>{r.mast} %</b></span>{r.belt.since && <span>À ce grade depuis <b>{C.duration(r.belt.since)}</b></span>}
          <label className="uzu-label" htmlFor={`cm-${r.id}`}>Commentaire / axe de travail du prof (facultatif)</label>
          <textarea id={`cm-${r.id}`} className="uzu-input" maxLength={300} placeholder="Ex. : travaille la sortie de monte avant la prochaine barrette" value={comment[r.id] || ""} onChange={e => setComment(c => ({ ...c, [r.id]: e.target.value }))} />
        </div>}
        {approve ? <div className="uzu-actions uzu-actions--start">
          <button className="button button--dark uzu-small-btn" disabled={!!busy} onClick={() => run("a" + r.id, () => decideGrade(r.id, r.req.rank, r.req.stripes, r.req.since || C.ymd(C.TODAY), "validé", (comment[r.id] || "").trim().slice(0, 300)), "Grade validé")}>Valider</button>
          <button className="button button--outline uzu-small-btn" disabled={!!busy} onClick={() => { const b = curBelt(r.id); run("r" + r.id, () => decideGrade(r.id, b.rank, b.stripes, b.since || "", "refusé", (comment[r.id] || "").trim().slice(0, 300)), "Demande refusée") }}>Refuser</button></div>
          : propose ? <div className="uzu-actions uzu-actions--start"><button className="button button--outline uzu-small-btn" disabled={!!busy} onClick={() => run("p" + r.id, () => proposeGrade(r.id, r.req.rank, r.req.stripes, r.req.since || C.ymd(C.TODAY), comment[r.id] || ""), "Proposition envoyée au responsable")}>Proposer au responsable</button></div> : null}
      </div>)}
    </section>

    {approve && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Propositions de l'équipe</h2><span className="uzu-pill">{props.length}</span></div>
      {!props.length ? <p className="uzu-text uzu-muted">Aucune proposition en attente.</p> : props.map(p => { const r = byId(p.student_id); return <div key={p.id} className="uzu-req">
        <div className="uzu-req-head"><b>{r?.name || "Élève"}</b><small>Proposé par {who(p.proposed_by) || "un prof"} le {C.frDate(String(p.created_at).slice(0, 10))}{p.comment ? ` · « ${p.comment} »` : ""}</small></div>
        <div className="uzu-req-chg">{r && <><BeltMark rank={r.belt.rank} stripes={r.belt.stripes} size={40} /><span>{C.beltShort(r.belt)}</span><span aria-hidden="true">→</span></>}<BeltMark rank={p.rank} stripes={p.stripes} size={40} /><b>{C.beltShort(p)}</b></div>
        <div className="uzu-actions uzu-actions--start">
          <button className="button button--dark uzu-small-btn" disabled={!!busy} onClick={() => run("pa" + p.id, () => decideGrade(p.student_id, p.rank, p.stripes, p.since || C.ymd(C.TODAY), "validé", p.comment || ""), "Grade validé")}>Valider</button>
          <button className="button button--outline uzu-small-btn" disabled={!!busy} onClick={() => { const b = curBelt(p.student_id); run("pr" + p.id, () => decideGrade(p.student_id, b.rank, b.stripes, b.since || "", "refusé", ""), "Demande refusée") }}>Refuser</button></div>
      </div> })}
    </section>}

    <div className="content-grid uzu-grid-gap">
      {(approve || propose) && <GrantForm C={C} rows={rows} approve={approve} onToast={onToast} onDone={reload} />}
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Historique des promotions</h2><TrendingUp size={17} /></div>
        {promos.length ? <ul className="uzu-top">{promos.slice(0, 12).map((o, i) => { const c = who(o.h.by || (o.h.at && o.h.at === o.r.grade?.decidedAt ? o.r.grade?.by : ""))
          return <li key={i}><span><b>{o.r.name}</b><small>{C.frDate(String(o.h.at).slice(0, 10))}{c ? ` · validé par ${c}` : ""}</small></span><span className="uzu-right"><span className="uzu-inline-belt"><BeltMark rank={o.h.rank} stripes={o.h.stripes} size={30} />{C.beltShort(o.h)}</span>{o.h.status === "refusé" && <small>Refusé</small>}</span></li> })}</ul>
          : <p className="uzu-text uzu-muted">Aucune promotion enregistrée pour l'instant.</p>}
      </section>
    </div>

    <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Répartition par ceinture</h2></div>
        {rows.length ? <ul className="uzu-hbars">{(C.BELTS as Any[]).filter(b => cnt[b.k]).map(b => <li key={b.k}><span className="uzu-inline-belt"><BeltMark rank={b.k} stripes={0} size={30} />{b.n.charAt(0).toUpperCase() + b.n.slice(1)}</span><span className="uzu-hbar"><i style={{ width: `${mx ? cnt[b.k] / mx * 100 : 0}%` }} /></span><b>{cnt[b.k]}</b></li>)}</ul>
          : <p className="uzu-text uzu-muted">Aucun élève pour l'instant.</p>}
      </section>
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Assiduité sur 30 jours</h2></div>
        {rows.length > 0 && <p className="uzu-text uzu-small">{act} actif{act > 1 ? "s" : ""} sur {rows.length} ({Math.round(act / rows.length * 100)} %) · {String(Math.round(tot / rows.length * 10) / 10).replace(".", ",")} séance(s) par élève en moyenne</p>}
        {top.length && m2 ? <ul className="uzu-hbars">{top.map(r => <li key={r.id}><span>{r.name}</span><span className="uzu-hbar"><i style={{ width: `${(r.n30 || 0) / m2 * 100}%` }} /></span><b>{r.n30}</b></li>)}</ul>
          : <p className="uzu-text uzu-muted">Aucune séance sur 30 jours.</p>}
      </section>
    </div>

    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Compétitions récentes du groupe</h2></div>
      {comps.length ? <ul className="uzu-top">{comps.slice(0, 8).map((o, i) => <li key={i}><span><b>{o.r.name}</b><small>{o.c.event || "Compétition"} · {C.frShort(o.c.date)}</small></span><b className={`uzu-res ${o.c.result}`}>{RESULT[o.c.result] || o.c.result}</b></li>)}</ul>
        : <p className="uzu-text uzu-muted">Aucune compétition saisie par le groupe.</p>}
      {can(ctx, "students", "view") && <button className="text-link uzu-small" onClick={() => onNavigate("students")}>Voir la liste des élèves</button>}
    </section>
  </>
}

export function GrantForm({ C, rows, approve, onToast, onDone, fixed }: { C: Any; rows: StudentRow[]; approve: boolean; onToast: (m: string) => void; onDone: () => void; fixed?: string }) {
  const [who, setWho] = useState(fixed || rows[0]?.id || "")
  const r = rows.find(x => x.id === who)
  const init = r ? (r.req ? { rank: r.req.rank, stripes: r.req.stripes, since: r.req.since || C.ymd(C.TODAY) } : r.belt) : { rank: "blanche", stripes: 0, since: "" }
  const [rank, setRank] = useState(init.rank)
  const [stripes, setStripes] = useState(init.stripes)
  const [since, setSince] = useState(init.since || C.ymd(C.TODAY))
  const [busy, setBusy] = useState(false)
  useEffect(() => { setRank(init.rank); setStripes(init.stripes); setSince(init.since || C.ymd(C.TODAY)) }, [who]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <section className="panel uzu-panel-col"><div className="section-title"><h2>Attribuer un grade</h2></div><p className="uzu-text uzu-muted">Aucun élève pour l'instant.</p></section>
  const submit = async () => {
    if (!who) return
    setBusy(true)
    const res = approve ? await decideGrade(who, rank, stripes, since || C.ymd(C.TODAY), "validé", "") : await proposeGrade(who, rank, stripes, since || C.ymd(C.TODAY), "")
    setBusy(false)
    onToast(res.ok ? (approve ? "Grade validé" : "Proposition envoyée : un responsable habilité la validera") : res.msg)
    if (res.ok) onDone()
  }
  return <section className="panel uzu-panel-col">
    <div className="section-title"><h2>Attribuer une barrette ou une ceinture</h2><Award size={17} /></div>
    {!fixed && <><label className="uzu-label" htmlFor="g-who">Élève</label>
      <select id="g-who" className="uzu-input" value={who} onChange={e => setWho(e.target.value)}>{rows.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></>}
    <label className="uzu-label" htmlFor="g-rank">Ceinture</label>
    <select id="g-rank" className="uzu-input" value={rank} onChange={e => setRank(e.target.value)}>{(C.BELTS as Any[]).map(b => <option key={b.k} value={b.k}>{b.n.charAt(0).toUpperCase() + b.n.slice(1)}</option>)}</select>
    <span className="uzu-label">Barrettes</span>
    <div className="uzu-seg" role="group" aria-label="Barrettes">{[0, 1, 2, 3, 4].map(n => <button key={n} type="button" className={stripes === n ? "on" : ""} aria-pressed={stripes === n} onClick={() => setStripes(n)}>{n}</button>)}</div>
    <label className="uzu-label" htmlFor="g-since">Date de passage</label>
    <input id="g-since" type="date" className="uzu-input" value={since} onChange={e => setSince(e.target.value)} />
    <button className="button button--dark uzu-wide" disabled={busy} onClick={submit}>{busy ? "Envoi…" : approve ? "Valider le grade" : "Proposer ce grade au responsable"}</button>
    <p className="uzu-text uzu-small uzu-muted">Un grade n'est jamais attribué automatiquement : seul un prof habilité le valide.</p>
    {!approve && <p className="uzu-note wait">Tu peux proposer un grade : un responsable habilité le validera.</p>}
  </section>
}

