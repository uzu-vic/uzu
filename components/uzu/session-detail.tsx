"use client"
// Aperçu d'une séance en lecture seule (même contenu que la fiche séance de l'ancienne application).
import { useEffect, useRef, useState } from "react"
import { Pencil, X } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { loadSessionDetail } from "@/lib/uzu/journal"
import { Stars } from "@/components/uzu/progress"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const durTxt = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min` }
const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`

export function SessionDetail({ uid, ctx, id, onClose, onEdit, onComplete }: { uid: string; ctx: UzuContext | null; id: string; onClose: () => void; onEdit: (id: string) => void; onComplete: () => void }) {
  const [d, setD] = useState<{ core: Any; s: Any } | null | "none">(null)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    let live = true
    loadSessionDetail(uid, ctx, id).then(r => { if (live) setD(r || "none") }, () => { if (live) setD("none") })
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    document.addEventListener("keydown", esc)
    return () => { live = false; document.removeEventListener("keydown", esc) }
  }, [uid, ctx, id])
  const body = (() => {
    if (d === null) return <p className="uzu-text uzu-muted" aria-busy="true">Chargement de la séance…</p>
    if (d === "none") return <p className="uzu-text">Séance introuvable.</p>
    const C = d.core, s = d.s, pp = C.isPrepa(s)
    const blocks: Any[] = pp ? [] : C.sessBlocks(s).filter((x: Any) => x.tech || x.sys)
    const subs: Any[] = pp ? [] : C.subsOf(s)
    const gm = pp ? {} : C.gmOf(s), gl: string[] = []
    if (!pp) Object.keys(C.GM_FIELDS).forEach((f: string) => { const q = f.split("_"); Object.keys(gm[f] || {}).forEach(k => { if (gm[f][k]) gl.push(`${C.gmName(q[0], k)} · ${q[1] === "placed" ? "placé" : "subi"}${gm[f][k] > 1 ? " × " + gm[f][k] : ""}`) }) })
    const td = C.actOf(s, "lucha_takedowns_done"), ts = C.actOf(s, "lucha_takedowns_suffered"), gr = C.actOf(s, "guard_retentions")
    const cu: Any[] = pp ? [] : C.normCustoms(s.customs)
    const title = pp ? "Prépa physique · " + C.effortName(s) : s.kind === "open" ? "Open mat" : (blocks.length > 1 ? blocks.map(b => b.tech || C.SYSTEMS[b.sys]?.n).join(" · ") : s.theme) || (s.roll ? "Cours du club" : "Séance")
    return <>
      <p className="uzu-det-title"><b>{title}</b>{s.roll && <em className="uzu-rolltag">Appel du prof</em>}</p>
      <dl className="uzu-det">
        <dt>Date</dt><dd>{C.parse(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
        <dt>Type</dt><dd>{pp ? "Prépa physique" : C.KINDS[C.kindOf(s)]?.n || "Cours collectif"}</dd>
        <dt>Durée</dt><dd>{durTxt(+s.dur || 0)}{pp ? "" : " sur le tatami"}</dd>
        {!pp && <><dt>Tenue</dt><dd>{s.type || "Gi"}</dd><dt>Rounds</dt><dd>{+s.rounds || 0}</dd></>}
        {C.FORME_TXT[s.forme] && <><dt>État</dt><dd>{C.FORME_TXT[s.forme]} <small className="uzu-muted">(visible par toi seul)</small></dd></>}
      </dl>
      {pp && <><h4>Prépa physique</h4><p className="uzu-text">{C.effortName(s)}{+s.rpe ? ` · RPE ${+s.rpe}/10` : ""}</p>{s.exos && <p className="uzu-text uzu-pre">{s.exos}</p>}</>}
      {blocks.length > 0 && <><h4>Systèmes et techniques</h4><ul className="uzu-det-list">{blocks.map((x, i) => { const inf = x.tech ? C.skillInfo(C.me(), x.tech) : null
        return <li key={i}><span>{x.tech && <b>{x.tech}</b>}{x.tech && C.SYSTEMS[x.sys] ? " · " : ""}{C.SYSTEMS[x.sys]?.n || ""}{x.flow === "impose" ? " · imposé" : x.flow === "subi" ? " · subi" : ""}</span>{inf && <Stars lvl={inf.lvl} review={inf.review} />}</li> })}</ul></>}
      {subs.length > 0 && <><h4>Soumissions en sparring</h4><ul className="uzu-det-list">{subs.map((x, i) => <li key={i}><span>{C.subName(x.t)} · {C.SUB_DIRS[x.d]}{x.n > 1 ? " × " + x.n : ""}</span></li>)}</ul></>}
      {gl.length > 0 && <><h4>Passages et renversements</h4><ul className="uzu-det-list">{gl.map((x, i) => <li key={i}><span>{x}</span></li>)}</ul></>}
      {(td || ts || gr) ? <><h4>Lutte et garde</h4><p className="uzu-text">Amenées au sol : {pl(td, "réussie")}, {pl(ts, "subie")}<br />Rétentions de garde : {gr}</p></> : null}
      {cu.length > 0 && <><h4>Techniques perso</h4><ul className="uzu-det-list">{cu.map((c, i) => <li key={i}><span>{c.n} (profil {String(C.OPP_PROFILES[c.p] || "").toLowerCase()})</span></li>)}</ul></>}
      {!pp && s.prepa && <><h4>Bloc prépa physique</h4><p className="uzu-text">{durTxt(+s.prepa.dur || 0)} · {C.EFFORTS[s.prepa.effort] || C.EFFORTS.force}{+s.prepa.rpe ? ` · RPE ${+s.prepa.rpe}/10` : ""}</p>{s.prepa.exos && <p className="uzu-text uzu-pre">{s.prepa.exos}</p>}</>}
      {s.note && <><h4>Note privée</h4><p className="uzu-text uzu-pre">{s.note}</p></>}
      <div className="uzu-actions uzu-actions--start uzu-det-acts">
        {s.roll ? <button className="button button--dark uzu-small-btn" onClick={onComplete}>Compléter ma séance</button>
          : !s.sample && <button className="button button--outline uzu-small-btn" onClick={() => onEdit(s.id)}><Pencil size={14} />Modifier cette séance</button>}
        <button className="button button--dark uzu-small-btn" onClick={onClose}>Fermer</button>
      </div>
    </>
  })()
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="invite-modal uzu-notif uzu-detail" role="dialog" aria-modal="true" aria-labelledby="det-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      <div className="eyebrow">APERÇU · LECTURE SEULE</div>
      <h2 id="det-title">Séance du {d && d !== "none" ? d.core.frShort(d.s.date) : "…"}</h2>
      {body}
    </section>
  </div>
}
