"use client"
// Class Media : photos et vidéos privées des séances.
// Saisie (rubrique « Plus de détails »), détail de séance (équipe et adhérent), file « À traiter »,
// option « Groupe de mineurs ». Les droits sont vérifiés par le serveur à chaque action et à chaque lecture.
import { useEffect, useRef, useState } from "react"
import { Camera, Film, ShieldAlert } from "lucide-react"
import { saveSection } from "@/lib/uzu/club"
import {
  addMedia, handleRequest, mediaQueue, mediaTicket, photoBlobUrl, removeMedia, requestRemoval, restoreMedia, sectionMinorsList, sessionMedia,
  setSectionMinors, validateMedia, videoSrc, REQ_LBL, STATE_LBL, VALID_LBL, type MediaItem, type QueueItem, type SessionMedia, type UploadStep,
} from "@/lib/uzu/class-media"

type Toast = (m: string) => void
const STEP_LBL: Record<UploadStep, string> = { prepare: "Préparation (localisation retirée)…", reserve: "Réservation…", upload: "Envoi…", verify: "Vérification par le serveur…", done: "Terminé" }

function useSessionMedia(sessionId: string | null, tick: number) {
  const [st, setSt] = useState<{ status: "loading" | "ok" | "absent" | "error"; data?: SessionMedia; msg?: string }>({ status: "loading" })
  useEffect(() => {
    if (!sessionId) { setSt({ status: "absent" }); return }
    let live = true
    sessionMedia(sessionId).then(r => { if (!live) return; setSt(r.ok ? (r.data && Array.isArray(r.data.items) ? { status: "ok", data: r.data } : { status: "absent" }) : r.absent ? { status: "absent" } : { status: "error", msg: r.msg }) })
    return () => { live = false }
  }, [sessionId, tick])
  return st
}

// ---------------------------------------------------------------- Lecture d'une photo ou d'une vidéo
function PhotoView({ m, onGone }: { m: MediaItem; onGone: () => void }) {
  const [url, setUrl] = useState(""), [err, setErr] = useState("")
  useEffect(() => {
    let live = true, made = ""
    mediaTicket(m.id).then(async t => {
      if (!live) return
      if (!t.ok) { setErr("Photo indisponible"); onGone(); return }
      const p = await photoBlobUrl(t.data.token)
      if (!live) { if (p.ok) URL.revokeObjectURL(p.url); return }
      if (p.ok) { made = p.url; setUrl(p.url) } else { setErr("Photo retirée ou plus accessible"); onGone() }
    })
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="uzu-cm-gone">{err}</div>
  if (!url) return <div className="uzu-cm-wait" aria-busy="true" aria-label="Chargement de la photo" />
  return <img className="uzu-cm-photo" src={url} alt="Photo de la séance" draggable={false} onContextMenu={e => e.preventDefault()} />
}

function VideoView({ m, onGone }: { m: MediaItem; onGone: () => void }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const [src, setSrc] = useState(""), [err, setErr] = useState(""), retries = useRef(0), seq = useRef(0)
  const load = async (keepTime: boolean) => {
    const t = await mediaTicket(m.id)
    if (!t.ok) { setErr("Vidéo retirée ou plus accessible"); setSrc(""); onGone(); return }
    const at = keepTime && ref.current ? ref.current.currentTime : 0, playing = !!ref.current && !ref.current.paused
    const url = await videoSrc(m.id, t.data, ++seq.current)
    if (!url) { setErr("Lecture de la vidéo impossible pour le moment"); setSrc(""); return }
    setSrc(url)
    if (keepTime) setTimeout(() => { if (ref.current) { ref.current.currentTime = at; if (playing) ref.current.play().catch(() => {}) } }, 50)
  }
  useEffect(() => { load(false); return () => { if (ref.current) { ref.current.removeAttribute("src"); ref.current.load() } } }, [m.id]) // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="uzu-cm-gone">{err}</div>
  if (!src) return <div className="uzu-cm-wait" aria-busy="true" aria-label="Chargement de la vidéo" />
  // Jeton expiré ou droits retirés : le serveur refuse le morceau suivant ; on redemande un jeton une fois.
  return <video ref={ref} className="uzu-cm-video" controls playsInline preload="metadata" src={src} controlsList="nodownload noremoteplayback" disablePictureInPicture
    onContextMenu={e => e.preventDefault()} onError={() => { if (retries.current++ < 1) load(true); else { setErr("Vidéo retirée ou plus accessible"); onGone() } }} aria-label="Vidéo de la séance" />
}

// ---------------------------------------------------------------- Détail d'une séance : galerie
function RemovalRequest({ m, sessionId, onDone, onToast }: { m: MediaItem; sessionId: string; onDone: () => void; onToast: Toast }) {
  const [open, setOpen] = useState(false), [reason, setReason] = useState(""), [busy, setBusy] = useState(false)
  if (!open) return <button type="button" className="text-link uzu-cm-req" onClick={() => setOpen(true)}>Demander le retrait</button>
  return <div className="uzu-cm-reqform">
    <label className="uzu-field"><span className="uzu-label">Motif (facultatif)</span><textarea className="uzu-input" rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Ex. je ne souhaite pas apparaître" /></label>
    <p className="uzu-text uzu-small uzu-muted">Le média est masqué tout de suite pour tout le groupe, et l'équipe du club est prévenue.</p>
    <div className="uzu-lib-actions uzu-lib-actions--left">
      <button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={async () => { setBusy(true); const r = await requestRemoval(m.id, sessionId, reason); setBusy(false); onToast(r.ok ? "Demande envoyée : le média est masqué" : r.msg); if (r.ok) onDone() }}>Confirmer la demande</button>
      <button type="button" className="text-link" onClick={() => setOpen(false)}>Annuler</button></div>
  </div>
}

function StaffActions({ m, sessionId, minors, onDone, onToast }: { m: MediaItem; sessionId: string; minors: boolean; onDone: () => void; onToast: Toast }) {
  const [arm, setArm] = useState(""), [rights, setRights] = useState(false), [minorsOk, setMinorsOk] = useState(false), [busy, setBusy] = useState(false)
  const go = async (k: string, f: () => Promise<{ ok: boolean; msg?: string }>, done: string) => { setBusy(true); const r = await f(); setBusy(false); setArm(""); onToast(r.ok ? done : (r as { msg: string }).msg); if (r.ok) onDone() }
  const req = m.request && (m.request.status === "requested" || m.request.status === "processing") ? m.request : null
  return <div className="uzu-cm-actions">
    <div className="uzu-lib-badges">
      {m.state && <span className={`uzu-lib-badge uzu-cm-st--${m.state}`}>{STATE_LBL[m.state]}</span>}
      {m.validation && m.state !== "quarantined" && <span className={`uzu-lib-badge uzu-cm-va--${m.validation}`}>{VALID_LBL[m.validation]}</span>}
      {m.request && <span className="uzu-lib-badge uzu-lib-badge--plain">{REQ_LBL[m.request.status]}</span>}
    </div>
    {req && req.reason && <p className="uzu-text uzu-small">Motif : {req.reason}</p>}
    <div className="uzu-lib-actions uzu-lib-actions--left">
      {m.can_validate && <>
        <button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={() => go("v", () => validateMedia(m.id, "approved", "Autorisations vérifiées"), "Média validé : visible par le groupe")}>Valider</button>
        <button type="button" className="button button--outline uzu-small-btn" disabled={busy} onClick={() => go("r", () => validateMedia(m.id, "rejected"), "Média refusé : jamais visible par les adhérents")}>Refuser</button></>}
      {req && m.can_handle && <>
        {req.status === "requested" && <button type="button" className="button button--outline uzu-small-btn" disabled={busy} onClick={() => go("p", () => handleRequest(req.id, sessionId, "processing"), "Demande prise en charge")}>Prendre en charge</button>}
        <button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={() => go("c", () => handleRequest(req.id, sessionId, "completed", "Retrait accepté"), "Retrait définitif effectué")}>Retirer définitivement</button>
        <button type="button" className="button button--outline uzu-small-btn" disabled={busy} onClick={() => go("j", () => handleRequest(req.id, sessionId, "rejected"), "Demande refusée : le média reste retiré tant qu'il n'est pas rétabli")}>Refuser la demande</button></>}
      {m.can_remove && (arm === "rm"
        ? <button type="button" className="button button--outline uzu-small-btn is-armed" disabled={busy} onClick={() => go("rm", () => removeMedia(m.id, sessionId), "Média retiré : quarantaine 7 jours, puis effacement")}>Confirmer : retirer</button>
        : <button type="button" className="text-link" onClick={() => setArm("rm")}>Retirer</button>)}
    </div>
    {m.can_restore && (arm === "rs" ? <div className="uzu-cm-reqform">
      <label className="uzu-check-row"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} /><span>Les personnes visibles sur les médias, et les représentants légaux des mineurs concernés, ont donné leur accord.</span></label>
      {minors && <label className="uzu-check-row"><input type="checkbox" checked={minorsOk} onChange={e => setMinorsOk(e.target.checked)} /><span>Les autorisations écrites des représentants légaux ont été recueillies.</span></label>}
      <div className="uzu-lib-actions uzu-lib-actions--left"><button type="button" className="button button--dark uzu-small-btn" disabled={busy || !rights || (minors && !minorsOk)} onClick={() => go("rs", () => restoreMedia(m.id, sessionId, rights, minorsOk), "Média rétabli")}>Rétablir</button>
        <button type="button" className="text-link" onClick={() => setArm("")}>Annuler</button></div></div>
      : <button type="button" className="text-link" onClick={() => setArm("rs")}>Rétablir…</button>)}
  </div>
}

export function MediaGallery({ sessionId, staff, onToast }: { sessionId: string; staff: boolean; onToast: Toast }) {
  const [tick, setTick] = useState(0)
  const st = useSessionMedia(sessionId, tick)
  const [gone, setGone] = useState<string[]>([])
  if (st.status !== "ok" || !st.data) return null
  const d = st.data
  const items = d.items.filter(i => !gone.includes(i.id) && (staff ? i.state !== "uploading" : true))
  if (!items.length) return null
  const refresh = () => setTick(x => x + 1)
  return <section className="uzu-lib-sec uzu-cm" aria-labelledby="cm-h"><h3 id="cm-h">Photos et vidéos</h3>
    {items.map(m => <figure key={m.id} className="uzu-cm-item">
      {m.viewable ? (m.kind === "photo" ? <PhotoView m={m} onGone={() => setGone(g => g.concat([m.id]))} /> : <VideoView m={m} onGone={() => setGone(g => g.concat([m.id]))} />)
        : <div className="uzu-cm-gone">{m.kind === "photo" ? <Camera size={18} aria-hidden="true" /> : <Film size={18} aria-hidden="true" />}{m.state === "quarantined" ? "En quarantaine : non visible" : m.validation === "rejected" ? "Refusé : non visible" : "Non visible par le groupe"}</div>}
      <figcaption>{staff ? <StaffActions m={m} sessionId={sessionId} minors={d.minors} onDone={refresh} onToast={onToast} />
        : <RemovalRequest m={m} sessionId={sessionId} onToast={onToast} onDone={() => setGone(g => g.concat([m.id]))} />}</figcaption>
    </figure>)}
    {!staff && <p className="uzu-text uzu-small uzu-muted">Ces médias sont réservés à ton groupe. Ne les enregistre pas et ne les partage pas.</p>}
  </section>
}

// ---------------------------------------------------------------- Saisie d'une séance : rubrique médias
export function MediaManager({ sessionId, onToast }: { sessionId: string | null; onToast: Toast }) {
  const [tick, setTick] = useState(0)
  const st = useSessionMedia(sessionId, tick)
  const [rights, setRights] = useState(false), [minorsOk, setMinorsOk] = useState(false)
  const [step, setStep] = useState<UploadStep | null>(null), [err, setErr] = useState("")
  const photo = useRef<HTMLInputElement | null>(null), video = useRef<HTMLInputElement | null>(null)
  if (!sessionId) return <p className="uzu-text uzu-small uzu-muted">Photos et vidéos : enregistre d'abord la séance (au moins en brouillon), puis rouvre-la pour en ajouter.</p>
  if (st.status === "absent") return null
  if (st.status === "loading") return <p className="uzu-text uzu-small uzu-muted" aria-busy="true">Photos et vidéos…</p>
  if (st.status === "error" || !st.data) return <p className="uzu-text uzu-small uzu-muted">Photos et vidéos indisponibles : {st.msg}</p>
  const d = st.data, full = d.used >= d.max, ready = rights && (!d.minors || minorsOk) && !step && !full
  const send = async (file: File | undefined, kind: "photo" | "video") => {
    if (!file) return
    setErr("")
    const r = await addMedia(sessionId, file, kind, rights, minorsOk, d.max_bytes, s => setStep(s))
    setStep(null)
    if (!r.ok) { setErr(r.msg); setTick(x => x + 1); return }
    onToast(r.data.validation === "pending_validation" ? "Média vérifié : en attente de validation par un responsable" : "Média ajouté à la séance")
    setTick(x => x + 1)
  }
  return <div className="uzu-cm-manager">
    <div className="uzu-cm-head"><span className="uzu-label">Photos et vidéos</span><span className="uzu-muted uzu-small">{d.used} sur {d.max}</span></div>
    {d.items.filter(i => i.state !== "deleted").map(m => <div key={m.id} className="uzu-cm-row">
      {m.kind === "photo" ? <Camera size={16} aria-hidden="true" /> : <Film size={16} aria-hidden="true" />}
      <span className="uzu-small">{m.kind === "photo" ? "Photo" : "Vidéo"} {m.position} · {m.state === "ready" ? VALID_LBL[m.validation || "approved"] : STATE_LBL[m.state || "ready"]}</span>
      {m.can_remove && <button type="button" className="text-link" onClick={async () => { const r = await removeMedia(m.id, sessionId); onToast(r.ok ? "Média retiré" : r.msg); setTick(x => x + 1) }}>Retirer</button>}
    </div>)}
    {d.can_add && !full && <>
      <label className="uzu-check-row"><input type="checkbox" checked={rights} onChange={e => setRights(e.target.checked)} /><span>Les personnes visibles sur les médias, et les représentants légaux des mineurs concernés, ont donné leur accord.</span></label>
      {d.minors && <label className="uzu-check-row"><input type="checkbox" checked={minorsOk} onChange={e => setMinorsOk(e.target.checked)} /><span><ShieldAlert size={14} aria-hidden="true" /> Groupe de mineurs : les autorisations écrites des représentants légaux ont été recueillies.</span></label>}
      <div className="uzu-lib-actions uzu-lib-actions--left">
        <button type="button" className="button button--outline uzu-small-btn" disabled={!ready} onClick={() => photo.current?.click()}><Camera size={15} aria-hidden="true" />Ajouter une photo</button>
        <button type="button" className="button button--outline uzu-small-btn" disabled={!ready} onClick={() => video.current?.click()}><Film size={15} aria-hidden="true" />Ajouter une vidéo</button>
      </div>
      <input ref={photo} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={e => { send(e.target.files?.[0], "photo"); e.target.value = "" }} />
      <input ref={video} type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={e => { send(e.target.files?.[0], "video"); e.target.value = "" }} />
      {!ready && !step && <p className="uzu-note wait uzu-cm-hint" role="status">{!rights ? "Coche la case d'accord pour ajouter un média." : "Groupe de mineurs : coche aussi la case des autorisations écrites pour ajouter un média."}</p>}
      <p className="uzu-text uzu-small uzu-muted">Photo réduite à 1600 px et sans métadonnées. Vidéo MP4, MOV ou WebM de 50 Mo au plus, sans sa localisation.{d.minors ? " Groupe de mineurs : le média reste invisible jusqu'à la validation d'un responsable." : ""}</p>
    </>}
    {full && <p className="uzu-text uzu-small uzu-muted">Limite de {d.max} médias atteinte pour cette séance.</p>}
    {step && <p className="uzu-note wait" role="status">{STEP_LBL[step]}</p>}
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
  </div>
}

// ---------------------------------------------------------------- Journal des cours : « À traiter »
export function MediaQueueBlock({ onOpen }: { onOpen: (session: string) => void }) {
  const [list, setList] = useState<QueueItem[]>([])
  useEffect(() => { let live = true; mediaQueue().then(r => { if (live && r.ok && Array.isArray(r.data)) setList(r.data) }); return () => { live = false } }, [])
  if (!list.length) return null
  return <section className="uzu-jr-todo uzu-cm-queue" aria-labelledby="cm-q"><h2 id="cm-q">Médias à traiter · {list.length}</h2>
    {list.map((q, i) => <button key={i} type="button" onClick={() => onOpen(q.session)}>
      <span>{q.type === "validation" ? "À valider" : "Demande de retrait"} · {q.group} · {q.theme}</span><span>Ouvrir ›</span></button>)}
  </section>
}

// ---------------------------------------------------------------- Équipe : groupes de mineurs
export function GroupsPanel({ canEdit, disc, onToast, onChanged }: { canEdit: boolean; disc: Record<string, string>; onToast: Toast; onChanged?: () => void }) {
  type G = { id: string; name: string; minors: boolean }
  const [d, setD] = useState<{ can_update: boolean; sections: G[] } | null>(null)
  const [tick, setTick] = useState(0), [arm, setArm] = useState(""), [ren, setRen] = useState(""), [name, setName] = useState(""), [fresh, setFresh] = useState(""), [busy, setBusy] = useState(false)
  useEffect(() => { let live = true; sectionMinorsList().then(r => { if (live && r.ok && r.data && Array.isArray(r.data.sections)) setD(r.data) }); return () => { live = false } }, [tick])
  if (!d) return null
  const done = () => { setTick(x => x + 1); onChanged?.() }
  const create = async () => { const n = fresh.trim(); if (!n) { onToast("Donne un nom au groupe"); return } setBusy(true); const r = await saveSection(null, n, ""); setBusy(false); onToast(r.ok ? "Groupe créé" : r.msg); if (r.ok) { setFresh(""); done() } }
  const rename = async (g: G) => { const n = name.trim(); if (!n) { onToast("Donne un nom au groupe"); return } setBusy(true); const r = await saveSection(g.id, n, disc[g.id] || ""); setBusy(false); onToast(r.ok ? "Groupe renommé" : r.msg); if (r.ok) { setRen(""); done() } }
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-labelledby="gr-h">
    <div className="section-title"><h2 id="gr-h">Groupes</h2></div>
    <p className="uzu-text uzu-small uzu-muted">Les groupes servent au Journal des cours, aux cours du planning et aux fiches élèves. Dans un groupe de mineurs, chaque photo ou vidéo de séance demande une deuxième confirmation et reste invisible jusqu'à la validation d'un responsable ; en cochant un groupe, ses médias déjà en ligne repassent en attente.</p>
    {!d.sections.length && <p className="uzu-text uzu-muted">Aucun groupe pour l'instant.</p>}
    {d.sections.map(g => <div key={g.id} className="uzu-cm-row uzu-gr-row">
      {ren === g.id
        ? <span className="uzu-gr-edit"><input className="uzu-input" aria-label={`Nouveau nom de ${g.name}`} maxLength={60} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") rename(g) }} />
            <button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={() => rename(g)}>Enregistrer</button>
            <button type="button" className="text-link" onClick={() => setRen("")}>Annuler</button></span>
        : <span className="uzu-gr-name"><b>{g.name}</b> {g.minors ? <span className="uzu-lib-badge uzu-cm-va--pending_validation">Groupe de mineurs</span> : null}</span>}
      {ren !== g.id && <span className="uzu-gr-acts">
        {canEdit && <button type="button" className="text-link" onClick={() => { setRen(g.id); setName(g.name); setArm("") }}>Renommer</button>}
        {d.can_update && (arm === g.id
          ? <button type="button" className="button button--outline uzu-small-btn is-armed" onClick={async () => { setArm(""); const r = await setSectionMinors(g.id, !g.minors); onToast(r.ok ? (g.minors ? "Option retirée" : `Groupe de mineurs : ${r.data} média(s) à revalider`) : r.msg); done() }}>{g.minors ? "Confirmer : retirer l'option" : "Confirmer : groupe de mineurs"}</button>
          : <button type="button" className="text-link" onClick={() => setArm(g.id)}>{g.minors ? "Retirer l'option" : "Marquer comme groupe de mineurs"}</button>)}
      </span>}
    </div>)}
    {canEdit && <div className="uzu-row2"><div className="uzu-field"><label className="uzu-label" htmlFor="gr-new">Nouveau groupe</label><input id="gr-new" className="uzu-input" maxLength={60} placeholder="Ex. : Adultes Gi, Enfants, Compétition" value={fresh} onChange={e => setFresh(e.target.value)} onKeyDown={e => { if (e.key === "Enter") create() }} /></div>
      <div className="uzu-field uzu-field--end"><button type="button" className="button button--outline uzu-small-btn" disabled={busy} onClick={create}>Créer le groupe</button></div></div>}
    {!canEdit && !d.can_update && <p className="uzu-text uzu-small uzu-muted">Seuls le droit « Paramètres de l'académie » (créer, renommer) et le droit « Groupes de mineurs » permettent de modifier les groupes.</p>}
    {canEdit && !d.can_update && <p className="uzu-text uzu-small uzu-muted">Seul le droit « Groupes de mineurs » permet de déclarer un groupe de mineurs.</p>}
  </section>
}
