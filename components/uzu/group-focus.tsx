"use client"
// Focus des groupes (lot J4) — Club › Contenus, sous le Focus du club (inchangé).
// Droits vérifiés par le serveur (set_group_focus, group_focus_board) ; l'historique n'est jamais effacé.
import { useEffect, useState } from "react"
import { ChevronLeft } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { groupFocusBoard, setGroupFocus, shortDate, SYS_KEYS, SYS_LBL, type FocusBoardGroup, type FocusInput } from "@/lib/uzu/class-journal"

const sysLine = (from: string, to: string) => from || to ? `${SYS_LBL[from] || "—"} → ${SYS_LBL[to] || "—"}` : ""

export function FocusCard({ label, theme, from, to, details }: { label: string; theme: string; from?: string; to?: string; details?: string }) {
  const line = sysLine(from || "", to || "")
  return <div className="uzu-jr-focus"><span>{label}</span><h2>{theme || "Thème du focus"}</h2>{line && <p className="uzu-jr-sys">{line}</p>}{details && <p>{details}</p>}</div>
}

function FocusEditor({ g, onBack, onDone }: { g: FocusBoardGroup; onBack: () => void; onDone: (m: string) => void }) {
  const [f, setF] = useState<FocusInput>({ theme: "", from: g.current?.from || "", to: g.current?.to || "", details: "" })
  const [busy, setBusy] = useState(false), [err, setErr] = useState("")
  useEffect(() => { window.scrollTo(0, 0) }, [])
  const send = async () => {
    setErr("")
    if (!f.theme.trim()) { setErr("Indique le thème du focus."); return }
    setBusy(true); const r = await setGroupFocus(g.id, { theme: f.theme.trim().slice(0, 100), from: f.from, to: f.to, details: f.details.trim().slice(0, 300) }); setBusy(false)
    if (!r.ok) { setErr(r.msg); return }
    onDone(`Focus publié pour ${g.name}`)
  }
  return <form className="uzu-lib-form uzu-gf-form" aria-labelledby="gf-title" onSubmit={e => { e.preventDefault(); send() }}>
    <button type="button" className="uzu-lib-back" onClick={onBack}><ChevronLeft size={16} aria-hidden="true" />Contenus</button>
    <div className="eyebrow">FOCUS DU GROUPE</div>
    <h2 id="gf-title" className="uzu-lib-title">{g.name}</h2>
    <label className="uzu-field"><span className="uzu-label">Thème du focus</span><input className="uzu-input" maxLength={100} value={f.theme} onChange={e => { setF({ ...f, theme: e.target.value }); setErr("") }} placeholder="Ex. Passages de garde" autoFocus /></label>
    <div className="uzu-jr-grid">
      <label className="uzu-field"><span className="uzu-label">Système de départ</span><select className="uzu-input" value={f.from} onChange={e => setF({ ...f, from: e.target.value })}><option value="">Aucun</option>{SYS_KEYS.map(k => <option key={k} value={k}>{SYS_LBL[k]}</option>)}</select></label>
      <label className="uzu-field"><span className="uzu-label">Connecté à</span><select className="uzu-input" value={f.to} onChange={e => setF({ ...f, to: e.target.value })}><option value="">Aucun</option>{SYS_KEYS.map(k => <option key={k} value={k}>{SYS_LBL[k]}</option>)}</select></label>
    </div>
    <label className="uzu-field"><span className="uzu-label">Description (300 caractères max)</span><textarea className="uzu-input" rows={3} maxLength={300} value={f.details} onChange={e => setF({ ...f, details: e.target.value })} placeholder="Ex. Passer, stabiliser 3 secondes, puis prendre le dos" /></label>
    <span className="uzu-sublabel">Ce que verront les adhérents du groupe</span>
    <FocusCard label="FOCUS DU GROUPE" theme={f.theme.trim()} from={f.from} to={f.to} details={f.details.trim()} />
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <button type="submit" className="button button--dark" disabled={busy}>{busy ? "Publication…" : "Publier pour le groupe"}</button>
    <p className="uzu-text uzu-small uzu-muted">{g.current ? `Le focus actuel « ${g.current.theme} » passera dans l'historique. ` : ""}Visible tout de suite dans « Cours du groupe ». Aucune notification envoyée.</p>
  </form>
}

export function GroupFocusSection({ ctx, onToast }: { ctx: UzuContext | null; onToast: (m: string) => void }) {
  const [list, setList] = useState<FocusBoardGroup[] | null>(null)
  const [tick, setTick] = useState(0)
  const [edit, setEdit] = useState<FocusBoardGroup | null>(null)
  const [arm, setArm] = useState(""), [busy, setBusy] = useState("")
  const key = ctx?.club?.id || ""
  useEffect(() => {
    if (!key) return
    let live = true
    groupFocusBoard().then(r => { if (live) setList(r.ok && Array.isArray(r.data) ? r.data : []) })
    return () => { live = false }
  }, [key, tick])
  useEffect(() => { if (!arm) return; const t = window.setTimeout(() => setArm(""), 4000); return () => window.clearTimeout(t) }, [arm])
  if (!list || !list.length || !list.some(g => g.can_publish || g.current)) return null
  if (edit) return <section className="panel uzu-panel-col uzu-grid-gap"><FocusEditor g={edit} onBack={() => setEdit(null)} onDone={m => { onToast(m); setEdit(null); setTick(x => x + 1) }} /></section>
  const unpublish = async (g: FocusBoardGroup) => {
    if (arm !== g.id) { setArm(g.id); return }
    setArm(""); setBusy(g.id); const r = await setGroupFocus(g.id, null); setBusy("")
    onToast(r.ok ? `Focus dépublié pour ${g.name} : le groupe voit le Focus du club` : r.msg); if (r.ok) setTick(x => x + 1)
  }
  return <section className="uzu-grid-gap uzu-gf" aria-labelledby="gf-h">
    <div className="uzu-gf-head"><h2 id="gf-h">Focus des groupes</h2>
      <p className="uzu-text uzu-small uzu-muted">Un thème par groupe, pour le cycle en cours. Il s'affiche dans « Cours du groupe » et préremplit le thème des séances du Journal.</p></div>
    {list.map(g => <article key={g.id} className="panel uzu-panel-col uzu-gf-card" aria-label={g.name}>
      <div className="uzu-gf-top"><b>{g.name}</b>{g.current ? <span className="uzu-lib-badge uzu-jr-st--publie">Publié · {shortDate(g.current.published_at.slice(0, 10))}</span> : <span className="uzu-lib-badge uzu-jr-st--depublie">Aucun focus</span>}</div>
      {g.current ? <>
        <FocusCard label="FOCUS DU GROUPE" theme={g.current.theme} from={g.current.from} to={g.current.to} details={g.current.details} />
        <small className="uzu-muted">{g.current.sessions} séance{g.current.sessions > 1 ? "s" : ""} publiée{g.current.sessions > 1 ? "s" : ""} depuis ce focus · par {g.current.by}</small>
      </> : <p className="uzu-text uzu-small uzu-muted">Les adhérents de ce groupe voient le Focus du club.</p>}
      {g.can_publish && <div className="uzu-lib-actions uzu-lib-actions--left">
        <button type="button" className={g.current ? "button button--dark" : "button button--outline"} onClick={() => setEdit(g)}>{g.current ? "Changer de focus" : "Publier un focus pour ce groupe"}</button>
        {g.current && <button type="button" className={`button button--outline${arm === g.id ? " is-armed" : ""}`} disabled={busy === g.id} onClick={() => unpublish(g)}>{arm === g.id ? "Confirmer : dépublier" : "Dépublier"}</button>}
      </div>}
      {g.history_count > 0 && <details className="uzu-jv-never"><summary>Focus précédents ({g.history_count})</summary>
        <ul className="uzu-gf-hist">{g.history.map((h, i) => <li key={i}>{h.theme} · {shortDate(h.from.slice(0, 10))} → {shortDate(h.to.slice(0, 10))}</li>)}</ul></details>}
    </article>)}
    <p className="uzu-text uzu-small uzu-muted">Un focus dépublié ou remplacé reste dans l'historique. Les séances déjà saisies gardent le focus de leur moment.</p>
  </section>
}
