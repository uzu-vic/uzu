"use client"
// Point d'entrée de la nouvelle application UZU (lot 1 — socle).
// Les écrans pas encore portés renvoient vers l'ancienne application (/legacy/),
// qui partage la même session et la même base.
import { useCallback, useEffect, useState } from "react"
import type { Session } from "@supabase/supabase-js"
import {
  ArrowRight, CalendarDays, CheckCircle2, ChevronDown, Dumbbell, GraduationCap, LayoutDashboard,
  LogOut, Menu, MoreHorizontal, ShieldCheck, Target, TrendingUp, UserRound, Users,
} from "lucide-react"
import { CONFIG_OK } from "@/lib/uzu/env"
import { uzu } from "@/lib/uzu/client"
import { fetchContext, switchAcademy, teamOn, type UzuContext } from "@/lib/uzu/context"
import { can, isStaff, isSuspended } from "@/lib/uzu/permissions"
import { AthleteHome, AthleteLog } from "@/components/uzu/athlete"

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
    { id: "home", label: "Accueil", icon: LayoutDashboard, legacy: "prof", show: true },
    { id: "attendance", label: "Présences", icon: CheckCircle2, legacy: "prof", show: can(ctx, "attendance", "view") },
    { id: "students", label: "Élèves", icon: Users, legacy: "prof", show: can(ctx, "students", "view") },
    { id: "progress", label: "Progression", icon: TrendingUp, legacy: "prof", show: can(ctx, "belts", "view") || can(ctx, "progression", "view") },
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

  // Liens existants de l'ancienne application (invitation, notification) : transmis tels quels.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    if (q.has("invite") || q.has("go")) window.location.replace(LEGACY + window.location.search)
  }, [])

  useEffect(() => {
    if (!CONFIG_OK) { setReady(true); return }
    const sb = uzu()
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const loadCtx = useCallback(async () => {
    setCtxError("")
    try { setCtx(await fetchContext()) } catch (e) { setCtxError((e as Error).message) }
  }, [])

  useEffect(() => { if (session) loadCtx(); else setCtx(null) }, [session, loadCtx])

  if (!CONFIG_OK) return <ConfigMissing />
  if (!ready) return <div className="uzu-splash" aria-busy="true"><span className="brand-glyph">U</span></div>
  if (!session) return <Login />
  return <Shell session={session} ctx={ctx} ctxError={ctxError} onReload={loadCtx} onCtx={setCtx} />
}

function ConfigMissing() {
  return <main className="uzu-center"><section className="uzu-card"><span className="modal-icon"><ShieldCheck size={20} /></span><h1 className="uzu-title">Configuration manquante<span className="heading-period">.</span></h1><p className="uzu-text">Cet environnement n'a pas de projet Supabase défini (NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY).</p></section></main>
}

function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError("")
    const { error: err } = await uzu().auth.signInWithPassword({ email: email.trim(), password })
    if (err) setError(err.message === "Invalid login credentials" ? "Adresse ou mot de passe incorrect." : err.message)
    setBusy(false)
  }
  return <main className="uzu-center uzu-login">
    <section className="uzu-card">
      <div className="uzu-login-brand"><span className="brand-glyph">U</span><span className="uzu-login-word">UZU</span></div>
      <div className="eyebrow">ATHLETE &amp; CLUB</div>
      <h1 className="uzu-title">Bon retour sur le tatami<span className="heading-period">.</span></h1>
      <form className="uzu-form" onSubmit={submit}>
        <label htmlFor="uzu-email">Adresse e-mail</label>
        <input id="uzu-email" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
        <label htmlFor="uzu-password">Mot de passe</label>
        <input id="uzu-password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
        {error && <p className="uzu-error" role="alert">{error}</p>}
        <button className="button button--dark uzu-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? "Connexion…" : <>Se connecter<ArrowRight size={16} /></>}</button>
      </form>
      <p className="uzu-text uzu-small">Pas encore de compte, mot de passe oublié ou code club ? <a href={LEGACY}>Continuer dans l'application actuelle</a>.</p>
    </section>
  </main>
}

function Shell({ session, ctx, ctxError, onReload, onCtx }: { session: Session; ctx: UzuContext | null; ctxError: string; onReload: () => void; onCtx: (c: UzuContext) => void }) {
  const staff = isStaff(ctx)
  const [space, setSpace] = useState<Space>("athlete")
  const [active, setActive] = useState("home")
  const [menuOpen, setMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [notice, setNotice] = useState("")

  // Un élève ne voit jamais l'espace Club ; le serveur refuse de toute façon ses actions.
  useEffect(() => { if (!staff && space === "club") { setSpace("athlete"); setActive("home") } }, [staff, space])

  const items = space === "club" ? clubNav(ctx) : athleteNav
  const current = items.find(i => i.id === active) ?? items[0]
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>
  const name = String(meta.name || meta.full_name || session.user.email || "Utilisateur")
  const memberships = (ctx?.memberships ?? []).filter(m => m.status === "active")
  const go = (id: string) => { setActive(id); setMenuOpen(false) }
  const changeSpace = (s: Space) => { setSpace(s); setActive("home"); setMenuOpen(false) }

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
      <div className="sidebar-top"><div className="brand-mark" aria-label="UZU"><span className="brand-glyph">U</span><span className="brand-word">UZU</span></div><button className="icon-button sidebar-collapse uzu-only-mobile" aria-label="Fermer le menu" onClick={() => setMenuOpen(false)}><Menu size={17} /></button></div>
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
      <header className="topbar"><div className="topbar-crumb"><span>UZU</span><span className="crumb-slash">/</span><span>{space === "athlete" ? "ATHLETE" : "CLUB"}</span><span className="crumb-slash">/</span><strong>{current?.label.toUpperCase()}</strong></div></header>
      <div className="mobile-space-bar"><button className="mobile-menu-trigger" aria-label="Ouvrir la navigation" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><div className="brand-mark brand-mark--compact"><span className="brand-glyph">U</span><span className="brand-word">UZU</span></div>{staff && <div className="mobile-switcher"><button onClick={() => changeSpace(space === "athlete" ? "club" : "athlete")}>{space === "athlete" ? "Athlete" : "Club"}<ChevronDown size={13} /></button></div>}</div>
      <div className="page-content">
        {ctxError && <div className="uzu-banner uzu-banner--error" role="alert">Impossible de lire votre contexte : {ctxError} <button className="text-link" onClick={onReload}>Réessayer</button></div>}
        {notice && <div className="uzu-banner uzu-banner--error" role="alert">{notice}</div>}
        {ctx && !teamOn(ctx) && <div className="uzu-banner">La base de cet environnement n'a pas la migration « équipe » : affichage en mode simplifié.</div>}
        {space === "club" && isSuspended(ctx) ? <Suspended />
          : space === "athlete" && current?.id === "home" ? <AthleteHome uid={session.user.id} ctx={ctx} name={name} onNavigate={go} />
          : space === "athlete" && current?.id === "log" ? <AthleteLog uid={session.user.id} ctx={ctx} />
          : current && <MigrationPage item={current} space={space} ctx={ctx} name={name} />}
      </div>
    </div>
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
