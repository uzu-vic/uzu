"use client"
// « Où rouler ? » — espace du référent UZU (uzu-14a2). Affiché seulement si le serveur reconnaît le rôle ;
// chaque action est de toute façon vérifiée côté serveur et inscrite au journal de modération.
import { useEffect, useState } from "react"
import { ArrowLeft, Plus, Trash2 } from "lucide-react"
import {
  DAYS, DISC_LBL, KIND_SHORT, STATUS_LBL, adminList, adminLog, adminResolve, adminSave, adminSetStatus, adminSuggestions, getClub,
  type AdminClub, type Commune, type DirClub, type DirDisc, type DirKind, type ModLog, type StaffSession, type Suggestion, type Welcome,
} from "@/lib/uzu/directory"
import { CommunePicker, Tick } from "@/components/uzu/directory"

type View = "sugg" | "clubs" | "log"
type Edit = { slug: string | null; prefill?: { name?: string; details?: string; contact?: string }; fromSuggestion?: string }
const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : ""
const fmtT = (s: string) => new Date(s).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
const ACTION_LBL: Record<string, string> = {
  "club.created": "Fiche créée", "club.updated": "Fiche modifiée", "suggestion.accepted": "Proposition traitée",
  "suggestion.rejected": "Proposition rejetée", "suggestion.open": "Proposition rouverte", "moderator.granted": "Référent désigné", "moderator.revoked": "Référent retiré",
}
const STATUS_ACT: Record<string, string> = { draft: "Mise en brouillon", published: "Publication", hidden: "Masquage", moderated: "Masquage de modération", unmoderated: "Masquage de modération levé" }
const logLine = (l: ModLog) => l.action === "club.status" ? STATUS_ACT[String(l.details?.status || "")] || "Changement d'état" : ACTION_LBL[l.action] || l.action

export function ModerationPane({ onBack, onToast }: { onBack: () => void; onToast: (m: string) => void }) {
  const [view, setView] = useState<View>("sugg"), [edit, setEdit] = useState<Edit | null>(null), [client, setClient] = useState<string | null>(null)
  const back = () => { setEdit(null); setClient(null) }
  return <section className="uzu-dir-admin" aria-label="Espace référent UZU">
    <div className="uzu-dir-admin-head">
      <div><div className="eyebrow">ANNUAIRE · RÉFÉRENT UZU</div><h2 className="uzu-dir-title">Espace référent</h2>
        <p className="uzu-text uzu-small uzu-muted">Fiches référencées, propositions des pratiquants, modération. Chaque action est inscrite au journal.</p></div>
      <button type="button" className="button button--outline uzu-small-btn" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />Retour à la recherche</button>
    </div>
    {edit ? <StaffForm edit={edit} onToast={onToast} onDone={back} />
      : client ? <ClientModeration slug={client} onToast={onToast} onDone={back} />
      : <>
        <div className="uzu-chips" role="group" aria-label="Rubriques du référent">
          {([["sugg", "Propositions"], ["clubs", "Fiches"], ["log", "Journal"]] as [View, string][]).map(([k, l]) =>
            <button key={k} type="button" className={view === k ? "on" : ""} aria-pressed={view === k} onClick={() => setView(k)}>{l}</button>)}
        </div>
        {view === "sugg" && <SuggestionsView onToast={onToast} onCreate={(s) => setEdit({ slug: null, prefill: s.payload, fromSuggestion: s.id })}
          onOpen={(s) => s.slug && (s.uzu ? setClient(s.slug) : setEdit({ slug: s.slug, fromSuggestion: s.id }))} />}
        {view === "clubs" && <ClubsView onNew={() => setEdit({ slug: null })} onOpen={(c) => c.uzu ? setClient(c.slug) : setEdit({ slug: c.slug })} />}
        {view === "log" && <LogView />}
      </>}
  </section>
}

// ---------------------------------------------------------------- Propositions
function SuggestionsView({ onToast, onCreate, onOpen }: { onToast: (m: string) => void; onCreate: (s: Suggestion) => void; onOpen: (s: Suggestion) => void }) {
  const [open, setOpen] = useState(true), [list, setList] = useState<Suggestion[] | null>(null), [err, setErr] = useState(""), [tick, setTick] = useState(0)
  useEffect(() => { let live = true; adminSuggestions(open ? "open" : null).then(r => { if (!live) return; if (r.ok) { setList(open ? r.data : r.data.filter(x => x.status !== "open")); setErr("") } else setErr(r.msg) }); return () => { live = false } }, [open, tick])
  const resolve = async (s: Suggestion, st: "accepted" | "rejected" | "open") => { const r = await adminResolve(s.id, st); onToast(r.ok ? (st === "open" ? "Proposition rouverte" : st === "accepted" ? "Proposition marquée traitée" : "Proposition rejetée") : r.msg); setTick(t => t + 1) }
  return <div className="uzu-panel-col uzu-grid-gap">
    <div className="uzu-chips uzu-chips--small" role="group" aria-label="État des propositions">
      <button type="button" className={open ? "on" : ""} aria-pressed={open} onClick={() => setOpen(true)}>À traiter</button>
      <button type="button" className={!open ? "on" : ""} aria-pressed={!open} onClick={() => setOpen(false)}>Traitées</button>
    </div>
    {err ? <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
      : !list ? <div className="uzu-banner" aria-busy="true">Chargement…</div>
      : !list.length ? <p className="uzu-text uzu-muted">{open ? "Aucune proposition à traiter." : "Aucune proposition traitée."}</p>
      : <ul className="uzu-dir-list">{list.map(s => <li key={s.id}><article className="uzu-dir-card uzu-dir-card--static" aria-label={s.slug ? `Correction : ${s.club}` : `Nouveau club : ${s.payload.name || ""}`}>
        <span className="uzu-dir-card-top"><b>{s.slug ? `Correction · ${s.club}` : `Nouveau club · ${s.payload.name || "sans nom"}`}</b>
          <span className={"uzu-dir-badge" + (s.status === "open" ? "" : " uzu-dir-badge--ref")}>{s.status === "open" ? "À traiter" : s.status === "accepted" ? "Traitée" : "Rejetée"}</span></span>
        <span className="uzu-dir-meta">{[s.payload.commune, `reçue le ${fmt(s.at)}`].filter(Boolean).join(" · ")}</span>
        {s.payload.details && <span className="uzu-text uzu-pre">{s.payload.details}</span>}
        {s.payload.contact && <span className="uzu-dir-meta">Contact public indiqué : {s.payload.contact}</span>}
        <span className="uzu-actions uzu-actions--start">
          {s.status === "open" && (s.slug ? <button type="button" className="button button--outline uzu-small-btn" onClick={() => onOpen(s)}>Ouvrir la fiche</button>
            : <button type="button" className="button button--dark uzu-small-btn" onClick={() => onCreate(s)}>Créer la fiche</button>)}
          {s.status === "open" && <button type="button" className="button button--outline uzu-small-btn" onClick={() => resolve(s, "accepted")}>Marquer traitée</button>}
          {s.status === "open" && <button type="button" className="button button--outline uzu-small-btn" onClick={() => resolve(s, "rejected")}>Rejeter</button>}
          {s.status !== "open" && <button type="button" className="button button--outline uzu-small-btn" onClick={() => resolve(s, "open")}>Rouvrir</button>}
        </span>
      </article></li>)}</ul>}
  </div>
}

// ---------------------------------------------------------------- Fiches
function ClubsView({ onNew, onOpen }: { onNew: () => void; onOpen: (c: AdminClub) => void }) {
  const [dep, setDep] = useState<string | null>(null), [status, setStatus] = useState<string | null>(null), [q, setQ] = useState("")
  const [list, setList] = useState<AdminClub[] | null>(null), [err, setErr] = useState("")
  useEffect(() => { let live = true; const t = window.setTimeout(() => adminList(dep, q.trim(), status).then(r => { if (!live) return; if (r.ok) { setList(r.data); setErr("") } else setErr(r.msg) }), 200); return () => { live = false; window.clearTimeout(t) } }, [dep, status, q])
  return <div className="uzu-panel-col uzu-grid-gap">
    <div className="uzu-actions uzu-actions--start"><button type="button" className="button button--dark uzu-small-btn" onClick={onNew}><Plus size={15} aria-hidden="true" />Nouvelle fiche référencée</button></div>
    <div className="uzu-chips uzu-chips--small" role="group" aria-label="Département">
      {([[null, "Tous"], ["91", "Essonne (91)"], ["94", "Val-de-Marne (94)"]] as [string | null, string][]).map(([k, l]) =>
        <button key={l} type="button" className={dep === k ? "on" : ""} aria-pressed={dep === k} onClick={() => setDep(k)}>{l}</button>)}
    </div>
    <div className="uzu-chips uzu-chips--small" role="group" aria-label="État">
      {([[null, "Tous les états"], ["draft", "Brouillons"], ["published", "Publiées"], ["hidden", "Masquées"]] as [string | null, string][]).map(([k, l]) =>
        <button key={l} type="button" className={status === k ? "on" : ""} aria-pressed={status === k} onClick={() => setStatus(k)}>{l}</button>)}
    </div>
    <label className="uzu-label" htmlFor="adm-q">Rechercher un club ou une commune</label>
    <input id="adm-q" className="uzu-input" maxLength={60} value={q} onChange={e => setQ(e.target.value)} />
    {err ? <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
      : !list ? <div className="uzu-banner" aria-busy="true">Chargement…</div>
      : <><p className="uzu-text uzu-small uzu-muted" role="status">{list.length} fiche{list.length > 1 ? "s" : ""}</p>
        <ul className="uzu-dir-list">{list.map(c => <li key={c.slug}><button type="button" className="uzu-dir-card" onClick={() => onOpen(c)} aria-label={`${c.name}, ${STATUS_LBL[c.status]}`}>
          <span className="uzu-dir-card-top"><b>{c.name}</b>{c.uzu ? <span className="uzu-dir-badge">◆ Club UZU</span> : <span className="uzu-dir-badge uzu-dir-badge--ref">Référencé</span>}</span>
          <span className="uzu-dir-meta">{c.commune} ({c.dep}) · {c.n_sessions} créneau{c.n_sessions > 1 ? "x" : ""}{c.verified_at ? ` · vérifiée le ${fmt(c.verified_at)}` : ""}</span>
          <span className="uzu-chips--static"><span className="uzu-dir-badge uzu-dir-badge--plain">{STATUS_LBL[c.status]}</span>
            {c.moderated && <span className="uzu-dir-badge uzu-dir-badge--warn">Masquée par la modération</span>}
            {c.open_suggestions > 0 && <span className="uzu-dir-badge uzu-dir-badge--plain">{c.open_suggestions} proposition{c.open_suggestions > 1 ? "s" : ""}</span>}</span>
        </button></li>)}</ul></>}
  </div>
}

// ---------------------------------------------------------------- Saisie d'une fiche référencée
const emptySession = (): StaffSession => ({ d: 5, s: "10:00", e: "12:00", disc: null, kind: "open_mat", price: "", notes: "" })
function StaffForm({ edit, onToast, onDone }: { edit: Edit; onToast: (m: string) => void; onDone: () => void }) {
  const [loaded, setLoaded] = useState(!edit.slug), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const [f, setF] = useState({ name: edit.prefill?.name || "", address: "", description: "", website: "", instagram: "", phone: "", email: "" })
  const [commune, setCommune] = useState<Commune | null>(null), [disc, setDisc] = useState<DirDisc[]>([]), [w, setW] = useState<Welcome>({})
  const [status, setStatus] = useState<"draft" | "published" | "hidden">("draft"), [sess, setSess] = useState<StaffSession[]>([])
  useEffect(() => {
    if (!edit.slug) return
    let live = true
    getClub(edit.slug).then(r => {
      if (!live) return
      if (!r.ok) { setErr(r.msg); return }
      const c: DirClub = r.data
      setF({ name: c.name, address: c.address || "", description: c.description || "", website: c.website || "", instagram: c.instagram || "", phone: c.phone || "", email: c.email || "" })
      setCommune({ insee: c.insee, nom: c.commune, departement: c.dep, code_postal: "" }); setDisc(c.disciplines || []); setW(c.welcome || {})
      setStatus((c.status as "draft" | "published" | "hidden") || "draft"); setSess((c.sessions || []).map(x => ({ d: x.d, s: x.s, e: x.e, disc: x.disc, kind: x.kind, price: x.price || "", notes: x.notes || "" }))); setLoaded(true)
    })
    return () => { live = false }
  }, [edit.slug])
  const setS = (i: number, patch: Partial<StaffSession>) => setSess(l => l.map((x, j) => j === i ? { ...x, ...patch } : x))
  const save = async () => {
    if (f.name.trim().length < 2) { onToast("Indique le nom du club"); return }
    if (!commune) { onToast("Choisis la commune de la salle"); return }
    if (!disc.length) { onToast("Choisis au moins une discipline"); return }
    if (f.website.trim() && !/^https:\/\//i.test(f.website.trim())) { onToast("Le site doit commencer par https://"); return }
    if (sess.some(x => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.s) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.e))) { onToast("Heures des créneaux au format HH:MM"); return }
    setBusy(true)
    const r = await adminSave({ ...(edit.slug ? { slug: edit.slug } : {}), ...f, insee: commune.insee, disciplines: disc, welcome: w, status, sessions: sess })
    if (r.ok && edit.fromSuggestion) await adminResolve(edit.fromSuggestion, "accepted")
    setBusy(false)
    if (!r.ok) { onToast(r.msg); return }
    onToast(edit.slug ? "Fiche enregistrée" : status === "published" ? "Fiche créée et publiée" : "Fiche créée en brouillon"); onDone()
  }
  const inp = (k: keyof typeof f, label: string, max: number, extra: Record<string, unknown> = {}) => <div className="uzu-field"><label className="uzu-label" htmlFor={"adm-" + k}>{label}</label><input id={"adm-" + k} className="uzu-input" maxLength={max} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} /></div>
  if (err) return <><button type="button" className="button button--outline uzu-small-btn" onClick={onDone}><ArrowLeft size={15} aria-hidden="true" />Retour</button><div className="uzu-banner uzu-banner--error" role="alert">{err}</div></>
  if (!loaded) return <div className="uzu-banner" aria-busy="true">Chargement de la fiche…</div>
  return <form className="panel uzu-panel-col uzu-grid-gap" aria-label={edit.slug ? "Modifier la fiche référencée" : "Nouvelle fiche référencée"} onSubmit={e => { e.preventDefault(); save() }}>
    <button type="button" className="button button--outline uzu-small-btn uzu-lib-back" onClick={onDone}><ArrowLeft size={15} aria-hidden="true" />Retour</button>
    <h3 className="uzu-h3">{edit.slug ? "Modifier la fiche référencée" : "Nouvelle fiche référencée"}</h3>
    {edit.prefill && (edit.prefill.details || edit.prefill.contact) && <div className="uzu-banner"><b>Proposition reçue :</b> {[edit.prefill.details, edit.prefill.contact].filter(Boolean).join(" · ")}</div>}
    <p className="uzu-text uzu-small uzu-muted">N&apos;utilise que des informations publiques du club (site, réseaux, affichage) et vérifie-les avant publication.</p>
    {inp("name", "Nom du club", 80)}
    <CommunePicker id="adm-commune" label="Commune de la salle" value={commune} onPick={setCommune} />
    {inp("address", "Adresse de la salle", 160)}
    <span className="uzu-label">Disciplines</span>
    <div className="uzu-chips">{(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={disc.includes(k) ? "on" : ""} aria-pressed={disc.includes(k)} onClick={() => setDisc(l => l.includes(k) ? l.filter(x => x !== k) : [...l, k])}>{DISC_LBL[k]}</button>)}</div>
    <label className="uzu-label" htmlFor="adm-description">Présentation</label><textarea id="adm-description" className="uzu-input" rows={3} maxLength={500} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
    <div className="uzu-row2">{inp("phone", "Téléphone public", 30, { inputMode: "tel" })}{inp("email", "Courriel public", 120, { inputMode: "email" })}</div>
    <div className="uzu-row2">{inp("website", "Site (https://…)", 200, { inputMode: "url" })}{inp("instagram", "Instagram", 60)}</div>
    <h4 className="uzu-h3">Conditions d&apos;accueil</h4>
    <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="adm-w-price">Tarif visiteur</label><input id="adm-w-price" className="uzu-input" maxLength={60} value={w.price || ""} onChange={e => setW({ ...w, price: e.target.value })} /></div>
      <div className="uzu-field"><label className="uzu-label" htmlFor="adm-w-license">Licence, assurance</label><input id="adm-w-license" className="uzu-input" maxLength={120} value={w.license || ""} onChange={e => setW({ ...w, license: e.target.value })} /></div></div>
    <label className="uzu-label" htmlFor="adm-w-rules">À savoir</label><input id="adm-w-rules" className="uzu-input" maxLength={200} value={w.rules || ""} onChange={e => setW({ ...w, rules: e.target.value })} />
    <Tick on={!!w.contact_first} onClick={() => setW({ ...w, contact_first: !w.contact_first })}>Les visiteurs doivent prévenir avant de venir</Tick>
    <h4 className="uzu-h3">Créneaux ouverts aux visiteurs</h4>
    {sess.length === 0 && <p className="uzu-text uzu-muted">Aucun créneau : la fiche invitera à contacter le club.</p>}
    <ul className="uzu-dir-slots">{sess.map((x, i) => <li key={i} className="uzu-dir-sess-edit" aria-label={`Créneau ${i + 1}`}>
      <div className="uzu-row2">
        <div className="uzu-field"><label className="uzu-label" htmlFor={`adm-s${i}-d`}>Jour</label><select id={`adm-s${i}-d`} className="uzu-input" value={x.d} onChange={e => setS(i, { d: Number(e.target.value) })}>{DAYS.map((d, k) => <option key={k} value={k}>{d}</option>)}</select></div>
        <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor={`adm-s${i}-s`}>Début</label><input id={`adm-s${i}-s`} className="uzu-input" inputMode="numeric" maxLength={5} placeholder="10:00" value={x.s} onChange={e => setS(i, { s: e.target.value })} /></div>
          <div className="uzu-field"><label className="uzu-label" htmlFor={`adm-s${i}-e`}>Fin</label><input id={`adm-s${i}-e`} className="uzu-input" inputMode="numeric" maxLength={5} placeholder="12:00" value={x.e} onChange={e => setS(i, { e: e.target.value })} /></div></div>
      </div>
      <div className="uzu-chips uzu-chips--small" role="group" aria-label={`Type du créneau ${i + 1}`}>{(Object.keys(KIND_SHORT) as DirKind[]).map(k => <button key={k} type="button" className={x.kind === k ? "on" : ""} aria-pressed={x.kind === k} onClick={() => setS(i, { kind: k })}>{KIND_SHORT[k]}</button>)}</div>
      <div className="uzu-chips uzu-chips--small" role="group" aria-label={`Discipline du créneau ${i + 1}`}>
        <button type="button" className={!x.disc ? "on" : ""} aria-pressed={!x.disc} onClick={() => setS(i, { disc: null })}>Toutes</button>
        {(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={x.disc === k ? "on" : ""} aria-pressed={x.disc === k} onClick={() => setS(i, { disc: k })}>{DISC_LBL[k]}</button>)}</div>
      <div className="uzu-row2"><input className="uzu-input" aria-label={`Tarif du créneau ${i + 1}`} maxLength={40} placeholder="Tarif (facultatif)" value={x.price} onChange={e => setS(i, { price: e.target.value })} />
        <input className="uzu-input" aria-label={`Précision du créneau ${i + 1}`} maxLength={160} placeholder="Précision (facultatif)" value={x.notes} onChange={e => setS(i, { notes: e.target.value })} /></div>
      <button type="button" className="text-link uzu-dir-link" onClick={() => setSess(l => l.filter((_, j) => j !== i))}><Trash2 size={14} aria-hidden="true" />Retirer ce créneau</button>
    </li>)}</ul>
    <button type="button" className="button button--outline uzu-small-btn" onClick={() => setSess(l => [...l, emptySession()])}><Plus size={15} aria-hidden="true" />Ajouter un créneau</button>
    <span className="uzu-label">État de la fiche</span>
    <div className="uzu-chips" role="group" aria-label="État de la fiche">{(["draft", "published", "hidden"] as const).map(k => <button key={k} type="button" className={status === k ? "on" : ""} aria-pressed={status === k} onClick={() => setStatus(k)}>{STATUS_LBL[k]}</button>)}</div>
    <button type="submit" className="button button--dark uzu-wide" disabled={busy}>{edit.slug ? "Enregistrer la fiche" : "Créer la fiche"}</button>
  </form>
}

// ---------------------------------------------------------------- Fiche d'un club client : modération seulement
function ClientModeration({ slug, onToast, onDone }: { slug: string; onToast: (m: string) => void; onDone: () => void }) {
  const [c, setC] = useState<DirClub | null>(null), [err, setErr] = useState(""), [note, setNote] = useState(""), [tick, setTick] = useState(0), [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; getClub(slug).then(r => { if (!live) return; if (r.ok) setC(r.data); else setErr(r.msg) }); return () => { live = false } }, [slug, tick])
  const act = async (st: "moderated" | "unmoderated") => {
    if (st === "moderated" && note.trim().length < 3) { onToast("Indique le motif du masquage"); return }
    setBusy(true); const r = await adminSetStatus(slug, st, note.trim()); setBusy(false)
    onToast(r.ok ? (st === "moderated" ? "Fiche masquée par la modération" : "Masquage levé : le club peut republier sa fiche") : r.msg)
    if (r.ok) { setNote(""); setTick(t => t + 1) }
  }
  const backBtn = <button type="button" className="button button--outline uzu-small-btn uzu-lib-back" onClick={onDone}><ArrowLeft size={15} aria-hidden="true" />Retour</button>
  if (err) return <>{backBtn}<div className="uzu-banner uzu-banner--error" role="alert">{err}</div></>
  if (!c) return <div className="uzu-banner" aria-busy="true">Chargement de la fiche…</div>
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Modération d'une fiche de club UZU">
    {backBtn}
    <h3 className="uzu-h3">{c.name}</h3>
    <p className="uzu-text">{c.commune} ({c.dep}) · {STATUS_LBL[c.status] || c.status} · vérifiée le {fmt(c.verified_at)}</p>
    <p className="uzu-text uzu-small uzu-muted">Fiche tenue par le club lui-même : le référent ne peut pas la modifier. En cas d&apos;abus ou d&apos;erreur grave, il peut la masquer en indiquant le motif ; le club voit qu&apos;elle est masquée.</p>
    {c.moderated ? <>
      <div className="uzu-banner"><b>Masquée par la modération.</b> {c.moderation_note}</div>
      <button type="button" className="button button--outline" disabled={busy} onClick={() => act("unmoderated")}>Lever le masquage</button>
    </> : <>
      <label className="uzu-label" htmlFor="adm-mod-note">Motif du masquage (visible de l&apos;équipe UZU)</label>
      <input id="adm-mod-note" className="uzu-input" maxLength={200} value={note} onChange={e => setNote(e.target.value)} />
      <button type="button" className="button button--outline" disabled={busy} onClick={() => act("moderated")}>Masquer la fiche (modération)</button>
    </>}
  </section>
}

// ---------------------------------------------------------------- Journal
function LogView() {
  const [list, setList] = useState<ModLog[] | null>(null), [err, setErr] = useState("")
  useEffect(() => { let live = true; adminLog(80).then(r => { if (!live) return; if (r.ok) setList(r.data); else setErr(r.msg) }); return () => { live = false } }, [])
  if (err) return <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
  if (!list) return <div className="uzu-banner" aria-busy="true">Chargement…</div>
  if (!list.length) return <p className="uzu-text uzu-muted">Aucune action de modération pour l&apos;instant.</p>
  return <ul className="uzu-dir-log" aria-label="Journal de modération">{list.map(l => <li key={l.id}>
    <span className="uzu-dir-meta">{fmtT(l.at)} · {l.actor}</span>
    <span><b>{logLine(l)}</b>{l.target && !/^[0-9a-f-]{36}$/.test(l.target) ? ` · ${l.target}` : ""}{l.details?.note ? ` · ${String(l.details.note)}` : ""}</span>
  </li>)}</ul>
}
