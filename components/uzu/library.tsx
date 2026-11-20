"use client"
// Bibliothèque technique — volets « Bibliothèque » et « Enchaînements » de Techniques, et fiche technique.
// Lecture seule (lot B). Rien n'est présenté comme validé : le texte du document et les propositions
// UZU (corrections, fiches complémentaires, suites de branche) sont toujours distingués.
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, ExternalLink, Search } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import {
  childrenOf, fichesForName, flowsOfTechnique, setDetails, KIND_LABEL, loadLibrary, matches, RESTRICTED_TXT, splitName, starsFor, techsOfStep, videoSource,
  type Library, type LibraryState, type LibStep, type LibTechnique,
} from "@/lib/uzu/library"
import { Stars } from "@/components/uzu/progress"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** tick > 0 : recharge (après une modification) */
export function useLibrary(ctx: UzuContext | null, tick = 0): LibraryState {
  const [st, setSt] = useState<LibraryState>({ status: "loading" })
  const key = ctx?.club?.id || ""
  useEffect(() => {
    if (!ctx) return
    if (!key || ctx.role === "solo") { setSt({ status: "unavailable" }); return }
    let live = true
    loadLibrary(key, tick > 0).then(s => { if (live) setSt(s) })
    return () => { live = false }
  }, [key, ctx?.role, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  return st
}

export type Volet = "prog" | "lib" | "flows"
export function VoletTabs({ value, onChange }: { value: Volet; onChange: (v: Volet) => void }) {
  const tabs: [Volet, string][] = [["prog", "Ma progression"], ["lib", "Bibliothèque"], ["flows", "Enchaînements"]]
  return <nav className="uzu-lib-volets" aria-label="Volets de Techniques">
    {tabs.map(([k, l]) => <button key={k} type="button" className={value === k ? "on" : ""} aria-current={value === k ? "page" : undefined} onClick={() => onChange(k)}>{l}</button>)}
  </nav>
}

function Badge({ kind, children }: { kind: "ref" | "prop" | "wait" | "club" | "plain" | "warn"; children: React.ReactNode }) {
  return <span className={`uzu-lib-badge uzu-lib-badge--${kind}`}>{children}</span>
}
function OriginBadges({ t }: { t: LibTechnique }) {
  return <>
    {t.origin === "document" ? <Badge kind="ref">Référence UZU</Badge> : <Badge kind="prop">Proposée par UZU</Badge>}
    {t.validation_status === "validee" ? <Badge kind="club">Validée</Badge> : <Badge kind="wait">À valider</Badge>}
  </>
}

// ---------------------------------------------------------------- Volet Bibliothèque
type Filter = "all" | "ref" | "prop" | "club"
export function LibraryPane({ lib, C, P, onOpen, onPropose, onMine, initialQuery = "", initialLinked = "" }: { lib: Library; C: Any; P: Any; onOpen: (id: string) => void; onPropose?: () => void; onMine?: () => void; initialQuery?: string; initialLinked?: string }) {
  const [col, setCol] = useState("")
  const collection = lib.collections.find(c => c.id === col) || null
  const [disc, setDisc] = useState(lib.disciplines[0]?.id || "")
  const [q, setQ] = useState(initialQuery)
  const [linked, setLinked] = useState(initialLinked)
  const linkedIds = useMemo(() => linked ? new Set(fichesForName(lib, linked, C).map(t => t.id)) : null, [linked, lib, C])
  const [origin, setOrigin] = useState<Filter>("all")
  const [withVideo, setWithVideo] = useState(false)
  const [mine, setMine] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const clubCount = useMemo(() => { const m: Record<string, { all: number; video: number }> = {}; for (const it of lib.items) { if (!it.technique_id) continue; const x = m[it.technique_id] || (m[it.technique_id] = { all: 0, video: 0 }); x.all++; if (videoSource(it.url)) x.video++ } return m }, [lib.items])
  const searching = q.trim().length > 0 || !!linkedIds
  const list = lib.techniques.filter(t => (searching || t.discipline_id === disc) && matches(t, q) && (!linkedIds || linkedIds.has(t.id))
    && (origin === "all" || (origin === "ref" && t.origin === "document") || (origin === "prop" && t.origin === "proposition") || (origin === "club" && !!clubCount[t.id]))
    && (!withVideo || !!clubCount[t.id]?.video)
    && (!mine || (starsFor(t, C, P)?.lvl || 0) > 0))
  const filtered = searching || origin !== "all" || withVideo || mine
  const cats = lib.categories.filter(c => searching ? list.some(t => t.category_id === c.id) : c.discipline_id === disc)
  const discLabel = (id: string) => lib.disciplines.find(d => d.id === id)?.label || ""
  if (collection) {
    const ids = collection.items.map(x => x.technique_id).filter((x): x is string => !!x && !!lib.byId[x])
    return <div className="uzu-lib">
      <button type="button" className="uzu-lib-back" onClick={() => setCol("")}><ChevronLeft size={16} aria-hidden="true" />Toute la bibliothèque</button>
      <div className="eyebrow">COLLECTION DU CLUB</div>
      <h2 className="uzu-lib-title uzu-lib-title--flow">{collection.name}</h2>
      {collection.description && <p className="uzu-text">{collection.description}</p>}
      <ol className="uzu-lib-cards uzu-lib-cat">{ids.map((id, i) => { const t = lib.byId[id], nm = splitName(t.name); return <li key={id}><button type="button" className="uzu-lib-card" onClick={() => onOpen(id)}>
        <span className="uzu-lib-card-top"><b>{i + 1}. {nm.main}</b><ChevronRight size={15} aria-hidden="true" /></span>{nm.sub && <small className="uzu-lib-card-sub">{nm.sub}</small>}</button></li> })}</ol>
      {!ids.length && <p className="uzu-lib-empty">Cette collection est vide.</p>}
    </div>
  }
  return <div className="uzu-lib">
    {(onPropose || onMine) && <div className="uzu-lib-actions uzu-lib-actions--left">
      {onPropose && <button type="button" className="button button--dark" onClick={onPropose}>Proposer un contenu</button>}
      {onMine && <button type="button" className="button button--outline" onClick={onMine}>Mes contributions</button>}
    </div>}
    {lib.collections.length > 0 && <div className="uzu-lib-colls"><span className="uzu-label">Collections du club</span><div className="uzu-chips uzu-chips--small">{lib.collections.map(c => <button key={c.id} type="button" onClick={() => setCol(c.id)}>{c.name}</button>)}</div></div>}
    {lib.disciplines.length > 1 && <div className="uzu-lib-disc" role="group" aria-label="Discipline">
      {lib.disciplines.map(d => <button key={d.id} type="button" aria-pressed={disc === d.id && !searching} className={disc === d.id && !searching ? "on" : ""} onClick={() => { setDisc(d.id); setQ("") }}>{d.label}</button>)}
    </div>}
    <label className="uzu-search uzu-lib-search"><Search size={16} aria-hidden="true" /><span className="sr-only">Rechercher une technique</span>
      <input className="uzu-input" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Nom ou autre nom (ex. Knee Slice)" /></label>
    <div className="uzu-chips uzu-chips--small uzu-lib-filters">
      <label className="uzu-lib-select"><span className="sr-only">Provenance</span>
        <select className="uzu-input" value={origin} onChange={e => setOrigin(e.target.value as Filter)}>
          <option value="all">Toutes provenances</option><option value="ref">Référence UZU</option><option value="club">Avec contenu du club</option>
        </select></label>
      <button type="button" className={withVideo ? "on" : ""} aria-pressed={withVideo} onClick={() => setWithVideo(v => !v)}>Avec vidéo</button>
      <button type="button" className={mine ? "on" : ""} aria-pressed={mine} onClick={() => setMine(v => !v)}>Que je travaille</button>
    </div>
    {linked && <div className="uzu-chips uzu-chips--small"><button type="button" className="on" onClick={() => setLinked("")} aria-label={`Retirer le filtre « liées à ${linked} »`}>Liées à « {linked} » ✕</button></div>}
    {searching && <p className="uzu-text uzu-small uzu-muted" role="status">{list.length} résultat{list.length > 1 ? "s" : ""} dans {lib.disciplines.length > 1 ? "toutes les disciplines" : discLabel(disc)}</p>}
    {!list.length && <p className="uzu-text uzu-muted">Aucune fiche ne correspond.</p>}
    <div className="uzu-lib-cats">{cats.map(c => {
      const items = list.filter(t => t.category_id === c.id).sort((a, b) => a.position - b.position)
      if (!items.length) return null
      const isOpen = filtered || !!open[c.id]
      return <section key={c.id} className="uzu-lib-cat">
        <button type="button" className="uzu-lib-cat-head" aria-expanded={isOpen} onClick={() => setOpen(o => ({ ...o, [c.id]: !isOpen }))}>
          <span>{searching && lib.disciplines.length > 1 ? discLabel(c.discipline_id) + " · " : ""}{c.label}</span><span className="uzu-lib-count">{items.length}<ChevronDown size={15} aria-hidden="true" /></span>
        </button>
        {isOpen && <ul className="uzu-lib-cards">{items.map(t => {
          const nm = splitName(t.name), s = starsFor(t, C, P), fl = flowsOfTechnique(lib, t.id), cc = clubCount[t.id]
          return <li key={t.id}><button type="button" className="uzu-lib-card" onClick={() => onOpen(t.id)}>
            <span className="uzu-lib-card-top"><b>{nm.main}</b>{s ? <Stars lvl={s.lvl} review={s.review} /> : <small className="uzu-muted">Non suivie</small>}</span>
            <small className="uzu-lib-card-sub">{[nm.sub, t.aliases.length ? "aussi « " + t.aliases.join(" », « ") + " »" : ""].filter(Boolean).join(" · ") || t.id}</small>
            <span className="uzu-lib-badges">
              {t.origin === "document" ? <Badge kind="plain">Référence UZU · à valider</Badge> : <Badge kind="prop">Proposée par UZU · à valider</Badge>}
              {t.restricted && <Badge kind="warn">Clé de talon</Badge>}
              {cc && <Badge kind="club">{cc.all} contenu{cc.all > 1 ? "s" : ""} du club</Badge>}
              {fl.map(f => <Badge key={f.flow.id} kind="plain">{f.flow.id}</Badge>)}
            </span>
          </button></li>
        })}</ul>}
      </section>
    })}</div>
    <p className="uzu-text uzu-small uzu-muted">Fiches issues du programme technique du club, en attente de validation par un professeur qualifié. Les fiches « Proposées par UZU » complètent les enchaînements.</p>
  </div>
}

// ---------------------------------------------------------------- Fiche technique
export function FicheView({ lib, C, P, id, onBack, onOpenFlow, onPropose }: { lib: Library; C: Any; P: Any; id: string; onBack: () => void; onOpenFlow: (flowId: string) => void; onPropose?: (init: { kind: "variante" | "lien" | "question"; technique_id: string; title?: string }) => void }) {
  const t = lib.byId[id]
  useEffect(() => { window.scrollTo(0, 0) }, [id])
  if (!t) return <section className="panel"><button type="button" className="text-link" onClick={onBack}><ChevronLeft size={15} />Bibliothèque</button><p className="uzu-text">Cette fiche n'est pas disponible dans ton club.</p></section>
  const nm = splitName(t.name), s = starsFor(t, C, P)
  const disc = lib.disciplines.find(d => d.id === t.discipline_id)?.label || ""
  const cat = lib.categories.find(c => c.id === t.category_id)?.label || ""
  const items = lib.items.filter(x => x.technique_id === t.id)
  const videos = items.filter(x => videoSource(x.url)), notes = items.filter(x => !videoSource(x.url))
  const flows = flowsOfTechnique(lib, t.id)
  return <article className="uzu-lib-fiche" aria-labelledby="fiche-title">
    <button type="button" className="uzu-lib-back" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />Bibliothèque</button>
    <div className="eyebrow">{[disc, cat, t.id].filter(Boolean).join(" · ").toUpperCase()}</div>
    <h2 id="fiche-title" className="uzu-lib-title">{nm.main}</h2>
    {nm.sub && <p className="uzu-lib-subtitle">{nm.sub}</p>}
    <div className="uzu-lib-badges"><OriginBadges t={t} />{t.aliases.length > 0 && <Badge kind="plain">Aussi : {t.aliases.join(", ")}</Badge>}</div>
    {t.restricted && <div className="uzu-lib-warn" role="note"><AlertTriangle size={17} aria-hidden="true" /><span>{RESTRICTED_TXT[t.restricted] || "Technique à encadrer."}</span></div>}
    {s && <div className="panel uzu-lib-prog"><span><small>Ma progression</small><b>{s.name}</b></span><Stars lvl={s.lvl} review={s.review} /></div>}
    <section className="uzu-lib-sec" aria-labelledby="fiche-desc"><h3 id="fiche-desc">Description</h3>
      {t.source_text && <div className="panel uzu-lib-text"><span className="uzu-lib-label">Texte du document</span><p>{t.source_text}</p></div>}
      {t.proposed_text && <div className="uzu-lib-text uzu-lib-text--prop"><span className="uzu-lib-label">{t.source_text ? "Correction proposée · à valider par un professeur" : "Description proposée par UZU · à valider par un professeur"}</span><p>{t.proposed_text}</p></div>}
    </section>
    <FicheDetailsSection key={t.id} lib={lib} t={t} />
    {flows.length > 0 && <section className="uzu-lib-sec" aria-labelledby="fiche-flows"><h3 id="fiche-flows">Dans les enchaînements</h3>
      {flows.map(f => <button key={f.flow.id} type="button" className="panel uzu-lib-row" onClick={() => onOpenFlow(f.flow.id)}>
        <span><b>{f.flow.id} · {f.flow.title.replace(/^Le système « (.+) »$/, "$1")}</b><small>{KIND_LABEL[f.step.kind]}{f.step.branch_label ? " · " + f.step.branch_label : ""}</small></span><ChevronRight size={16} aria-hidden="true" /></button>)}
    </section>}
    <section className="uzu-lib-sec" aria-labelledby="fiche-videos"><h3 id="fiche-videos">Vidéos du club</h3>
      {videos.length ? videos.map(v => <a key={v.id} className="panel uzu-lib-row" href={v.url || "#"} target="_blank" rel="noopener noreferrer">
        <span><b>{v.title}</b><small>{videoSource(v.url)} · s'ouvre dans un nouvel onglet</small></span><ExternalLink size={16} aria-hidden="true" /></a>)
        : <p className="uzu-lib-empty">Aucune vidéo du club pour cette fiche.</p>}
    </section>
    <section className="uzu-lib-sec" aria-labelledby="fiche-club"><h3 id="fiche-club">Variantes et notes du club</h3>
      {notes.length ? notes.map(n => <div key={n.id} className="panel uzu-lib-text"><span className="uzu-lib-badges"><Badge kind="club">Validée par le club</Badge><Badge kind="plain">{({ technique: "Technique du club", variante: "Variante", note: "Note", lien: "Lien", astuce: "Astuce" } as Record<string, string>)[n.kind]}</Badge></span>
        <b>{n.title}</b>{n.body && <p>{n.body}</p>}</div>)
        : <p className="uzu-lib-empty">Pas encore de variante ni de note du club.</p>}
    </section>
    {onPropose && <div className="uzu-lib-actions">
      <button type="button" className="button button--dark" onClick={() => onPropose({ kind: "variante", technique_id: t.id })}>Proposer une variante</button>
      <button type="button" className="button button--outline" onClick={() => onPropose({ kind: "lien", technique_id: t.id })}>Proposer une vidéo</button>
      <button type="button" className="text-link" onClick={() => onPropose({ kind: "question", technique_id: t.id, title: "Remarque sur la fiche " + t.id })}>Poser une question ou signaler une erreur</button>
    </div>}
  </article>
}

// Étapes pédagogiques, points de vigilance, niveau : vides par défaut, remplis par les professeurs
// autorisés du club (décision D3). Le catalogue UZU n'est jamais modifié.
function FicheDetailsSection({ lib, t }: { lib: Library; t: LibTechnique }) {
  const d0 = lib.details[t.id] || { steps: "", vigilance: "", level: null }
  const [d, setD] = useState(d0)
  const [edit, setEdit] = useState(false)
  const [draft, setDraft] = useState(d0)
  const [msg, setMsg] = useState("")
  const canEdit = lib.ctx.can_review || lib.ctx.can_manage
  const empty = !d.steps && !d.vigilance && !d.level
  if (empty && !canEdit) return null
  if (edit) return <section className="uzu-lib-sec uzu-lib-form" aria-labelledby="fiche-det">
    <h3 id="fiche-det">Compléter la fiche pour le club</h3>
    <label className="uzu-field"><span className="uzu-label">Étapes pédagogiques</span><textarea className="uzu-input" rows={5} maxLength={3000} value={draft.steps} onChange={e => setDraft({ ...draft, steps: e.target.value })} placeholder={"1. …\n2. …"} /></label>
    <label className="uzu-field"><span className="uzu-label">Points de vigilance</span><textarea className="uzu-input" rows={3} maxLength={2000} value={draft.vigilance} onChange={e => setDraft({ ...draft, vigilance: e.target.value })} /></label>
    <label className="uzu-field"><span className="uzu-label">Niveau</span><select className="uzu-input" value={draft.level ?? ""} onChange={e => setDraft({ ...draft, level: e.target.value ? Number(e.target.value) : null })}>
      <option value="">Non défini</option><option value="1">★ Débutant</option><option value="2">★★ Intermédiaire</option><option value="3">★★★ Avancé</option></select></label>
    {msg && <div className="uzu-banner uzu-banner--error" role="alert">{msg}</div>}
    <div className="uzu-lib-actions"><button type="button" className="button button--outline" onClick={() => { setEdit(false); setMsg("") }}>Annuler</button>
      <button type="button" className="button button--dark" onClick={async () => { const r = await setDetails(t.id, draft.steps.trim(), draft.vigilance.trim(), draft.level); if (!r.ok) { setMsg(r.msg); return } setD(draft); setEdit(false) }}>Enregistrer</button></div>
  </section>
  return <section className="uzu-lib-sec" aria-labelledby="fiche-det">
    <h3 id="fiche-det">Repères du club</h3>
    {empty ? <p className="uzu-lib-empty">Étapes pédagogiques, points de vigilance et niveau : pas encore renseignés par les professeurs du club.</p> : <div className="panel uzu-lib-text">
      {d.level ? <span className="uzu-lib-badges"><span className="uzu-lib-badge uzu-lib-badge--plain">Niveau {"★".repeat(d.level)}</span></span> : null}
      {d.steps && <><span className="uzu-lib-label">Étapes pédagogiques</span><p>{d.steps}</p></>}
      {d.vigilance && <><span className="uzu-lib-label">Points de vigilance</span><p>{d.vigilance}</p></>}
      <small className="uzu-muted">Rédigé par les professeurs du club.</small>
    </div>}
    {canEdit && <button type="button" className="button button--outline uzu-lib-self" onClick={() => { setDraft(d); setEdit(true) }}>{empty ? "Compléter la fiche" : "Modifier les repères"}</button>}
  </section>
}

// ---------------------------------------------------------------- Volet Enchaînements
export function FlowsPane({ lib, flowId, onFlow, onOpen }: { lib: Library; flowId: string; onFlow: (id: string) => void; onOpen: (id: string) => void }) {
  const flow = lib.flows.find(f => f.id === flowId) || lib.flows[0]
  const [choice, setChoice] = useState<Record<string, string>>({})
  useEffect(() => { setChoice({}) }, [flow?.id])
  if (!flow) return <p className="uzu-text uzu-muted">Aucun enchaînement pour les disciplines de ton club.</p>
  const disc = lib.disciplines.find(d => d.id === flow.discipline_id)?.label || ""
  // Chemin suivi : à chaque embranchement, la branche choisie (par défaut la première issue du document)
  const path: (LibStep | { fork: LibStep[]; parent: string })[] = []
  let cur: LibStep[] = childrenOf(lib, flow.id, null), guard = 0
  while (cur.length && guard++ < 40) {
    if (cur.length === 1) { path.push(cur[0]); cur = childrenOf(lib, flow.id, cur[0].id); continue }
    const parent = cur[0].parent_id || "root"
    const pick = cur.find(s => s.id === choice[parent]) || cur.find(s => s.origin === "document") || cur[0]
    path.push({ fork: cur, parent }); path.push(pick); cur = childrenOf(lib, flow.id, pick.id)
  }
  return <div className="uzu-lib">
    <div className="uzu-lib-flowpick" role="group" aria-label="Choisir un enchaînement">
      {lib.flows.map(f => { const dl = lib.disciplines.find(d => d.id === f.discipline_id)?.label || ""; return <button key={f.id} type="button" aria-pressed={f.id === flow.id} className={f.id === flow.id ? "on" : ""} onClick={() => onFlow(f.id)}>{f.id}<small>{dl}</small></button> })}
    </div>
    <div className="eyebrow">{disc.toUpperCase()}</div>
    <h2 className="uzu-lib-title uzu-lib-title--flow">{flow.title.replace(/^Le système « (.+) »$/, "$1")}</h2>
    {flow.intro && <p className="uzu-text">{flow.intro}</p>}
    <ol className="uzu-lib-steps">{path.map((x, i) => "fork" in x
      ? <li key={"f" + i} className="uzu-lib-fork"><span className="uzu-lib-label uzu-lib-label--wine">Choisis la suite</span>
          <div className="uzu-lib-forkbtns">{x.fork.map(s => { const on = s.id === (path[i + 1] as LibStep).id
            return <button key={s.id} type="button" aria-pressed={on} className={on ? "on" : ""} onClick={() => setChoice(c => ({ ...c, [x.parent]: s.id }))}>{s.branch_label || KIND_LABEL[s.kind]}{s.origin === "proposition" && <small>proposée par UZU</small>}</button> })}</div></li>
      : <StepCard key={x.id} lib={lib} s={x} onOpen={onOpen} />)}</ol>
    <p className="uzu-text uzu-small uzu-muted">Touche une fiche pour l'ouvrir. Les éléments en pointillés sont proposés par UZU et attendent la validation d'un professeur ; ils ne figurent pas dans le document.</p>
  </div>
}

function StepCard({ lib, s, onOpen }: { lib: Library; s: LibStep; onOpen: (id: string) => void }) {
  const techs = techsOfStep(lib, s.id)
  const final = s.kind === "finalisation" || s.kind === "alternative"
  const warn = techs.find(x => x.t.restricted)
  return <li className={`uzu-lib-step${s.origin === "proposition" ? " prop" : ""}${final ? " final" : ""}`}>
    <span className={`uzu-lib-label${final || s.origin === "proposition" ? " uzu-lib-label--wine" : ""}`}>{s.origin === "proposition" ? "Suite proposée par UZU · à valider" : KIND_LABEL[s.kind] + (s.branch_label && s.kind !== "reaction" ? " · " + s.branch_label : "")}</span>
    <p>{s.label}</p>
    {techs.length > 0 && <span className="uzu-lib-chips">{techs.map(x => <button key={x.t.id} type="button" className={x.t.origin === "proposition" ? "prop" : ""} onClick={() => onOpen(x.t.id)}>
      {x.t.id} {splitName(x.t.name).main}{x.t.origin === "proposition" ? " · proposée" : ""}<ChevronRight size={13} aria-hidden="true" /></button>)}</span>}
    {warn && warn.t.restricted && <span className="uzu-lib-warn uzu-lib-warn--small"><AlertTriangle size={15} aria-hidden="true" />{RESTRICTED_TXT[warn.t.restricted]}</span>}
  </li>
}
