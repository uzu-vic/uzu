"use client"
// Journal des cours (lot J2) — mémoire pédagogique du club, par groupe.
// Équipe : Club › Cours › « Journal des cours » (chronologie, filtres, saisie en 1 à 2 minutes).
// Adhérent : Séances › « Cours du groupe » (toutes les séances publiées de ses groupes, présent ou absent).
// Le Journal décrit ce qui a été enseigné au groupe ; il ne modifie jamais la progression individuelle.
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Plus, Search, Video, X } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { can, scopeOf } from "@/lib/uzu/permissions"
import { normSched } from "@/lib/uzu/training"
import {
  journalOverview, setStudentGroups, studentGroups, type Overview, type StudentGroups,
  byMonth, dayBadge, journalFeed, journalGroups, libDiscOfCourse, longDate, monthLabel, myRollKeys, saveSession, setSessionStatus, shortDate, STATUS_LBL,
  type JGroup, type JInput, type JSession,
} from "@/lib/uzu/class-journal"
import { matches, splitName, type Library } from "@/lib/uzu/library"
import { useLibrary } from "@/components/uzu/library"
import { ClubCourses } from "@/components/uzu/club-admin"
import { ClubHeading } from "@/components/uzu/club"

type Toast = (m: string) => void
const openFiche = (id: string) => window.dispatchEvent(new CustomEvent("uzu-nav", { detail: { page: "path", arg: "fiche:" + id } }))
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` }

/** Le Journal est-il disponible (script uzu-10 appliqué) ? */
export function useJournalGroups(ctx: UzuContext | null, tick = 0): { status: "loading" | "ok" | "absent" | "error"; groups: JGroup[]; msg?: string } {
  const [st, setSt] = useState<{ status: "loading" | "ok" | "absent" | "error"; groups: JGroup[]; msg?: string }>({ status: "loading", groups: [] })
  const key = ctx?.club?.id || ""
  useEffect(() => {
    if (!key || ctx?.role === "solo") { setSt({ status: "absent", groups: [] }); return }
    let live = true
    journalGroups().then(r => { if (!live) return; setSt(r.ok ? { status: "ok", groups: Array.isArray(r.data) ? r.data : [] } : r.absent ? { status: "absent", groups: [] } : { status: "error", groups: [], msg: r.msg }) })
    return () => { live = false }
  }, [key, ctx?.role, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return st
}

function DateBadge({ iso, hot }: { iso: string; hot?: boolean }) {
  const b = dayBadge(iso)
  return <span className={`uzu-jr-date${hot ? " hot" : ""}`} aria-hidden="true"><b>{b.n}</b><small>{b.wd}</small></span>
}
const techLabel = (t: { id: string | null; name: string | null; text: string | null }) => t.id ? splitName(t.name || t.id).main : t.text || ""

function SessionCard({ s, staff, presence, hot, onOpen }: { s: JSession; staff: boolean; presence?: "present" | "absent" | null; hot?: boolean; onOpen: () => void }) {
  const shown = s.techniques.slice(0, 3), more = s.techniques.length - shown.length
  return <li><button type="button" className="uzu-jr-card" onClick={onOpen} aria-label={`${longDate(s.session_date)} : ${s.theme}`}>
    <DateBadge iso={s.session_date} hot={hot} />
    <span className="uzu-jr-body">
      <b>{s.theme}</b>
      {staff && <small>{[s.group_name, s.author_name].filter(Boolean).join(" · ")}</small>}
      {(shown.length > 0 || staff) && <span className="uzu-lib-badges">
        {shown.map((t, i) => <span key={i} className="uzu-lib-badge uzu-lib-badge--plain">{t.id ? t.id + " " : ""}{techLabel(t)}</span>)}
        {more > 0 && <span className="uzu-lib-badge uzu-lib-badge--plain">+ {more}</span>}
        {staff && <span className={`uzu-lib-badge uzu-jr-st--${s.status}`}>{STATUS_LBL[s.status]}</span>}
      </span>}
      {!staff && (s.media > 0 || presence) && <small className="uzu-jr-meta">{s.media > 0 && <><Video size={13} aria-hidden="true" />Vidéo</>}{s.media > 0 && presence ? " · " : ""}{presence === "present" ? "Tu étais présent" : presence === "absent" ? "Tu étais absent" : ""}</small>}
    </span>
  </button></li>
}

function Timeline({ list, staff, presence, onOpen }: { list: JSession[]; staff: boolean; presence?: (s: JSession) => "present" | "absent" | null; onOpen: (s: JSession) => void }) {
  return <>{byMonth(list).map(([k, items], mi) => <section key={k} className="uzu-jr-month" aria-label={monthLabel(items[0].session_date)}>
    <h2 className="uzu-jr-mh">{monthLabel(items[0].session_date)} <small>{items.length} séance{items.length > 1 ? "s" : ""}</small></h2>
    <ol className="uzu-jr-line">{items.map((s, i) => <SessionCard key={s.id} s={s} staff={staff} hot={!staff && mi === 0 && i === 0} presence={presence ? presence(s) : null} onOpen={() => onOpen(s)} />)}</ol>
  </section>)}</>
}

// ---------------------------------------------------------------- Détail d'une séance
export function ClassSessionDetail({ s, all, onBack, onOpen, staff, onEdit, onStatus, presence, onNote }: {
  s: JSession; all: JSession[]; onBack: () => void; onOpen: (s: JSession) => void; staff?: boolean
  onEdit?: () => void; onStatus?: (st: "publie" | "depublie") => void; presence?: "present" | "absent" | null; onNote?: () => void
}) {
  useEffect(() => { window.scrollTo(0, 0) }, [s.id])
  const same = all.filter(x => x.section_id === s.section_id && (staff || x.status === "publie")).sort((a, b) => a.session_date < b.session_date ? -1 : a.session_date > b.session_date ? 1 : 0)
  const i = same.findIndex(x => x.id === s.id)
  const prev = (s.previous_session_id && all.find(x => x.id === s.previous_session_id)) || (i > 0 ? same[i - 1] : null)
  const next = i >= 0 && i < same.length - 1 ? same[i + 1] : null
  const b = dayBadge(s.session_date)
  return <article className="uzu-lib-fiche uzu-jr-detail" aria-labelledby="jr-title">
    <button type="button" className="uzu-lib-back" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />{staff ? "Journal des cours" : "Cours du groupe"}</button>
    <div className="uzu-jr-head"><span className="uzu-jr-date big" aria-hidden="true"><b>{b.n}</b><small>{shortDate(s.session_date).replace(/^\d+\s*/, "").toUpperCase()}</small></span>
      <span><small className="uzu-muted">{longDate(s.session_date).replace(/^./, c => c.toUpperCase())}</small><b>{s.group_name}</b><small className="uzu-muted">Cours de {s.author_name}</small></span></div>
    <h2 id="jr-title" className="uzu-lib-title">{s.theme}</h2>
    {staff && <div className="uzu-lib-badges"><span className={`uzu-lib-badge uzu-jr-st--${s.status}`}>{STATUS_LBL[s.status]}</span>{s.focus?.theme ? <span className="uzu-lib-badge uzu-lib-badge--plain">Focus : {s.focus.theme}</span> : null}</div>}
    {s.objective && <div className="panel uzu-lib-text"><span className="uzu-lib-label">Objectif</span><p>{s.objective}</p></div>}
    {s.techniques.length > 0 && <section className="uzu-lib-sec" aria-labelledby="jr-techs"><h3 id="jr-techs">Techniques abordées</h3>
      {s.techniques.map((t, k) => t.id ? <button key={k} type="button" className="panel uzu-lib-row" onClick={() => openFiche(t.id as string)}>
        <span><b>{t.id} · {techLabel(t)}</b><small>Ouvrir la fiche dans la Bibliothèque</small></span><ChevronRight size={16} aria-hidden="true" /></button>
        : <div key={k} className="uzu-lib-empty uzu-jr-free"><b>{t.text}</b><small>Pas encore dans la Bibliothèque</small></div>)}
    </section>}
    {s.exercises && <section className="uzu-lib-sec" aria-labelledby="jr-exo"><h3 id="jr-exo">Exercices et situations</h3><div className="panel uzu-lib-text"><p>{s.exercises}</p></div></section>}
    {s.comment && <section className="uzu-lib-sec" aria-labelledby="jr-com"><h3 id="jr-com">Le mot du professeur</h3><div className="panel uzu-lib-text"><p>{s.comment}</p></div></section>}
    {(prev || next) && <nav className="uzu-jr-prevnext" aria-label="Séances voisines">
      {prev ? <button type="button" onClick={() => onOpen(prev)}><small>‹ Séance précédente</small><span>{shortDate(prev.session_date)} · {prev.theme}</span></button> : <span />}
      {next ? <button type="button" className="r" onClick={() => onOpen(next)}><small>Séance suivante ›</small><span>{shortDate(next.session_date)} · {next.theme}</span></button> : <span />}
    </nav>}
    {staff && (s.can_edit || s.can_publish) && <div className="uzu-lib-actions">
      {s.can_edit && <button type="button" className="button button--outline" onClick={onEdit}>Modifier</button>}
      {s.can_publish && s.status !== "publie" && <button type="button" className="button button--dark" onClick={() => onStatus && onStatus("publie")}>Publier pour le groupe</button>}
      {s.can_publish && s.status === "publie" && <button type="button" className="button button--outline" onClick={() => onStatus && onStatus("depublie")}>Dépublier</button>}
    </div>}
    {!staff && <div className="uzu-jr-mine">
      <p>Ce que le groupe a travaillé. Tes étoiles ne changent pas : c'est toi qui notes ce que tu as travaillé.</p>
      {presence === "present" ? <p className="uzu-small">Tu étais pointé présent : la séance est déjà dans « Mon journal », à compléter si tu veux.</p>
        : onNote && <button type="button" className="button button--dark" onClick={onNote}>Noter dans mon journal</button>}
    </div>}
  </article>
}

// ---------------------------------------------------------------- Saisie d'une séance
export type EditorInit = { course?: string; date?: string }
function SessionEditor({ ctx, lib, groups, sessions, edit, init, onDone, onCancel }: {
  ctx: UzuContext | null; lib: Library | null; groups: JGroup[]; sessions: JSession[]; edit?: JSession | null; init?: EditorInit
  onDone: (msg: string) => void; onCancel: () => void
}) {
  const slots = useMemo(() => normSched(ctx?.club?.schedule), [ctx])
  const writable = groups.filter(g => g.can_create || (edit && g.id === edit.section_id))
  const groupOfCourse = (c: string) => groups.find(g => g.courses.includes(c))?.id || ""
  const [course, setCourse] = useState(edit?.course_key || init?.course || "")
  const [date, setDate] = useState(edit?.session_date || init?.date || today())
  const [group, setGroup] = useState(edit?.section_id || (init?.course ? groupOfCourse(init.course) : "") || (writable.length === 1 ? writable[0].id : ""))
  const g = groups.find(x => x.id === group)
  const slot = slots.find(x => x.id === course)
  const discFor = (sl?: { disc?: string }, gg?: JGroup) => libDiscOfCourse(sl?.disc) || (gg && lib?.disciplines.some(d => d.id === gg.discipline) ? gg.discipline : null) || lib?.disciplines[0]?.id || null
  const [disc, setDisc] = useState<string | null>(edit?.discipline_id || discFor(slot, g))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const clubFocus = String(((ctx?.club?.tactical_focus || {}) as any).weekTheme || "")
  const [theme, setTheme] = useState(edit?.theme || g?.focus?.theme || clubFocus)
  const [themeTouched, setThemeTouched] = useState(!!edit)
  const [techs, setTechs] = useState<({ t: string } | { text: string })[]>(edit ? edit.techniques.map(x => x.id ? { t: x.id } : { text: x.text || "" }) : [])
  const [q, setQ] = useState("")
  const [free, setFree] = useState<string | null>(null)
  const [exercises, setExercises] = useState(edit?.exercises || "")
  const [objective, setObjective] = useState(edit?.objective || "")
  const [comment, setComment] = useState(edit?.comment || "")
  const before = sessions.filter(x => x.section_id === group && x.id !== edit?.id && x.session_date <= date).sort((a, b) => a.session_date < b.session_date ? 1 : -1)
  const [prev, setPrev] = useState<string>(edit ? edit.previous_session_id || "" : "auto")
  const prevId = prev === "auto" ? before[0]?.id || "" : prev
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const pickCourse = (c: string) => {
    setCourse(c)
    const sl = slots.find(x => x.id === c), gid = c ? groupOfCourse(c) : ""
    const gg = groups.find(x => x.id === (gid || group))
    if (gid) { setGroup(gid); if (!themeTouched) setTheme(gg?.focus?.theme || clubFocus) }
    setDisc(discFor(sl, gg))
  }
  const pickGroup = (id: string) => {
    setGroup(id); const gg = groups.find(x => x.id === id)
    if (!themeTouched) setTheme(gg?.focus?.theme || clubFocus)
    if (!course) setDisc(discFor(undefined, gg))
  }
  const chosen = new Set(techs.flatMap(x => "t" in x ? [x.t] : []))
  const results = lib && q.trim() ? lib.techniques.filter(t => !chosen.has(t.id) && (!disc || t.discipline_id === disc) && matches(t, q)).slice(0, 6) : []
  const canPublish = can(ctx, "class_journal", "approve")
  const send = async (publish: boolean) => {
    setErr("")
    if (!group) { setErr("Choisis le groupe de la séance."); return }
    if (!theme.trim()) { setErr("Indique le thème principal."); return }
    const p: JInput = { section_id: group, course_key: course || null, session_date: date, discipline_id: disc, theme: theme.trim(), objective: objective.trim(), exercises: exercises.trim(), comment: comment.trim(), previous_session_id: prevId || null, techniques: techs }
    setBusy(true); const r = await saveSession(edit?.id || null, p, publish); setBusy(false)
    if (!r.ok) { setErr(r.msg); return }
    onDone(r.data.status === "publie" ? "Séance publiée pour le groupe" : "Brouillon enregistré")
  }
  return <form className="uzu-lib-fiche uzu-lib-form" aria-labelledby="jr-ed" onSubmit={e => { e.preventDefault(); send(true) }}>
    <button type="button" className="uzu-lib-back" onClick={onCancel}><ChevronLeft size={16} aria-hidden="true" />Journal des cours</button>
    <div className="eyebrow">{edit ? "MODIFIER LA SÉANCE" : "NOUVELLE SÉANCE"}</div>
    <h2 id="jr-ed" className="uzu-lib-title">Ce qui a été enseigné</h2>
    <div className="uzu-jr-grid">
      <label className="uzu-field"><span className="uzu-label">Cours du planning</span>
        <select className="uzu-input" value={course} onChange={e => pickCourse(e.target.value)}><option value="">Hors planning</option>
          {slots.map(x => <option key={x.id} value={x.id}>{x.t} · {["", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."][x.d]} {x.s}</option>)}</select></label>
      <label className="uzu-field"><span className="uzu-label">Date</span><input className="uzu-input" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    </div>
    <div className="uzu-jr-grid">
      <label className="uzu-field"><span className="uzu-label">Groupe</span>
        <select className="uzu-input" value={group} onChange={e => pickGroup(e.target.value)}><option value="">Choisir</option>{writable.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
      {lib && lib.disciplines.length > 0 && <label className="uzu-field"><span className="uzu-label">Discipline</span>
        <select className="uzu-input" value={disc || ""} onChange={e => setDisc(e.target.value || null)}>{lib.disciplines.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>}
    </div>
    {!writable.length && <p className="uzu-lib-empty">Aucun groupe ne t'est ouvert pour ajouter une séance. Le responsable crée les groupes (sections) et attribue les droits du Journal dans Équipe.</p>}
    <label className="uzu-field"><span className="uzu-label">Thème principal</span><input className="uzu-input" maxLength={120} value={theme} onChange={e => { setTheme(e.target.value); setThemeTouched(true) }} placeholder="Ex. Passages de garde" /></label>
    {!themeTouched && theme && <small className="uzu-muted uzu-jr-hint">Thème proposé à partir du Focus{g?.focus ? " du groupe" : " du club"}.</small>}
    <fieldset className="uzu-jr-techs"><legend className="uzu-label">Techniques travaillées</legend>
      {techs.length > 0 && <div className="uzu-lib-chips">{techs.map((x, i) => { const t = "t" in x && lib ? lib.byId[x.t] : null
        return <button key={i} type="button" className="on" aria-label={"Retirer " + ("t" in x ? x.t : x.text)} onClick={() => setTechs(l => l.filter((_, j) => j !== i))}>{"t" in x ? `${x.t} ${t ? splitName(t.name).main : ""}` : x.text}<X size={13} aria-hidden="true" /></button> })}</div>}
      {lib ? <label className="uzu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Chercher dans la Bibliothèque</span>
        <input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher dans la Bibliothèque (ex. knee cut)" /></label>
        : <p className="uzu-text uzu-small uzu-muted">Bibliothèque indisponible : ajoute les techniques en texte libre.</p>}
      {results.length > 0 && <ul className="uzu-lib-picks">{results.map(t => <li key={t.id}><button type="button" className="uzu-jr-pick" onClick={() => { setTechs(l => l.concat([{ t: t.id }])); setQ("") }}><span><b>{t.id}</b> {splitName(t.name).main}</span><span className="uzu-jr-add">Ajouter</span></button></li>)}</ul>}
      {q.trim() && lib && !results.length && <p className="uzu-text uzu-small uzu-muted">Aucune fiche trouvée.</p>}
      {free === null ? <button type="button" className="text-link uzu-lib-self" onClick={() => setFree(q.trim())}>+ Ajouter en texte libre (hors Bibliothèque)</button>
        : <div className="uzu-jr-grid"><label className="uzu-field"><span className="uzu-label">Technique en texte libre</span><input className="uzu-input" maxLength={120} value={free} onChange={e => setFree(e.target.value)} autoFocus /></label>
          <div className="uzu-lib-actions uzu-lib-actions--left"><button type="button" className="button button--outline" onClick={() => { if (free.trim()) setTechs(l => l.concat([{ text: free.trim() }])); setFree(null); setQ("") }}>Ajouter</button><button type="button" className="text-link" onClick={() => setFree(null)}>Annuler</button></div></div>}
    </fieldset>
    <label className="uzu-field"><span className="uzu-label">Exercices et situations</span><textarea className="uzu-input" rows={3} maxLength={2000} value={exercises} onChange={e => setExercises(e.target.value)} placeholder="Ex. Situations de passage 3 × 3 min" /></label>
    <label className="uzu-field"><span className="uzu-label">Objectif du cours</span><input className="uzu-input" maxLength={500} value={objective} onChange={e => setObjective(e.target.value)} placeholder="Ex. Enchaîner Torreando et Knee Cut" /></label>
    <details className="panel uzu-jr-more" open={!!comment}><summary>Plus de détails (facultatif)</summary>
      <label className="uzu-field"><span className="uzu-label">Commentaire du professeur</span><textarea className="uzu-input" rows={3} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)} /></label>
      <p className="uzu-text uzu-small uzu-muted">Vidéo ou photo de séance : prochaine étape (stockage privé du club, avec la déclaration d'accord).</p>
    </details>
    <label className="uzu-field"><span className="uzu-label">Suite de la séance</span>
      <select className="uzu-input" value={prev} onChange={e => setPrev(e.target.value)}>
        {!edit && <option value="auto">{before[0] ? `Automatique : ${shortDate(before[0].session_date)} · ${before[0].theme}` : "Automatique : aucune séance avant"}</option>}
        <option value="">Aucune</option>
        {before.slice(0, 20).map(x => <option key={x.id} value={x.id}>{shortDate(x.session_date)} · {x.theme}</option>)}
      </select></label>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <div className="uzu-lib-actions">
      <button type="button" className="button button--outline" disabled={busy} onClick={() => send(false)}>Enregistrer le brouillon</button>
      {canPublish && <button type="submit" className="button button--dark" disabled={busy}>{busy ? "Envoi…" : "Publier pour le groupe"}</button>}
    </div>
    <p className="uzu-text uzu-small uzu-muted">{canPublish ? "Publiée, la séance est visible de tous les adhérents du groupe, présents ou absents. Elle peut être dépubliée, jamais effacée sans trace." : "Tu n'as pas le droit de publier : enregistre le brouillon, un professeur autorisé le publiera."}</p>
  </form>
}

// ---------------------------------------------------------------- Journal des cours (équipe)
export function StaffJournal({ ctx, onToast, init }: { ctx: UzuContext | null; onToast: Toast; init?: EditorInit | null }) {
  const [tick, setTick] = useState(0)
  const G = useJournalGroups(ctx, tick)
  const libState = useLibrary(ctx)
  const lib = libState.status === "ok" ? libState.lib : null
  const [section, setSection] = useState("")
  const [disc, setDisc] = useState("")
  const [q, setQ] = useState(""), [qq, setQq] = useState("")
  const [list, setList] = useState<JSession[] | null>(null)
  const [all, setAll] = useState<JSession[]>([])
  const [err, setErr] = useState("")
  const [view, setView] = useState<JSession | null>(null)
  const [edit, setEdit] = useState<JSession | "new" | null>(init ? "new" : null)
  const [months, setMonths] = useState(6)
  useEffect(() => { const t = window.setTimeout(() => setQq(q), 300); return () => window.clearTimeout(t) }, [q])
  useEffect(() => {
    let live = true
    const from = new Date(); from.setMonth(from.getMonth() - months)
    journalFeed({ section: section || null, discipline: disc || null, q: qq, from: qq ? null : from.toISOString().slice(0, 10), limit: 300 }).then(r => {
      if (!live) return
      if (r.ok) { setList(r.data); if (!section && !disc && !qq) setAll(r.data) } else setErr(r.msg)
    })
    return () => { live = false }
  }, [section, disc, qq, months, tick])
  useEffect(() => { if (!section && !disc && !qq) return; journalFeed({ limit: 300 }).then(r => { if (r.ok) setAll(r.data) }) }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = G.groups
  const canCreate = groups.some(g => g.can_create)
  const refresh = () => { setTick(x => x + 1) }
  // La saisie se pré-remplit à partir des groupes et de la Bibliothèque : on attend qu'ils soient chargés
  if (edit && (G.status === "loading" || libState.status === "loading")) return <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p>
  if (edit) return <SessionEditor ctx={ctx} lib={lib} groups={groups} sessions={all} edit={edit === "new" ? null : edit} init={edit === "new" ? init || undefined : undefined}
    onCancel={() => setEdit(null)} onDone={m => { onToast(m); setEdit(null); setView(null); refresh() }} />
  if (view) {
    const cur = (list || []).find(x => x.id === view.id) || view
    return <ClassSessionDetail s={cur} all={all.length ? all : list || []} staff onBack={() => setView(null)} onOpen={s => setView(s)} onEdit={() => setEdit(cur)}
      onStatus={async st => { const r = await setSessionStatus(cur.id, st); onToast(r.ok ? (st === "publie" ? "Séance publiée pour le groupe" : "Séance dépubliée : les adhérents ne la voient plus") : r.msg); if (r.ok) { setView({ ...cur, status: st }); refresh() } }} />
  }
  const drafts = (list || []).filter(s => s.status === "brouillon" && (s.mine || s.can_edit))
  const shown = (list || []).filter(s => s.status !== "brouillon")
  return <div className="uzu-lib uzu-jr">
    {canCreate && <button type="button" className="button button--dark uzu-jr-new" onClick={() => setEdit("new")}><Plus size={17} aria-hidden="true" />Nouvelle séance</button>}
    {!groups.length && <p className="uzu-lib-empty">Aucun groupe dans le club pour l'instant. Les groupes du Journal sont les sections de l'académie : le responsable les crée dans Équipe.</p>}
    <div className="uzu-jr-grid">
      <label className="uzu-field"><span className="uzu-label">Groupe</span><select className="uzu-input" value={section} onChange={e => setSection(e.target.value)}><option value="">Tous les groupes</option>{groups.filter(g => g.can_view || g.can_create).map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
      {lib && <label className="uzu-field"><span className="uzu-label">Discipline</span><select className="uzu-input" value={disc} onChange={e => setDisc(e.target.value)}><option value="">Toutes</option>{lib.disciplines.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>}
    </div>
    <label className="uzu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Rechercher un thème ou une technique</span>
      <input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Thème ou technique (ex. knee cut)" /></label>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    {drafts.length > 0 && <section className="uzu-jr-todo" aria-labelledby="jr-todo"><h2 id="jr-todo">À finir · {drafts.length} brouillon{drafts.length > 1 ? "s" : ""}</h2>
      {drafts.map(s => <button key={s.id} type="button" onClick={() => setEdit(s)}><span>{shortDate(s.session_date)} · {s.group_name} · {s.theme}</span><span>Reprendre ›</span></button>)}</section>}
    {list === null ? <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p>
      : !shown.length ? <p className="uzu-lib-empty">{qq || section || disc ? "Aucune séance ne correspond." : "Aucune séance publiée pour l'instant. Après un cours, « Nouvelle séance » ou le bouton de l'appel suffisent."}</p>
      : <Timeline list={shown} staff onOpen={s => setView(s)} />}
    {!qq && list && list.length >= 1 && <button type="button" className="button button--outline" onClick={() => setMonths(m => m + 12)}>Mois précédents</button>}
  </div>
}

// ---------------------------------------------------------------- Cours du groupe (adhérent)
export function GroupJournal({ uid, groups }: { uid: string; groups: JGroup[] }) {
  const mine = groups.filter(g => g.mine)
  const [group, setGroup] = useState("")
  const [q, setQ] = useState(""), [qq, setQq] = useState("")
  const [list, setList] = useState<JSession[] | null>(null)
  const [err, setErr] = useState("")
  const [view, setView] = useState<JSession | null>(null)
  const [roll, setRoll] = useState<{ present: Set<string>; absent: Set<string> }>({ present: new Set(), absent: new Set() })
  const cur = group || mine.find(g => g.primary)?.id || mine[0]?.id || ""
  useEffect(() => { const t = window.setTimeout(() => setQq(q), 300); return () => window.clearTimeout(t) }, [q])
  useEffect(() => { myRollKeys(uid).then(setRoll) }, [uid])
  useEffect(() => {
    if (!cur) return
    let live = true
    journalFeed({ section: cur, q: qq, limit: 300 }).then(r => { if (!live) return; if (r.ok) setList(r.data.filter(s => s.status === "publie")); else setErr(r.msg) })
    return () => { live = false }
  }, [cur, qq])
  const presence = (s: JSession): "present" | "absent" | null => { if (!s.course_key) return null; const k = s.session_date + "|" + s.course_key; return roll.present.has(k) ? "present" : roll.absent.has(k) ? "absent" : null }
  const note = (s: JSession) => window.dispatchEvent(new CustomEvent("uzu-compose", { detail: { date: s.session_date, type: s.discipline_id === "grappling_nogi" ? "No-gi" : "Gi", note: "Cours du groupe : " + s.theme } }))
  if (!mine.length) return <section className="panel uzu-panel-col"><p className="uzu-text">Tu n'es rattaché à aucun groupe pour l'instant.</p><p className="uzu-text uzu-small uzu-muted">Le responsable du club t'inscrit dans un groupe : tu retrouveras ici tous ses cours.</p></section>
  if (view) return <ClassSessionDetail s={view} all={list || []} onBack={() => setView(null)} onOpen={s => setView(s)} presence={presence(view)} onNote={() => note(view)} />
  const g = mine.find(x => x.id === cur)
  return <div className="uzu-lib uzu-jr">
    {mine.length > 1 && <div className="uzu-chips" role="group" aria-label="Mes groupes">{mine.map(x => <button key={x.id} type="button" className={x.id === cur ? "on" : ""} aria-pressed={x.id === cur} onClick={() => { setGroup(x.id); setList(null) }}>{x.name}</button>)}</div>}
    {g?.focus && <section className="uzu-jr-focus" aria-labelledby="jr-focus"><span>FOCUS DU GROUPE</span><h2 id="jr-focus">{g.focus.theme}</h2>{g.focus.details && <p>{g.focus.details}</p>}</section>}
    <label className="uzu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Retrouver un cours</span>
      <input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Retrouver un cours (thème, technique)" /></label>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    {list === null ? <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p>
      : !list.length ? <p className="uzu-lib-empty">{qq ? "Aucun cours ne correspond." : "Aucun cours publié pour ce groupe pour l'instant."}</p>
      : <Timeline list={list} staff={false} presence={presence} onOpen={s => setView(s)} />}
    <p className="uzu-text uzu-small uzu-muted">Ce que le professeur a enseigné au groupe. Ta progression, elle, se note dans « Mon journal ».</p>
  </div>
}

// ---------------------------------------------------------------- Page Club › Cours : onglets
export type CoursesTab = "week" | "journal" | "overview"
/** Vue d'ensemble : responsable, ou droit « consulter » du Journal de portée académie ou section (vérifié aussi par le serveur) */
export const overviewOpen = (ctx: UzuContext | null) => { const s = scopeOf(ctx, "class_journal", "view"); return s === "academy" || s === "section" }
export function CoursesTabs({ tab, onTab, overview }: { tab: CoursesTab; onTab: (t: CoursesTab) => void; overview?: boolean }) {
  return <div className="subnav"><div className="subnav-tabs" role="tablist" aria-label="Cours">
    {([["week", "Cours de la semaine"], ["journal", "Journal des cours"], ...(overview ? [["overview", "Vue d'ensemble"]] : [])] as [CoursesTab, string][]).map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "active" : ""} onClick={() => onTab(k)}>{l}</button>)}
  </div></div>
}
/** Le Journal est-il ouvert à ce membre de l'équipe ? (script appliqué et au moins un droit) */
export const journalOpen = (ctx: UzuContext | null, st: { status: string }) => st.status === "ok" && (can(ctx, "class_journal", "view") || can(ctx, "class_journal", "create"))
/** « journal:new:<cours>:<date> » (depuis l'appel) → saisie pré-remplie */
export function parseJournalArg(arg: string): EditorInit | null {
  const p = (arg || "").split(":")
  if (p[0] !== "journal" || p[1] !== "new") return null
  return { course: p[2] && p[2] !== "libre" ? p[2] : undefined, date: /^\d{4}-\d{2}-\d{2}$/.test(p[3] || "") ? p[3] : undefined }
}

// ---------------------------------------------------------------- Fiche élève : groupes
export function StudentGroupsPanel({ ctx, user, onToast }: { ctx: UzuContext | null; user: string; onToast: Toast }) {
  const G = useJournalGroups(ctx)
  const [sg, setSg] = useState<StudentGroups | null>(null)
  const [prim, setPrim] = useState(""), [sec, setSec] = useState<string[]>([])
  const [edit, setEdit] = useState(false), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (G.status !== "ok") return
    let live = true
    studentGroups(user).then(r => { if (!live || !r.ok) return; setSg(r.data); setPrim(r.data.primary || ""); setSec(r.data.secondary || []) })
    return () => { live = false }
  }, [G.status, user])
  if (G.status !== "ok" || !sg || !sg.student || !G.groups.length) return null
  const name = (id: string | null) => G.groups.find(g => g.id === id)?.name || ""
  const save = async () => {
    setBusy(true); const r = await setStudentGroups(user, prim || null, sec.filter(x => x !== prim)); setBusy(false)
    if (!r.ok) { onToast(r.msg); return }
    setSg({ ...sg, primary: prim || null, secondary: sec.filter(x => x !== prim) }); setEdit(false); onToast("Groupes de l'élève enregistrés")
  }
  return <div className="uzu-jr-groups" aria-label="Groupes de l'élève">
    <span className="uzu-sublabel">Groupes</span>
    {!edit ? <p className="uzu-text">{sg.primary ? <><b>{name(sg.primary)}</b> (principal)</> : "Aucun groupe principal"}{sg.secondary.length ? " · " + sg.secondary.map(name).filter(Boolean).join(", ") : ""}
      {sg.can_edit && <> <button type="button" className="text-link" onClick={() => setEdit(true)}>Modifier</button></>}</p>
      : <>
        <label className="uzu-field"><span className="uzu-label">Groupe principal</span><select className="uzu-input" value={prim} onChange={e => setPrim(e.target.value)}><option value="">Aucun</option>{G.groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <fieldset className="uzu-jr-techs"><legend className="uzu-label">Groupes secondaires</legend>
          <div className="uzu-lib-chips">{G.groups.filter(g => g.id !== prim).map(g => { const on = sec.includes(g.id); return <button key={g.id} type="button" className={on ? "on" : ""} aria-pressed={on} onClick={() => setSec(l => on ? l.filter(x => x !== g.id) : l.concat([g.id]))}>{g.name}</button> })}</div></fieldset>
        <div className="uzu-lib-actions uzu-lib-actions--left"><button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={save}>Enregistrer</button><button type="button" className="text-link" onClick={() => { setEdit(false); setPrim(sg.primary || ""); setSec(sg.secondary) }}>Annuler</button></div>
        <p className="uzu-text uzu-small uzu-muted">L'élève voit les cours publiés de tous ses groupes dans « Cours du groupe ».</p>
      </>}
  </div>
}

/** Club › Cours : « Cours de la semaine » (existant, inchangé) | « Journal des cours » */
export function ClubCoursesPage(props: { uid: string; ctx: UzuContext | null; onToast: Toast; onReloadCtx: () => void; onNavigate: (id: string, arg?: string) => void; navArg?: string }) {
  const { ctx, onToast, navArg } = props
  const G = useJournalGroups(ctx)
  const init = parseJournalArg(navArg || "")
  const [tab, setTab] = useState<CoursesTab>(init || (navArg || "").startsWith("journal") ? "journal" : "week")
  const [jinit, setJinit] = useState<{ k: number; init: EditorInit | null }>({ k: 0, init })
  const open = journalOpen(ctx, G), ov = open && overviewOpen(ctx)
  if (!open || tab === "week") return <ClubCourses {...props} tabs={open ? <CoursesTabs tab="week" onTab={setTab} overview={ov} /> : null} />
  const head = tab === "overview" ? <ClubHeading eyebrow={(ctx?.club?.name || "").toUpperCase()} title="Vue d'ensemble" sub="Ce qui a été enseigné, calculé uniquement à partir des séances saisies." />
    : <ClubHeading eyebrow={(ctx?.club?.name || "").toUpperCase()} title="Journal des cours" sub="La mémoire pédagogique du club : ce qui a été enseigné, groupe par groupe." />
  return <>
    {head}
    <CoursesTabs tab={tab} onTab={t => { setTab(t); if (t === "journal") setJinit(j => ({ k: j.k + 1, init: null })) }} overview={ov} />
    {tab === "overview" && ov ? <JournalOverview ctx={ctx} groups={G.groups} onNew={i => { setJinit(j => ({ k: j.k + 1, init: i })); setTab("journal") }} />
      : <StaffJournal key={jinit.k} ctx={ctx} onToast={onToast} init={jinit.init} />}
  </>
}

// ---------------------------------------------------------------- Vue d'ensemble (lot J3)
type Period = "30" | "90" | "season"
const periodFrom = (p: Period) => {
  const d = new Date()
  if (p === "season") { const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return `${y}-09-01` }
  d.setDate(d.getDate() - (p === "30" ? 30 : 90))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}
const pl2 = (n: number, w: string, ws?: string) => `${n} ${n > 1 ? ws || w + "s" : w}`

function Tile({ n, label, sub, tone }: { n: number | string; label: string; sub?: string; tone?: "alert" }) {
  return <div className={`uzu-jv-tile${tone ? " " + tone : ""}`}><b>{n}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>
}
/** Barre horizontale d'une seule série (longueur = valeur), valeur écrite à côté */
function HBar({ label, n, max, onClick, suffix }: { label: string; n: number; max: number; onClick?: () => void; suffix: string }) {
  const w = max > 0 ? Math.max(4, Math.round((n / max) * 100)) : 0
  const inner = <><span className="uzu-jv-bl">{label}</span><span className="uzu-jv-track" aria-hidden="true"><i style={{ width: w + "%" }} /></span><span className="uzu-jv-bn">{n} {suffix}</span></>
  return onClick ? <button type="button" className="uzu-jv-bar" onClick={onClick} title={`${label} : ${n} ${suffix}`}>{inner}</button> : <div className="uzu-jv-bar" title={`${label} : ${n} ${suffix}`}>{inner}</div>
}

export function JournalOverview({ ctx, groups, onNew }: { ctx: UzuContext | null; groups: JGroup[]; onNew: (i: EditorInit) => void }) {
  const [period, setPeriod] = useState<Period>("30")
  const [section, setSection] = useState("")
  const [o, setO] = useState<Overview | null>(null)
  const [err, setErr] = useState("")
  const academyWide = scopeOf(ctx, "class_journal", "view") === "academy"
  useEffect(() => {
    let live = true; setO(null); setErr("")
    journalOverview(periodFrom(period), null, section || null).then(r => { if (!live) return; if (r.ok) setO(r.data); else setErr(r.msg) })
    return () => { live = false }
  }, [period, section])
  const T = o?.totals
  const empty = !!T && T.published === 0 && T.drafts === 0 && T.calls === 0
  const maxTop = Math.max(0, ...(o?.top || []).map(x => x.n)), maxAuth = Math.max(0, ...(o?.authors || []).map(x => x.n))
  return <div className="uzu-jr uzu-jv">
    <div className="uzu-jv-filters">
      <div className="uzu-seg" role="group" aria-label="Période">{([["30", "30 jours"], ["90", "90 jours"], ["season", "Saison"]] as [Period, string][]).map(([k, l]) =>
        <button key={k} type="button" className={period === k ? "on" : ""} aria-pressed={period === k} onClick={() => setPeriod(k)}>{l}</button>)}</div>
      {academyWide && groups.length > 1 && <label className="uzu-field"><span className="sr-only">Groupe</span><select className="uzu-input" aria-label="Groupe" value={section} onChange={e => setSection(e.target.value)}><option value="">Tous les groupes</option>{groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}
    </div>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    {!o && !err && <p className="uzu-text uzu-muted" aria-busy="true">Calcul…</p>}
    {o && T && <>
      {o.scope === "section" && <p className="uzu-text uzu-small uzu-muted">Ta section seulement : {o.groups.map(g => g.name).join(", ") || "aucun groupe"}.</p>}
      <div className="uzu-jv-tiles">
        <Tile n={T.published} label={T.published > 1 ? "séances publiées" : "séance publiée"} sub={`du ${shortDate(o.from)} au ${shortDate(o.to)}`} />
        <Tile n={T.drafts} label={T.drafts > 1 ? "brouillons en attente" : "brouillon en attente"} />
        <Tile n={T.missing} label="cours sans séance saisie" sub={T.calls ? `sur ${pl2(T.calls, "appel")}` : "aucun appel sur la période"} tone={T.missing ? "alert" : undefined} />
        <Tile n={T.techniques} label={T.techniques > 1 ? "fiches abordées" : "fiche abordée"} sub={T.free_texts ? `+ ${pl2(T.free_texts, "technique")} en texte libre` : undefined} />
      </div>
      {empty && <p className="uzu-lib-empty">Aucune séance ni aucun appel sur cette période : les indicateurs se rempliront avec les séances saisies au Journal. Rien n'est estimé.</p>}

      {o.missing.length > 0 && <section className="panel uzu-panel-col" aria-labelledby="jv-miss"><div className="section-title"><h2 id="jv-miss">Cours sans séance saisie</h2><span className="uzu-muted uzu-small">appel fait, rien au Journal</span></div>
        <ul className="uzu-jv-list">{o.missing.map(m => <li key={m.date + m.course}><span><b>{shortDate(m.date)} · {m.title || m.course}</b><small>{m.group || "Cours sans groupe rattaché"}</small></span>
          <button type="button" className="text-link" onClick={() => onNew({ course: m.course, date: m.date })}>Saisir ›</button></li>)}</ul>
        {T.missing > o.missing.length && <p className="uzu-text uzu-small uzu-muted">Et {T.missing - o.missing.length} autres, plus anciens.</p>}</section>}

      {o.drafts.length > 0 && <section className="panel uzu-panel-col" aria-labelledby="jv-dr"><div className="section-title"><h2 id="jv-dr">Brouillons en attente</h2></div>
        <ul className="uzu-jv-list">{o.drafts.map(d => <li key={d.id}><span><b>{shortDate(d.date)} · {d.theme}</b><small>{d.group} · {d.author}</small></span></li>)}</ul></section>}

      <section className="panel uzu-panel-col" aria-labelledby="jv-gr"><div className="section-title"><h2 id="jv-gr">Groupes</h2></div>
        {!o.groups.length ? <p className="uzu-text uzu-muted">Aucun groupe dans l'académie.</p> : <ul className="uzu-jv-groups">{o.groups.map(g => {
          const late = g.days !== null && g.days > 14, cv = g.coverage
          return <li key={g.id}>
            <div className="uzu-jv-gh"><b>{g.name}</b><span className="uzu-muted uzu-small">{pl2(g.published, "séance publiée", "séances publiées")}</span></div>
            <p className={`uzu-text uzu-small${late ? " uzu-jv-late" : ""}`}>{g.last ? <>Dernière séance : {shortDate(g.last)}{g.days !== null ? ` (il y a ${pl2(g.days, "jour")})` : ""}{late ? " · plus de 14 jours sans séance publiée" : ""}</> : "Aucune séance publiée pour l'instant"}</p>
            {cv && cv.total > 0 && <>
              <div className="uzu-jv-cov" role="img" aria-label={`${cv.covered} fiches abordées sur ${cv.total}`}><i style={{ width: Math.round((cv.covered / cv.total) * 100) + "%" }} /></div>
              <small className="uzu-muted">Bibliothèque : {cv.covered} fiche{cv.covered > 1 ? "s" : ""} abordée{cv.covered > 1 ? "s" : ""} sur {cv.total}, depuis la première séance</small>
              {cv.never.length > 0 && <details className="uzu-jv-never"><summary>Jamais abordées ({cv.total - cv.covered})</summary>
                <div className="uzu-lib-badges">{cv.never.map(x => <button key={x.id} type="button" className="uzu-lib-badge uzu-lib-badge--plain" onClick={() => openFiche(x.id)}>{x.id} {splitName(x.name).main}</button>)}{cv.total - cv.covered > cv.never.length && <span className="uzu-lib-badge uzu-lib-badge--plain">+ {cv.total - cv.covered - cv.never.length}</span>}</div></details>}
            </>}
          </li> })}</ul>}
      </section>

      {o.top.length > 0 && <section className="panel uzu-panel-col" aria-labelledby="jv-top"><div className="section-title"><h2 id="jv-top">Techniques les plus travaillées</h2><span className="uzu-muted uzu-small">nombre de séances</span></div>
        <div className="uzu-jv-bars">{o.top.map(x => <HBar key={x.id} label={`${x.id} ${splitName(x.name).main}`} n={x.n} max={maxTop} suffix={x.n > 1 ? "séances" : "séance"} onClick={() => openFiche(x.id)} />)}</div></section>}

      {o.authors.length > 0 && <section className="panel uzu-panel-col" aria-labelledby="jv-au"><div className="section-title"><h2 id="jv-au">Saisies par professeur</h2><span className="uzu-muted uzu-small">séances publiées</span></div>
        <div className="uzu-jv-bars">{o.authors.map(a => <HBar key={a.name} label={a.name} n={a.n} max={maxAuth} suffix={a.n > 1 ? "séances" : "séance"} />)}</div></section>}

      <p className="uzu-text uzu-small uzu-muted">Ces chiffres décrivent ce qui a été enseigné aux groupes. Ils ne disent rien de la progression d'un élève et ne modifient aucune maîtrise.</p>
    </>}
  </div>
}
