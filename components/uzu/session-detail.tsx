"use client"
// Aperçu d'une séance en lecture seule (même contenu que la fiche séance de l'ancienne application).
import { useEffect, useRef, useState } from "react"
import { Download, ImagePlus, Pencil, Share2, X } from "lucide-react"
import { storyCanvas, type StoryPhoto } from "@/lib/uzu/story"
import { mySessionPartners, type Partner } from "@/lib/uzu/partners"
import type { UzuContext } from "@/lib/uzu/context"
import { loadSessionDetail } from "@/lib/uzu/journal"
import { Stars } from "@/components/uzu/progress"
import { useLibrary } from "@/components/uzu/library"
import { fichesForName } from "@/lib/uzu/library"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const durTxt = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min` }
const pl = (n: number, w: string) => `${n} ${w}${n > 1 ? "s" : ""}`

export function SessionDetail({ uid, ctx, id, onClose, onEdit, onComplete, saved }: { uid: string; ctx: UzuContext | null; id: string; onClose: () => void; onEdit: (id: string) => void; onComplete: () => void; saved?: boolean }) {
  const [d, setD] = useState<{ core: Any; s: Any } | null | "none">(null)
  const [partners, setPartners] = useState<Partner[]>([])
  const closeRef = useRef(onClose); closeRef.current = onClose
  const library = useLibrary(ctx)
  const openFiche = (arg: string) => { onClose(); window.dispatchEvent(new CustomEvent("uzu-nav", { detail: { page: "path", arg } })) }
  useEffect(() => {
    let live = true
    loadSessionDetail(uid, ctx, id).then(r => {
      if (!live) return
      setD(r || "none")
      if (r && ctx?.club) mySessionPartners(r.s.date).then(m => { if (live) setPartners(m[id] || []) })
    }, () => { if (live) setD("none") })
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    document.addEventListener("keydown", esc)
    return () => { live = false; document.removeEventListener("keydown", esc) }
  }, [uid, ctx, id])
  const body = (() => {
    if (d === null) return <p className="uzu-text uzu-muted" aria-busy="true">Chargement de la séance…</p>
    if (d === "none") return <p className="uzu-text">Séance introuvable.</p>
    const C = d.core, s = d.s, pp = C.isPrepa(s)
    const streak = C.streakDays(C.allSessions().filter((x: Any) => !x.sample), s.date)
    const blocks: Any[] = pp ? [] : C.sessBlocks(s).filter((x: Any) => x.tech || x.sys)
    const subs: Any[] = pp ? [] : C.subsOf(s)
    const gm = pp ? {} : C.gmOf(s), gl: string[] = []
    if (!pp) Object.keys(C.GM_FIELDS).forEach((f: string) => { const q = f.split("_"); Object.keys(gm[f] || {}).forEach(k => { if (gm[f][k]) gl.push(`${C.gmName(q[0], k)} · ${q[1] === "placed" ? "placé" : "subi"}${gm[f][k] > 1 ? " × " + gm[f][k] : ""}`) }) })
    const td = C.actOf(s, "lucha_takedowns_done"), ts = C.actOf(s, "lucha_takedowns_suffered"), gr = C.actOf(s, "guard_retentions")
    const cu: Any[] = pp ? [] : C.normCustoms(s.customs)
    const title = pp ? "Prépa physique · " + C.effortName(s) : s.kind === "open" ? "Open mat" : (blocks.length > 1 ? blocks.map(b => b.tech || C.SYSTEMS[b.sys]?.n).join(" · ") : s.theme) || (s.roll ? "Cours du club" : "Séance")
    return <>
      {saved && <p className="uzu-note ok">{streak > 1 ? `Série : ${streak} jours d'affilée sur le tatami.` : "Bravo, une séance de plus dans ton carnet."}</p>}
      <p className="uzu-det-title"><b>{title}</b>{s.roll && <em className="uzu-rolltag">Appel du prof</em>}</p>
      <dl className="uzu-det">
        <dt>Date</dt><dd>{C.parse(s.date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</dd>
        <dt>Type</dt><dd>{pp ? "Prépa physique" : C.KINDS[C.kindOf(s)]?.n || "Cours collectif"}</dd>
        <dt>Durée</dt><dd>{durTxt(+s.dur || 0)}{pp ? "" : " sur le tatami"}</dd>
        {!pp && <><dt>Tenue</dt><dd>{s.type || "Gi"}</dd><dt>Rounds</dt><dd>{+s.rounds || 0}</dd></>}
        {partners.length > 0 && <><dt>Partenaires</dt><dd>{partners.map((p, i) => <span key={p.user_id}>{i ? ", " : ""}{p.name}<small className="uzu-muted"> ({p.status === "confirmed" ? "confirmé" : p.status === "declined" ? "pas confirmé" : "en attente"})</small></span>)}</dd></>}
        {C.FORME_TXT[s.forme] && <><dt>État</dt><dd>{C.FORME_TXT[s.forme]} <small className="uzu-muted">(visible par toi seul)</small></dd></>}
      </dl>
      {pp && <><h4>Prépa physique</h4><p className="uzu-text">{C.effortName(s)}{+s.rpe ? ` · RPE ${+s.rpe}/10` : ""}</p>{s.exos && <p className="uzu-text uzu-pre">{s.exos}</p>}</>}
      {blocks.length > 0 && <><h4>Systèmes et techniques</h4><ul className="uzu-det-list">{blocks.map((x, i) => { const inf = x.tech ? C.skillInfo(C.me(), x.tech) : null
        const fs = x.tech && library.status === "ok" ? fichesForName(library.lib, x.tech, C) : []
        return <li key={i}><span>{x.tech && <b>{x.tech}</b>}{x.tech && C.SYSTEMS[x.sys] ? " · " : ""}{C.SYSTEMS[x.sys]?.n || ""}{x.flow === "impose" ? " · imposé" : x.flow === "subi" ? " · subi" : ""}
          {fs.length > 0 && <button type="button" className="text-link uzu-det-fiche" onClick={() => openFiche(fs.length === 1 ? "fiche:" + fs[0].id : "libl:" + x.tech)}>{fs.length === 1 ? "Voir la fiche" : `Voir les ${fs.length} fiches`}</button>}</span>{inf && <Stars lvl={inf.lvl} review={inf.review} />}</li> })}</ul></>}
      {subs.length > 0 && <><h4>Soumissions en sparring</h4><ul className="uzu-det-list">{subs.map((x, i) => <li key={i}><span>{C.subName(x.t)} · {C.SUB_DIRS[x.d]}{x.n > 1 ? " × " + x.n : ""}</span></li>)}</ul></>}
      {gl.length > 0 && <><h4>Passages et renversements</h4><ul className="uzu-det-list">{gl.map((x, i) => <li key={i}><span>{x}</span></li>)}</ul></>}
      {(td || ts || gr) ? <><h4>Lutte et garde</h4><p className="uzu-text">Amenées au sol : {pl(td, "réussie")}, {pl(ts, "subie")}<br />Rétentions de garde : {gr}</p></> : null}
      {cu.length > 0 && <><h4>Techniques perso</h4><ul className="uzu-det-list">{cu.map((c, i) => <li key={i}><span>{c.n} (profil {String(C.OPP_PROFILES[c.p] || "").toLowerCase()})</span></li>)}</ul></>}
      {!pp && s.prepa && <><h4>Bloc prépa physique</h4><p className="uzu-text">{durTxt(+s.prepa.dur || 0)} · {C.EFFORTS[s.prepa.effort] || C.EFFORTS.force}{+s.prepa.rpe ? ` · RPE ${+s.prepa.rpe}/10` : ""}</p>{s.prepa.exos && <p className="uzu-text uzu-pre">{s.prepa.exos}</p>}</>}
      {s.note && <><h4>Note privée</h4><p className="uzu-text uzu-pre">{s.note}</p></>}
      {!s.roll && !s.sample && <StoryBox C={C} s={s} partners={partners.filter(p => p.status !== "declined").map(p => p.name)} />}
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
      <div className="eyebrow">{saved ? "SÉANCE ENREGISTRÉE ✓" : "APERÇU · LECTURE SEULE"}</div>
      <h2 id="det-title">Séance du {d && d !== "none" ? d.core.frShort(d.s.date) : "…"}</h2>
      {body}
    </section>
  </div>
}

/** Image à partager en Story (Instagram, WhatsApp…) : partage direct, téléchargement ou copie.
 *  La photo choisie sert seulement à fabriquer l'image, sur le téléphone : elle n'est ni envoyée ni enregistrée. */
function StoryBox({ C, s, partners }: { C: Any; s: Any; partners: string[] }) {
  const [img, setImg] = useState<{ url: string; blob: Blob; file: File | null } | null>(null)
  const [photo, setPhoto] = useState<StoryPhoto | null>(null)
  const [msg, setMsg] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => () => { if (img) URL.revokeObjectURL(img.url) }, [img])
  const make = (ph: StoryPhoto | null = photo) => {
    const c = storyCanvas(C, s, C.allSessions(), { photo: ph, partners })
    c.toBlob(blob => {
      if (!blob) { setMsg("Image indisponible sur cet appareil"); return }
      let file: File | null = null
      try { file = new File([blob], `uzu-seance-${s.date}.png`, { type: "image/png" }) } catch { /* ancien navigateur */ }
      setImg(old => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), blob, file } })
    }, "image/png")
  }
  const pick = (f: File | undefined) => {
    if (!f) return
    if (!/^image\//.test(f.type) && !/\.(jpe?g|png|heic|heif|webp)$/i.test(f.name)) { setMsg("Choisis une photo (JPEG, PNG ou HEIC)"); return }
    const url = URL.createObjectURL(f), im = new Image()
    im.onload = () => { const ph = { img: im, w: im.naturalWidth, h: im.naturalHeight }; setPhoto(ph); setMsg(""); make(ph); window.setTimeout(() => URL.revokeObjectURL(url), 2000) }
    im.onerror = () => { URL.revokeObjectURL(url); setMsg("Cette photo ne peut pas être lue sur cet appareil : essaie une autre photo") }
    im.src = url
  }
  const picker = <>
    <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { pick(e.target.files?.[0]); e.target.value = "" }} />
    <button type="button" className="button button--outline uzu-small-btn" onClick={() => fileRef.current?.click()}><ImagePlus size={14} />{photo ? "Changer la photo" : "Ajouter une photo"}</button>
    {photo && <button type="button" className="button button--outline uzu-small-btn" onClick={() => { setPhoto(null); make(null) }}>Retirer la photo</button>}
  </>
  if (!img) return <div className="uzu-actions uzu-actions--start">
    <button type="button" className="button button--outline uzu-small-btn uzu-story-btn" onClick={() => make()}><Share2 size={14} />Partager (Story)</button>
    {picker}
  </div>
  const canShare = !!(img.file && typeof navigator !== "undefined" && navigator.canShare && navigator.canShare({ files: [img.file] }))
  const canCopy = typeof navigator !== "undefined" && !!navigator.clipboard && typeof ClipboardItem !== "undefined"
  return <div className="uzu-story">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={img.url} alt="Aperçu de ta Story UZU" />
    <div className="uzu-actions uzu-actions--start">
      {canShare && <button type="button" className="button button--dark uzu-small-btn" onClick={() => navigator.share({ files: [img.file!], title: "UZU — The mat doesn't lie" }).catch(() => {})}><Share2 size={14} />Partager en Story</button>}
      <a className="button button--outline uzu-small-btn" href={img.url} download={`uzu-seance-${s.date}.png`}><Download size={14} />Télécharger l&apos;image</a>
      {canCopy && <button type="button" className="button button--outline uzu-small-btn" onClick={() => navigator.clipboard.write([new ClipboardItem({ "image/png": img.blob })]).then(() => setMsg("Image copiée : colle-la dans ta Story"), () => setMsg("Copie impossible : télécharge l'image"))}>Copier l&apos;image</button>}
      {picker}
    </div>
    <p className="uzu-text uzu-small uzu-muted">Ta photo reste sur ton téléphone : elle n&apos;est ni envoyée ni enregistrée dans UZU.</p>
    {msg && <p className="uzu-text uzu-small uzu-muted" role="status">{msg}</p>}
  </div>
}
