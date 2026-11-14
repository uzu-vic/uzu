"use client"
// Cloche et centre de notifications : liste, lecture, réglages par type, notifications sur le téléphone.
import { useEffect, useRef, useState } from "react"
import { Bell, X } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import {
  NKINDS, currentPush, disablePush, enablePush, getPrefs, kindsFor, listNotifs, listenNotifs, markAllRead, pushSupport, setPrefs, testPush,
  type Notif, type PushState,
} from "@/lib/uzu/notifications"

const ago = (iso: string) => {
  const d = new Date(iso), s = (Date.now() - d.getTime()) / 1000
  if (!(s >= 0)) return ""; if (s < 60) return "à l'instant"; if (s < 3600) return `il y a ${Math.floor(s / 60)} min`; if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`
  if (s < 172800) return "hier"; return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

/** État partagé : liste, non lues, nouvelles notifications en direct (affichées en message). */
export function useNotifs(uid: string, ctx: UzuContext | null, onNew: (n: Notif) => void) {
  const [list, setList] = useState<Notif[]>([])
  const [ready, setReady] = useState<"" | "ok" | "nosql">("")
  const onNewRef = useRef(onNew); onNewRef.current = onNew
  useEffect(() => {
    if (!ctx) return
    let live = true
    const seenKey = "uzu-notif-seen-" + uid
    listNotifs().then(L => {
      if (!live) return
      setList(L); setReady("ok")
      // Nouvelles depuis la dernière ouverture : affichées une fois (comme l'ancienne application)
      let seen = ""; try { seen = JSON.parse(localStorage.getItem(seenKey) || "\"\"") } catch { /* rien */ }
      L.filter(n => !n.read_at && (!seen || n.created_at > seen)).reverse().slice(-4).forEach(n => onNewRef.current(n))
      try { localStorage.setItem(seenKey, JSON.stringify(new Date().toISOString())) } catch { /* rien */ }
    }, () => { if (live) setReady("nosql") })
    let stop = () => {}
    try { stop = listenNotifs(uid, n => { setList(l => l.some(x => String(x.id) === String(n.id)) ? l : [n, ...l].slice(0, 60)); onNewRef.current(n); try { localStorage.setItem(seenKey, JSON.stringify(new Date().toISOString())) } catch { /* rien */ } }) } catch { /* temps réel indisponible */ }
    currentPush(uid).catch(() => {})
    return () => { live = false; stop() }
  }, [uid, ctx?.club?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const unread = list.filter(n => !n.read_at).length
  const readAll = () => { if (!unread) return; const now = new Date().toISOString(); setList(l => l.map(n => n.read_at ? n : { ...n, read_at: now })); markAllRead().catch(() => {}) }
  return { list, unread, ready, readAll }
}

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return <button className="icon-button notification-button uzu-bell" aria-label={unread ? `${unread} notification${unread > 1 ? "s" : ""} non lue${unread > 1 ? "s" : ""}` : "Notifications"} onClick={onClick}>
    <Bell size={18} />{unread > 0 && <b className="uzu-bell-n">{unread > 9 ? "9+" : unread}</b>}</button>
}

export function NotifCenter({ uid, ctx, list, ready, onClose, onOpen, onToast }: { uid: string; ctx: UzuContext | null; list: Notif[]; ready: string; onClose: () => void; onOpen: (url: string) => void; onToast: (m: string) => void }) {
  const [prefs, setP] = useState<Record<string, boolean>>({})
  const [push, setPush] = useState<{ state: PushState; sub: PushSubscription | null }>({ state: "unsupported", sub: null })
  const [busy, setBusy] = useState(false)
  const closeRef = useRef(onClose); closeRef.current = onClose
  useEffect(() => {
    getPrefs().then(setP, () => {})
    const st = pushSupport(); currentPush(uid).then(sub => setPush({ state: st, sub }))
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current() }
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc)
  }, [uid])
  const toggle = async (k: string, on: boolean) => {
    const next = { ...prefs, [k]: on }; setP(next)
    try { setP(await setPrefs(next)); onToast("Réglage enregistré") } catch { onToast("Réglage impossible pour l'instant") }
  }
  const on = async () => { setBusy(true); const r = await enablePush(uid); setBusy(false); onToast(r.ok ? "Notifications activées sur ce téléphone" : r.msg); setPush({ state: pushSupport(), sub: await currentPush(uid) }) }
  const off = async () => { setBusy(true); await disablePush(push.sub); setBusy(false); onToast("Notifications coupées sur ce téléphone"); setPush({ state: pushSupport(), sub: null }) }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <section className="invite-modal uzu-notif" role="dialog" aria-modal="true" aria-labelledby="notif-title">
      <button className="icon-button modal-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button>
      <h2 id="notif-title">Notifications</h2>
      {list.length ? <ul className="uzu-nlist">{list.slice(0, 40).map(n => { const k = NKINDS[n.kind] || NKINDS.test
        return <li key={String(n.id)} className={n.read_at ? "" : "unread"}><button type="button" onClick={() => { onClose(); if (n.url) onOpen(n.url) }}><span aria-hidden="true">{k.i}</span><span><b>{n.title}</b>{n.body && <p>{n.body}</p>}<small>{ago(n.created_at)}</small></span></button></li> })}</ul>
        : <p className="uzu-text uzu-muted">Aucune notification pour l'instant. Tu seras prévenu ici des validations de ton prof, des messages du club et des rappels.</p>}
      <div className="uzu-nset">
        <h3 className="uzu-h3">Sur ce téléphone</h3>
        {ready === "nosql" ? <p className="uzu-text uzu-small">Notifications pas encore installées sur le serveur du club (script uzu-notifications.sql).</p>
          : push.state === "ios-install" ? <p className="uzu-text uzu-small"><b>Sur iPhone :</b> installe d'abord UZU sur l'écran d'accueil (bouton Partager, puis « Sur l'écran d'accueil »), ouvre-la depuis l'icône, puis reviens ici.</p>
          : push.state === "unsupported" ? <p className="uzu-text uzu-small">Ce navigateur ne gère pas les notifications. Essaie avec Chrome, ou avec l'appli installée.</p>
          : push.state === "nokey" ? <p className="uzu-text uzu-small">Notifications sur le téléphone pas encore configurées pour cet environnement.</p>
          : push.state === "denied" ? <p className="uzu-text uzu-small">Les notifications sont bloquées pour UZU. Autorise-les dans les réglages du navigateur ou du téléphone, puis reviens ici.</p>
          : push.sub ? <><p className="uzu-text uzu-small"><b>Activées sur ce téléphone ✓</b> Tu les reçois même quand l'appli est fermée.</p>
            <div className="uzu-actions uzu-actions--start"><button className="button button--outline uzu-small-btn" disabled={busy} onClick={async () => onToast(await testPush() ? "Test envoyé" : "Test impossible pour l'instant")}>Envoyer un test</button><button className="button button--outline uzu-small-btn" disabled={busy} onClick={off}>Couper sur ce téléphone</button></div></>
          : <><p className="uzu-text uzu-small">Reçois les validations, rappels et messages du club même quand l'appli est fermée.</p><button className="button button--dark uzu-small-btn" disabled={busy} onClick={on}>Activer les notifications sur ce téléphone</button></>}
        <h3 className="uzu-h3">Ce que tu veux recevoir</h3>
        {kindsFor(ctx).map(k => <label key={k} className="uzu-check-row"><input type="checkbox" checked={prefs[k] !== false} onChange={e => toggle(k, e.target.checked)} /><span>{NKINDS[k].n}</span></label>)}
      </div>
    </section>
  </div>
}
