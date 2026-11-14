"use client"
import { UzuMark } from "@/components/uzu/mark"
// Point d'entrée de la nouvelle application UZU (lot 1 — socle).
// Les écrans pas encore portés renvoient vers l'ancienne application (/legacy/),
// qui partage la même session et la même base.
import { useCallback, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import {
  ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Dumbbell, GraduationCap, LayoutDashboard,
  LogOut, Menu, MoreHorizontal, Newspaper, ShieldCheck, Target, TrendingUp, UserRound, Users,
} from "lucide-react"
import { CONFIG_OK } from "@/lib/uzu/env"
import { uzu } from "@/lib/uzu/client"
import { fetchContext, switchAcademy, teamOn, type UzuContext } from "@/lib/uzu/context"
import { can, isStaff, isSuspended } from "@/lib/uzu/permissions"
import { AthleteHome, AthleteLog } from "@/components/uzu/athlete"
import { JournalForm } from "@/components/uzu/journal-form"
import { AthleteProgress, AthleteTechniques } from "@/components/uzu/progress"
import { AthleteFeed, AthleteProfile } from "@/components/uzu/social"
import { syncPending } from "@/lib/uzu/journal"
import { ClubAttendance, ClubHome, ClubProgress } from "@/components/uzu/club"
import { ClubStudents } from "@/components/uzu/club-students"
import { ClubAcademy, ClubContents, ClubCourses, ClubTeam } from "@/components/uzu/club-admin"
import { BellButton, NotifCenter, useNotifs } from "@/components/uzu/notifications"
import { Login, Recovery, Welcome } from "@/components/uzu/auth-screens"
import { PENDING, acceptInvitation, captureInviteToken, cleanInviteUrl, dropInviteToken, inviteToken } from "@/lib/uzu/auth"
import { createClubFromSolo, ensureConsent, giveConsent } from "@/lib/uzu/journal"
import { Check, X } from "lucide-react"

type Space = "athlete" | "club"
type IconType = typeof Dumbbell
type NavItem = { id: string; label: string; icon: IconType; legacy: string }

const LEGACY = "/legacy/"

const athleteNav: NavItem[] = [
  { id: "home", label: "Accueil", icon: LayoutDashboard, legacy: "today" },
  { id: "log", label: "Carnet", icon: Dumbbell, legacy: "log" },
  { id: "path", label: "Techniques", icon: Target, legacy: "path" },
  { id: "progress", label: "Progression", icon: TrendingUp, legacy: "prog" },
  { id: "feed", label: "Fil du club", icon: Users, legacy: "feed" },
  { id: "profile", label: "Mon profil", icon: UserRound, legacy: "profile" },
]

function clubNav(ctx: UzuContext | null): NavItem[] {
  const items: (NavItem & { show: boolean })[] = [
    // Mêmes règles d'accès aux onglets que l'ancienne application (tabAllowed)
    { id: "home", label: "Accueil", icon: LayoutDashboard, legacy: "prof", show: can(ctx, "dashboard", "view") },
    { id: "attendance", label: "Présences", icon: CheckCircle2, legacy: "prof", show: can(ctx, "attendance", "view") || can(ctx, "attendance", "create") },
    { id: "students", label: "Élèves", icon: Users, legacy: "prof", show: can(ctx, "students", "view") },
    { id: "progress", label: "Progression", icon: TrendingUp, legacy: "prof", show: can(ctx, "progression", "view") || can(ctx, "belts", "view") || can(ctx, "belts", "create") },
    { id: "contents", label: "Contenus", icon: Newspaper, legacy: "prof", show: can(ctx, "contents", "view") || can(ctx, "communications", "view") || can(ctx, "communications", "create") },
    { id: "courses", label: "Cours", icon: CalendarDays, legacy: "prof", show: can(ctx, "schedule", "view") || can(ctx, "courses", "view") },
    { id: "team", label: "Équipe", icon: GraduationCap, legacy: "prof", show: can(ctx, "instructors", "view") },
    { id: "academy", label: "Mon académie", icon: ShieldCheck, legacy: "prof", show: true },
  ]
  return items.filter(i => i.show)
}

const ROLE_LBL: Record<string, string> = {
  owner: "Responsable", section_lead: "Responsable de section", instructor: "Professeur", assistant: "Assistant", student: "Élève",
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return ((parts[0]?.[0] ?? "U") + (parts[1]?.[0] ?? "")).toUpperCase()
}

export function UzuRoot() {
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [ctx, setCtx] = useState<UzuContext | null>(null)
  const [ctxError, setCtxError] = useState("")

  // Lien d'invitation d'équipe (?invite=) : jeton gardé sur le téléphone, accepté après la connexion
  useState(() => { if (typeof window !== "undefined") captureInviteToken(); return 0 })
  useEffect(() => { const t = window.setTimeout(cleanInviteUrl, 0); return () => window.clearTimeout(t) }, [])
  const [recovery, setRecovery] = useState(false)
  const [flash, setFlash] = useState("")
  const [welcome, setWelcome] = useState<"" | "check" | "show" | "ok">("")

  useEffect(() => {
    if (!CONFIG_OK) { setReady(true); return }
    const sb = uzu()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = sb.auth.onAuthStateChange((ev, s) => { if (ev === "PASSWORD_RECOVERY") setRecovery(true); setSession(s) })
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadCtx = useCallback(async () => {
    setCtxError("")
    try { setCtx(await fetchContext()) } catch (e) { setCtxError((e as Error).message) }
  }, [])

  const uid = session?.user.id || ""
  useEffect(() => { if (uid) loadCtx(); else { setCtx(null); setWelcome("") } }, [uid, loadCtx])

  // Après la connexion, une seule fois : club en attente de création, invitation d'équipe, accord sur les données.
  const [booted, setBooted] = useState("")
  useEffect(() => {
    if (!ctx || !uid || booted === uid) return
    setBooted(uid)
    ;(async () => {
      let c: UzuContext = ctx
      const refresh = async () => { try { c = await fetchContext(); setCtx(c) } catch { /* contexte précédent conservé */ } }
      let pend: { name?: string; code?: string } | null = null
      try { pend = JSON.parse(localStorage.getItem(PENDING) || "null") } catch { /* rien */ }
      if (pend && pend.name && ctx.role === "solo") {
        try { localStorage.removeItem(PENDING) } catch { /* rien */ }
        const r = await createClubFromSolo(pend.name, pend.code || "")
        setFlash(r.ok ? `${pend.name} est créé. Donne ce code invitation à tes élèves : ${r.code}. Ils l'indiquent à l'inscription ou depuis leur carnet solo (Mon profil) pour te rejoindre avec tout leur historique.`
          : `Création du club impossible : ${r.msg} Ton compte est ouvert en carnet solo : tu peux recréer ton club depuis Mon profil.`)
        if (r.ok) await refresh()
      }
      const tk = inviteToken()
      if (tk && teamOn(c)) {
        const r = await acceptInvitation(tk); dropInviteToken()
        setFlash(r.ok ? `Bienvenue dans l'équipe : tu fais maintenant partie de l'équipe de ${r.club}. Tes accès ont été définis par le responsable de l'académie.` : `Invitation non acceptée : ${r.msg}`)
        if (r.ok) await refresh()
      }
      setWelcome("check")
      try { setWelcome(await ensureConsent(uid, c) ? "ok" : "show") } catch { setWelcome("ok") }
    })()
  }, [ctx, uid, booted])

  if (!CONFIG_OK) return <ConfigMissing />
  if (!ready) return <div className="uzu-splash" aria-busy="true"><UzuMark size={52} /></div>
  if (!session) return <Login />
  if (recovery) return <Recovery onDone={() => { setRecovery(false); setFlash("Mot de passe modifié.") }} />
  if (ctx && !ctxError && (welcome === "" || welcome === "check")) return <div className="uzu-splash" aria-busy="true"><UzuMark size={52} /></div>
  if (welcome === "show" && ctx) {
    const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>
    return <Welcome initialName={String(meta.name || "")} onLogout={() => { uzu().auth.signOut() }} onSubmit={async p => { const r = await giveConsent(session.user.id, ctx, p); if (!r.ok) return r.msg; setWelcome("ok"); setFlash("Bienvenue sur UZU"); return "" }} />
  }
  return <Shell session={session} ctx={ctx} ctxError={ctxError} onReload={loadCtx} onCtx={setCtx} flash={flash} onFlashClose={() => setFlash("")} />
}

function ConfigMissing() {
  return <main className="uzu-center"><section className="uzu-card"><span className="modal-icon"><ShieldCheck size={20} /></span><h1 className="uzu-title">Configuration manquante<span className="heading-period">.</span></h1><p className="uzu-text">Cet environnement n'a pas de projet Supabase défini (NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY).</p></section></main>
}

function Shell({ session, ctx, ctxError, onReload, onCtx, flash, onFlashClose }: { session: Session; ctx: UzuContext | null; ctxError: string; onReload: () => void; onCtx: (c: UzuContext) => void; flash: string; onFlashClose: () => void }) {
  const staff = isStaff(ctx)
  const [space, setSpace] = useState<Space>("athlete")
  const [active, setActive] = useState("home")
  const [menuOpen, setMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [notice, setNotice] = useState("")
  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<{ kind: "s" | "c"; id: string } | null>(null)
  const [toast, setToast] = useState("")
  const showToast = (m: string) => { setToast(m); window.setTimeout(() => setToast(""), 4500) }

  // Saisies restées sur le téléphone : envoyées au démarrage, au retour du réseau et au retour sur l'appli
  const [syncTick, setSyncTick] = useState(0)
  useEffect(() => {
    if (!ctx) return
    let live = true
    syncPending(session.user.id, ctx).then(sent => { if (live && sent) { showToast("Saisies de ce téléphone synchronisées"); setSyncTick(t => t + 1) } }).catch(() => {})
    return () => { live = false }
  }, [ctx, session.user.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const kick = () => { if (document.visibilityState === "visible" && ctx) syncPending(session.user.id, ctx).then(sent => { if (sent) { showToast("Saisies de ce téléphone synchronisées"); setSyncTick(t => t + 1) } }).catch(() => {}) }
    window.addEventListener("online", kick); document.addEventListener("visibilitychange", kick)
    return () => { window.removeEventListener("online", kick); document.removeEventListener("visibilitychange", kick) }
  }, [ctx, session.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Un élève ne voit jamais l'espace Club ; le serveur refuse de toute façon ses actions.
  useEffect(() => { if (!staff && space === "club") { setSpace("athlete"); setActive("home") } }, [staff, space])

  const items = space === "club" ? clubNav(ctx) : athleteNav
  const current = items.find(i => i.id === active) ?? items[0]
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>
  const name = String(meta.name || meta.full_name || session.user.email || "Utilisateur")
  const memberships = (ctx?.memberships ?? []).filter(m => m.status === "active")
  const [navArg, setNavArg] = useState("")
  const go = (id: string, arg = "") => { setActive(id); setNavArg(arg); setMenuOpen(false); setComposing(false); setEditing(null); window.scrollTo(0, 0) }
  const changeSpace = (s: Space) => { setSpace(s); setActive("home"); setMenuOpen(false); setComposing(false) }

  // Ouverture depuis une notification : ?go=vue (appli fermée) ou message du service worker (appli ouverte)
  const openGo = useCallback((g: string) => {
    const map: Record<string, [Space, string]> = { today: ["athlete", "home"], path: ["athlete", "path"], prog: ["athlete", "progress"], feed: ["athlete", "feed"], log: ["athlete", "log"], prof: ["club", "home"] }
    const t = map[g]; if (!t) return
    if (t[0] === "club" && !staff) return
    setSpace(t[0]); setMenuOpen(false); setEditing(null)
    if (g === "log") { setActive("log"); setComposing(true) } else { setActive(t[1]); setComposing(false) }
    window.scrollTo(0, 0)
  }, [staff])
  useEffect(() => {
    if (!ctx) return
    try { const g = new URLSearchParams(window.location.search).get("go"); if (g) { window.history.replaceState(null, "", window.location.pathname); openGo(g) } } catch { /* rien */ }
    const onMsg = (e: MessageEvent) => { if (e.data && e.data.type === "uzu-go") openGo(String(e.data.go || "")) }
    if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", onMsg)
    return () => { if ("serviceWorker" in navigator) navigator.serviceWorker.removeEventListener("message", onMsg) }
  }, [!!ctx, openGo]) // eslint-disable-line react-hooks/exhaustive-deps
  const [notifOpen, setNotifOpen] = useState(false)
  const notifs = useNotifs(session.user.id, ctx, n => showToast(n.title))
  const openNotifs = () => { setNotifOpen(true); window.setTimeout(notifs.readAll, 800) }

  const onSwitch = async (academyId: string) => {
    if (!academyId || academyId === ctx?.club?.id) return
    setSwitching(true)
    try { onCtx(await switchAcademy(academyId)); setNotice("") } catch (e) { setNotice((e as Error).message) }
    setSwitching(false)
  }
  const logout = async () => { await uzu().auth.signOut() }

  const bottom = items.length > 5 ? items.slice(0, 4) : items

  return <main className={`app-shell ${menuOpen ? "mobile-menu-open" : ""}`}>
    <aside className="sidebar">
      <div className="sidebar-top"><div className="brand-mark" aria-label="UZU"><UzuMark /><span className="brand-word">UZU</span></div><button className="icon-button sidebar-collapse uzu-only-mobile" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}><Menu size={17} /></button></div>
      {staff && <div className="space-picker" aria-label="Choisir un espace">
        <button className={`space-option ${space === "athlete" ? "is-selected" : ""}`} onClick={() => changeSpace("athlete")} aria-pressed={space === "athlete"}><span className="space-option-icon"><UserRound size={15} /></span><span>Athlete</span></button>
        <button className={`space-option ${space === "club" ? "is-selected" : ""}`} onClick={() => changeSpace("club")} aria-pressed={space === "club"}><span className="space-option-icon"><ShieldCheck size={15} /></span><span>Club</span></button>
      </div>}
      {!staff && <div className="uzu-space-gap" />}
      {ctx?.club && <div className="academy-switcher">
        <span className="academy-avatar">{ctx.club.name.slice(0, 1).toUpperCase()}</span>
        <span className="academy-name"><strong>{ctx.club.name}</strong><small>{ROLE_LBL[ctx.academy_role ?? (ctx.role === "coach" ? "owner" : "student")] ?? ""}</small></span>
        {memberships.length > 1 && <><ChevronDown size={15} /><select className="uzu-academy-select" aria-label="Changer d'académie" value={ctx.club.id} disabled={switching} onChange={e => onSwitch(e.target.value)}>{memberships.map(m => <option key={m.academy_id} value={m.academy_id}>{m.name} · {ROLE_LBL[m.role] ?? m.role}</option>)}</select></>}
      </div>}
      <div className="nav-label">MENU PRINCIPAL</div>
      <nav className="primary-nav" aria-label={`Navigation ${space === "athlete" ? "Athlete" : "Club"}`}>
        {items.map(item => { const Icon = item.icon; return <button key={item.id} className={`nav-item ${current?.id === item.id ? "is-active" : ""}`} onClick={() => go(item.id)} aria-current={current?.id === item.id ? "page" : undefined}><Icon size={18} strokeWidth={1.8} /><span>{item.label}</span></button> })}
      </nav>
      <div className="sidebar-spacer" />
      <div className="sidebar-bottom"><div className="profile-switch"><span className="avatar avatar--light" aria-hidden="true">{initials(name)}</span><span><strong>{name}</strong><small>{session.user.email}</small></span><button className="icon-button uzu-logout" aria-label="Se déconnecter" onClick={logout}><LogOut size={16} /></button></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="topbar-crumb"><span>UZU</span><span className="crumb-slash">/</span><span>{space === "athlete" ? "ATHLETE" : "CLUB"}</span><span className="crumb-slash">/</span><strong>{current?.label.toUpperCase()}</strong></div><div className="topbar-actions"><BellButton unread={notifs.unread} onClick={openNotifs} /></div></header>
      <div className="mobile-space-bar"><button className="mobile-menu-trigger" aria-label="Ouvrir la navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><div className="brand-mark brand-mark--compact"><UzuMark /><span className="brand-word">UZU</span></div><span className="uzu-mobile-bell"><BellButton unread={notifs.unread} onClick={openNotifs} /></span>{staff && <div className="mobile-switcher"><button onClick={() => changeSpace(space === "athlete" ? "club" : "athlete")}>{space === "athlete" ? "Athlete" : "Club"}<ChevronDown size={13} /></button></div>}</div>
      <div className="page-content">
        {ctxError && <div className="uzu-banner uzu-banner--error" role="alert">Impossible de lire votre contexte : {ctxError} <button className="text-link" onClick={onReload}>Réessayer</button></div>}
        {notice && <div className="uzu-banner uzu-banner--error" role="alert">{notice}</div>}
        {flash && <div className="uzu-banner uzu-flash" role="status"><span>{flash}</span><button className="icon-button" aria-label="Fermer le message" onClick={onFlashClose}><X size={15} /></button></div>}
        {ctx && !teamOn(ctx) && <div className="uzu-banner">La base de cet environnement n'a pas la migration « équipe » : affichage en mode simplifié.</div>}
        {space === "club" && isSuspended(ctx) ? <Suspended />
          : space === "athlete" && composing ? <JournalForm key={editing ? editing.kind + editing.id : "new"} uid={session.user.id} ctx={ctx} edit={editing} onCancel={() => { setComposing(false); setEditing(null) }} onDone={m => { setComposing(false); setEditing(null); setActive("log"); showToast(m); window.scrollTo(0, 0) }} />
          : space === "athlete" && current?.id === "home" ? <AthleteHome key={"h" + syncTick} uid={session.user.id} ctx={ctx} name={name} onNavigate={go} onCompose={() => { setComposing(true); window.scrollTo(0, 0) }} />
          : space === "athlete" && current?.id === "path" ? <AthleteTechniques key={"t" + syncTick} uid={session.user.id} ctx={ctx} />
          : space === "athlete" && current?.id === "progress" ? <AthleteProgress key={"p" + syncTick} uid={session.user.id} ctx={ctx} />
          : space === "athlete" && current?.id === "log" ? <AthleteLog key={"l" + syncTick} uid={session.user.id} ctx={ctx} onCompose={() => { setComposing(true); window.scrollTo(0, 0) }} onEdit={(kind, id) => { setEditing({ kind, id }); setComposing(true); window.scrollTo(0, 0) }} onToast={showToast} />
          : space === "athlete" && current?.id === "feed" ? <AthleteFeed key={"f" + syncTick} uid={session.user.id} ctx={ctx} onToast={showToast} onCompose={() => { setComposing(true); window.scrollTo(0, 0) }} />
          : space === "athlete" && current?.id === "profile" ? <AthleteProfile key={"pr" + syncTick} session={session} ctx={ctx} onToast={showToast} />
          : space === "club" && teamOn(ctx) && current?.id === "home" ? <ClubHome key={"ch" + ctx?.club?.id} uid={session.user.id} ctx={ctx} name={name} onToast={showToast} onNavigate={go} />
          : space === "club" && teamOn(ctx) && current?.id === "attendance" ? <ClubAttendance key={"ca" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} />
          : space === "club" && teamOn(ctx) && current?.id === "students" ? <ClubStudents key={"cs" + ctx?.club?.id + navArg} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} initialFilter={navArg} />
          : space === "club" && teamOn(ctx) && current?.id === "progress" ? <ClubProgress key={"cp" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} />
          : space === "club" && teamOn(ctx) && current?.id === "contents" ? <ClubContents key={"cc" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} onReloadCtx={onReload} />
          : space === "club" && teamOn(ctx) && current?.id === "courses" ? <ClubCourses key={"co" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} onReloadCtx={onReload} />
          : space === "club" && teamOn(ctx) && current?.id === "team" ? <ClubTeam key={"ct" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} onReloadCtx={onReload} />
          : space === "club" && teamOn(ctx) && current?.id === "academy" ? <ClubAcademy key={"ac" + ctx?.club?.id} uid={session.user.id} ctx={ctx} onToast={showToast} onNavigate={go} onReloadCtx={onReload} />
          : current && <MigrationPage item={current} space={space} ctx={ctx} name={name} />}
      </div>
    </div>
    {notifOpen && <NotifCenter uid={session.user.id} ctx={ctx} list={notifs.list} ready={notifs.ready} onClose={() => setNotifOpen(false)} onOpen={openGo} onToast={showToast} />}
    {toast && <div className="toast-message" role="status"><span><Check size={15} /></span>{toast}<button onClick={() => setToast("")} aria-label="Fermer le message"><X size={15} /></button></div>}
    <nav className="mobile-bottom-nav" aria-label="Navigation mobile">
      {bottom.map(item => { const Icon = item.icon; return <button key={item.id} className={current?.id === item.id ? "active" : ""} onClick={() => go(item.id)} aria-current={current?.id === item.id ? "page" : undefined}><Icon size={18} /><span>{item.label}</span></button> })}
      {items.length > 5 && <button className={bottom.some(b => b.id === current?.id) ? "" : "active"} onClick={() => setMenuOpen(true)}><MoreHorizontal size={18} /><span>Plus</span></button>}
    </nav>
  </main>
}

function Suspended() {
  return <section className="panel uzu-panel"><h2 className="uzu-h2">Accès suspendu</h2><p className="uzu-text">Votre accès à l'espace Club de cette académie est suspendu par son responsable. Votre compte et votre entraînement personnel restent disponibles dans l'espace Athlete.</p></section>
}

function MigrationPage({ item, space, ctx, name }: { item: NavItem; space: Space; ctx: UzuContext | null; name: string }) {
  const first = name.split(/[\s@]/)[0]
  return <>
    <div className="page-heading"><div><div className="eyebrow">{space === "athlete" ? "ESPACE ATHLETE" : "ESPACE CLUB"}{ctx?.club && <><span className="eyebrow-dot" />{ctx.club.name.toUpperCase()}</>}</div><h1>{item.id === "home" ? <>Bonjour {first}</> : item.label}<span className="heading-period">.</span></h1><p>{item.id === "home" ? "Votre espace UZU, sur la même base et le même compte." : "Cet écran est en cours de migration vers le nouveau design."}</p></div></div>
    <section className="panel uzu-panel">
      <div className="eyebrow">EN COURS DE MIGRATION</div>
      <h2 className="uzu-h2">« {item.label} » fonctionne dans l'application actuelle</h2>
      <p className="uzu-text">Vos données sont les mêmes des deux côtés et vous restez connecté. Cet écran sera remplacé ici dès qu'il aura passé ses tests.</p>
      <a className="button button--dark" href={LEGACY}>Ouvrir l'application actuelle<ArrowRight size={16} /></a>
    </section>
  </>
}
