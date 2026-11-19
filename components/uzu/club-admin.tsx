"use client"
// Espace Club — Cours (planning et encadrement), Équipe (membres, invitations, rôles, droits, affectations),
// Contenus (focus tactique, annonce) et Mon académie (informations, code, paramètres, journal d'activité).
// Toutes les écritures passent par les fonctions serveur ; les droits affichés ici ne servent qu'à l'affichage.
import { useCallback, useEffect, useMemo, useState } from "react"
import { ArrowLeft, ArrowRight, CalendarOff, CalendarPlus, Check, Flag, ChevronRight, LogOut, Mail, MoreHorizontal, Plus, Send, ShieldCheck } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { can, scopeOf } from "@/lib/uzu/permissions"
import { COURSE_DISC, COURSE_KIND, ZONES, closureOn, closureTxt, closuresOf, discLabel, normSched, schoolHolidays, slotOpenOn, slotTag, ymd, zoneOf, type Closure, type Slot, type Zone } from "@/lib/uzu/training"
import { Calendar, type CalItem } from "@/components/uzu/calendar"
import { listReports, reasonLabel, resolveReport, type Report } from "@/lib/uzu/safety"
import {
  AUDIT_LBL, DISCIPLINES, PERM_CAT, PRESETS, ROLE_LBL, SCOPE_LBL, SENSITIVE, STAFF_ROLES, STATUS_LBL, TPL_LBL,
  actLabel, bilanCalc, courseAllowed, seasonOf, seasonYear, createInvitation, getAudit, getMyCourses, getTeam, inviteUrl, leaveAcademy, loadClubData, mapToList,
  resendInvitation, revokeInvitation, setCourseMeta, setCourseStaff, setMemberPermissions, setMemberRole, setMemberStatus, setStudentAccess,
  tplMap, transferOwnership, updateAcademy, updateInviteCode, upsertSection,
  type MyCourses, type PermDraft, type StudentRow, type Team, type TeamMember,
} from "@/lib/uzu/club"
import { ClubHeading, ClubLoading, InvitePanel, initialsOf } from "@/components/uzu/club"
import { checkVideo, loadVideos, removeVideo, uploadVideo, videoSlots, type VideoMap } from "@/lib/uzu/videos"
import { useLibrary } from "@/components/uzu/library"
import { ClubLibrary, type ClubTab } from "@/components/uzu/library-contrib"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
type AdminProps = { uid: string; ctx: UzuContext | null; onToast: (m: string) => void; onReloadCtx: () => void; onNavigate: (id: string, arg?: string) => void }
const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]
const DSHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const canAcademy = (ctx: UzuContext | null, r: string, a: string) => scopeOf(ctx, r, a) === "academy"
const frDT = (iso?: string | null) => { if (!iso) return ""; const d = new Date(iso); return isNaN(+d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) }

/** Bouton à double appui pour les actions importantes (même principe que l'ancienne application). */
function ConfirmButton({ label, confirm, onConfirm, className = "button button--outline uzu-small-btn", disabled }: { label: React.ReactNode; confirm: string; onConfirm: () => void; className?: string; disabled?: boolean }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t) }, [armed])
  return <button type="button" className={className + (armed ? " is-armed" : "")} disabled={disabled} onClick={() => { if (!armed) { setArmed(true); return } setArmed(false); onConfirm() }}>{armed ? confirm : label}</button>
}

function useTeam(ctx: UzuContext | null) {
  const [team, setTeam] = useState<Team | null>(null)
  const [error, setError] = useState("")
  const [tick, setTick] = useState(0)
  const allowed = can(ctx, "instructors", "view")
  useEffect(() => {
    if (!allowed || !ctx?.club) return
    let live = true
    getTeam().then(r => { if (!live) return; if (r.ok) { setTeam(r.data as Team); setError("") } else setError(r.msg) })
    return () => { live = false }
  }, [ctx, allowed, tick])
  return { team, error, allowed, reload: useCallback(() => setTick(t => t + 1), []) }
}

// ================================================================ Cours
const KIND_TONE: Record<string, string> = { cours: "wine", open: "dark", compet: "sand", prive: "sand" }
const seasonLbl = () => { const d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return `SAISON ${y}–${String(y + 1).slice(2)}` }

export function ClubCourses({ ctx, onToast, onReloadCtx, tabs }: AdminProps & { tabs?: React.ReactNode }) {
  const { team, reload: reloadTeam } = useTeam(ctx)
  const [mc, setMc] = useState<MyCourses>({ assigned: [], section: [], staff: [] })
  const [mcTick, setMcTick] = useState(0)
  const [staffFor, setStaffFor] = useState("")
  const [editing, setEditing] = useState<Slot | "new" | null>(null)
  const [filter, setFilter] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; getMyCourses().then(m => { if (live) setMc(m) }); return () => { live = false } }, [ctx, mcTick])
  const raw: Slot[] = normSched(ctx?.club?.schedule)
  const L = raw.slice().sort((a, b) => a.d - b.d || (a.s < b.s ? -1 : 1))
  const canEdit = canAcademy(ctx, "courses", "update")
  const canStaff = (id: string) => can(ctx, "courses", "manage") && courseAllowed(ctx, mc, "courses", "manage", id) && can(ctx, "instructors", "view")
  const staffOf = (id: string) => mc.staff.filter(y => y.course_key === id && !y.date)
  const saveSchedule = async (list: Slot[], msg: string) => {
    setBusy(true); const r = await updateAcademy({ schedule: normSched(list) }); setBusy(false)
    onToast(r.ok ? msg : r.msg); if (r.ok) { onReloadCtx(); setEditing(null) }
    return r.ok
  }
  const slot = L.find(x => x.id === staffFor)
  if (slot && team) return <CourseStaff slot={slot} team={team} onBack={() => setStaffFor("")} onToast={onToast} onDone={() => { setStaffFor(""); reloadTeam(); setMcTick(t => t + 1) }} />
  const today = new Date(), mon = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7))
  const days = [0, 1, 2, 3, 4, 5, 6].map(i => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))
  const shown = L.filter(x => !filter || x.disc === filter)
  const open = (x: Slot) => { if (canEdit) { setEditing(x); window.scrollTo(0, 0) } else if (canStaff(x.id)) setStaffFor(x.id) }
  const itemsOn = (d: Date, ds: string): CalItem[] => shown.filter(x => x.d === ((d.getDay() + 6) % 7) + 1).map(x => {
    const lead = staffOf(x.id).find(y => y.role === "lead")
    return { key: x.id, title: x.t, sub: [x.s + (lead ? " · " + lead.name.split(" ")[0] : ""), x.disc ? discLabel(x.disc) : ""].filter(Boolean).join(" · "), tone: KIND_TONE[x.kind || "cours"] as CalItem["tone"],
      off: slotOpenOn(ctx?.club, x, ds) ? undefined : x.off?.includes(ds) ? "Annulé" : "Vacances", onClick: canEdit || canStaff(x.id) ? () => open(x) : undefined }
  })
  const sub = (x: Slot) => [slotTag(x), staffOf(x.id).map(y => y.name + (y.role === "lead" ? " (principal)" : y.role === "assistant" ? " (assistant)" : "")).join(", ")].filter(Boolean).join(" · ")
  return <>
    <div className="page-heading"><div><div className="eyebrow">{(ctx?.club?.name || "").toUpperCase()}<span className="eyebrow-dot" />{seasonLbl()}</div><h1>Les cours, en rythme<span className="heading-period">.</span></h1><p>Votre calendrier pédagogique et les rendez-vous de l&apos;académie.</p></div>
      {canEdit && <button className="button button--dark" onClick={() => { setEditing("new"); window.scrollTo(0, 0) }}><Plus size={16} />Créer un cours</button>}</div>
    {tabs}
    {editing && <CourseEditor slot={editing === "new" ? null : editing} busy={busy} canStaff={editing !== "new" && canStaff(editing.id) && !!team}
      onCancel={() => setEditing(null)} onStaff={() => { if (editing !== "new") { setStaffFor(editing.id); setEditing(null) } }}
      onSave={x => editing === "new" ? saveSchedule(raw.concat([x]), "Cours ajouté au planning") : saveSchedule(raw.map(y => (y.id === x.id ? x : y)), "Cours modifié")}
      onRemove={editing === "new" ? undefined : () => saveSchedule(raw.filter(y => y.id !== (editing as Slot).id), "Cours retiré du planning")} />}
    <Calendar eyebrow="PLANNING DU CLUB" storeKey="uzu-cal-club" itemsOn={itemsOn} closedOn={ds => closureOn(ctx?.club, ds)?.label || null}
      legend={<div className="chart-legend uzu-cal-legend"><span><i className="lg-wine" />Cours collectif</span><span><i className="lg-dark" />Open mat</span><span><i className="lg-sand" />Compétition, cours privé</span>{closuresOf(ctx?.club).length > 0 && <span><i className="lg-hol" />Vacances, fermeture</span>}</div>} />
    <section className="panel course-list-panel">
      <div className="panel-header"><div className="section-title"><h2>Les cours de la semaine</h2></div>
        <label className="panel-select uzu-period"><select aria-label="Filtrer par discipline" value={filter} onChange={e => setFilter(e.target.value)}><option value="">Tous les cours</option>{COURSE_DISC.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div>
      {shown.length ? shown.map(x => <div className="course-list-row" key={x.id}>
        <strong>{x.s}</strong><span>{DSHORT[x.d - 1].toUpperCase()} {days[x.d - 1].getDate()}</span><i className={`course-line course-line--${KIND_TONE[x.kind || "cours"]}`} />
        <div><b>{x.t}</b><small>{sub(x) || "Discipline et type à préciser"}</small>{(x.hol || (x.off || []).some(o => o >= ymd(today))) && <small className="uzu-hol-tag">{[x.hol ? "Maintenu pendant les vacances" : "", (() => { const n = (x.off || []).filter(o => o >= ymd(today)).length; return n ? n + " date" + (n > 1 ? "s" : "") + " annulée" + (n > 1 ? "s" : "") : "" })()].filter(Boolean).join(" · ")}</small>}</div>
        <span>{x.s} – {x.e}</span>
        {(canEdit || canStaff(x.id)) ? <button className="row-action" aria-label={`Gérer ${x.t}`} onClick={() => open(x)}><ChevronRight size={16} /></button> : <span />}
      </div>) : <p className="uzu-text uzu-muted">{L.length ? "Aucun cours pour cette discipline." : "Aucun cours au planning."}</p>}
    </section>
    <ClubClosures ctx={ctx} onToast={onToast} onReloadCtx={onReloadCtx} />
  </>
}

/** Vacances scolaires et fermetures du club : les cours n'ont pas lieu pendant ces périodes (sauf cours maintenus). */
function ClubClosures({ ctx, onToast, onReloadCtx }: Pick<AdminProps, "ctx" | "onToast" | "onReloadCtx">) {
  const canEdit = can(ctx, "academy_settings", "update")
  const all = closuresOf(ctx?.club), t = ymd(new Date())
  const list = all.filter(c => c.to >= t)
  const [zone, setZone] = useState<Zone>(zoneOf(ctx?.club))
  const [f, setF] = useState({ label: "", from: "", to: "" })
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  if (!canEdit && !list.length) return null
  const save = async (next: Closure[], msg: string, z: Zone = zoneOf(ctx?.club)) => {
    const lim = ymd(new Date(Date.now() - 400 * 864e5))
    const keep = next.filter(c => c.to >= lim).sort((a, b) => (a.from < b.from ? -1 : 1)).slice(-60)
    setBusy(true)
    const r = await updateAcademy({ profile: { ...((ctx?.club?.profile || {}) as Record<string, unknown>), zone: z, closures: keep } })
    setBusy(false); onToast(r.ok ? msg : r.msg); if (r.ok) onReloadCtx()
    return r.ok
  }
  const addHolidays = () => {
    const pre = schoolHolidays(zone, t), ids = new Set(pre.map(p => p.id))
    if (!pre.length) { onToast("Aucune période de vacances connue à venir"); return }
    save(all.filter(c => !ids.has(c.id)).concat(pre), `Vacances scolaires ajoutées (zone ${zone})`, zone)
  }
  const add = async () => {
    const label = f.label.trim() || "Fermeture du club"
    if (!f.from) { setErr("Indique la date de début"); return }
    const to = f.to || f.from
    if (to < f.from) { setErr("La date de fin doit être après la date de début"); return }
    if (to < t) { setErr("Cette période est déjà passée"); return }
    setErr("")
    if (await save(all.concat([{ id: "f" + Date.now().toString(36), from: f.from, to, label: label.slice(0, 60) }]), "Fermeture ajoutée")) setF({ label: "", from: "", to: "" })
  }
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Vacances et fermetures">
    <div className="section-title"><h2>Vacances et fermetures</h2><CalendarOff size={17} /></div>
    <p className="uzu-text uzu-muted">Pendant ces périodes, les cours n&apos;ont pas lieu : ils disparaissent de l&apos;accueil, des prochains cours et de l&apos;appel, et le calendrier affiche « Vacances ». Un cours peut être maintenu depuis sa fiche.</p>
    {list.length ? <div className="uzu-hol-list">{list.map(c => <div className="uzu-hol-row" key={c.id + c.from}>
      <div><b>{c.label}</b><small>{closureTxt(c)}{c.from <= t ? " · en cours" : ""}</small></div>
      {canEdit && <button className="button button--outline uzu-mini" disabled={busy} aria-label={`Retirer ${c.label}`} onClick={() => save(all.filter(y => !(y.id === c.id && y.from === c.from)), "Période retirée : les cours reprennent ces jours-là")}>Retirer</button>}
    </div>)}</div> : <p className="uzu-text">Aucune période de fermeture : les cours ont lieu toutes les semaines.</p>}
    {canEdit && <>
      <div className="uzu-hol-preset">
        <div className="uzu-field"><label className="uzu-label" htmlFor="hol-zone">Zone scolaire</label><select id="hol-zone" className="uzu-input" value={zone} onChange={e => setZone(e.target.value as Zone)}>{ZONES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <button className="button button--dark" disabled={busy} onClick={addHolidays}><CalendarOff size={15} />Ajouter les vacances scolaires 2026-2027</button>
      </div>
      <span className="uzu-label">Autre fermeture (jour férié, stage, travaux…)</span>
      <div className="uzu-row2">
        <div className="uzu-field"><label className="uzu-label" htmlFor="hol-label">Motif</label><input id="hol-label" className="uzu-input" maxLength={60} placeholder="Ex. : Fermeture estivale" value={f.label} onChange={e => setF({ ...f, label: e.target.value })} /></div>
        <div className="uzu-field"><label className="uzu-label" htmlFor="hol-from">Du</label><input id="hol-from" type="date" min={t} className="uzu-input" value={f.from} onChange={e => setF({ ...f, from: e.target.value })} /></div>
        <div className="uzu-field"><label className="uzu-label" htmlFor="hol-to">Au (inclus)</label><input id="hol-to" type="date" min={f.from || t} className="uzu-input" value={f.to} onChange={e => setF({ ...f, to: e.target.value })} /></div>
      </div>
      {err && <p className="uzu-note wait" role="alert">{err}</p>}
      <div className="uzu-actions uzu-actions--start"><button className="button button--outline" disabled={busy} onClick={add}><Plus size={15} />Ajouter cette fermeture</button></div>
    </>}
  </section>
}

function CourseEditor({ slot, busy, canStaff, onSave, onCancel, onRemove, onStaff }: { slot: Slot | null; busy: boolean; canStaff: boolean; onSave: (x: Slot) => Promise<boolean>; onCancel: () => void; onRemove?: () => void; onStaff: () => void }) {
  const [f, setF] = useState({ d: String(slot?.d || 1), t: slot?.t || "", s: slot?.s || "19:00", e: slot?.e || "20:30", disc: slot?.disc || "jjb", kind: slot?.kind || "cours", hol: !!slot?.hol, off: slot?.off || [] })
  const [offIn, setOffIn] = useState("")
  const [err, setErr] = useState("")
  const today = ymd(new Date())
  const cancelDate = () => {
    if (!offIn) { setErr("Choisis la date à annuler"); return }
    const wd = new Date(offIn + "T12:00:00"), iso = ((wd.getDay() + 6) % 7) + 1
    if (iso !== +f.d) { setErr(`Ce cours a lieu le ${DAYS[+f.d - 1].toLowerCase()} : choisis un ${DAYS[+f.d - 1].toLowerCase()}`); return }
    setErr(""); setF({ ...f, off: [...new Set(f.off.concat([offIn]))].sort() }); setOffIn("")
  }
  const save = () => {
    const t = f.t.trim()
    if (!t) { setErr("Indique le nom du cours"); return }
    if (!f.s || !f.e || f.e <= f.s) { setErr("Vérifie les horaires : la fin doit être après le début"); return }
    setErr("")
    const lim = ymd(new Date(Date.now() - 60 * 864e5))
    const off = slot && +f.d === slot.d ? f.off.filter(o => o >= lim) : []
    onSave({ id: slot?.id || "c" + Date.now().toString(36), d: +f.d, s: f.s, e: f.e, t, disc: f.disc as Slot["disc"], kind: f.kind as Slot["kind"], ...(f.hol ? { hol: true } : {}), ...(off.length ? { off } : {}) })
  }
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>{slot ? "Modifier le cours" : "Créer un cours"}</h2><CalendarPlus size={17} /></div>
    <span className="uzu-label">Discipline</span>
    <div className="uzu-seg" role="group" aria-label="Discipline">{COURSE_DISC.map(([k, l]) => <button key={k} type="button" className={f.disc === k ? "on" : ""} aria-pressed={f.disc === k} onClick={() => setF({ ...f, disc: k })}>{l}</button>)}</div>
    <span className="uzu-label">Type de cours</span>
    <div className="uzu-seg" role="group" aria-label="Type de cours">{COURSE_KIND.map(([k, l]) => <button key={k} type="button" className={f.kind === k ? "on" : ""} aria-pressed={f.kind === k} onClick={() => setF({ ...f, kind: k })}>{l}</button>)}</div>
    <div className="uzu-row2">
      <div className="uzu-field"><label className="uzu-label" htmlFor="sl-title">Nom du cours</label><input id="sl-title" className="uzu-input" maxLength={40} placeholder="Ex. : Adultes tous niveaux" value={f.t} onChange={e => setF({ ...f, t: e.target.value })} /></div>
      <div className="uzu-field"><label className="uzu-label" htmlFor="sl-day">Jour</label><select id="sl-day" className="uzu-input" value={f.d} onChange={e => setF({ ...f, d: e.target.value })}>{DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select></div>
      <div className="uzu-field"><label className="uzu-label" htmlFor="sl-start">Début</label><input id="sl-start" type="time" className="uzu-input" value={f.s} onChange={e => setF({ ...f, s: e.target.value })} /></div>
      <div className="uzu-field"><label className="uzu-label" htmlFor="sl-end">Fin</label><input id="sl-end" type="time" className="uzu-input" value={f.e} onChange={e => setF({ ...f, e: e.target.value })} /></div>
    </div>
    <label className="uzu-check-row"><input type="checkbox" checked={f.hol} onChange={e => setF({ ...f, hol: e.target.checked })} />Cours maintenu pendant les vacances et fermetures du club</label>
    <span className="uzu-label">Annuler une date précise</span>
    <div className="uzu-hol-preset">
      <div className="uzu-field"><label className="uzu-label" htmlFor="sl-off">Date</label><input id="sl-off" type="date" min={today} className="uzu-input" value={offIn} onChange={e => setOffIn(e.target.value)} /></div>
      <button type="button" className="button button--outline" onClick={cancelDate}>Annuler cette date</button>
    </div>
    {f.off.filter(o => o >= today).length > 0 && <div className="uzu-off-chips">{f.off.filter(o => o >= today).map(o => <button type="button" key={o} className="uzu-off-chip" aria-label={`Rétablir le cours du ${new Date(o + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}`} onClick={() => setF({ ...f, off: f.off.filter(y => y !== o) })}>{new Date(o + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })} ×</button>)}</div>}
    {err && <p className="uzu-note wait" role="alert">{err}</p>}
    <div className="uzu-actions uzu-actions--start">
      <button className="button button--dark" disabled={busy} onClick={save}><Check size={15} />{slot ? "Enregistrer le cours" : "Ajouter ce cours au planning"}</button>
      <button className="button button--outline" onClick={onCancel}>Annuler</button>
      {canStaff && <button className="button button--outline" onClick={onStaff}>Encadrement</button>}
      {onRemove && <ConfirmButton className="button button--outline uzu-danger" label="Retirer du planning" confirm="Confirmer le retrait" disabled={busy} onConfirm={onRemove} />}
    </div>
  </section>
}

function CourseStaff({ slot, team, onBack, onToast, onDone }: { slot: Slot; team: Team; onBack: () => void; onToast: (m: string) => void; onDone: () => void }) {
  const cur: Record<string, string> = {}
  team.course_staff.filter(c => c.course_key === slot.id && !c.date).forEach(c => { cur[c.member_id] = c.role })
  const meta = team.course_meta.find(c => c.course_key === slot.id)
  const [roles, setRoles] = useState<Record<string, string>>(cur)
  const [date, setDate] = useState("")
  const [disc, setDisc] = useState(meta?.discipline || "")
  const [level, setLevel] = useState(meta?.level || "")
  const [sec, setSec] = useState(meta?.section_id || "")
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    const staff = Object.keys(roles).filter(k => roles[k]).map(k => ({ member_id: k, role: roles[k] }))
    const r = await setCourseStaff(slot.id, date || null, staff)
    if (!r.ok) { setBusy(false); onToast(r.msg); return }
    const r2 = await setCourseMeta(slot.id, sec || null, disc.trim(), level.trim())
    setBusy(false); onToast(r2.ok ? "Encadrement enregistré" : "Encadrement enregistré · " + r2.msg); onDone()
  }
  return <>
    <button className="text-link uzu-back" onClick={onBack}><ArrowLeft size={15} />Planning</button>
    <ClubHeading eyebrow="ENCADREMENT" title={slot.t} sub={`${DAYS[slot.d - 1]} · ${slot.s} – ${slot.e}`} />
    <section className="panel uzu-panel-col">
      <ul className="uzu-top">{team.members.filter(m => m.status === "active").map(m => <li key={m.id}><span><b>{m.name}</b><small>{ROLE_LBL[m.role]}</small></span>
        <select className="uzu-input uzu-input--auto" aria-label={`Rôle de ${m.name}`} value={roles[m.id] || ""} onChange={e => setRoles({ ...roles, [m.id]: e.target.value })}>{STAFF_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></li>)}</ul>
      <label className="uzu-label" htmlFor="cs-date">Seulement pour une séance (facultatif)</label><input id="cs-date" type="date" className="uzu-input" value={date} onChange={e => setDate(e.target.value)} />
      <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="cs-disc">Discipline</label><input id="cs-disc" className="uzu-input" maxLength={30} placeholder="Ex. : JJB, MMA" value={disc} onChange={e => setDisc(e.target.value)} /></div>
        <div className="uzu-field"><label className="uzu-label" htmlFor="cs-level">Niveau</label><input id="cs-level" className="uzu-input" maxLength={30} placeholder="Ex. : débutants" value={level} onChange={e => setLevel(e.target.value)} /></div></div>
      <label className="uzu-label" htmlFor="cs-sec">Section</label><select id="cs-sec" className="uzu-input" value={sec} onChange={e => setSec(e.target.value)}><option value="">Aucune</option>{team.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
      <button className="button button--dark uzu-wide" disabled={busy} onClick={save}>Enregistrer l'encadrement</button>
    </section>
  </>
}

// ================================================================ Équipe
const TONES = ["peach", "lavender", "sage", "rose", "light"]
export function ClubTeam({ uid, ctx, onToast, onReloadCtx }: AdminProps) {
  const { team, error, allowed, reload } = useTeam(ctx)
  const [inviting, setInviting] = useState(false)
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)
  const [open, setOpen] = useState("")
  const [students, setStudents] = useState<StudentRow[]>([])
  useEffect(() => { let live = true; loadClubData(uid).then(d => { if (live) setStudents(d.rows) }, () => {}); return () => { live = false } }, [uid, ctx])
  const club = (ctx?.club?.name || "").toUpperCase()
  if (!allowed) return <><ClubHeading eyebrow="ÉQUIPE" title="Une équipe, un tatami" sub="" /><p className="uzu-note">Tu n'as pas accès à l'équipe pédagogique.</p></>
  if (!team) return <><ClubHeading eyebrow={club} title="Une équipe, un tatami" sub="Chargement…" /><ClubLoading error={error} onRetry={reload} /></>
  const m = open ? team.members.find(x => x.id === open) : null
  if (m) return <MemberSheet ctx={ctx} team={team} m={m} students={students} onBack={() => setOpen("")} onToast={onToast} onChanged={() => { reload() }} onReloadCtx={onReloadCtx} />
  const sec = (id: string | null) => team.sections.find(s => s.id === id)?.name || ""
  const active = team.members.filter(x => x.status === "active")
  const canInvite = can(ctx, "instructors", "create")
  const showLink = (email: string, d: Any) => setLink({ email, url: inviteUrl(d.token) })
  const startInvite = () => { setInviting(true); setLink(null); window.scrollTo(0, 0) }
  // Résumé des droits par rôle (à partir des droits réels de chaque membre)
  const roles = [...new Set(team.members.filter(x => x.status !== "removed").map(x => x.role))]
  const roleSummary = (r: string) => {
    const ms = team.members.filter(x => x.role === r && x.status !== "removed")
    if (r === "owner") return { acts: "Tous les droits de l'académie", scopes: "Toute l'académie", n: ms.length }
    const acts = new Set<string>(), scopes = new Set<string>()
    ms.forEach(x => mapToList(x.perms || {}).forEach(p => { acts.add(PERM_CAT.find(c => c[0] === p.r)?.[1] || p.r); scopes.add(SCOPE_LBL[p.s] || p.s) }))
    return { acts: acts.size ? [...acts].slice(0, 6).join(" · ") + (acts.size > 6 ? ` · +${acts.size - 6}` : "") : "Aucun droit", scopes: [...scopes].join(" · "), n: ms.length }
  }
  return <>
    <div className="page-heading"><div><div className="eyebrow">{club}<span className="eyebrow-dot" />{active.length} MEMBRE{active.length > 1 ? "S" : ""}</div><h1>Une équipe, un tatami<span className="heading-period">.</span></h1><p>Les personnes qui transmettent, encadrent et font progresser.</p></div>
      {canInvite && <button className="button button--dark" onClick={startInvite}><Plus size={16} />Inviter un membre</button>}</div>
    {link && <InviteLink email={link.email} url={link.url} clubName={ctx?.club?.name || ""} onClose={() => setLink(null)} />}
    {inviting && !link && <InviteForm ctx={ctx} onToast={onToast} onCancel={() => setInviting(false)} onCreated={(email, d) => { setInviting(false); showLink(email, d); reload() }} />}
    <section className="panel team-panel">
      <div className="panel-header"><div className="section-title"><h2>Équipe pédagogique</h2></div><span className="panel-select">{active.length} membre{active.length > 1 ? "s" : ""} actif{active.length > 1 ? "s" : ""}</span></div>
      {team.members.map((x, i) => <div className="team-row uzu-team-row" key={x.id}>
        <span className={`avatar avatar--${TONES[i % TONES.length]}`} aria-hidden="true">{initialsOf(x.name)}</span>
        <div className="team-member"><strong>{x.name}{x.is_me && <span className="uzu-muted"> (toi)</span>}</strong><small>{ROLE_LBL[x.role] || x.role}{x.section_id && sec(x.section_id) ? " · " + sec(x.section_id) : ""} · {x.courses || 0} cours · depuis le {frDT(x.joined_at)}</small></div>
        <span className="role-pill">{ROLE_LBL[x.role] || x.role}</span>
        <span className={`member-status ${x.status !== "active" ? "is-off" : ""}`}><i />{STATUS_LBL[x.status] || x.status}</span>
        <button className="icon-button" aria-label={`Options de ${x.name}`} aria-haspopup="dialog" onClick={() => { setOpen(x.id); window.scrollTo(0, 0) }}><MoreHorizontal size={18} /></button>
      </div>)}
      {team.invitations.map(inv => <div className="team-row uzu-team-row uzu-inv-row" key={inv.id}>
        <span className="avatar avatar--light" aria-hidden="true">@</span>
        <div className="team-member"><strong>{inv.email}</strong><small>{ROLE_LBL[inv.role] || inv.role} · {inv.status === "expired" ? "invitation expirée" : "valable jusqu'au " + frDT(inv.expires_at)}</small>
          {canInvite && <span className="uzu-actions uzu-actions--start">
            <button className="button button--outline uzu-small-btn" onClick={async () => { const r = await resendInvitation(inv.id); if (!r.ok) { onToast(r.msg); return } showLink(inv.email || r.data?.email || "", r.data); reload() }}>Nouveau lien</button>
            <ConfirmButton label="Annuler" confirm="Confirmer" onConfirm={async () => { const r = await revokeInvitation(inv.id); onToast(r.ok ? "Invitation annulée" : r.msg); reload() }} /></span>}</div>
        <span className="role-pill">{STATUS_LBL[inv.status] || inv.status}</span>
      </div>)}
      {!team.members.length && !team.invitations.length && <p className="uzu-text uzu-muted">Aucun membre pour l'instant.</p>}
    </section>
    <div className="content-grid team-lower">
      <section className="panel"><div className="panel-header"><div className="section-title"><h2>Rôles &amp; permissions</h2></div></div>
        {roles.map(r => { const x = roleSummary(r); return <div className="permission-row" key={r}><span className="permission-shield"><ShieldCheck size={15} /></span>
          <div><strong>{ROLE_LBL[r] || r}</strong><small>{x.acts} {x.scopes && <span>· {x.scopes}</span>}</small></div><span>{x.n} membre{x.n > 1 ? "s" : ""}</span></div> })}
      </section>
      <section className="team-invite-card"><span className="invite-illustration"><Mail size={21} /></span><div className="eyebrow">AGRANDIR L&apos;ÉQUIPE</div><h2>Le club se construit<br />ensemble.</h2><p>Invitez les professeurs et assistants à rejoindre l&apos;académie, avec des droits réglés au plus juste.</p>
        {canInvite && <button className="button button--light" onClick={startInvite}>Envoyer une invitation<ArrowRight size={15} /></button>}</section>
    </div>
  </>
}

function InviteLink({ email, url, clubName, onClose }: { email: string; url: string; clubName: string; onClose: () => void }) {
  const [msg, setMsg] = useState("")
  const txt = `Tu es invité(e) à rejoindre l'équipe de ${clubName || "notre académie"} sur UZU. Ouvre ce lien et connecte-toi avec ${email} (valable 7 jours) : ${url}`
  const share = async () => {
    try { if (navigator.share) { await navigator.share({ title: "Invitation UZU", text: txt }); return } await navigator.clipboard.writeText(txt); setMsg("Lien copié : colle-le dans ton message") }
    catch { setMsg("Copie impossible : sélectionne le lien") }
  }
  return <section className="panel uzu-panel-col uzu-grid-gap" role="status">
    <div className="section-title"><h2>Invitation prête</h2></div>
    <p className="uzu-text">Envoie ce lien à <b>{email}</b> par WhatsApp, SMS ou e-mail. Il n'est affiché qu'une fois et fonctionne uniquement avec cette adresse.</p>
    <p className="uzu-code uzu-link">{url}</p>
    <div className="uzu-actions uzu-actions--start"><button className="button button--dark" onClick={share}><Send size={15} />Partager le lien</button><button className="button button--outline" onClick={onClose}>Fermer</button></div>
    {msg && <p className="uzu-small uzu-muted">{msg}</p>}
  </section>
}

function InviteForm({ ctx, onToast, onCancel, onCreated }: { ctx: UzuContext | null; onToast: (m: string) => void; onCancel: () => void; onCreated: (email: string, d: Any) => void }) {
  const meOwner = ctx?.academy_role === "owner"
  const roles = ["instructor", "assistant", "section_lead", ...(meOwner ? ["owner"] : [])]
  const [email, setEmail] = useState("")
  const [role, setRole] = useState("instructor")
  const [tpl, setTpl] = useState("instructor")
  const [perms, setPerms] = useState<PermDraft>(tplMap("instructor"))
  const [custom, setCustom] = useState(false)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState(false)
  const n = mapToList(perms).length
  const send = async () => {
    setErr("")
    const e = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { setErr("Adresse e-mail invalide."); return }
    setBusy(true); const r = await createInvitation(e, role, mapToList(perms)); setBusy(false)
    if (!r.ok) { setErr(r.msg); return }
    onToast("Invitation créée"); onCreated(e, r.data)
  }
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Inviter un membre</h2></div>
    <p className="uzu-text uzu-small uzu-muted">La personne reçoit un lien valable 7 jours. Elle l'accepte en se connectant avec cette adresse e-mail.</p>
    <label className="uzu-label" htmlFor="iv-email">Adresse e-mail</label><input id="iv-email" type="email" autoComplete="off" className="uzu-input" placeholder="prenom@exemple.fr" value={email} onChange={e => setEmail(e.target.value)} />
    <label className="uzu-label" htmlFor="iv-role">Rôle</label><select id="iv-role" className="uzu-input" value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r} value={r}>{ROLE_LBL[r]}</option>)}</select>
    {role !== "owner" && <><label className="uzu-label" htmlFor="iv-tpl">Modèle de droits</label>
      <select id="iv-tpl" className="uzu-input" value={tpl} onChange={e => { setTpl(e.target.value); setPerms(tplMap(e.target.value)) }}>{Object.keys(TPL_LBL).map(k => <option key={k} value={k}>{TPL_LBL[k]}</option>)}</select></>}
    <p className="uzu-text uzu-small">{role === "owner" ? "Un responsable a tous les droits de l'académie." : `${n} droit${n > 1 ? "s" : ""} accordé${n > 1 ? "s" : ""}. Tu pourras les modifier à tout moment.`}</p>
    {role !== "owner" && <button className="button button--outline uzu-small-btn" onClick={() => setCustom(v => !v)}>{custom ? "Masquer les droits" : "Personnaliser les droits avant l'envoi"}</button>}
    {role !== "owner" && custom && <PermGrid draft={perms} disabled={false} onChange={setPerms} />}
    {err && <p className="uzu-note wait" role="alert">{err}</p>}
    <div className="uzu-actions uzu-actions--start"><button className="button button--dark" disabled={busy} onClick={send}>{busy ? "Création…" : "Créer l'invitation"}</button><button className="button button--outline" onClick={onCancel}>Annuler</button></div>
  </section>
}

function PermGrid({ draft, disabled, onChange }: { draft: PermDraft; disabled: boolean; onChange: (d: PermDraft) => void }) {
  const set = (r: string, a: string, v: string | null) => { const d: PermDraft = JSON.parse(JSON.stringify(draft)); d[r] = d[r] || {}; if (v) d[r][a] = v; else delete d[r][a]; if (!Object.keys(d[r]).length) delete d[r]; onChange(d) }
  return <div className="uzu-perm-grid">{PERM_CAT.map(([r, lbl, acts, scopes]) => <div key={r} className="uzu-perm-cat"><b>{lbl}</b>
    {acts.map(a => { const cur = draft[r]?.[a], on = !!cur && cur !== "deny", sens = SENSITIVE[r + "." + a]
      return <div key={a} className="uzu-perm-row">
        <button type="button" role="switch" aria-checked={on} aria-label={`${lbl} : ${actLabel(r, a)}`} className={`uzu-switch ${on ? "on" : ""}`} disabled={disabled} onClick={() => set(r, a, on ? null : scopes[0])}><i /></button>
        <span className="uzu-perm-l">{actLabel(r, a)}{sens && <em className="uzu-sens" title="Droit sensible">sensible</em>}</span>
        {scopes.length > 1 && <select className="uzu-input uzu-input--auto" aria-label="Portée" disabled={!on || disabled} value={on ? cur : scopes[0]} onChange={e => set(r, a, e.target.value)}>{scopes.map(s => <option key={s} value={s}>{SCOPE_LBL[s]}</option>)}</select>}
      </div> })}</div>)}</div>
}

const MTABS = ["Informations", "Rôle", "Permissions", "Affectations"]
function MemberSheet({ ctx, team, m, students, onBack, onToast, onChanged, onReloadCtx }: { ctx: UzuContext | null; team: Team; m: TeamMember; students: StudentRow[]; onBack: () => void; onToast: (s: string) => void; onChanged: () => void; onReloadCtx: () => void }) {
  const [tab, setTab] = useState(0)
  const meOwner = ctx?.academy_role === "owner"
  const canU = can(ctx, "instructors", "update") && !m.is_me && (m.role !== "owner" || meOwner)
  const canD = can(ctx, "instructors", "delete") && !m.is_me && (m.role !== "owner" || meOwner)
  const sched = normSched(ctx?.club?.schedule).sort((a, b) => a.d - b.d || (a.s < b.s ? -1 : 1))
  const run = async (fn: () => Promise<{ ok: boolean; msg?: string }>, ok: string, after?: () => void) => { const r = await fn(); onToast(r.ok ? ok : (r as Any).msg); if (r.ok) { onChanged(); after?.() } }
  return <>
    <button className="text-link uzu-back" onClick={onBack}><ArrowLeft size={15} />Équipe</button>
    <ClubHeading eyebrow="MEMBRE DE L'ÉQUIPE" title={m.name} sub={`${ROLE_LBL[m.role] || m.role} · ${STATUS_LBL[m.status] || m.status}`} />
    <div className="uzu-seg uzu-tabs" role="tablist" aria-label="Fiche membre">{MTABS.map((t, i) => <button key={t} role="tab" aria-selected={tab === i} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>{t}</button>)}</div>

    {tab === 0 && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="uzu-belt-head"><span className="uzu-av uzu-av--lg" aria-hidden="true">{initialsOf(m.name)}</span><div><b>{m.name}</b><p className="uzu-text uzu-small uzu-muted">{m.email}</p></div></div>
      <p className="uzu-text">Rôle : <b>{ROLE_LBL[m.role]}</b> · Statut : <span className={`uzu-pill ${m.status === "active" ? "done" : "now"}`}>{STATUS_LBL[m.status]}</span></p>
      <p className="uzu-text uzu-small">Membre depuis le {frDT(m.joined_at)}{m.last_activity ? " · dernière action le " + frDT(m.last_activity) : ""}</p>
      <p className="uzu-text uzu-small">Cours : {(() => { const cs = team.course_staff.filter(x => x.member_id === m.id && !x.date).map(x => { const s = sched.find(y => y.id === x.course_key); return s ? `${s.t} (${DSHORT[s.d - 1]} ${s.s})` : x.course_key }); return cs.length ? cs.join(" · ") : "aucun cours affecté" })()}</p>
      <div className="uzu-actions uzu-actions--start">
        {canD && m.status === "active" && <ConfirmButton label="Suspendre" confirm="Confirmer la suspension" onConfirm={() => run(() => setMemberStatus(m.id, "suspended"), "Membre suspendu")} />}
        {canD && m.status === "suspended" && <ConfirmButton label="Réactiver" confirm="Confirmer" onConfirm={() => run(() => setMemberStatus(m.id, "active"), "Membre réactivé")} />}
        {canD && <ConfirmButton className="button button--outline uzu-small-btn uzu-danger" label="Retirer de l'académie" confirm="Confirmer le retrait" onConfirm={() => run(() => setMemberStatus(m.id, "removed"), "Membre retiré : son historique est conservé", onBack)} />}
        {meOwner && !m.is_me && m.status === "active" && m.role !== "owner" && <ConfirmButton label="Transférer la responsabilité" confirm="Confirmer le transfert" onConfirm={() => run(() => transferOwnership(m.id), "Responsabilité transférée", () => { onReloadCtx(); onBack() })} />}
      </div>
      {m.is_me && <p className="uzu-text uzu-small uzu-muted">C'est toi : tes propres droits ne se modifient pas ici.</p>}
    </section>}

    {tab === 1 && <RoleTab ctx={ctx} team={team} m={m} canU={canU} meOwner={meOwner} onToast={onToast} onChanged={onChanged} />}
    {tab === 2 && <PermTab m={m} canU={canU} onToast={onToast} onChanged={onChanged} />}
    {tab === 3 && <AssignTab ctx={ctx} team={team} m={m} canU={canU} students={students} sched={sched} onToast={onToast} onChanged={onChanged} />}
  </>
}

function RoleTab({ ctx, team, m, canU, meOwner, onToast, onChanged }: { ctx: UzuContext | null; team: Team; m: TeamMember; canU: boolean; meOwner: boolean; onToast: (s: string) => void; onChanged: () => void }) {
  const roles = ["instructor", "assistant", "section_lead", ...(meOwner ? ["owner"] : [])]; if (!roles.includes(m.role)) roles.push(m.role)
  const [role, setRole] = useState(m.role)
  const [sec, setSec] = useState(m.section_id || "")
  const [newSec, setNewSec] = useState("")
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <label className="uzu-label" htmlFor="ms-role">Rôle dans l'académie</label>
    <select id="ms-role" className="uzu-input" disabled={!canU} value={role} onChange={e => setRole(e.target.value)}>{roles.map(r => <option key={r} value={r}>{ROLE_LBL[r]}</option>)}</select>
    <label className="uzu-label" htmlFor="ms-sec">Section (facultatif)</label>
    <select id="ms-sec" className="uzu-input" disabled={!canU} value={sec} onChange={e => setSec(e.target.value)}><option value="">Aucune</option>{team.sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
    {can(ctx, "academy_settings", "update") && <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="ms-newsec">Nouvelle section</label><input id="ms-newsec" className="uzu-input" maxLength={60} placeholder="Ex. : Enfants, Compétition, MMA" value={newSec} onChange={e => setNewSec(e.target.value)} /></div>
      <div className="uzu-field uzu-field--end"><button className="button button--outline uzu-small-btn" onClick={async () => { const n = newSec.trim(); if (!n) { onToast("Donne un nom à la section"); return } const r = await upsertSection(n); onToast(r.ok ? "Section créée" : r.msg); if (r.ok) { setNewSec(""); onChanged() } }}>Créer la section</button></div></div>}
    <p className="uzu-text uzu-small uzu-muted">Le rôle ne change pas les droits à lui seul : après l'enregistrement, tu peux appliquer le modèle du nouveau rôle dans Permissions.</p>
    {canU ? <button className="button button--dark uzu-wide" onClick={async () => { const r = await setMemberRole(m.id, role, sec || null); onToast(r.ok ? "Rôle enregistré" : r.msg); if (r.ok) onChanged() }}>Enregistrer le rôle</button>
      : <p className="uzu-note wait">Tu n'as pas le droit de modifier ce membre.</p>}
  </section>
}

function PermTab({ m, canU, onToast, onChanged }: { m: TeamMember; canU: boolean; onToast: (s: string) => void; onChanged: () => void }) {
  const [draft, setDraft] = useState<PermDraft>(() => JSON.parse(JSON.stringify(m.perms || {})))
  const [dirty, setDirty] = useState(false)
  const [pendingTpl, setPendingTpl] = useState("")
  const [sens, setSens] = useState<{ r: string; a: string }[] | null>(null)
  const [busy, setBusy] = useState(false)
  if (m.role === "owner") return <section className="panel uzu-panel-col"><p className="uzu-note ok">Un responsable a tous les droits de l'académie. Les notes privées des autres profs et les données privées des élèves restent inaccessibles, même pour lui.</p></section>
  const eff = mapToList(draft)
  const change = (d: PermDraft) => { setDraft(d); setDirty(true) }
  const save = async (force: boolean) => {
    const before: Record<string, string> = {}; mapToList(m.perms || {}).forEach(p => { before[p.r + "." + p.a] = p.s })
    const newSens = eff.filter(p => SENSITIVE[p.r + "." + p.a] && before[p.r + "." + p.a] !== p.s)
    if (newSens.length && !force) { setSens(newSens); return }
    setBusy(true); const r = await setMemberPermissions(m.id, eff); setBusy(false); setSens(null)
    if (!r.ok) { onToast(r.msg); return }
    onToast("Droits enregistrés : effectifs immédiatement"); setDirty(false); onChanged()
  }
  if (sens) return <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Confirmer des droits sensibles</h2><ShieldCheck size={17} /></div>
    <p className="uzu-text">Tu accordes à <b>{m.name}</b> :</p><ul className="uzu-text">{sens.map(p => <li key={p.r + p.a}>{PERM_CAT.find(c => c[0] === p.r)?.[1]} : {actLabel(p.r, p.a)}</li>)}</ul>
    <p className="uzu-text uzu-small">Ces droits donnent accès à la gestion de l'académie ou à des validations définitives.</p>
    <div className="uzu-actions uzu-actions--start"><button className="button button--dark" disabled={busy} onClick={() => save(true)}>Confirmer et enregistrer</button><button className="button button--outline" onClick={() => setSens(null)}>Revenir aux droits</button></div></section>
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Gérer les permissions</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Définissez précisément les fonctionnalités auxquelles ce membre peut accéder dans votre académie.</p>
    {canU && <div className="uzu-actions uzu-actions--start">
      <select className="uzu-input uzu-input--auto" aria-label="Modèle" value="" onChange={e => { if (e.target.value) setPendingTpl(e.target.value) }}><option value="">Appliquer un modèle…</option>{Object.keys(TPL_LBL).map(k => <option key={k} value={k}>{TPL_LBL[k]}</option>)}</select>
      <button className="button button--outline uzu-small-btn" onClick={() => change({})}>Tout désactiver</button></div>}
    {pendingTpl && <div className="uzu-note wait">Remplacer les droits par le modèle « {TPL_LBL[pendingTpl]} » ? (rien n'est enregistré avant « Enregistrer »)
      <div className="uzu-actions uzu-actions--start"><button className="button button--dark uzu-small-btn" onClick={() => { change(tplMap(pendingTpl)); setPendingTpl("") }}>Appliquer</button><button className="button button--outline uzu-small-btn" onClick={() => setPendingTpl("")}>Garder les droits actuels</button></div></div>}
    {dirty && <p className="uzu-note wait">Modifications non enregistrées</p>}
    <PermGrid draft={draft} disabled={!canU} onChange={change} />
    <div className="uzu-fiche"><b>Droits effectifs ({eff.length})</b>
      <span className="uzu-small">{eff.length ? eff.map(p => `${PERM_CAT.find(c => c[0] === p.r)?.[1] || p.r} : ${actLabel(p.r, p.a).toLowerCase()}${p.s !== "academy" ? ` (${SCOPE_LBL[p.s].toLowerCase()})` : ""}`).join(" · ") : "Aucun accès : ce membre ne verra que son profil."}</span>
      <span className="uzu-small uzu-muted">Toujours protégés : notes privées des autres profs, données privées des élèves (état physique, notes perso).</span></div>
    {canU ? <div className="uzu-actions uzu-actions--start"><button className="button button--dark" disabled={busy} onClick={() => save(false)}>Enregistrer</button><button className="button button--outline" onClick={() => { setDraft(JSON.parse(JSON.stringify(m.perms || {}))); setDirty(false) }}>Annuler</button></div>
      : <p className="uzu-note wait">Tu n'as pas le droit de modifier ce membre.</p>}
  </section>
}

function AssignTab({ ctx, team, m, canU, students, sched, onToast, onChanged }: { ctx: UzuContext | null; team: Team; m: TeamMember; canU: boolean; students: StudentRow[]; sched: Slot[]; onToast: (s: string) => void; onChanged: () => void }) {
  const [mc, setMc] = useState<MyCourses>({ assigned: [], section: [], staff: [] })
  useEffect(() => { let live = true; getMyCourses().then(x => { if (live) setMc(x) }); return () => { live = false } }, [])
  const init: Record<string, string> = {}; team.course_staff.filter(x => x.member_id === m.id && !x.date).forEach(x => { init[x.course_key] = x.role })
  const [rk, setRk] = useState(init)
  const [given, setGiven] = useState<string[]>(m.students || [])
  const canC = can(ctx, "courses", "manage")
  const studs = useMemo(() => students.slice().sort((a, b) => a.name.localeCompare(b.name, "fr")), [students])
  const saveCourses = async () => {
    const jobs: Promise<{ ok: boolean; msg?: string }>[] = []
    sched.forEach(x => {
      const cur = team.course_staff.filter(c => c.course_key === x.id && !c.date), mine = cur.find(c => c.member_id === m.id), nv = rk[x.id] || ""
      if ((mine ? mine.role : "") === nv) return
      const staff = cur.filter(c => c.member_id !== m.id).map(c => ({ member_id: c.member_id, role: c.role })); if (nv) staff.push({ member_id: m.id, role: nv })
      jobs.push(setCourseStaff(x.id, null, staff))
    })
    if (!jobs.length) { onToast("Aucun changement"); return }
    const rs = await Promise.all(jobs), bad = rs.find(r => !r.ok)
    onToast(bad ? (bad as Any).msg : "Affectations enregistrées"); onChanged()
  }
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Cours encadrés</h2></div>
    {sched.length ? <ul className="uzu-top">{sched.map(x => <li key={x.id}><span><b>{x.t}</b><small>{DSHORT[x.d - 1]} · {x.s} – {x.e}</small></span>
      <select className="uzu-input uzu-input--auto" aria-label={`Rôle sur ${x.t}`} disabled={!(canC && courseAllowed(ctx, mc, "courses", "manage", x.id))} value={rk[x.id] || ""} onChange={e => setRk({ ...rk, [x.id]: e.target.value })}>{STAFF_ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></li>)}</ul>
      : <p className="uzu-text uzu-muted">Aucun cours au planning.</p>}
    {canC && sched.length > 0 && <button className="button button--outline uzu-small-btn" onClick={saveCourses}>Enregistrer les cours</button>}
    <div className="section-title"><h2>Élèves confiés</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Utilisé quand un droit a la portée « Élèves confiés ».</p>
    {studs.length ? <div className="uzu-checks">{studs.map(r => <label key={r.id} className="uzu-check-row"><input type="checkbox" disabled={!canU} checked={given.includes(r.id)} onChange={e => setGiven(g => e.target.checked ? [...g, r.id] : g.filter(x => x !== r.id))} /><span>{r.name}</span></label>)}</div>
      : <p className="uzu-text uzu-muted">Aucun élève.</p>}
    {canU && <button className="button button--outline uzu-small-btn" onClick={async () => { const r = await setStudentAccess(m.id, given); onToast(r.ok ? `${given.length} élève(s) confié(s)` : r.msg); if (r.ok) onChanged() }}>Enregistrer les élèves confiés</button>}
  </section>
}

// ================================================================ Contenus
export function ClubContents({ uid, ctx, onToast, onReloadCtx }: AdminProps) {
  const club = ctx?.club, tf = (club?.tactical_focus || {}) as Any
  const [C, setC] = useState<Any>(null)
  useEffect(() => { import("@/lib/uzu/journal").then(j => setC(j.newCore())) }, [])
  const [focus, setFocus] = useState({ weekTheme: String(tf.weekTheme || ""), focusFrom: String(tf.focusFrom || ""), focusTo: String(tf.focusTo || ""), focusDetails: String(tf.focusDetails || "") })
  const [news, setNews] = useState(String(club?.news || ""))
  const [busy, setBusy] = useState("")
  const save = async (key: string, patch: Record<string, unknown>, ok: string) => { setBusy(key); const r = await updateAcademy(patch); setBusy(""); onToast(r.ok ? ok : r.msg); if (r.ok) onReloadCtx() }
  const canFocus = canAcademy(ctx, "contents", "update"), canNews = can(ctx, "communications", "create") || can(ctx, "communications", "delete")
  const sysOpts = C ? (C.SYS_KEYS as string[]) : []
  return <>
    <ClubHeading eyebrow="CONTENUS" title="Contenus" sub="Focus tactique, actualités et vidéos pour tout le club." />
    {canFocus && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Focus tactique</h2><span className={`uzu-pill ${tf.weekTheme ? "done" : ""}`}>{tf.weekTheme ? "Publié" : "Non publié"}</span></div>
      <p className="uzu-text uzu-small uzu-muted">Ce que tout le club voit en ouvrant l'app. Change-le quand tu veux, sans calendrier.</p>
      <label className="uzu-label" htmlFor="fe-title">Titre du focus</label><input id="fe-title" className="uzu-input" maxLength={100} placeholder="Ex. : Connecter le snap down au front headlock" value={focus.weekTheme} onChange={e => setFocus({ ...focus, weekTheme: e.target.value })} />
      <div className="uzu-row2">
        <div className="uzu-field"><label className="uzu-label" htmlFor="fe-from">Système de départ</label><select id="fe-from" className="uzu-input" value={focus.focusFrom} onChange={e => setFocus({ ...focus, focusFrom: e.target.value })}><option value="">Aucun</option>{sysOpts.map(k => <option key={k} value={k}>{C.SYSTEMS[k].n}</option>)}</select></div>
        <div className="uzu-field"><label className="uzu-label" htmlFor="fe-to">Connecté à</label><select id="fe-to" className="uzu-input" value={focus.focusTo} onChange={e => setFocus({ ...focus, focusTo: e.target.value })}><option value="">Aucun</option>{sysOpts.map(k => <option key={k} value={k}>{C.SYSTEMS[k].n}</option>)}</select></div>
      </div>
      <label className="uzu-label" htmlFor="fe-details">Description (300 caractères max)</label><textarea id="fe-details" className="uzu-input" maxLength={300} rows={3} value={focus.focusDetails} onChange={e => setFocus({ ...focus, focusDetails: e.target.value })} />
      <div className="uzu-actions uzu-actions--start">
        <button className="button button--dark" disabled={!!busy} onClick={() => save("fe", { tactical_focus: { weekTheme: focus.weekTheme.trim().slice(0, 100), focusFrom: focus.focusFrom, focusTo: focus.focusTo, focusDetails: focus.focusDetails.trim().slice(0, 300) } }, "Focus publié pour tout le club")}>Publier le focus</button>
        {tf.weekTheme && <ConfirmButton label="Dépublier" confirm="Confirmer : dépublier" onConfirm={() => { setFocus({ weekTheme: "", focusFrom: "", focusTo: "", focusDetails: "" }); save("fc", { tactical_focus: { weekTheme: "", focusFrom: "", focusTo: "", focusDetails: "" } }, "Focus dépublié") }} />}
      </div>
    </section>}
    {canNews && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Actualités du club</h2><span className={`uzu-pill ${club?.news ? "done" : ""}`}>{club?.news ? "En ligne" : "Aucune"}</span></div>
      <p className="uzu-text uzu-small uzu-muted">Annonce, événement, changement de planning, compétition à venir : affichée sur l'Accueil de tous les élèves.</p>
      <label className="uzu-label" htmlFor="club-news">Annonce (280 caractères max)</label><textarea id="club-news" className="uzu-input" maxLength={280} rows={3} placeholder="Ex. : Stage le samedi 28 novembre ! Pas de cours le 11 novembre." value={news} onChange={e => setNews(e.target.value)} />
      <div className="uzu-actions uzu-actions--start">
        {can(ctx, "communications", "create") && <button className="button button--dark" disabled={!!busy} onClick={() => { const n = news.trim().slice(0, 280); if (!n) { onToast("Écris d'abord ton annonce"); return } save("nw", { news: n }, "Annonce publiée pour tout le club") }}>Publier l'annonce</button>}
        {club?.news && can(ctx, "communications", "delete") && <ConfirmButton label="Retirer" confirm="Confirmer : retirer" onConfirm={() => { setNews(""); save("nc", { news: "" }, "Annonce retirée") }} />}
      </div>
    </section>}
    {(can(ctx, "contents", "create") || can(ctx, "contents", "view")) && C && club && <VideosCard C={C} clubId={club.id} uid={uid} canEdit={ctx?.role === "coach" && can(ctx, "contents", "create")} onToast={onToast} />}
    <ClubLibrarySection ctx={ctx} onToast={onToast} />
  </>
}

// Bibliothèque technique côté club : visible seulement si le script uzu-9 est appliqué et si l'on a un droit
function ClubLibrarySection({ ctx, onToast }: { ctx: UzuContext | null; onToast: (m: string) => void }) {
  const [tick, setTick] = useState(0)
  const [tab, setTab] = useState<ClubTab | "">("")
  const st = useLibrary(ctx, tick)
  if (st.status !== "ok") return null
  const c = st.lib.ctx
  if (!c.can_review && !c.can_manage && !c.can_configure) return null
  return <ClubLibrary key={tick} lib={st.lib} tab={tab} onTab={setTab} onToast={onToast} onChanged={() => setTick(x => x + 1)} />
}

// ================================================================ Mon académie
export function ClubAcademy({ uid, ctx, onToast, onReloadCtx, onNavigate }: AdminProps) {
  const club = ctx?.club, prof = (club?.profile || {}) as Any
  const [f, setF] = useState({ name: club?.name || "", desc: String(prof.desc || ""), addr: String(prof.addr || ""), contact: String(prof.contact || ""), code: club?.invite_code || "", accent: club?.accent_color || "sceau" })
  const [disc, setDisc] = useState<string[]>(Array.isArray(prof.disc) ? prof.disc : [])
  const [busy, setBusy] = useState(false)
  const [audit, setAudit] = useState<Any[] | null>(null)
  const [stats, setStats] = useState<{ n: number; act: number } | null>(null)
  useEffect(() => { if (!can(ctx, "academy_audit_logs", "view")) return; let live = true; getAudit(30, null).then(r => { if (live) setAudit(r.ok ? r.data || [] : []) }); return () => { live = false } }, [ctx])
  useEffect(() => { if (!(can(ctx, "students", "view") || can(ctx, "students", "create"))) return; let live = true; loadClubData(uid).then(d => { if (live) setStats({ n: d.rows.length, act: d.rows.filter(r => r.days <= 14).length }) }, () => {}); return () => { live = false } }, [uid, ctx])
  const save = async () => {
    const ncode = f.code.trim().replace(/\s+/g, "").toUpperCase()
    if (ncode && ncode !== (club?.invite_code || "") && !/^[A-Z0-9-]{6,20}$/.test(ncode)) { onToast("Code invitation : 6 à 20 lettres, chiffres ou tirets"); return }
    if (f.name.trim().length < 2) { onToast("Nom du club trop court"); return }
    setBusy(true)
    if (ncode && ncode !== (club?.invite_code || "")) { const r = await updateInviteCode(ncode); onToast(r.ok ? "Nouveau code invitation : " + ncode : r.msg) }
    const r = await updateAcademy({ name: f.name.trim().slice(0, 60), accent_color: f.accent, profile: { ...((ctx?.club?.profile || {}) as Record<string, unknown>), desc: f.desc.trim().slice(0, 300), addr: f.addr.trim().slice(0, 120), contact: f.contact.trim().slice(0, 80), disc: disc.slice(0, 12) } })
    setBusy(false); onToast(r.ok ? "Informations du club enregistrées" : r.msg); onReloadCtx()
  }
  const audLine = (a: Any) => { const d = a.details || {}; return a.action === "attendance.saved" ? `${d.present || 0} présent(s), ${d.absent || 0} absent(s)` : a.action === "invitation.created" ? String(d.email || "") : a.action === "member.role_changed" ? `${ROLE_LBL[d.from] || ""} → ${ROLE_LBL[d.to] || ""}` : a.action.indexOf("grade.") === 0 ? String(d.rank || "") : "" }
  return <>
    <ClubHeading eyebrow="MON ACADÉMIE" title="Mon académie" sub="Identité, élèves, paramètres et journal d'activité." />
    {can(ctx, "academy_settings", "update") && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Informations générales</h2></div>
      <label className="uzu-label" htmlFor="ac-name">Nom du club</label><input id="ac-name" className="uzu-input" maxLength={60} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label className="uzu-label" htmlFor="ac-desc">Présentation (300 caractères max)</label><textarea id="ac-desc" className="uzu-input" maxLength={300} rows={3} placeholder="Ex. : Académie de JJB et grappling, cours enfants et adultes, compétition et loisir." value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} />
      <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="ac-addr">Adresse</label><input id="ac-addr" className="uzu-input" maxLength={120} value={f.addr} onChange={e => setF({ ...f, addr: e.target.value })} /></div>
        <div className="uzu-field"><label className="uzu-label" htmlFor="ac-contact">Contact du club</label><input id="ac-contact" className="uzu-input" maxLength={80} value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></div></div>
      <span className="uzu-label">Disciplines enseignées</span>
      <div className="uzu-chips">{DISCIPLINES.map(([k, l]) => <button key={k} type="button" className={disc.includes(k) ? "on" : ""} aria-pressed={disc.includes(k)} onClick={() => setDisc(d => d.includes(k) ? d.filter(x => x !== k) : [...d, k])}>{l}</button>)}</div>
      <label className="uzu-label" htmlFor="ac-code">Code invitation des élèves</label><input id="ac-code" className="uzu-input" maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Ex. : TEAM2026" value={f.code} onChange={e => setF({ ...f, code: e.target.value })} />
      <span className="uzu-text uzu-small uzu-muted">À donner à tes élèves pour qu'ils rejoignent le club. Change-le pour couper les inscriptions avec l'ancien code.</span>
      <span className="uzu-label">Couleur d'accent</span>
      <div className="uzu-chips">{Object.keys(PRESETS).map(k => <button key={k} type="button" className={f.accent === k ? "on" : ""} aria-pressed={f.accent === k} onClick={() => setF({ ...f, accent: k })}><i className="uzu-swatch" style={{ background: PRESETS[k].l }} />{PRESETS[k].n}</button>)}</div>
      <button className="button button--dark uzu-wide" disabled={busy} onClick={save}>Enregistrer les informations du club</button>
    </section>}

    {(can(ctx, "students", "view") || can(ctx, "students", "create")) && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Élèves et code invitation</h2></div>
      <p className="uzu-text">{stats ? <><b>{stats.n}</b> élève{stats.n > 1 ? "s" : ""} rattaché{stats.n > 1 ? "s" : ""} · {stats.act} actif{stats.act > 1 ? "s" : ""} · {stats.n - stats.act} à relancer</> : "…"}</p>
      {can(ctx, "students", "create") && <InvitePanel code={club?.invite_code || ""} clubName={club?.name || ""} />}
      {can(ctx, "students", "view") && <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("students")}>Voir la liste</button>}
    </section>}

    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Paramètres</h2></div>
      <div className="uzu-actions uzu-actions--start">
        {ctx?.academy_role !== "owner" && <ConfirmButton className="button button--outline uzu-small-btn uzu-danger" label={<><LogOut size={14} />Quitter cette académie</>} confirm="Confirmer : quitter" onConfirm={async () => { const r = await leaveAcademy(); if (!r.ok) { onToast(r.msg); return } window.location.reload() }} />}
      </div>
    </section>
    {can(ctx, "students", "delete") && <ReportsCard onToast={onToast} onNavigate={onNavigate} />}
    {can(ctx, "academy_statistics", "view") && <BilanCard uid={uid} clubName={club?.name || "Club"} />}

    {can(ctx, "academy_audit_logs", "view") && <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Journal d'activité</h2></div>
      {audit === null ? <p className="uzu-text uzu-muted">Chargement…</p> : audit.length ? <ul className="uzu-top">{audit.map(a => <li key={a.id}><span><b>{AUDIT_LBL[a.action] || a.action}</b><small>{a.actor || ""}{audLine(a) ? " · " + audLine(a) : ""}</small></span><small>{frDT(a.at)}</small></li>)}</ul>
        : <p className="uzu-text uzu-muted">Aucune action enregistrée pour l'instant.</p>}
    </section>}
  </>
}


// Signalements du fil : examinés par le responsable (ou l'équipe autorisée à retirer un élève)
function ReportsCard({ onToast, onNavigate }: { onToast: (m: string) => void; onNavigate: (id: string) => void }) {
  const [list, setList] = useState<Report[] | null>(null)
  const [err, setErr] = useState("")
  const [showAll, setShowAll] = useState(false)
  const [tick, setTick] = useState(0)
  useEffect(() => { let live = true; listReports().then(r => { if (!live) return; if (r.ok) { setList(r.data); setErr("") } else { setList([]); setErr(r.msg) } }); return () => { live = false } }, [tick])
  const open = (list || []).filter(r => r.status === "open"), done = (list || []).filter(r => r.status !== "open")
  const act = async (id: string, st: "resolved" | "dismissed" | "open") => { const r = await resolveReport(id, st); onToast(r.ok ? (st === "resolved" ? "Signalement traité" : st === "dismissed" ? "Signalement classé sans suite" : "Signalement rouvert") : r.msg); if (r.ok) setTick(t => t + 1) }
  const row = (r: Report) => <li key={r.id} className="uzu-report-row">
    <div><b>{r.target_name || "Membre"}</b> · {reasonLabel(r.reason)}
      {r.item_text && <small>Publication : {r.item_text}</small>}
      {r.details && <small>« {r.details} »</small>}
      <small>Signalé par {r.reporter} · {frDT(r.at)}{r.status !== "open" ? ` · ${r.status === "resolved" ? "traité" : "sans suite"}` : ""}</small></div>
    <div className="uzu-actions uzu-actions--start">
      {r.status === "open" ? <>
        <button className="button button--dark uzu-small-btn" onClick={() => act(r.id, "resolved")}>Traité</button>
        <button className="button button--outline uzu-small-btn" onClick={() => act(r.id, "dismissed")}>Sans suite</button>
        {r.target_id && <button className="button button--outline uzu-small-btn" onClick={() => onNavigate("students")}>Voir les élèves</button>}
      </> : <button className="button button--outline uzu-small-btn" onClick={() => act(r.id, "open")}>Rouvrir</button>}
    </div></li>
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Signalements du fil">
    <div className="section-title"><h2>Signalements du fil{open.length ? ` (${open.length})` : ""}</h2><Flag size={17} /></div>
    <p className="uzu-text uzu-small uzu-muted">Les membres peuvent signaler une publication du fil. Examine-la, parles-en avec le membre concerné et, si besoin, retire-le de l&apos;académie depuis la liste des élèves.</p>
    {err ? <p className="uzu-note wait" role="alert">{err}</p> : list === null ? <p className="uzu-text uzu-muted">Chargement…</p>
      : open.length ? <ul className="uzu-report-list">{open.map(row)}</ul> : <p className="uzu-text">Aucun signalement en attente.</p>}
    {done.length > 0 && <>
      <button className="button button--outline uzu-small-btn" aria-expanded={showAll} onClick={() => setShowAll(v => !v)}>{showAll ? "Masquer les signalements traités" : `Voir les signalements traités (${done.length})`}</button>
      {showAll && <ul className="uzu-report-list">{done.map(row)}</ul>}</>}
  </section>
}

// Vidéos pédagogiques : une par emplacement (focus tactique, chaque système), même stockage que l'ancienne application
function VideosCard({ C, clubId, uid, canEdit, onToast }: { C: Any; clubId: string; uid: string; canEdit: boolean; onToast: (m: string) => void }) {
  const slots = videoSlots(C)
  const [vids, setVids] = useState<VideoMap>({})
  const [slot, setSlot] = useState(slots[0].k)
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [tick, setTick] = useState(0)
  const [inputKey, setInputKey] = useState(0)
  useEffect(() => { let live = true; loadVideos(clubId).then(v => { if (live) setVids(v) }); return () => { live = false } }, [clubId, tick])
  const send = async () => {
    if (!file) { onToast("Choisis d'abord une vidéo"); return }
    const c = checkVideo(file); if ("msg" in c) { onToast(c.msg); return }
    setBusy(true); const r = await uploadVideo(clubId, slot, file, uid, vids[slot]?.id); setBusy(false)
    onToast(r.ok ? "Vidéo ajoutée" : r.msg); if (r.ok) { setFile(null); setInputKey(k => k + 1); setTick(t => t + 1) }
  }
  const have = slots.filter(x => vids[x.k]?.id)
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Vidéos pédagogiques</h2></div>
    <p className="uzu-text uzu-small uzu-muted">{canEdit ? "Une vidéo courte (30 à 60 s filmées au téléphone, MP4 ou WebM, 50 Mo maximum) pour le focus tactique ou pour chaque système. Les élèves la voient sur leur Accueil ou dans Techniques." : "L'envoi de vidéos est réservé au responsable de l'académie."}</p>
    {canEdit && <>
      <label className="uzu-label" htmlFor="v-slot">Pour</label>
      <select id="v-slot" className="uzu-input" value={slot} onChange={e => setSlot(e.target.value)}>{slots.map(x => <option key={x.k} value={x.k}>{x.label}{vids[x.k]?.id ? " (vidéo en ligne)" : ""}</option>)}</select>
      <label className="uzu-label" htmlFor="v-file">Vidéo</label>
      <input key={inputKey} id="v-file" type="file" className="uzu-input" accept="video/mp4,video/webm,video/quicktime" onChange={e => setFile(e.target.files?.[0] || null)} />
      <button className="button button--dark" disabled={busy} onClick={send}>{busy ? "Envoi en cours…" : "Envoyer la vidéo"}</button></>}
    {have.length ? <ul className="uzu-top">{have.map(x => <li key={x.k}><span>{x.label}</span>
      {canEdit && <ConfirmButton label="Retirer" confirm="Confirmer" onConfirm={async () => { const r = await removeVideo(clubId, x.k, vids[x.k].id); onToast(r.ok ? "Vidéo retirée" : r.msg); if (r.ok) setTick(t => t + 1) }} />}</li>)}</ul>
      : <p className="uzu-text uzu-muted">Aucune vidéo pour l'instant.</p>}
  </section>
}

// Bilan d'activité et subventions : statistiques agrégées et anonymes de la saison, imprimables en PDF
function BilanCard({ uid, clubName }: { uid: string; clubName: string }) {
  const [rows, setRows] = useState<StudentRow[] | null>(null)
  const [C, setC] = useState<Any>(null)
  const [show, setShow] = useState(false)
  const [season, setSeason] = useState(() => seasonYear(new Date()))
  useEffect(() => { let live = true; loadClubData(uid).then(d => { if (live) { setRows(d.rows); setC(d.C) } }, () => { if (live) setRows([]) }); return () => { live = false } }, [uid])
  const cur = seasonYear(new Date()), opts = [cur, cur - 1, cur - 2, cur - 3]
  const print = () => {
    setShow(true)
    window.setTimeout(() => {
      document.body.classList.add("uzu-print-bilan")
      const done = () => { document.body.classList.remove("uzu-print-bilan"); window.removeEventListener("afterprint", done) }
      window.addEventListener("afterprint", done)
      try { window.print() } catch { /* impression indisponible */ }
      window.setTimeout(done, 60000)
    }, 50)
  }
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Bilan d'activité et subventions</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Statistiques agrégées et anonymes de la saison, prêtes à annexer à un dossier ANS, mairie ou département. Aucun nom, aucune donnée de santé.</p>
    <label className="uzu-label" htmlFor="b-season">Saison sportive</label>
    <select id="b-season" className="uzu-input" value={season} onChange={e => setSeason(+e.target.value)}>{opts.map(y => <option key={y} value={y}>Saison {y}-{y + 1}{y === cur ? " (en cours)" : ""}</option>)}</select>
    <div className="uzu-actions uzu-actions--start"><button className="button button--dark" onClick={print}>Imprimer / Exporter (PDF)</button><button className="button button--outline" onClick={() => setShow(v => !v)}>{show ? "Masquer l'aperçu" : "Voir l'aperçu du bilan"}</button></div>
    <p className="uzu-text uzu-small uzu-muted">Sur téléphone, choisis « Enregistrer en PDF » ou « Partager » dans la fenêtre d'impression.</p>
    {show && (rows === null || !C ? <p className="uzu-text uzu-muted">Chargement des données du club…</p> : <BilanSheet C={C} rows={rows} season={season} clubName={clubName} />)}
  </section>
}

function BilanSheet({ C, rows, season, clubName }: { C: Any; rows: StudentRow[]; season: number; clubName: string }) {
  const se = seasonOf(C, season), o = bilanCalc(C, rows, se)
  const pct = (n: number, t: number) => (t ? Math.round(n / t * 100) : 0), nfr = (n: number) => String(n).replace(".", ",")
  const head = <div className="uzu-bl-head"><div className="eyebrow">BILAN D'ACTIVITÉ · SAISON {se.label}</div><h3>{clubName}</h3>
    <span className="uzu-text uzu-small uzu-muted">Période : du {C.frDate(se.from)} au {C.frDate(se.closed ? se.to : se.until)}{se.closed ? "" : " (saison en cours)"} · Document généré le {C.frDate(C.ymd(C.TODAY))}</span></div>
  if (!o.inscrits) return <div className="uzu-bilan">{head}<p className="uzu-text uzu-muted">Aucun adhérent inscrit dans UZU pour l'instant. Le bilan se remplit dès que tes élèves saisissent leurs séances.</p></div>
  if (!o.actifs) return <div className="uzu-bilan">{head}<p className="uzu-text uzu-muted">Aucune séance enregistrée sur cette saison. Choisis une autre saison ou reviens quand tes élèves auront saisi leurs séances.</p></div>
  const tm = o.medals.or + o.medals.argent + o.medals.bronze, gr = o.ceintures + o.barrettes, s = (n: number, w: string) => w + (n > 1 ? "s" : "")
  const sx: [string, string][] = ([["h", "Hommes"], ["f", "Femmes"], ["a", "Autre"], ["n", "Non renseigné"]] as [string, string][]).filter(x => o.sex[x[0]])
  const prow: [string, string][] = (C.AGES as Any[]).slice().reverse().map(a => [a.k, a.n] as [string, string]); if (o.pyr.nr.h + o.pyr.nr.f + o.pyr.nr.a + o.pyr.nr.n) prow.push(["nr", "Non renseigné"])
  let mx = 1; prow.forEach(x => { const p = o.pyr[x[0]]; mx = Math.max(mx, p.h, p.f) })
  const bk = (C.BELTS as Any[]).filter(b => o.byBelt[b.k])
  return <div className="uzu-bilan">{head}
    <div className="uzu-bl-kpis">
      <div><b>{o.actifs}</b><span>{s(o.actifs, "adhérent")} {s(o.actifs, "actif")}<br />sur {o.inscrits} inscrits</span></div>
      <div><b>{pct(o.sex.f, o.actifs)} %</b><span>de femmes<br />({o.sex.f} sur {o.actifs})</span></div>
      <div><b>{o.hours.toLocaleString("fr-FR")} h</b><span>heures de tapis<br />({o.sessions.toLocaleString("fr-FR")} séances)</span></div>
      <div><b>{nfr(o.perWeek)}</b><span>séances par adhérent<br />et par semaine</span></div>
      <div><b>{gr}</b><span>{s(gr, "grade")} {s(gr, "délivré")}<br />({o.ceintures} {s(o.ceintures, "ceinture")}, {o.barrettes} {s(o.barrettes, "barrette")})</span></div>
      <div><b>{tm}</b><span>{s(tm, "médaille")}<br />({o.medals.or} or, {o.medals.argent} argent, {o.medals.bronze} bronze)</span></div>
    </div>
    <h4>Répartition par sexe (adhérents actifs)</h4>
    <div className="uzu-sexbar" role="img" aria-label="Répartition par sexe">{sx.map(x => <span key={x[0]} className={`sx-${x[0]}`} style={{ width: `${o.sex[x[0]] / o.actifs * 100}%` }} />)}</div>
    <div className="uzu-sexleg">{sx.map(x => <span key={x[0]}><i className={`sx-${x[0]}`} />{x[1]} : <b>{o.sex[x[0]]}</b> ({pct(o.sex[x[0]], o.actifs)} %)</span>)}</div>
    <h4>Pyramide des âges</h4>
    <div className="uzu-pyr"><div className="uzu-pyr-row uzu-pyr-head"><span>Hommes</span><span>Âge</span><span>Femmes</span></div>
      {prow.map(x => { const p = o.pyr[x[0]]; return <div key={x[0]} className="uzu-pyr-row"><div className="uzu-pyr-l"><b>{p.h}</b><span className="sx-h" style={{ width: `${p.h / mx * 100}%` }} /></div><div className="uzu-pyr-c">{x[1]}</div><div className="uzu-pyr-r"><span className="sx-f" style={{ width: `${p.f / mx * 100}%` }} /><b>{p.f}</b></div></div> })}</div>
    <table className="uzu-bl-table"><thead><tr><th>Tranche d'âge</th><th>Hommes</th><th>Femmes</th><th>Autre / NR</th><th>Total</th></tr></thead>
      <tbody>{prow.map(x => { const p = o.pyr[x[0]]; return <tr key={x[0]}><td>{x[1]}</td><td>{p.h}</td><td>{p.f}</td><td>{p.a + p.n}</td><td>{p.h + p.f + p.a + p.n}</td></tr> })}</tbody>
      <tfoot><tr><td>Total</td><td>{o.sex.h}</td><td>{o.sex.f}</td><td>{o.sex.a + o.sex.n}</td><td>{o.actifs}</td></tr></tfoot></table>
    <h4>Activité sur le tapis</h4>
    <table className="uzu-bl-table"><tbody>
      <tr><td>Séances enregistrées</td><td>{o.sessions.toLocaleString("fr-FR")}</td></tr><tr><td>Volume d'heures de tapis</td><td>{o.hours.toLocaleString("fr-FR")} h</td></tr>
      <tr><td>Assiduité moyenne (séances par adhérent actif et par semaine)</td><td>{nfr(o.perWeek)}</td></tr><tr><td>Assiduité moyenne (séances par adhérent actif et par mois)</td><td>{nfr(o.perMonth)}</td></tr>
      <tr><td>Semaines couvertes par la période</td><td>{se.weeks}</td></tr></tbody></table>
    <h4>Grades délivrés par l'encadrement</h4>
    {bk.length ? <table className="uzu-bl-table"><thead><tr><th>Ceinture</th><th>Passages de ceinture</th><th>Barrettes</th></tr></thead>
      <tbody>{bk.map(b => <tr key={b.k}><td>Ceinture {b.n}</td><td>{o.byBelt[b.k].c}</td><td>{o.byBelt[b.k].b}</td></tr>)}</tbody><tfoot><tr><td>Total</td><td>{o.ceintures}</td><td>{o.barrettes}</td></tr></tfoot></table>
      : <p className="uzu-text uzu-muted">Aucun grade délivré sur la période.</p>}
    <h4>Compétitions</h4>
    {o.parts ? <table className="uzu-bl-table"><tbody><tr><td>Compétiteurs engagés</td><td>{o.competiteurs}</td></tr><tr><td>Participations</td><td>{o.parts}</td></tr><tr><td>Médailles d'or</td><td>{o.medals.or}</td></tr><tr><td>Médailles d'argent</td><td>{o.medals.argent}</td></tr><tr><td>Médailles de bronze</td><td>{o.medals.bronze}</td></tr><tr><td>Combats gagnés / perdus</td><td>{o.wins} / {o.losses}</td></tr></tbody></table>
      : <p className="uzu-text uzu-muted">Aucune compétition saisie sur la période.</p>}
    <p className="uzu-text uzu-small uzu-muted">Méthode : adhérent actif = au moins une séance de tapis enregistrée sur la période (la préparation physique n'est pas comptée). Séances et compétitions saisies par les adhérents dans UZU ou notées à l'appel ; grades validés par l'encadrement. Données agrégées et anonymes : aucune donnée nominative ni de santé.</p>
    <div className="uzu-bl-sign"><div>Fait à ………………………, le ……………</div><div>Signature du président ou de la présidente et cachet du club</div></div>
  </div>
}
