"use client"
// Espace Club — liste des élèves et fiche élève (profil, progression, assiduité, historique, notes pédagogiques).
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, Download, Search, Trash2, UserPlus } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { can } from "@/lib/uzu/permissions"
import { addNote, assidOf, deleteNote, listNotes, removeStudent, reqText, verifyTechnique, type ClubData, type Note, type StudentRow } from "@/lib/uzu/club"
import { BeltMark, Bar, Stars, TopList } from "@/components/uzu/progress"
import { ClubHeading, ClubLoading, GrantForm, InvitePanel, initialsOf, normTxt, useClub, type ClubProps } from "@/components/uzu/club"
import { StudentGroupsPanel } from "@/components/uzu/class-journal"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const RESULT: Record<string, string> = { or: "Or", argent: "Argent", bronze: "Bronze", aucun: "Sans podium" }
const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`

// ---------------------------------------------------------------- Liste
export function ClubStudents({ uid, ctx, onToast, initialFilter }: ClubProps & { initialFilter?: string }) {
  const { data, error, reload } = useClub(uid, ctx)
  const [open, setOpen] = useState("")
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState(initialFilter === "active" || initialFilter === "late" ? initialFilter : "all")
  const [belt, setBelt] = useState("")
  const [sort, setSort] = useState("activity")
  const [invite, setInvite] = useState(false)

  const shown = useMemo(() => {
    if (!data) return []
    const C = data.C, nq = normTxt(q.trim())
    const L = data.rows.filter(r => { const late = r.days > 14; return (filter === "all" || (filter === "late" ? late : !late)) && (!belt || r.belt.rank === belt) && (!nq || normTxt(r.name).includes(nq)) })
    return L.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "fr")
      if (sort === "belt") return (C.beltIdx(b.belt.rank) - C.beltIdx(a.belt.rank)) || (b.belt.stripes - a.belt.stripes) || a.name.localeCompare(b.name, "fr")
      if (sort === "n30") return (b.n30 - a.n30) || (a.days - b.days)
      return a.days - b.days
    })
  }, [data, q, filter, belt, sort])

  if (!data) return <><ClubHeading eyebrow="ÉLÈVES" title="Mes élèves" sub="Chargement…" /><ClubLoading error={error} onRetry={reload} /></>
  const st = open ? data.rows.find(r => r.id === open) : null
  if (st) return <StudentSheet uid={uid} ctx={ctx} data={data} st={st} onBack={() => { setOpen(""); window.scrollTo(0, 0) }} onToast={onToast} onChanged={reload} />
  const C = data.C, rows = data.rows, warn = rows.filter(r => r.days > 14).length, act = rows.length - warn
  const bc: Record<string, number> = {}; rows.forEach(r => { bc[r.belt.rank] = (bc[r.belt.rank] || 0) + 1 })
  return <>
    <ClubHeading eyebrow="ÉLÈVES" title="Mes élèves" sub={`${pl(rows.length, "élève")} · ${pl(act, "actif")}`}>
      {can(ctx, "students", "create") && <button className="button button--dark" onClick={() => setInvite(v => !v)}><UserPlus size={15} />Ajouter un élève</button>}
    </ClubHeading>
    {invite && <section className="panel uzu-panel-col"><InvitePanel code={ctx?.club?.invite_code || ""} clubName={ctx?.club?.name || ""} /></section>}
    <section className="panel uzu-panel-col uzu-grid-gap">
      <span className="uzu-search"><Search size={15} /><input type="search" className="uzu-input" placeholder="Rechercher par nom" aria-label="Rechercher un élève" value={q} onChange={e => setQ(e.target.value)} /></span>
      <div className="uzu-seg" role="group" aria-label="Filtrer">{[["all", "Tous"], ["active", "Actifs"], ["late", `À relancer (${warn})`]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <div className="uzu-row2">
        <select className="uzu-input" aria-label="Filtrer par ceinture" value={belt} onChange={e => setBelt(e.target.value)}><option value="">Toutes les ceintures</option>{(C.BELTS as Any[]).filter(b => bc[b.k]).map(b => <option key={b.k} value={b.k}>{b.n.charAt(0).toUpperCase() + b.n.slice(1)} ({bc[b.k]})</option>)}</select>
        <select className="uzu-input" aria-label="Trier la liste" value={sort} onChange={e => setSort(e.target.value)}><option value="activity">Activité récente</option><option value="name">Ordre alphabétique</option><option value="belt">Ceinture</option><option value="n30">Séances sur 30 jours</option></select>
      </div>
      <button className="button button--outline uzu-small-btn" disabled={!shown.length} onClick={() => exportCsv(C, shown, ctx?.club?.name || "club", onToast)}><Download size={14} />Exporter {shown.length === rows.length ? "la liste" : pl(shown.length, "élève")} (CSV)</button>
    </section>
    {!rows.length ? <p className="uzu-text uzu-muted uzu-grid-gap">Aucun élève pour l'instant. Chaque élève apparaît ici dès qu'il a rejoint le club avec ton code invitation.</p>
      : !shown.length ? <p className="uzu-text uzu-muted uzu-grid-gap">Aucun élève ne correspond à ta recherche.</p>
      : <div className="uzu-plist uzu-grid-gap">{shown.map(r => { const late = r.days > 14, ld = lastDate(r); return <button key={r.id} className="uzu-pcard" onClick={() => { setOpen(r.id); window.scrollTo(0, 0) }}>
        <span className="uzu-av" aria-hidden="true">{initialsOf(r.name)}</span>
        <span className="uzu-pc-main"><b>{r.name}</b><span className="uzu-inline-belt"><BeltMark rank={r.belt.rank} stripes={r.belt.stripes} size={34} />{C.beltShort(r.belt)}</span><small>{pl(r.n30, "séance")} / 30 j · {ld ? "dernière le " + C.frShort(ld) : "aucune séance"}</small></span>
        <span className={`uzu-pill ${late ? "now" : "done"}`}>{late ? "À relancer" : "Actif"}</span></button> })}</div>}
    <p className="uzu-text uzu-small uzu-muted uzu-grid-gap">« À relancer » : aucune séance depuis plus de 14 jours. Touche un élève pour ouvrir sa fiche.</p>
  </>
}

const lastDate = (r: StudentRow) => (r.sess.length ? r.sess.map((x: Any) => x.date).sort().pop() : "")

function exportCsv(C: Any, rows: StudentRow[], clubName: string, onToast: (m: string) => void) {
  const cell = (v: unknown) => { let s = v == null ? "" : String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  const frNum = (d: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ""); return m ? `${m[3]}/${m[2]}/${m[1]}` : "" }
  const head = ["Élève", "Ceinture", "Barrettes", "À ce grade depuis", "Système le plus maîtrisé", "Heures de tapis", "Séances (30 j)", "Dernière séance", "Jours sans séance", "Statut", "Techniques à 3 étoiles", "Maîtrise des systèmes (%)", "Or", "Argent", "Bronze", "Demande de grade en attente"]
  const lines = [head.map(cell).join(";")]
  rows.forEach(r => {
    const bn = C.BELTS[C.beltIdx(r.belt.rank)].n, k = C.topSys(r.P, r.ver || {})
    lines.push([r.name, bn.charAt(0).toUpperCase() + bn.slice(1), r.belt.stripes || 0, frNum(r.belt.since), k ? C.SYSTEMS[k].n : "", String(r.hours || 0).replace(".", ","), r.n30 || 0, frNum(lastDate(r)), r.days < 999 ? r.days : "", r.days > 14 ? "À relancer" : "Actif", r.stars3 || 0, r.mast || 0, r.medals.or, r.medals.argent, r.medals.bronze, r.req ? reqText(C, r.belt, r.req) : ""].map(cell).join(";"))
  })
  const csv = "﻿" + lines.join("\r\n") + "\r\n"
  const fn = "eleves-" + clubName.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + C.ymd(C.TODAY) + ".csv"
  try {
    const u = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), a = document.createElement("a")
    a.href = u; a.download = fn; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000)
    onToast("Fichier CSV téléchargé")
  } catch { onToast("Téléchargement impossible sur cet appareil") }
}

// ---------------------------------------------------------------- Fiche élève
const TABS = ["Profil", "Progression", "Assiduité", "Historique", "Notes"]

function StudentSheet({ uid, ctx, data, st, onBack, onToast, onChanged }: { uid: string; ctx: UzuContext | null; data: ClubData; st: StudentRow; onBack: () => void; onToast: (m: string) => void; onChanged: () => void }) {
  const [tab, setTab] = useState(0)
  const [grant, setGrant] = useState(false)
  const [confirmRm, setConfirmRm] = useState(false)
  const [busy, setBusy] = useState("")
  const C = data.C, P = st.P, sess: Any[] = P.sessions
  const srt = sess.slice().sort((a, b) => (a.date < b.date ? 1 : -1)), last = srt[0], g = st.grade
  const k = C.topSys(P)
  const approve = can(ctx, "belts", "approve"), propose = can(ctx, "belts", "create")
  useEffect(() => { if (!confirmRm) return; const t = setTimeout(() => setConfirmRm(false), 4000); return () => clearTimeout(t) }, [confirmRm])
  const rm = async () => {
    if (!confirmRm) { setConfirmRm(true); return }
    setBusy("rm"); const r = await removeStudent(st.id); setBusy("")
    if (!r.ok) { onToast(r.msg); return }
    onToast("Élève retiré de l'académie : ses données lui restent"); onBack(); onChanged()
  }
  const verify = async (tech: string, on: boolean) => {
    setBusy("v" + tech); const r = await verifyTechnique(st.id, tech, on); setBusy("")
    onToast(r.ok ? (on ? "★★★ validée : définitive pour l'élève" : "★★★ retirée") : r.msg); if (r.ok) onChanged()
  }
  return <>
    <button className="text-link uzu-back" onClick={onBack}><ArrowLeft size={15} />Tous les élèves</button>
    <ClubHeading eyebrow="FICHE ÉLÈVE" title={st.name} sub={`${C.beltLabel(st.belt)}, ${C.stripesTxt(st.belt.stripes)}`} />
    <div className="uzu-seg uzu-tabs" role="tablist" aria-label="Fiche élève">{TABS.map((t, i) => <button key={t} role="tab" aria-selected={tab === i} className={tab === i ? "on" : ""} onClick={() => setTab(i)}>{t}</button>)}</div>

    {tab === 0 && <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="uzu-belt-head"><BeltMark rank={st.belt.rank} stripes={st.belt.stripes} size={72} /><div><b>{C.beltLabel(st.belt)}, {C.stripesTxt(st.belt.stripes)}</b>
        <p className="uzu-text uzu-small">{st.belt.since ? "À ce grade depuis " + C.duration(st.belt.since) : "Date de passage non renseignée"}{k ? " · Système fort : " + C.SYSTEMS[k].n : ""}</p></div></div>
      <div className="uzu-counts uzu-counts--4"><div><b>{st.hours} h</b><small>de tapis au total</small></div><div><b>{st.n30}</b><small>séances sur 30 jours</small></div><div><b>{st.stars3}</b><small>techniques à 3 étoiles</small></div><div><b>{st.mast} %</b><small>maîtrise des systèmes</small></div></div>
      <StudentGroupsPanel ctx={ctx} user={st.id} onToast={onToast} />
      <p className="uzu-text">Médailles : <b>{st.medals.or} or · {st.medals.argent} argent · {st.medals.bronze} bronze</b></p>
      {st.req && <p className="uzu-note wait">Demande en attente : {reqText(C, st.belt, st.req)}</p>}
      {g && g.decidedAt && <p className="uzu-text uzu-small uzu-muted">Dernière décision : {g.status || "validé"} le {C.frDate(String(g.decidedAt).slice(0, 10))}{g.comment ? ` · « ${g.comment} »` : ""}</p>}
      <div className="uzu-actions uzu-actions--start">
        {(approve || propose) && <button className="button button--dark uzu-small-btn" onClick={() => setGrant(v => !v)}>{approve ? "Attribuer un grade" : "Proposer un grade"}</button>}
        {can(ctx, "students", "delete") && <button className="button button--outline uzu-small-btn uzu-danger" disabled={busy === "rm"} onClick={rm}><Trash2 size={14} />{confirmRm ? "Confirmer le retrait" : "Retirer de l'académie"}</button>}
      </div>
      {confirmRm && <p className="uzu-text uzu-small uzu-muted">L'élève garde son compte et tout son historique ; il quitte seulement cette académie.</p>}
      {grant && <GrantForm C={C} rows={[st]} fixed={st.id} approve={approve} onToast={onToast} onDone={() => { setGrant(false); onChanged() }} />}
    </section>}

    {tab === 1 && <ProgressTab C={C} st={st} canVerify={can(ctx, "progression", "update")} busy={busy} onVerify={verify} />}

    {tab === 2 && (() => { const as = assidOf(C, ctx?.club?.schedule, st.att, sess, ctx?.club), lim = C.ymd(C.addDays(C.TODAY, -30)), mix: Record<string, number> = {}; let n = 0
      sess.forEach(x => { if (x.date > lim) { const kk = C.kindOf(x); mix[kk] = (mix[kk] || 0) + 1; n++ } })
      return <section className="panel uzu-panel-col uzu-grid-gap">
        <p className="uzu-text">Dernière séance : <b>{last ? C.frDate(last.date) : "aucune"}</b> {st.days > 14 && <span className="uzu-pill now">À relancer</span>}</p>
        <p className="uzu-text">Séances sur 30 jours : <b>{st.n30}</b></p>
        {as.tot ? <p className="uzu-text">Assiduité aux cours du planning (30 jours) : <b>{as.pr} cours sur {as.tot} ({Math.round(as.pr / as.tot * 100)} %)</b></p> : <p className="uzu-text uzu-muted">Assiduité : ajoute le planning des cours pour la calculer.</p>}
        <span className="uzu-sublabel">Répartition sur 30 jours</span>
        {n ? <div className="uzu-chips uzu-chips--static">{Object.keys(mix).map(kk => <span key={kk} className="uzu-pill">{C.KINDS[kk]?.n || kk} · {mix[kk]}</span>)}</div> : <p className="uzu-text uzu-muted">Aucune séance sur les 30 derniers jours.</p>}
      </section> })()}

    {tab === 3 && <section className="panel uzu-panel-col uzu-grid-gap">
      <span className="uzu-sublabel">Historique des grades</span>
      {st.hist.length ? <ul className="uzu-top">{st.hist.slice().reverse().slice(0, 10).map((h: Any, i: number) => <li key={i}><span>{C.beltShort(h)}<small>{C.frDate(String(h.at || "").slice(0, 10))}</small></span><span className={`uzu-pill ${h.status === "refusé" ? "now" : "done"}`}>{h.status === "refusé" ? "Refusé" : "Validé"}</span></li>)}</ul>
        : <p className="uzu-text uzu-muted">Aucune décision de grade enregistrée.</p>}
      <span className="uzu-sublabel">Dernières séances</span>
      {srt.length ? <ul className="uzu-top">{srt.slice(0, 8).map((x: Any) => <li key={x.id}><span>{x.theme || C.KINDS[C.kindOf(x)]?.n || "Séance"}{x.stars ? " " + "★".repeat(+x.stars) : ""}{x.roll && <em className="uzu-rolltag">Appel</em>}<small>{C.frShort(x.date)}{C.isPrepa(x) ? "" : " · " + (x.type || "Gi")}</small>{C.isPrepa(x) && x.exos && <small className="uzu-pre">{x.exos}</small>}</span><b>{String((+x.dur || 0) / 60).replace(".", ",")} h</b></li>)}</ul>
        : <p className="uzu-text uzu-muted">Aucune séance enregistrée.</p>}
      <span className="uzu-sublabel">Compétitions</span>
      {st.comps.length ? <ul className="uzu-top">{st.comps.slice().sort((a: Any, b: Any) => (a.date < b.date ? 1 : -1)).slice(0, 5).map((c: Any) => <li key={c.id}><span>{c.event || "Compétition"}<small>{C.frShort(c.date)}</small></span><b className={`uzu-res ${c.result}`}>{RESULT[c.result] || c.result}</b></li>)}</ul>
        : <p className="uzu-text uzu-muted">Aucune compétition.</p>}
    </section>}

    {tab === 4 && <NotesTab uid={uid} ctx={ctx} studentId={st.id} onToast={onToast} />}
  </>
}

function ProgressTab({ C, st, canVerify, busy, onVerify }: { C: Any; st: StudentRow; canVerify: boolean; busy: string; onVerify: (t: string, on: boolean) => void }) {
  const S = st.P.sessions, a = C.actStats(S), gs = C.gmStats(S), sb = C.subStats(S), ss = C.sysStats(st.P), SL: Any[] = C.skillList(st.P)
  const top = (m: Record<string, number>, name: (k: string) => string): [string, number][] => Object.keys(m).sort((x, y) => m[y] - m[x] || name(x).localeCompare(name(y), "fr")).slice(0, 5).map(k => [name(k), m[k]])
  const gmn = (k: string) => { const p = k.split(":"); return C.gmName(p[0], p[1]) }
  const customs: Record<string, Record<string, number>> = {}
  C.mat(S).forEach((x: Any) => C.normCustoms(x.customs).forEach((c: Any) => { const g = customs[c.p] || (customs[c.p] = {}); g[c.n] = (g[c.n] || 0) + 1 }))
  return <>
    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Lutte et garde</h2></div>
      <span className="uzu-sublabel">Amenées au sol {a.tdPct != null ? `· ${a.tdPct} % réussies` : ""}</span>
      <Bar a={a.lucha_takedowns_done} b={a.lucha_takedowns_suffered} la="Réussies" lb="Subies" />
      <span className="uzu-sublabel">Efficacité de garde · {a.guardPct != null ? a.guardPct + " %" : "—"} · rétentions {a.guard_retentions}</span>
      <div className="uzu-row2"><div><span className="uzu-sublabel">Ses armes (placés)</span><TopList rows={top(gs.placed, gmn)} empty="Aucun." /></div><div><span className="uzu-sublabel">Ses failles (subis)</span><TopList rows={top(gs.suffered, gmn)} empty="Aucun." /></div></div>
    </section>
    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Cartographie</h2><span className="uzu-muted uzu-small">Maîtrise moyenne {ss.avg} %</span></div>
      <ul className="uzu-hbars">{(C.SYS_KEYS as string[]).map(k => <li key={k}><span><span className={`uzu-dot sd-${k}`} /> {C.SYSTEMS[k].n}</span><span className="uzu-hbar"><i style={{ width: `${ss[k].pct}%` }} /></span><b>{ss[k].pct} %</b></li>)}</ul>
    </section>
    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Techniques et validation ★★★</h2></div>
      <p className="uzu-text uzu-small uzu-muted">★★★ est définitive pour l'élève et ne passe jamais « À réviser ». Valide-la quand tu as vu la technique placée en sparring.</p>
      {SL.length ? <ul className="uzu-skill-list">{SL.map(i => { const on = i.lvl === 3; return <li key={i.name}><span><b>{i.name}</b><small>{String(C.skillMeta(i)).replace("ton prof", "toi")}</small></span>
        <span className="uzu-skill-acts"><Stars lvl={i.lvl} review={i.review} />{canVerify && <button className={`button ${on ? "button--outline" : "button--dark"} uzu-small-btn`} disabled={busy === "v" + i.name} onClick={() => onVerify(i.name, !on)}>{on ? "Retirer ★★★" : "Valider ★★★"}</button>}</span></li> })}</ul>
        : <p className="uzu-text uzu-muted">Aucune technique dans son carnet pour l'instant.</p>}
    </section>
    <section className="panel uzu-panel-col uzu-grid-gap"><div className="section-title"><h2>Soumissions par type</h2></div>
      <div className="uzu-row2"><div><span className="uzu-sublabel">Placées</span><TopList rows={top(sb.placee, C.subName)} empty="Aucune." /></div><div><span className="uzu-sublabel">Subies</span><TopList rows={top(sb.subie, C.subName)} empty="Aucune." /></div></div>
      {Object.keys(customs).length > 0 && <><span className="uzu-sublabel">Plan de jeu par profil d'adversaire</span>
        {Object.keys(C.OPP_PROFILES).filter(p => customs[p]).map(p => <div key={p}><b className="uzu-small">{C.OPP_PROFILES[p]}</b><TopList rows={Object.keys(customs[p]).sort((x, y) => customs[p][y] - customs[p][x] || x.localeCompare(y, "fr")).map(n => [n, customs[p][n]] as [string, number])} empty="" /></div>)}</>}
    </section>
  </>
}

function NotesTab({ uid, ctx, studentId, onToast }: { uid: string; ctx: UzuContext | null; studentId: string; onToast: (m: string) => void }) {
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [err, setErr] = useState(false)
  const [body, setBody] = useState("")
  const [vis, setVis] = useState<"team" | "private">("team")
  const [busy, setBusy] = useState("")
  const [tick, setTick] = useState(0)
  const aid = ctx?.club?.id || ""
  const canView = can(ctx, "pedagogical_notes", "view"), canCreate = can(ctx, "pedagogical_notes", "create"), canDel = can(ctx, "pedagogical_notes", "delete")
  useEffect(() => {
    if (!canView || !aid) return
    let live = true
    setErr(false)
    listNotes(aid, studentId).then(L => { if (live) setNotes(L) }, () => { if (live) setErr(true) })
    return () => { live = false }
  }, [aid, studentId, canView, tick])
  if (!canView && !canCreate) return <section className="panel uzu-panel-col"><p className="uzu-text uzu-muted">Tu n'as pas accès aux notes pédagogiques.</p></section>
  const add = async () => {
    const t = body.trim(); if (!t) { onToast("Écris d'abord ta note"); return }
    setBusy("add"); const r = await addNote(aid, studentId, uid, t, vis); setBusy("")
    if (!r.ok) { onToast("Enregistrement impossible : " + (r.msg || "droit requis")); return }
    setBody(""); onToast(vis === "private" ? "Note privée enregistrée" : "Note partagée avec l'équipe"); setTick(x => x + 1)
  }
  const del = async (id: string) => { setBusy(id); const r = await deleteNote(id); setBusy(""); onToast(r.ok ? "Note supprimée" : r.msg); if (r.ok) setTick(x => x + 1) }
  const dt = (s: string) => { const d = new Date(s); return isNaN(+d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) }
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <div className="section-title"><h2>Notes pédagogiques</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Jamais visibles par l'élève. « Privée » : toi seul. « Équipe » : les profs autorisés de l'académie. Les notes perso de l'élève ne sont jamais affichées ici.</p>
    {canCreate && <>
      <textarea className="uzu-input" maxLength={2000} rows={3} aria-label="Nouvelle note" placeholder="Ex. : travaille la sortie de monte avant la prochaine barrette" value={body} onChange={e => setBody(e.target.value)} />
      <div className="uzu-actions uzu-actions--start"><div className="uzu-seg" role="group" aria-label="Visibilité de la note">{([["team", "Équipe"], ["private", "Privée"]] as const).map(([k, l]) => <button key={k} className={vis === k ? "on" : ""} aria-pressed={vis === k} onClick={() => setVis(k)}>{l}</button>)}</div>
        <button className="button button--dark uzu-small-btn" disabled={busy === "add"} onClick={add}>Ajouter la note</button></div></>}
    {!canView ? null : err ? <p className="uzu-note wait">Notes indisponibles pour l'instant.</p> : notes === null ? <p className="uzu-text uzu-muted">Chargement des notes…</p>
      : !notes.length ? <p className="uzu-text uzu-muted">Aucune note visible pour toi.</p>
      : <ul className="uzu-notes">{notes.map(n => { const mine = n.author_user_id === uid; return <li key={n.id}>
        <div className="uzu-note-h"><span className={`uzu-pill ${n.visibility === "private" ? "now" : "done"}`}>{n.visibility === "private" ? "Privée" : "Équipe"}</span><small>{dt(n.updated_at || n.created_at)}{mine ? " · toi" : n.legacy ? " · reprise de l'ancienne note" : ""}</small></div>
        <p className="uzu-text uzu-pre">{n.body}</p>
        {mine && canDel && <button className="button button--outline uzu-small-btn" disabled={busy === n.id} onClick={() => del(n.id)}>Supprimer</button>}</li> })}</ul>}
  </section>
}
