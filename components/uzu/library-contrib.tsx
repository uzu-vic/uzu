"use client"
// Bibliothèque technique — contributions et gestion du club (lot C).
// Adhérent : proposer (découverte, variante, vidéo ou lien, question), suivre ses contributions.
// Équipe : file « À valider », contenus du club, collections, disciplines et fiches masquées.
// Une contribution ne devient jamais officielle sans un relecteur autorisé : le serveur l'impose.
import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ExternalLink, Search } from "lucide-react"
import {
  archiveItem, clubItems, deleteCollection, KIND_TXT, matches, myItems, reviewItem, reviewQueue, saveCollection, saveItem, setDisciplines, setHidden,
  splitName, STATUS_TXT, videoSource, type ClubItem, type Collection, type ItemKind, type Library, type QueueItem,
} from "@/lib/uzu/library"

type Toast = (m: string) => void
const fiche = (lib: Library, id: string | null) => { const t = id ? (lib.byId[id] || lib.all.find(x => x.id === id)) : null; return t ? `${t.id} · ${splitName(t.name).main}` : "" }

// ---------------------------------------------------------------- Proposer
export type ProposeInit = { kind?: ItemKind; technique_id?: string; title?: string; body?: string }
export function ProposeForm({ lib, staff, init, edit, onDone, onCancel }: { lib: Library; staff: boolean; init?: ProposeInit; edit?: ClubItem | null; onDone: (msg: string) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<ItemKind>(edit?.kind || init?.kind || "variante")
  const [tech, setTech] = useState(edit?.technique_id || init?.technique_id || "")
  const [disc, setDisc] = useState(edit?.discipline_id || lib.disciplines[0]?.id || "")
  const [title, setTitle] = useState(edit?.title || init?.title || "")
  const [body, setBody] = useState(edit?.body || init?.body || "")
  const [url, setUrl] = useState(edit?.url || "")
  const [rights, setRights] = useState(!!edit?.rights_declared_at)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const kinds: [ItemKind, string][] = [["variante", "Variante"], ["lien", "Vidéo ou lien"], ["technique", "Découverte technique"], ["question", "Question"], ...(staff ? [["note", "Annotation"] as [ItemKind, string]] : [])]
  const needTech = !(kind === "technique" || kind === "question")
  const opts = useMemo(() => [...lib.all].sort((a, b) => a.id.localeCompare(b.id)), [lib.all])
  const send = async (submit: boolean) => {
    setErr("")
    if (!title.trim()) { setErr("Donne un titre à ta proposition."); return }
    if (needTech && !tech) { setErr("Choisis la fiche UZU concernée."); return }
    if (kind === "lien" && !url.trim()) { setErr("Ajoute le lien YouTube ou Instagram."); return }
    if (url.trim() && !videoSource(url.trim())) { setErr("Lien accepté : YouTube ou Instagram, en https."); return }
    if (submit && url.trim() && !rights) { setErr("Coche la déclaration d'accord des personnes filmées pour envoyer un lien."); return }
    setBusy(true)
    const r = await saveItem(edit?.id || null, { kind, technique_id: tech || null, discipline_id: tech ? null : disc, title: title.trim(), body: body.trim(), url: url.trim() || null, rights }, submit)
    setBusy(false)
    if (!r.ok) { setErr(r.msg); return }
    onDone(r.data.status === "publie" ? "Contenu publié pour le club" : r.data.status === "en_attente" ? "Proposition envoyée : un professeur va la relire" : "Brouillon enregistré")
  }
  return <form className="uzu-lib-fiche uzu-lib-form" onSubmit={e => { e.preventDefault(); send(true) }} aria-labelledby="prop-title">
    <button type="button" className="uzu-lib-back" onClick={onCancel}><ChevronLeft size={16} aria-hidden="true" />Retour</button>
    <div className="eyebrow">BIBLIOTHÈQUE DU CLUB</div>
    <h2 id="prop-title" className="uzu-lib-title">{edit ? "Modifier ma proposition" : "Proposer un contenu"}</h2>
    <p className="uzu-text">{staff ? "Si tu as le droit de valider, ton contenu est publié directement ; sinon il est relu avant d'être visible." : "Ta proposition est relue par un professeur avant d'être visible par le club. Elle ne devient jamais une technique officielle automatiquement."}</p>
    {edit?.review_note && <div className="uzu-lib-warn" role="note"><span><b>Message du professeur : </b>{edit.review_note}</span></div>}
    <fieldset className="uzu-lib-kinds"><legend className="uzu-label">Type</legend>
      {kinds.map(([k, l]) => <label key={k} className={kind === k ? "on" : ""}><input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />{l}</label>)}
    </fieldset>
    <label className="uzu-field"><span className="uzu-label">Fiche UZU concernée{needTech ? "" : " (facultatif)"}</span>
      <select className="uzu-input" value={tech} onChange={e => setTech(e.target.value)}>
        <option value="">{needTech ? "Choisir une fiche" : "Aucune fiche"}</option>
        {opts.map(t => <option key={t.id} value={t.id}>{t.id} · {splitName(t.name).main}</option>)}
      </select></label>
    {!tech && !needTech && lib.disciplines.length > 1 && <label className="uzu-field"><span className="uzu-label">Discipline</span>
      <select className="uzu-input" value={disc} onChange={e => setDisc(e.target.value)}>{lib.disciplines.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>}
    <label className="uzu-field"><span className="uzu-label">Titre</span><input className="uzu-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder={kind === "question" ? "Ex. Quand préférer le Knee Cut au Torreando ?" : "Ex. Variante avec saisie des genoux"} /></label>
    <label className="uzu-field"><span className="uzu-label">{kind === "question" ? "Ta question" : "Explication"}</span><textarea className="uzu-input" rows={5} maxLength={4000} value={body} onChange={e => setBody(e.target.value)} placeholder="Position de départ, prises, points clés." /></label>
    <label className="uzu-field"><span className="uzu-label">Lien YouTube ou Instagram{kind === "lien" ? "" : " (facultatif)"}</span><input className="uzu-input" type="url" inputMode="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
      <small className="uzu-muted">Le lien est enregistré tel quel avec sa source : rien n'est copié.</small></label>
    {url.trim() && <label className="uzu-lib-consent"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} />
      <span>Les personnes filmées, et les représentants légaux des mineurs, ont donné leur accord pour cette vidéo.</span></label>}
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <div className="uzu-lib-actions">
      <button type="button" className="button button--outline" disabled={busy} onClick={() => send(false)}>Enregistrer le brouillon</button>
      <button type="submit" className="button button--dark" disabled={busy}>{busy ? "Envoi…" : staff ? "Publier ou envoyer" : "Envoyer pour validation"}</button>
    </div>
  </form>
}

// ---------------------------------------------------------------- Mes contributions
export function MyContributions({ lib, uid, onEdit, onBack, onToast }: { lib: Library; uid: string; onEdit: (it: ClubItem) => void; onBack: () => void; onToast: Toast }) {
  const [list, setList] = useState<ClubItem[] | null>(null)
  const [err, setErr] = useState("")
  const [tick, setTick] = useState(0)
  useEffect(() => { let live = true; myItems(uid).then(r => { if (!live) return; if (r.ok) setList(r.data); else setErr(r.msg) }); return () => { live = false } }, [uid, tick])
  return <section className="uzu-lib-fiche" aria-labelledby="mine-title">
    <button type="button" className="uzu-lib-back" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />Bibliothèque</button>
    <h2 id="mine-title" className="uzu-lib-title">Mes contributions</h2>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    {!list ? <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p> : !list.length ? <p className="uzu-lib-empty">Tu n'as encore rien proposé.</p>
      : <ul className="uzu-lib-list">{list.map(it => <li key={it.id} className="panel uzu-lib-text">
        <span className="uzu-lib-badges"><span className={`uzu-lib-badge uzu-lib-status--${it.status}`}>{STATUS_TXT[it.status]}</span><span className="uzu-lib-badge uzu-lib-badge--plain">{KIND_TXT[it.kind]}</span>{it.technique_id && <span className="uzu-lib-badge uzu-lib-badge--plain">{fiche(lib, it.technique_id)}</span>}</span>
        <b>{it.title}</b>
        {it.review_note && (it.status === "a_completer" || it.status === "refuse") && <p className="uzu-lib-note">Message du professeur : {it.review_note}</p>}
        <div className="uzu-lib-actions uzu-lib-actions--left">
          {["brouillon", "a_completer", "refuse"].includes(it.status) && <button type="button" className="button button--outline" onClick={() => onEdit(it)}>{it.status === "brouillon" ? "Reprendre" : "Compléter et renvoyer"}</button>}
          {it.status !== "archive" && <button type="button" className="text-link" onClick={async () => { const r = await archiveItem(it.id); onToast(r.ok ? "Contribution archivée" : r.msg); if (r.ok) setTick(x => x + 1) }}>Archiver</button>}
        </div>
      </li>)}</ul>}
  </section>
}

// ---------------------------------------------------------------- Espace club : bibliothèque
export type ClubTab = "queue" | "items" | "collections" | "settings"
export function ClubLibrary({ lib, onToast, onChanged, tab: tabIn, onTab }: { lib: Library; onToast: Toast; onChanged: () => void; tab?: ClubTab | ""; onTab?: (t: ClubTab) => void }) {
  const c = lib.ctx
  const tabs: [ClubTab, string][] = [
    ...(c.can_review ? [["queue", `À valider${c.pending ? ` (${c.pending})` : ""}`] as [ClubTab, string]] : []),
    ["items", "Contenus du club"],
    ...(c.can_manage ? [["collections", "Collections"] as [ClubTab, string]] : []),
    ...(c.can_manage || c.can_configure ? [["settings", "Réglages"] as [ClubTab, string]] : []),
  ]
  const [own, setOwn] = useState<ClubTab>(tabs[0][0])
  const tab = tabIn && tabs.some(x => x[0] === tabIn) ? tabIn : own
  const setTab = (t: ClubTab) => { setOwn(t); if (onTab) onTab(t) }
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-labelledby="club-lib-title">
    <div className="section-title"><h2 id="club-lib-title">Bibliothèque technique</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Catalogue UZU commun et contenus privés du club. Rien n'est publié sans validation.</p>
    <div className="uzu-chips uzu-chips--small uzu-tabs" role="group" aria-label="Bibliothèque du club">
      {tabs.map(([k, l]) => <button key={k} type="button" className={tab === k ? "on" : ""} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    {tab === "queue" && <ReviewQueue lib={lib} onToast={onToast} onChanged={onChanged} />}
    {tab === "items" && <ClubItemsList lib={lib} canArchive={c.can_review} onToast={onToast} onChanged={onChanged} />}
    {tab === "collections" && <Collections lib={lib} onToast={onToast} onChanged={onChanged} />}
    {tab === "settings" && <Settings lib={lib} onToast={onToast} onChanged={onChanged} />}
  </section>
}

function ReviewQueue({ lib, onToast, onChanged }: { lib: Library; onToast: Toast; onChanged: () => void }) {
  const [list, setList] = useState<QueueItem[] | null>(null)
  const [err, setErr] = useState("")
  const [open, setOpen] = useState<{ id: string; mode: "refuser" | "preciser" | "corriger" } | null>(null)
  const [note, setNote] = useState(""), [fix, setFix] = useState({ title: "", body: "" })
  const [tick, setTick] = useState(0)
  useEffect(() => { let live = true; reviewQueue().then(r => { if (!live) return; if (r.ok) setList(Array.isArray(r.data) ? r.data : []); else setErr(r.msg) }); return () => { live = false } }, [tick])
  const decide = async (it: QueueItem, d: "publier" | "refuser" | "preciser", patch?: { title: string; body: string }) => {
    if (d !== "publier" && note.trim().length < 3) { onToast("Indique un motif : il est envoyé à l'auteur"); return }
    const r = await reviewItem(it.id, d, d === "publier" ? "" : note.trim(), patch || null)
    onToast(r.ok ? (d === "publier" ? "Contenu validé et publié" : d === "refuser" ? "Proposition refusée" : "Demande de précisions envoyée") : r.msg)
    if (r.ok) { setOpen(null); setNote(""); setTick(x => x + 1); onChanged() }
  }
  if (err) return <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
  if (!list) return <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p>
  if (!list.length) return <p className="uzu-lib-empty">Aucune proposition en attente.</p>
  return <ul className="uzu-lib-list">{list.map(it => { const src = videoSource(it.url); return <li key={it.id} className="uzu-lib-text uzu-lib-queue">
    <span className="uzu-lib-badges"><span className="uzu-lib-badge uzu-lib-badge--plain">{KIND_TXT[it.kind]}</span>{it.technique_id && <span className="uzu-lib-badge uzu-lib-badge--plain">{fiche(lib, it.technique_id)}</span>}</span>
    <b>{it.title}</b>{it.body && <p>{it.body}</p>}
    {src && it.url && <a className="uzu-lib-row panel" href={it.url} target="_blank" rel="noopener noreferrer"><span><b>Lien {src}</b><small>{it.rights_declared_at ? "Accord des personnes filmées déclaré le " + new Date(it.rights_declared_at).toLocaleDateString("fr-FR") : "Accord non déclaré"}</small></span><ExternalLink size={16} aria-hidden="true" /></a>}
    <small className="uzu-muted">Proposé par {it.author_name} · {({ student: "élève", owner: "responsable", instructor: "professeur", assistant: "assistant", section_lead: "responsable de section" } as Record<string, string>)[it.author_role] || "membre"}</small>
    {open?.id === it.id && open.mode !== "corriger" && <label className="uzu-field"><span className="uzu-label">Motif (obligatoire, envoyé à l'auteur)</span><textarea className="uzu-input" rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>}
    {open?.id === it.id && open.mode === "corriger" && <><label className="uzu-field"><span className="uzu-label">Titre corrigé</span><input className="uzu-input" maxLength={120} value={fix.title} onChange={e => setFix({ ...fix, title: e.target.value })} /></label>
      <label className="uzu-field"><span className="uzu-label">Texte corrigé</span><textarea className="uzu-input" rows={4} maxLength={4000} value={fix.body} onChange={e => setFix({ ...fix, body: e.target.value })} /></label></>}
    <div className="uzu-lib-actions uzu-lib-actions--3">
      {open?.id === it.id ? <>
        <button type="button" className="button button--dark" onClick={() => open.mode === "corriger" ? decide(it, "publier", fix) : decide(it, open.mode)}>{open.mode === "refuser" ? "Confirmer le refus" : open.mode === "preciser" ? "Envoyer la demande" : "Publier la version corrigée"}</button>
        <button type="button" className="button button--outline" onClick={() => setOpen(null)}>Annuler</button>
      </> : <>
        <button type="button" className="button button--dark" onClick={() => decide(it, "publier")}>Valider</button>
        <button type="button" className="button button--outline" onClick={() => { setNote(""); setOpen({ id: it.id, mode: "preciser" }) }}>À compléter</button>
        <button type="button" className="button button--outline" onClick={() => { setNote(""); setOpen({ id: it.id, mode: "refuser" }) }}>Refuser</button>
        <button type="button" className="text-link" onClick={() => { setFix({ title: it.title, body: it.body }); setOpen({ id: it.id, mode: "corriger" }) }}>Corriger avant de publier</button>
      </>}
    </div>
  </li> })}</ul>
}

function ClubItemsList({ lib, canArchive, onToast, onChanged }: { lib: Library; canArchive: boolean; onToast: Toast; onChanged: () => void }) {
  const [list, setList] = useState<ClubItem[] | null>(null)
  const [tick, setTick] = useState(0)
  useEffect(() => { let live = true; clubItems().then(r => { if (live) setList(r.ok ? r.data : []) }); return () => { live = false } }, [tick])
  if (!list) return <p className="uzu-text uzu-muted" aria-busy="true">Chargement…</p>
  if (!list.length) return <p className="uzu-lib-empty">Aucun contenu publié par le club pour l'instant.</p>
  return <ul className="uzu-lib-list">{list.map(it => <li key={it.id} className="uzu-lib-text uzu-lib-queue">
    <span className="uzu-lib-badges"><span className={`uzu-lib-badge uzu-lib-status--${it.status}`}>{STATUS_TXT[it.status]}</span><span className="uzu-lib-badge uzu-lib-badge--plain">{KIND_TXT[it.kind]}</span>{it.technique_id && <span className="uzu-lib-badge uzu-lib-badge--plain">{fiche(lib, it.technique_id)}</span>}</span>
    <b>{it.title}</b>
    {canArchive && it.status === "publie" && <div className="uzu-lib-actions uzu-lib-actions--left"><button type="button" className="text-link" onClick={async () => { const r = await archiveItem(it.id); onToast(r.ok ? "Contenu archivé : il n'est plus visible des élèves" : r.msg); if (r.ok) { setTick(x => x + 1); onChanged() } }}>Archiver</button></div>}
  </li>)}</ul>
}

function Collections({ lib, onToast, onChanged }: { lib: Library; onToast: Toast; onChanged: () => void }) {
  const [edit, setEdit] = useState<Collection | "new" | null>(null)
  const [name, setName] = useState(""), [desc, setDesc] = useState(""), [sel, setSel] = useState<string[]>([]), [q, setQ] = useState("")
  const start = (c: Collection | "new") => { setEdit(c); setName(c === "new" ? "" : c.name); setDesc(c === "new" ? "" : c.description); setSel(c === "new" ? [] : c.items.map(x => x.technique_id).filter((x): x is string => !!x)); setQ("") }
  const save = async () => {
    if (!edit) return
    const id = edit === "new" ? null : edit.id
    const r = await saveCollection(id, name.trim(), desc.trim(), edit === "new" ? lib.collections.length + 1 : edit.position, sel.map(t => ({ t })))
    onToast(r.ok ? "Collection enregistrée" : r.msg); if (r.ok) { setEdit(null); onChanged() }
  }
  if (edit) return <div className="uzu-lib-form">
    <label className="uzu-field"><span className="uzu-label">Nom</span><input className="uzu-input" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Ex. Programme ceinture bleue" /></label>
    <label className="uzu-field"><span className="uzu-label">Description (facultatif)</span><input className="uzu-input" maxLength={500} value={desc} onChange={e => setDesc(e.target.value)} /></label>
    <p className="uzu-text uzu-small">{sel.length} fiche{sel.length > 1 ? "s" : ""} dans l'ordre choisi : {sel.map(id => fiche(lib, id)).join(" → ") || "aucune"}</p>
    <label className="uzu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Chercher une fiche</span><input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une fiche" /></label>
    <ul className="uzu-lib-picks">{lib.techniques.filter(t => matches(t, q)).slice(0, 40).map(t => <li key={t.id}><label><input type="checkbox" checked={sel.includes(t.id)} onChange={e => setSel(s => e.target.checked ? [...s, t.id] : s.filter(x => x !== t.id))} />{t.id} · {splitName(t.name).main}</label></li>)}</ul>
    <div className="uzu-lib-actions"><button type="button" className="button button--outline" onClick={() => setEdit(null)}>Annuler</button><button type="button" className="button button--dark" onClick={save}>Enregistrer la collection</button></div>
  </div>
  return <div className="uzu-lib-list">
    {lib.collections.length ? lib.collections.map(c => <div key={c.id} className="uzu-lib-text uzu-lib-queue">
      <b>{c.name}</b>{c.description && <p>{c.description}</p>}
      <small className="uzu-muted">{c.items.map(x => x.technique_id ? fiche(lib, x.technique_id) : "Contenu du club").join(" → ") || "Vide"}</small>
      <div className="uzu-lib-actions uzu-lib-actions--left"><button type="button" className="button button--outline" onClick={() => start(c)}>Modifier</button>
        <button type="button" className="text-link" onClick={async () => { if (!window.confirm(`Supprimer la collection « ${c.name} » ? Les fiches ne sont pas touchées.`)) return; const r = await deleteCollection(c.id); onToast(r.ok ? "Collection supprimée" : r.msg); if (r.ok) onChanged() }}>Supprimer</button></div>
    </div>) : <p className="uzu-lib-empty">Aucune collection. Regroupe des fiches dans l'ordre où tu les enseignes.</p>}
    <button type="button" className="button button--dark" onClick={() => start("new")}>Nouvelle collection</button>
  </div>
}

function Settings({ lib, onToast, onChanged }: { lib: Library; onToast: Toast; onChanged: () => void }) {
  const c = lib.ctx
  const [disc, setDisc] = useState<string[]>(c.disciplines)
  const [q, setQ] = useState("")
  const hidden = new Set(c.hidden)
  return <div className="uzu-lib-form">
    {c.can_configure && <fieldset className="uzu-lib-kinds"><legend className="uzu-label">Disciplines ouvertes dans la bibliothèque</legend>
      {[{ id: "jjb_gi", label: "JJB Gi" }, { id: "grappling_nogi", label: "Grappling No-Gi" }].map(d => <label key={d.id} className={disc.includes(d.id) ? "on" : ""}><input type="checkbox" checked={disc.includes(d.id)} onChange={e => setDisc(s => e.target.checked ? [...s, d.id] : s.filter(x => x !== d.id))} />{d.label}</label>)}
      <span className="uzu-text uzu-small uzu-muted">MMA : prévu plus tard.</span>
      <button type="button" className="button button--dark" disabled={!disc.length} onClick={async () => { const r = await setDisciplines(disc); onToast(r.ok ? "Disciplines enregistrées" : r.msg); if (r.ok) onChanged() }}>Enregistrer</button>
    </fieldset>}
    {c.can_manage && <>
      <h3 className="uzu-h3">Fiches non enseignées au club</h3>
      <p className="uzu-text uzu-small uzu-muted">Une fiche masquée n'apparaît plus pour les membres du club. Le catalogue UZU n'est pas modifié.</p>
      <label className="uzu-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Chercher une fiche</span><input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Chercher une fiche" /></label>
      <ul className="uzu-lib-picks">{lib.all.filter(t => matches(t, q)).slice(0, 40).map(t => <li key={t.id}><label><input type="checkbox" checked={hidden.has(t.id)} onChange={async e => { const r = await setHidden(t.id, e.target.checked); onToast(r.ok ? (e.target.checked ? "Fiche masquée" : "Fiche visible") : r.msg); if (r.ok) onChanged() }} />Masquer {t.id} · {splitName(t.name).main}</label></li>)}</ul>
    </>}
  </div>
}
