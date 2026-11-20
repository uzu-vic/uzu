"use client"
// « Où rouler ? » — espace Tatami : volets Fil / Partenaires / Clubs, annuaire privé des clubs.
// Le fil reste le volet par défaut et n'est pas modifié. Recherche réservée aux personnes connectées ;
// localisation à la commune ; distances par tranches ; aucune donnée de membre.
import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Check, ExternalLink, Mail, MapPin, Phone, Search } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import {
  DAYS, DISC_LBL, DSHORT, KIND_LBL, KIND_SHORT, getClub, lastCommune, myDirClub, rememberCommune, saveMyDirClub, searchClubs, searchCommunes, sessionLine, suggestClub,
  type Commune, type DirClub, type DirClubHit, type DirDisc, type DirKind, type DirSearch, type DirSession, type MyDirClub, type MySlot, type Welcome,
} from "@/lib/uzu/directory"

export type TatamiVolet = "fil" | "partners" | "clubs"
export function TatamiTabs({ value, onChange }: { value: TatamiVolet; onChange: (v: TatamiVolet) => void }) {
  const tabs: [TatamiVolet, string][] = [["fil", "Fil"], ["partners", "Partenaires"], ["clubs", "Clubs"]]
  return <nav className="uzu-lib-volets" aria-label="Volets de Tatami">
    {tabs.map(([k, l]) => <button key={k} type="button" className={value === k ? "on" : ""} aria-current={value === k ? "page" : undefined} onClick={() => onChange(k)}>{l}</button>)}
  </nav>
}

function Heading({ title, sub }: { title: string; sub: string }) {
  return <div className="page-heading"><div><div className="eyebrow">TATAMI · OÙ ROULER ?</div><h1>{title}<span className="heading-period">.</span></h1><p>{sub}</p></div></div>
}

// ---------------------------------------------------------------- Partenaires (étape 2)
export function PartnersPane({ tabs }: { tabs: React.ReactNode }) {
  return <>
    <Heading title="Partenaires" sub="Trouve un partenaire de roulage, chez toi ou en déplacement." />
    {tabs}
    <section className="panel uzu-panel-col uzu-grid-gap">
      <h2 className="uzu-h2">Bientôt dans UZU</h2>
      <p className="uzu-text">Tu pourras indiquer tes disponibilités, ta ville habituelle ou ta ville de déplacement, et proposer un roulage à d&apos;autres pratiquants. Rien n&apos;est visible sans ton accord.</p>
      <p className="uzu-text uzu-small uzu-muted">En attendant, cherche un club ou un open mat dans le volet Clubs.</p>
    </section>
  </>
}

// ---------------------------------------------------------------- Choix d'une commune
export function CommunePicker({ value, onPick, label = "Ville ou code postal", id = "dir-commune" }: { value: Commune | null; onPick: (c: Commune) => void; label?: string; id?: string }) {
  const [q, setQ] = useState(""), [list, setList] = useState<Commune[]>([]), [open, setOpen] = useState(!value), [err, setErr] = useState("")
  const seq = useRef(0)
  useEffect(() => {
    const s = q.trim(); if (s.length < 2) { setList([]); return }
    const n = ++seq.current
    const t = window.setTimeout(async () => { const r = await searchCommunes(s); if (n !== seq.current) return; if (r.ok) { setList(r.data || []); setErr("") } else setErr(r.msg) }, 220)
    return () => window.clearTimeout(t)
  }, [q])
  if (value && !open) return <div className="uzu-field"><span className="uzu-label">{label}</span>
    <button type="button" className="uzu-dir-commune" onClick={() => { setOpen(true); setQ("") }} aria-label={`Changer de commune : ${value.nom} (${value.departement})`}><MapPin size={15} aria-hidden="true" /><span>{value.nom} ({value.departement})</span><small>Changer</small></button></div>
  return <div className="uzu-field uzu-dir-picker">
    <label className="uzu-label" htmlFor={id}>{label}</label>
    <div className="uzu-search"><Search size={15} aria-hidden="true" /><input id={id} className="uzu-input" autoComplete="off" inputMode="search" placeholder="Ex. Évry, 91000" value={q} onChange={e => setQ(e.target.value)} /></div>
    {err && <p className="uzu-text uzu-small" role="alert">{err}</p>}
    {list.length > 0 && <ul className="uzu-dir-sugg" role="listbox" aria-label="Communes trouvées">{list.map(c => <li key={c.insee}><button type="button" role="option" aria-selected={false} onClick={() => { onPick(c); setOpen(false); setQ(""); setList([]) }}><b>{c.nom}</b><small>{c.departement} · {c.code_postal}</small></button></li>)}</ul>}
    {value && <button type="button" className="text-link uzu-dir-link" onClick={() => setOpen(false)}>Garder {value.nom}</button>}
  </div>
}

// ---------------------------------------------------------------- Clubs
export function ClubsPane({ tabs, onToast }: { tabs: React.ReactNode; onToast: (m: string) => void }) {
  const [commune, setCommune] = useState<Commune | null>(() => lastCommune())
  const [radius, setRadius] = useState(25), [disc, setDisc] = useState<DirDisc | null>(null), [kind, setKind] = useState<DirKind | null>(null)
  const [res, setRes] = useState<DirSearch | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const [open, setOpen] = useState<string | null>(null), [suggest, setSuggest] = useState<{ slug: string | null; name?: string } | null>(null)
  useEffect(() => {
    if (!commune) return
    let live = true; setBusy(true); setErr("")
    searchClubs(commune.insee, radius, disc, kind, null).then(r => { if (!live) return; setBusy(false); if (r.ok) setRes(r.data); else { setRes(null); setErr(r.msg) } })
    return () => { live = false }
  }, [commune, radius, disc, kind])
  if (suggest) return <><Heading title="Clubs" sub="Open mats, cours ouverts et clubs qui accueillent les visiteurs." />{tabs}<SuggestForm slug={suggest.slug} name={suggest.name} onCancel={() => setSuggest(null)} onDone={() => { setSuggest(null); onToast("Merci ! L'équipe UZU va vérifier ta proposition.") }} /></>
  if (open) return <><Heading title="Clubs" sub="Open mats, cours ouverts et clubs qui accueillent les visiteurs." />{tabs}<ClubSheet slug={open} onBack={() => setOpen(null)} onSuggest={(name) => setSuggest({ slug: open, name })} /></>
  return <>
    <Heading title="Clubs" sub="Open mats, cours ouverts et clubs qui accueillent les visiteurs." />
    {tabs}
    <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Recherche de clubs">
      <CommunePicker value={commune} onPick={c => { setCommune(c); rememberCommune(c) }} />
      <div className="uzu-field"><span className="uzu-label">Rayon</span><div className="uzu-chips uzu-chips--small">{[10, 25, 50].map(r => <button key={r} type="button" className={radius === r ? "on" : ""} aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</button>)}</div></div>
      <div className="uzu-field"><span className="uzu-label">Discipline</span><div className="uzu-chips uzu-chips--small">
        <button type="button" className={!disc ? "on" : ""} aria-pressed={!disc} onClick={() => setDisc(null)}>Toutes</button>
        {(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={disc === k ? "on" : ""} aria-pressed={disc === k} onClick={() => setDisc(k)}>{DISC_LBL[k]}</button>)}</div></div>
      <div className="uzu-field"><span className="uzu-label">Je cherche</span><div className="uzu-chips uzu-chips--small">
        <button type="button" className={!kind ? "on" : ""} aria-pressed={!kind} onClick={() => setKind(null)}>Tous les clubs</button>
        {(Object.keys(KIND_SHORT) as DirKind[]).map(k => <button key={k} type="button" className={kind === k ? "on" : ""} aria-pressed={kind === k} onClick={() => setKind(k)}>{KIND_SHORT[k]}</button>)}</div></div>
    </section>
    {!commune ? <p className="uzu-text uzu-muted">Choisis une ville pour voir les clubs autour.</p>
      : err ? <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
      : busy && !res ? <div className="uzu-banner" aria-busy="true">Recherche…</div>
      : res && <section aria-label="Clubs trouvés" aria-busy={busy}>
        <p className="uzu-text uzu-small uzu-muted" role="status">{res.clubs.length ? `${res.clubs.length} club${res.clubs.length > 1 ? "s" : ""} à moins de ${res.radius} km de ${res.commune.nom}` : `Aucun club référencé à moins de ${res.radius} km de ${res.commune.nom} pour l'instant.`}</p>
        <ul className="uzu-dir-list">{res.clubs.map(c => <li key={c.slug}><ClubCard c={c} onOpen={() => setOpen(c.slug)} /></li>)}</ul>
      </section>}
    <p className="uzu-text uzu-small uzu-muted">Un club manque ? <button type="button" className="text-link uzu-dir-link" onClick={() => setSuggest({ slug: null })}>Propose-le à l&apos;équipe UZU</button></p>
  </>
}

function ClubCard({ c, onOpen }: { c: DirClubHit; onOpen: () => void }) {
  const first = c.sessions.slice(0, 2)
  return <button type="button" className="uzu-dir-card" onClick={onOpen} aria-label={`${c.name}, ${c.commune}, ${c.band}`}>
    <span className="uzu-dir-card-top"><b>{c.name}</b>{c.uzu ? <span className="uzu-dir-badge">◆ Club UZU</span> : <span className="uzu-dir-badge uzu-dir-badge--ref">Référencé</span>}</span>
    <span className="uzu-dir-meta">{c.commune} ({c.dep}) · {c.band}</span>
    <span className="uzu-dir-meta">{c.disciplines.map(d => DISC_LBL[d]).join(" · ")}</span>
    {first.length > 0 && <span className="uzu-dir-sess">{first.map((x, i) => <span key={i}><b>{KIND_SHORT[x.kind]}</b> · {sessionLine(x)}</span>)}{c.sessions.length > 2 && <small>+ {c.sessions.length - 2} autre{c.sessions.length > 3 ? "s" : ""}</small>}</span>}
    {first.length === 0 && c.n_sessions === 0 && <span className="uzu-dir-meta">Horaires à demander au club</span>}
    {c.price && <span className="uzu-dir-meta">Visiteur : {c.price}</span>}
  </button>
}

const fmtDate = (s: string | null) => s ? new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""
function groupByDay(list: DirSession[]) { const m = new Map<number, DirSession[]>(); for (const x of list) m.set(x.d, [...(m.get(x.d) || []), x]); return [...m.entries()].sort((a, b) => a[0] - b[0]) }

export function ClubSheet({ slug, onBack, onSuggest }: { slug: string; onBack: () => void; onSuggest: (name: string) => void }) {
  const [c, setC] = useState<DirClub | null>(null), [err, setErr] = useState("")
  useEffect(() => { let live = true; getClub(slug).then(r => { if (!live) return; if (r.ok) setC(r.data); else setErr(r.msg) }); return () => { live = false } }, [slug])
  const back = <button type="button" className="button button--outline uzu-small-btn uzu-lib-back" onClick={onBack}><ArrowLeft size={15} aria-hidden="true" />Retour aux clubs</button>
  if (err) return <>{back}<div className="uzu-banner uzu-banner--error" role="alert">{err}</div></>
  if (!c) return <>{back}<div className="uzu-banner" aria-busy="true">Chargement de la fiche…</div></>
  const w = c.welcome || {}
  return <article className="uzu-dir-sheet" aria-labelledby="dir-name">
    {back}
    <div className="uzu-panel-col uzu-grid-gap">
      <h2 id="dir-name" className="uzu-dir-title">{c.name}</h2>
      <div className="uzu-chips--static">{c.uzu ? <span className="uzu-dir-badge">◆ Club UZU</span> : <span className="uzu-dir-badge uzu-dir-badge--ref">Référencé par UZU</span>}{c.disciplines.map(d => <span key={d} className="uzu-dir-badge uzu-dir-badge--plain">{DISC_LBL[d]}</span>)}</div>
      {c.description && <p className="uzu-text">{c.description}</p>}
    </div>
    <section className="panel uzu-panel-col uzu-grid-gap"><h3 className="uzu-h3">Open mats et cours ouverts</h3>
      {c.sessions.length ? <ul className="uzu-dir-days">{groupByDay(c.sessions).map(([d, xs]) => <li key={d}><b>{DAYS[d]}</b>{xs.map((x, i) => <span key={i}>{x.s}–{x.e} · {KIND_LBL[x.kind]}{x.disc ? ` · ${DISC_LBL[x.disc]}` : ""}{x.price ? ` · ${x.price}` : ""}{x.notes ? ` · ${x.notes}` : ""}</span>)}</li>)}</ul>
        : <p className="uzu-text uzu-muted">Pas de créneau ouvert publié : contacte le club.</p>}
    </section>
    {(w.price || w.license || w.rules || w.contact_first || w.notes) && <section className="panel uzu-panel-col uzu-grid-gap"><h3 className="uzu-h3">Conditions d&apos;accueil</h3>
      <ul className="uzu-dir-cond">
        {w.price && <li><b>Tarif visiteur</b> {w.price}</li>}
        {w.license && <li><b>Licence, assurance</b> {w.license}</li>}
        {w.rules && <li><b>À savoir</b> {w.rules}</li>}
        {w.contact_first && <li><b>Prévenir avant de venir</b></li>}
        {w.notes && <li>{w.notes}</li>}
      </ul></section>}
    <section className="panel uzu-panel-col uzu-grid-gap"><h3 className="uzu-h3">Salle et contact</h3>
      <p className="uzu-text"><MapPin size={14} aria-hidden="true" /> {c.address ? `${c.address}, ` : ""}{c.commune} ({c.dep})</p>
      <div className="uzu-actions uzu-actions--start">
        {c.phone && <a className="button button--outline uzu-small-btn" href={`tel:${c.phone.replace(/[^+0-9]/g, "")}`}><Phone size={14} aria-hidden="true" />{c.phone}</a>}
        {c.email && <a className="button button--outline uzu-small-btn" href={`mailto:${c.email}`}><Mail size={14} aria-hidden="true" />Écrire</a>}
        {c.website && <a className="button button--outline uzu-small-btn" href={c.website} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />Site</a>}
        {c.instagram && <a className="button button--outline uzu-small-btn" href={`https://www.instagram.com/${encodeURIComponent(c.instagram)}/`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} aria-hidden="true" />@{c.instagram}</a>}
      </div>
    </section>
    <p className="uzu-text uzu-small uzu-muted">{c.uzu ? "Horaires tenus à jour par le club" : "Fiche vérifiée par l'équipe UZU"}{c.verified_at ? ` · ${fmtDate(c.verified_at)}` : ""} · <button type="button" className="text-link uzu-dir-link" onClick={() => onSuggest(c.name)}>Signaler une erreur</button></p>
  </article>
}

function SuggestForm({ slug, name, onCancel, onDone }: { slug: string | null; name?: string; onCancel: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: "", commune: "", details: "", contact: "" }), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const send = async () => {
    setErr(""); if (!f.details.trim() && !f.name.trim()) { setErr(slug ? "Décris l'erreur." : "Indique au moins le nom du club."); return }
    setBusy(true); const r = await suggestClub(slug, slug ? { details: f.details } : f); setBusy(false)
    if (!r.ok) { setErr(r.msg); return } onDone()
  }
  return <form className="panel uzu-panel-col uzu-grid-gap" onSubmit={e => { e.preventDefault(); send() }} aria-label={slug ? "Signaler une erreur" : "Proposer un club"}>
    <h2 className="uzu-h2">{slug ? `Signaler une erreur · ${name || ""}` : "Proposer un club"}</h2>
    {!slug && <><label className="uzu-label" htmlFor="sg-name">Nom du club</label><input id="sg-name" className="uzu-input" maxLength={80} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
      <label className="uzu-label" htmlFor="sg-commune">Ville</label><input id="sg-commune" className="uzu-input" maxLength={80} value={f.commune} onChange={e => setF({ ...f, commune: e.target.value })} /></>}
    <label className="uzu-label" htmlFor="sg-details">{slug ? "Qu'est-ce qui est faux ?" : "Horaires, open mats, conditions (si tu les connais)"}</label>
    <textarea id="sg-details" className="uzu-input" rows={4} maxLength={800} value={f.details} onChange={e => setF({ ...f, details: e.target.value })} />
    {!slug && <><label className="uzu-label" htmlFor="sg-contact">Site ou contact public du club (facultatif)</label><input id="sg-contact" className="uzu-input" maxLength={120} value={f.contact} onChange={e => setF({ ...f, contact: e.target.value })} /></>}
    <p className="uzu-text uzu-small uzu-muted">L&apos;équipe UZU vérifie chaque proposition avant publication. N&apos;indique aucune information personnelle.</p>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <div className="uzu-actions"><button type="button" className="button button--outline" onClick={onCancel}>Annuler</button><button type="submit" className="button button--dark" disabled={busy}>Envoyer</button></div>
  </form>
}

// ---------------------------------------------------------------- Espace Tatami (volets)
export function TatamiSpace({ initial, ctx, onToast, renderFeed }: { initial?: string; ctx: UzuContext | null; onToast: (m: string) => void; renderFeed: (tabs: React.ReactNode) => React.ReactNode }) {
  const [vol, setVol] = useState<TatamiVolet>(initial === "clubs" ? "clubs" : initial === "partners" ? "partners" : "fil")
  const tabs = <TatamiTabs value={vol} onChange={v => { setVol(v); window.scrollTo(0, 0) }} />
  void ctx
  if (vol === "clubs") return <ClubsPane tabs={tabs} onToast={onToast} />
  if (vol === "partners") return <PartnersPane tabs={tabs} />
  return <>{renderFeed(tabs)}</>
}

// ---------------------------------------------------------------- Mon académie : fiche dans l'annuaire
// Réservé au droit « Paramètres de l'académie » (modification). Le planning du club n'est jamais modifié :
// on choisit seulement quels créneaux existants sont ouverts aux visiteurs.
const commFrom = (insee: string | null, label: string | null): Commune | null => {
  if (!insee) return null
  const m = /^(.*) \(([^)]+)\)$/.exec(label || "")
  return { insee, nom: m ? m[1] : (label || insee), departement: m ? m[2] : "", code_postal: "" }
}
function Tick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" role="checkbox" aria-checked={on} className={"uzu-lib-consent uzu-lib-consentbtn" + (on ? " is-on" : "")} onClick={onClick}>
    <span className="uzu-lib-tick" aria-hidden="true">{on && <Check size={16} strokeWidth={3} />}</span><span>{children}</span></button>
}
export function DirClubPanel({ onToast }: { onToast: (m: string) => void }) {
  const [d, setD] = useState<MyDirClub | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [tick, setTick] = useState(0)
  const [commune, setCommune] = useState<Commune | null>(null), [pub, setPub] = useState(false)
  const [f, setF] = useState({ address: "", description: "", website: "", instagram: "", phone: "", email: "" })
  const [disc, setDisc] = useState<DirDisc[]>([]), [w, setW] = useState<Welcome>({}), [slots, setSlots] = useState<MySlot[]>([])
  useEffect(() => {
    let live = true
    myDirClub().then(r => {
      if (!live) return
      if (!r.ok) { setErr(r.msg); return }
      const x = r.data; setD(x); setErr("")
      setCommune(commFrom(x.insee, x.commune)); setPub(x.status === "published")
      setF({ address: x.address || "", description: x.description || "", website: x.website || "", instagram: x.instagram || "", phone: x.phone || "", email: x.email || "" })
      setDisc(x.disciplines || []); setW(x.welcome || {}); setSlots(x.slots || [])
    })
    return () => { live = false }
  }, [tick])
  if (err) return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Fiche dans l'annuaire UZU"><div className="section-title"><h2>Fiche dans l&apos;annuaire UZU</h2></div><p className="uzu-text uzu-muted">{err}</p></section>
  if (!d) return <section className="panel uzu-panel-col" aria-busy="true"><div className="section-title"><h2>Fiche dans l&apos;annuaire UZU</h2></div><p className="uzu-text uzu-muted">Chargement…</p></section>
  const setSlot = (id: string, patch: Partial<MySlot>) => setSlots(l => l.map(x => x.id === id ? { ...x, ...patch } : x))
  const save = async () => {
    if (!commune) { onToast("Choisis la commune de la salle"); return }
    if (!disc.length) { onToast("Choisis au moins une discipline"); return }
    if (f.website.trim() && !/^https:\/\//i.test(f.website.trim())) { onToast("Le site doit commencer par https://"); return }
    setBusy(true)
    const r = await saveMyDirClub({ insee: commune.insee, published: pub, disciplines: disc, welcome: w, ...f,
      slots: slots.filter(x => x.pub).map(x => ({ id: x.id, kind: x.kind || "open_mat", price: x.price, notes: x.notes })) })
    setBusy(false)
    if (!r.ok) { onToast(r.msg); return }
    onToast(pub ? "Fiche publiée dans l'annuaire UZU" : "Fiche enregistrée, non visible dans l'annuaire"); setTick(t => t + 1)
  }
  const inp = (k: keyof typeof f, label: string, max: number, extra: Record<string, unknown> = {}) => <div className="uzu-field"><label className="uzu-label" htmlFor={"dir-" + k}>{label}</label><input id={"dir-" + k} className="uzu-input" maxLength={max} value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} {...extra} /></div>
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Fiche dans l'annuaire UZU">
    <div className="section-title"><h2>Fiche dans l&apos;annuaire UZU</h2>{d.exists && <span className={"uzu-dir-badge" + (d.status === "published" ? "" : " uzu-dir-badge--ref")}>{d.status === "published" ? "Publiée" : "Non visible"}</span>}</div>
    <p className="uzu-text uzu-small uzu-muted">Les pratiquants connectés à UZU trouvent ton club, ses open mats et ses cours ouverts aux visiteurs. Seules les informations ci-dessous sont visibles ; aucune donnée d&apos;élève n&apos;est publiée.</p>
    <Tick on={pub} onClick={() => setPub(v => !v)}>Publier la fiche du club dans l&apos;annuaire</Tick>
    <CommunePicker id="dir-my-commune" label="Commune de la salle" value={commune} onPick={setCommune} />
    {inp("address", "Adresse de la salle (affichée sur la fiche)", 160)}
    <span className="uzu-label">Disciplines</span>
    <div className="uzu-chips">{(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={disc.includes(k) ? "on" : ""} aria-pressed={disc.includes(k)} onClick={() => setDisc(l => l.includes(k) ? l.filter(x => x !== k) : [...l, k])}>{DISC_LBL[k]}</button>)}</div>
    <label className="uzu-label" htmlFor="dir-description">Présentation</label><textarea id="dir-description" className="uzu-input" rows={3} maxLength={500} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} />
    <div className="uzu-row2">{inp("phone", "Téléphone public", 30, { inputMode: "tel" })}{inp("email", "Courriel public", 120, { inputMode: "email" })}</div>
    <div className="uzu-row2">{inp("website", "Site (https://…)", 200, { inputMode: "url" })}{inp("instagram", "Instagram", 60)}</div>
    <h3 className="uzu-h3">Conditions d&apos;accueil des visiteurs</h3>
    <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="dir-w-price">Tarif visiteur</label><input id="dir-w-price" className="uzu-input" maxLength={60} placeholder="Ex. gratuit, 10 € la séance" value={w.price || ""} onChange={e => setW({ ...w, price: e.target.value })} /></div>
      <div className="uzu-field"><label className="uzu-label" htmlFor="dir-w-license">Licence, assurance</label><input id="dir-w-license" className="uzu-input" maxLength={120} placeholder="Ex. licence fédérale demandée" value={w.license || ""} onChange={e => setW({ ...w, license: e.target.value })} /></div></div>
    <label className="uzu-label" htmlFor="dir-w-rules">À savoir</label><input id="dir-w-rules" className="uzu-input" maxLength={200} placeholder="Ex. kimono blanc ou bleu, rashguard obligatoire" value={w.rules || ""} onChange={e => setW({ ...w, rules: e.target.value })} />
    <Tick on={!!w.contact_first} onClick={() => setW({ ...w, contact_first: !w.contact_first })}>Les visiteurs doivent prévenir avant de venir</Tick>
    <h3 className="uzu-h3">Créneaux ouverts aux visiteurs</h3>
    {slots.length === 0 ? <p className="uzu-text uzu-muted">Aucun créneau dans le planning du club. Ajoute d&apos;abord tes cours dans le planning.</p>
      : <ul className="uzu-dir-slots">{slots.map(x => <li key={x.id} className={x.pub ? "on" : ""}>
        <Tick on={x.pub} onClick={() => setSlot(x.id, { pub: !x.pub, kind: x.kind || (x.course_kind === "open" ? "open_mat" : "open_class") })}>Ouvert aux visiteurs · {DSHORT[x.d]} {x.s}–{x.e}{x.t ? ` · ${x.t}` : ""}{x.disc ? ` · ${DISC_LBL[x.disc]}` : ""}</Tick>
        {x.pub && <div className="uzu-dir-slot-opts">
          <div className="uzu-chips uzu-chips--small" role="group" aria-label="Type de créneau">{(Object.keys(KIND_SHORT) as DirKind[]).map(k => <button key={k} type="button" className={x.kind === k ? "on" : ""} aria-pressed={x.kind === k} onClick={() => setSlot(x.id, { kind: k })}>{KIND_SHORT[k]}</button>)}</div>
          <div className="uzu-row2"><input className="uzu-input" aria-label="Tarif du créneau" maxLength={40} placeholder="Tarif (facultatif)" value={x.price} onChange={e => setSlot(x.id, { price: e.target.value })} />
            <input className="uzu-input" aria-label="Précision" maxLength={160} placeholder="Précision (facultatif)" value={x.notes} onChange={e => setSlot(x.id, { notes: e.target.value })} /></div>
        </div>}
      </li>)}</ul>}
    <button className="button button--dark uzu-wide" disabled={busy} onClick={save}>Enregistrer la fiche annuaire</button>
  </section>
}
