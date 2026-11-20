"use client"
// Bibliothèque : vidéos pédagogiques d'une fiche technique ou d'un enchaînement.
// Lecture pour les membres du club ; ajout, remplacement, suppression, titre et ordre pour les personnes
// qui ont « valider » ou « gérer » la Bibliothèque (vérifié par le serveur, script uzu-9b).
// Stockage pédagogique existant (« videos ») : aucune vidéo de Class Media ici.
import { useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Play, Plus } from "lucide-react"
import type { Library } from "@/lib/uzu/library"
import {
  addLibVideo, fmtDuration, libSignedUrl, LIB_VIDEO_PER_TARGET, loadLibVideos, removeLibVideo, STEP_TXT, updateLibVideo, videosOf,
  type LibUploadStep, type LibVideo, type LibVideoTarget,
} from "@/lib/uzu/library-videos"

const HEVC_NOTE = "Vidéo au format HEVC (réglage « Haute efficacité » de l'iPhone) : certains téléphones Android anciens ne pourront pas la lire. Sur iPhone, Réglages › Appareil photo › Formats › « Le plus compatible » enregistre des vidéos lisibles partout."
const PLAY_MSG = "Cette vidéo ne peut pas être lue sur cet appareil (format non pris en charge ou connexion interrompue)."

export function LibVideos({ lib, kind, target, label }: { lib: Library; kind: LibVideoTarget; target: string; label: string }) {
  const canEdit = lib.ctx.can_review || lib.ctx.can_manage
  const [list, setList] = useState<LibVideo[]>(() => videosOf(lib.videos || [], kind, target))
  const [form, setForm] = useState<{ replaces: LibVideo | null } | null>(null)
  const [toast, setToast] = useState("")
  useEffect(() => { setList(videosOf(lib.videos || [], kind, target)); setForm(null); setToast("") }, [lib, kind, target])
  const refresh = async (msg: string) => { setList(await loadLibVideos(kind, target)); setToast(msg) }
  if (!list.length && !canEdit) return null
  const id = `vid-${kind}-${target}`
  return <section className="uzu-lib-sec uzu-lib-vids" aria-labelledby={id}>
    <h3 id={id}>Vidéos pédagogiques</h3>
    {list.length ? <ul className="uzu-lib-vlist">{list.map((v, i) => <VideoCard key={v.id} v={v} n={i + 1} label={label} canEdit={canEdit} first={i === 0} last={i === list.length - 1}
        onReplace={() => setForm({ replaces: v })} onChanged={refresh} />)}</ul>
      : <p className="uzu-lib-empty">Aucune vidéo pour l'instant. Ajoute une démonstration filmée au téléphone ou depuis l'ordinateur.</p>}
    {toast && <p className="uzu-text uzu-small" role="status">{toast}</p>}
    {canEdit && !form && list.length < LIB_VIDEO_PER_TARGET && <button type="button" className="button button--outline uzu-lib-self" onClick={() => { setToast(""); setForm({ replaces: null }) }}><Plus size={16} aria-hidden="true" />Ajouter une vidéo</button>}
    {canEdit && !form && list.length >= LIB_VIDEO_PER_TARGET && <p className="uzu-text uzu-small uzu-muted">{LIB_VIDEO_PER_TARGET} vidéos au plus : remplace ou supprime une vidéo pour en ajouter une autre.</p>}
    {canEdit && form && <VideoForm kind={kind} target={target} replaces={form.replaces} onCancel={() => setForm(null)}
      onDone={(msg) => { setForm(null); refresh(msg) }} />}
  </section>
}

function VideoCard({ v, n, label, canEdit, first, last, onReplace, onChanged }: { v: LibVideo; n: number; label: string; canEdit: boolean; first: boolean; last: boolean; onReplace: () => void; onChanged: (msg: string) => void }) {
  const [poster, setPoster] = useState("")
  const [src, setSrc] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "error">("idle")
  const [edit, setEdit] = useState(false), [title, setTitle] = useState(v.title)
  const [del, setDel] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("")
  useEffect(() => { let live = true; setPoster(""); if (v.poster_path) libSignedUrl(v.poster_path).then(u => { if (live) setPoster(u) }); return () => { live = false } }, [v.poster_path])
  const name = v.title || `Vidéo ${n}`
  const ratio = v.width && v.height ? `${v.width} / ${v.height}` : "16 / 9"
  const play = async () => { setState("loading"); const u = await libSignedUrl(v.path); if (!u) { setState("error"); return } setSrc(u); setState("idle") }
  const act = async (fn: () => Promise<{ ok: boolean; msg?: string }>, msg: string) => { setBusy(true); setErr(""); const r = await fn(); setBusy(false); if (!r.ok) { setErr(r.msg || "Action refusée"); return } setEdit(false); setDel(false); onChanged(msg) }
  return <li className="uzu-lib-vcard">
    <div className="uzu-lib-vframe" style={{ aspectRatio: ratio }}>
      {src ? <video src={src} poster={poster || undefined} controls playsInline autoPlay preload="metadata" aria-label={`${name} — ${label}`}
          onLoadedMetadata={e => { if ((e.target as HTMLVideoElement).videoWidth === 0 && v.width) setState("error") }} onError={() => setState("error")} />
        : <button type="button" className="uzu-lib-vplay" onClick={play} aria-label={`Lire la vidéo « ${name} »`} disabled={state === "loading"}>
          {poster ? <img src={poster} alt="" /> : <span className="uzu-lib-vph" aria-hidden="true" />}
          <span className="uzu-lib-vbtn" aria-hidden="true"><Play size={22} /></span>
          {v.duration_s != null && <span className="uzu-lib-vdur">{fmtDuration(v.duration_s)}</span>}
        </button>}
    </div>
    {state === "error" && <p className="uzu-lib-note" role="alert">{PLAY_MSG}</p>}
    {edit ? <div className="uzu-lib-form">
        <label className="uzu-field"><span className="uzu-label">Titre</span><input className="uzu-input" maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
        <div className="uzu-lib-actions"><button type="button" className="button button--outline" onClick={() => { setEdit(false); setTitle(v.title) }}>Annuler</button>
          <button type="button" className="button button--dark" disabled={busy} onClick={() => act(() => updateLibVideo(v.id, title.trim(), 0), "Titre enregistré")}>Enregistrer</button></div>
      </div>
      : <div className="uzu-lib-vmeta"><b>{name}</b>{v.duration_s != null && <small>{fmtDuration(v.duration_s)}</small>}</div>}
    {canEdit && !edit && <div className="uzu-lib-vtools">
      {del ? <>
        <span className="uzu-text uzu-small">Supprimer cette vidéo pour tout le club ?</span>
        <button type="button" className="button button--dark" disabled={busy} onClick={() => act(() => removeLibVideo(v.id), "Vidéo supprimée")}>Confirmer la suppression</button>
        <button type="button" className="uzu-lib-vtxt" onClick={() => setDel(false)}>Annuler</button>
      </> : <>
        <button type="button" className="uzu-lib-vicon" disabled={first || busy} aria-label={`Monter « ${name} »`} onClick={() => act(() => updateLibVideo(v.id, null, -1), "Ordre modifié")}><ArrowUp size={16} /></button>
        <button type="button" className="uzu-lib-vicon" disabled={last || busy} aria-label={`Descendre « ${name} »`} onClick={() => act(() => updateLibVideo(v.id, null, 1), "Ordre modifié")}><ArrowDown size={16} /></button>
        <button type="button" className="uzu-lib-vtxt" onClick={() => setEdit(true)}>Renommer</button>
        <button type="button" className="uzu-lib-vtxt" onClick={onReplace}>Remplacer</button>
        <button type="button" className="uzu-lib-vtxt uzu-lib-vdel" onClick={() => setDel(true)}>Supprimer</button>
      </>}
    </div>}
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
  </li>
}

function VideoForm({ kind, target, replaces, onCancel, onDone }: { kind: LibVideoTarget; target: string; replaces: LibVideo | null; onCancel: () => void; onDone: (msg: string) => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [rights, setRights] = useState(false)
  const [step, setStep] = useState<LibUploadStep | null>(null)
  const [err, setErr] = useState("")
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  const send = async () => {
    setErr("")
    if (!file) { setErr("Choisis d'abord une vidéo."); return }
    if (!rights) { setErr("Coche la déclaration d'accord des personnes filmées."); return }
    const r = await addLibVideo(kind, target, file, title, rights, replaces?.id || null, setStep)
    if (!r.ok) { setStep(null); setErr(r.msg); return }
    onDone((replaces ? "Vidéo remplacée" : "Vidéo ajoutée") + (r.data.hevc ? ". " + HEVC_NOTE : ""))
  }
  const busy = !!step && step !== "done"
  return <form className="uzu-lib-form uzu-lib-vform" onSubmit={e => { e.preventDefault(); send() }} aria-label={replaces ? "Remplacer la vidéo" : "Ajouter une vidéo"}>
    <b>{replaces ? `Remplacer « ${replaces.title || "la vidéo"} »` : "Ajouter une vidéo"}</b>
    <label className="uzu-field"><span className="uzu-label">Vidéo (MP4, MOV ou WebM, 50 Mo au plus)</span>
      <input ref={ref} className="uzu-input" type="file" accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" disabled={busy} onChange={e => setFile(e.target.files?.[0] || null)} />
      <small className="uzu-muted">Sur téléphone : choisis une vidéo de la galerie ou filme directement. Une séquence courte (30 s à 2 min) se charge plus vite.</small></label>
    <label className="uzu-field"><span className="uzu-label">Titre {replaces ? "(vide : garde le titre actuel)" : "(facultatif)"}</span>
      <input className="uzu-input" maxLength={120} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Ex. Démonstration vue de face" /></label>
    <label className="uzu-lib-consent"><input type="checkbox" checked={rights} disabled={busy} onChange={e => setRights(e.target.checked)} />
      <span>Les personnes filmées, et les représentants légaux des mineurs, ont donné leur accord pour cette vidéo.</span></label>
    {step && <p className="uzu-text uzu-small" role="status" aria-live="polite">{STEP_TXT[step]}</p>}
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <div className="uzu-lib-actions"><button type="button" className="button button--outline" disabled={busy} onClick={onCancel}>Annuler</button>
      <button type="submit" className="button button--dark" disabled={busy}>{busy ? "Envoi en cours…" : replaces ? "Remplacer la vidéo" : "Envoyer la vidéo"}</button></div>
  </form>
}
