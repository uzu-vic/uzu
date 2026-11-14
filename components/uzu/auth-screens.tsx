"use client"
import { UzuMark } from "@/components/uzu/mark"
// Écrans d'accès : connexion, création de compte (carnet solo, rejoindre un club, créer un club),
// mot de passe oublié, nouveau mot de passe, et écran de bienvenue (accord sur les données).
import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight } from "lucide-react"
import { uzu } from "@/lib/uzu/client"
import { PENDING, dropSignup, emailOk, frAuth, inviteCodeAvailable, inviteToken, dropInviteToken, keepSignup, previewInvitation, resetPassword, setNewPassword, signUp } from "@/lib/uzu/auth"

type Path = "home" | "in" | "solo" | "join" | "create"
const TITLES: Record<Path, string> = { home: "Ta progression sur le tatami, séance après séance", in: "Content de te revoir", solo: "Ton carnet solo", join: "Rejoins ton club", create: "Crée l'espace de ton club" }
const LEADS: Partial<Record<Path, string>> = {
  solo: "Sans club ni prof : tu suis ta progression seul. Tu pourras relier ton carnet à un club plus tard, avec tout ton historique.",
  join: "Le code invitation t'est donné par ton prof.",
  create: "Tu deviens responsable de ce club : tu valides les grades, les techniques ★★★ et tu génères ton bilan d'activité.",
}
const AGES: [string, string][] = [["lt16", "Moins de 16 ans"], ["16-17", "16-17 ans"], ["18-25", "18-25 ans"], ["26-39", "26-39 ans"], ["40p", "40 ans et plus"]]
const SEXES: [string, string][] = [["h", "Homme"], ["f", "Femme"], ["a", "Autre"]]
const ROLE_LBL: Record<string, string> = { owner: "Responsable", section_lead: "Responsable de section", instructor: "Professeur", assistant: "Assistant" }

function Brand() { return <div className="uzu-brand-block"><div className="uzu-login-brand"><UzuMark /><span className="uzu-login-word">UZU</span></div><span className="uzu-slogan">The mat doesn&apos;t lie</span></div> }

export function Login() {
  const [path, setPath] = useState<Path>("home")
  const [f, setF] = useState({ email: "", pass: "", first: "", init: "", code: "", club: "", newCode: "", age: "", sex: "", parent: false, data: false, solo: false })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ t: string; ok?: boolean } | null>(null)
  const [invite, setInvite] = useState("")
  useEffect(() => {
    const t = inviteToken(); if (!t) return
    previewInvitation(t).then(d => {
      if (!d) return
      if (d.status !== "pending") { setInvite(`Ce lien d'invitation n'est plus valable (${d.status === "expired" ? "expiré" : d.status === "accepted" ? "déjà utilisé" : "annulé"}). Demande un nouveau lien au responsable de l'académie.`); dropInviteToken(); return }
      setInvite(`Invitation à rejoindre « ${d.academy} » comme ${ROLE_LBL[d.role] || "membre"}. Connecte-toi ou crée ton compte avec l'adresse invitée (${d.email_hint}), puis l'invitation sera acceptée automatiquement.`)
    })
  }, [])
  const set = (p: Partial<typeof f>) => setF(x => ({ ...x, ...p }))
  const go = (p: Path) => { setPath(p); setMsg(null) }
  const say = (t: string, ok = false) => setMsg(t ? { t, ok } : null)

  // Mêmes contrôles que l'ancienne application (creds)
  const creds = () => {
    const o: { name?: string; email: string; password: string; code?: string; club?: string; demo?: { age: string; sex: string }; parental?: boolean } = { email: f.email.trim(), password: f.pass }
    if (path === "create") {
      o.club = f.club.trim().replace(/\s+/g, " ").slice(0, 60); if (o.club.length < 2) { say("Indique le nom du club."); return null }
      o.code = f.newCode.trim().replace(/\s+/g, "").toUpperCase(); if (!/^[A-Z0-9-]{6,20}$/.test(o.code)) { say("Code invitation : 6 à 20 lettres, chiffres ou tirets (ex. : TEAM2026)."); return null }
    }
    if (path !== "in") {
      const first = f.first.trim().replace(/\s+/g, " "), i = f.init.trim().replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 1).toUpperCase()
      if (!first) { say("Indique ton prénom."); return null }
      if (!i) { say("Indique l'initiale de ton nom."); return null }
      o.name = (first.charAt(0).toUpperCase() + first.slice(1)).slice(0, 30) + " " + i + "."
    }
    if (path === "solo" || path === "join") {
      if (f.age === "lt16" && !f.parent) { say("Moins de 16 ans : coche l'accord de ton représentant légal pour continuer."); return null }
      o.demo = { age: f.age, sex: f.sex }; o.parental = f.age === "lt16"
    }
    if (!emailOk(o.email)) { say("Indique une adresse e-mail valide."); return null }
    if (o.password.length < 8 && path !== "in") { say("Mot de passe : 8 caractères minimum."); return null }
    if (path === "in" && !o.password) { say("Indique ton mot de passe."); return null }
    if (path === "join") {
      o.code = f.code.trim().toUpperCase(); if (!o.code) { say("Indique le code invitation club. Demande-le à ton prof sur le tatami."); return null }
      if (!f.data) { say("Coche l'accord sur tes données pour rejoindre le club."); return null }
    }
    if (path === "solo" && !f.solo) { say("Coche l'accord pour enregistrer ton carnet dans ton compte."); return null }
    say(""); return o
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return
    const o = creds(); if (!o) return
    setBusy(true)
    if (path === "in") {
      const { error } = await uzu().auth.signInWithPassword({ email: o.email, password: o.password })
      setBusy(false); if (error) say(frAuth(error)); return
    }
    if (path === "create") {
      const av = await inviteCodeAvailable(o.code!)
      if (av === false) { setBusy(false); say("Ce code invitation est déjà utilisé : choisis-en un autre."); return }
      try { localStorage.setItem(PENDING, JSON.stringify({ name: o.club, code: o.code })) } catch { /* rien */ }
    } else keepSignup({ name: o.name!, demo: o.demo, parental: o.parental }, path === "solo" ? "solo" : "club")
    const r = await signUp(o.email, o.password, path === "join" ? { club_code: o.code!, name: o.name! } : { name: o.name! })
    setBusy(false)
    if (!r.ok) { dropSignup(); if (path === "create") { try { localStorage.removeItem(PENDING) } catch { /* rien */ } } say(r.msg); return }
    if (path === "solo") { try { localStorage.removeItem("uzu-solo") } catch { /* rien */ } }
    if (!r.session) { setPath("in"); say("Compte créé. Ouvre le lien de confirmation reçu par e-mail, puis connecte-toi.", true) }
    // Avec une session ouverte, l'application s'ouvre d'elle-même (changement d'état de connexion).
  }
  const forgot = async () => {
    const e = f.email.trim(); if (!emailOk(e)) { say("Indique d'abord ton e-mail."); return }
    setBusy(true); const m = await resetPassword(e); setBusy(false)
    say(m || "Si un compte existe pour cette adresse, un e-mail de réinitialisation vient de t'être envoyé. Pense à vérifier tes spams.", !m)
  }
  const show = (...ps: Path[]) => ps.includes(path)

  return <main className="uzu-center uzu-login">
    <section className="uzu-card">
      <Brand /><div className="eyebrow">ATHLETE &amp; CLUB</div>
      {invite && <p className="uzu-note" role="status">{invite}</p>}
      {path === "home" ? <>
        <h1 className="uzu-title">{TITLES.home}<span className="heading-period">.</span></h1>
        <p className="uzu-text">Jiu-jitsu, grappling, lutte. Seul ou avec ton club.</p>
        <div className="uzu-paths">
          <button type="button" className="uzu-path" onClick={() => go("in")}><b>Se connecter</b><small>Tu as déjà un compte</small></button>
          <button type="button" className="uzu-path primary" onClick={() => go("solo")}><b>Créer mon carnet solo (sans club)</b><small>Tes séances, tes techniques, tes compétitions. Sauvegardées dans ton compte, sur tous tes appareils.</small></button>
          <button type="button" className="uzu-path" onClick={() => go("join")}><b>Rejoindre ou créer un club</b><small>Ton prof valide tes ceintures et tes techniques ★★★</small></button>
        </div>
      </> : <form className="uzu-form" onSubmit={submit} noValidate>
        <button type="button" className="text-link uzu-back" onClick={() => go("home")}><ArrowLeft size={15} />Retour</button>
        {show("join", "create") && <div className="uzu-seg" role="tablist" aria-label="Club">
          <button type="button" role="tab" aria-selected={path === "join"} className={path === "join" ? "on" : ""} onClick={() => go("join")}>Rejoindre un club</button>
          <button type="button" role="tab" aria-selected={path === "create"} className={path === "create" ? "on" : ""} onClick={() => go("create")}>Créer un club</button></div>}
        <h1 className="uzu-title">{TITLES[path]}<span className="heading-period">.</span></h1>
        {LEADS[path] && <p className="uzu-text">{LEADS[path]}</p>}
        {show("create") && <><label htmlFor="lg-club">Nom du club</label><input id="lg-club" maxLength={60} autoComplete="organization" placeholder="Ex. : Académie de jiu-jitsu de ta ville" value={f.club} onChange={e => set({ club: e.target.value })} />
          <label htmlFor="lg-newcode">Code invitation pour tes élèves</label><input id="lg-newcode" maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Ex. : TEAM2026" value={f.newCode} onChange={e => set({ newCode: e.target.value })} /></>}
        {show("solo", "join", "create") && <div className="uzu-row2">
          <div className="uzu-field"><label htmlFor="lg-first">Prénom</label><input id="lg-first" maxLength={30} autoComplete="given-name" placeholder="Yanis" value={f.first} onChange={e => set({ first: e.target.value })} /></div>
          <div className="uzu-field"><label htmlFor="lg-init">Initiale du nom</label><input id="lg-init" maxLength={2} autoComplete="off" autoCapitalize="characters" placeholder="B" value={f.init} onChange={e => set({ init: e.target.value })} /></div></div>}
        <label htmlFor="uzu-email">Adresse e-mail</label>
        <input id="uzu-email" type="email" autoComplete="email" placeholder="prenom@exemple.fr" value={f.email} onChange={e => set({ email: e.target.value })} />
        <label htmlFor="uzu-password">{path === "in" ? "Mot de passe" : "Mot de passe (8 caractères minimum)"}</label>
        <input id="uzu-password" type="password" autoComplete={path === "in" ? "current-password" : "new-password"} value={f.pass} onChange={e => set({ pass: e.target.value })} />
        {show("join") && <><label htmlFor="lg-code">Code invitation club</label><input id="lg-code" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Demande-le à ton prof sur le tatami" value={f.code} onChange={e => set({ code: e.target.value })} /></>}
        {show("solo", "join") && <>
          <label htmlFor="lg-age">Tranche d'âge (facultatif)</label>
          <select id="lg-age" value={f.age} onChange={e => set({ age: e.target.value })}><option value="">Choisis…</option>{AGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span className="uzu-label">Sexe (facultatif)</span>
          <div className="uzu-seg" role="group" aria-label="Sexe">{SEXES.map(([k, l]) => <button key={k} type="button" className={f.sex === k ? "on" : ""} aria-pressed={f.sex === k} onClick={() => set({ sex: f.sex === k ? "" : k })}>{l}</button>)}</div>
          {path === "join" && <small className="uzu-hint">Âge et sexe servent uniquement aux statistiques anonymes du club (bilan d'activité, dossiers de subvention).</small>}
          {f.age === "lt16" && <label className="uzu-check-row"><input type="checkbox" checked={f.parent} onChange={e => set({ parent: e.target.checked })} /><span>Mon représentant légal (parent ou tuteur) a donné son accord pour que j'utilise UZU.</span></label>}
        </>}
        {show("join") && <label className="uzu-check-row"><input type="checkbox" checked={f.data} onChange={e => set({ data: e.target.checked })} /><span>J'accepte que mes données d'entraînement soient enregistrées et visibles par les profs de mon club. Mon état physique et mes notes restent visibles par moi seul.</span></label>}
        {show("solo") && <label className="uzu-check-row"><input type="checkbox" checked={f.solo} onChange={e => set({ solo: e.target.checked })} /><span>J'accepte que mes séances soient enregistrées dans mon compte UZU (hébergé dans l'Union européenne). Aucun prof ni club n'y a accès tant que je ne rejoins pas un club.</span></label>}
        {msg && <p className={msg.ok ? "uzu-note ok" : "uzu-error"} role="alert">{msg.t}</p>}
        <button className="button button--dark uzu-submit" type="submit" disabled={busy} aria-busy={busy}>{busy ? (path === "in" ? "Connexion…" : "Création…") : <>{path === "in" ? "Se connecter" : path === "solo" ? "Créer mon carnet" : path === "join" ? "Rejoindre le club" : "Créer le club"}<ArrowRight size={16} /></>}</button>
        {path === "in" && <button type="button" className="text-link uzu-small" disabled={busy} onClick={forgot}>Mot de passe oublié</button>}
      </form>}
    </section>
  </main>
}

/** Arrivée par le lien « mot de passe oublié » : choix du nouveau mot de passe. */
export function Recovery({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState(""), [pw2, setPw2] = useState(""), [msg, setMsg] = useState(""), [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw.length < 8) { setMsg("Mot de passe : 8 caractères minimum."); return }
    if (pw !== pw2) { setMsg("Les deux mots de passe ne sont pas identiques."); return }
    setBusy(true); const m = await setNewPassword(pw); setBusy(false)
    if (m) { setMsg(m); return }
    onDone()
  }
  return <main className="uzu-center uzu-login"><section className="uzu-card"><Brand />
    <h1 className="uzu-title">Nouveau mot de passe<span className="heading-period">.</span></h1>
    <form className="uzu-form" onSubmit={submit} noValidate>
      <label htmlFor="rc-pw">Nouveau mot de passe (8 caractères minimum)</label><input id="rc-pw" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
      <label htmlFor="rc-pw2">Confirmation</label><input id="rc-pw2" type="password" autoComplete="new-password" value={pw2} onChange={e => setPw2(e.target.value)} />
      {msg && <p className="uzu-error" role="alert">{msg}</p>}
      <button className="button button--dark uzu-submit" type="submit" disabled={busy}>Enregistrer le mot de passe<ArrowRight size={16} /></button>
    </form></section></main>
}

/** Première ouverture sans accord enregistré (compte créé ailleurs ou ancien compte). */
export function Welcome({ initialName, onSubmit, onLogout }: { initialName: string; onSubmit: (p: { name: string; age: string; sex: string; parental: boolean }) => Promise<string>; onLogout: () => void }) {
  const [name, setName] = useState(initialName), [age, setAge] = useState(""), [sex, setSex] = useState(""), [parent, setParent] = useState(false), [data, setData] = useState(false)
  const [msg, setMsg] = useState(""), [busy, setBusy] = useState(false)
  const start = async () => {
    if (!name.trim()) { setMsg("Indique ton prénom pour que ton prof te reconnaisse"); return }
    if (age === "lt16" && !parent) { setMsg("Moins de 16 ans : coche l'accord de ton représentant légal"); return }
    if (!data) { setMsg("Coche l'accord sur tes données pour continuer"); return }
    setBusy(true); const m = await onSubmit({ name, age, sex, parental: age === "lt16" }); setBusy(false); setMsg(m)
  }
  return <main className="uzu-center uzu-login"><section className="uzu-card"><Brand />
    <div className="eyebrow">BIENVENUE SUR UZU</div>
    <h1 className="uzu-title">Ton suivi, de la blanche à la noire<span className="heading-period">.</span></h1>
    <ul className="uzu-text uzu-feat">
      <li><b>Le focus tactique du club</b> et la carte de tes fondamentaux et de tes 3 systèmes : lutte, contrôle et dos, jambes.</li>
      <li><b>Après chaque cours</b>, ta séance saisie en 10 secondes, et tes résultats en compétition.</li>
      <li><b>Ta ceinture, tes barrettes et tes techniques ★★★</b>, validées par ton prof, avec ta progression jusqu'à la noire.</li>
    </ul>
    <p className="uzu-text uzu-small">Tes séances, tes compétitions et ta ceinture sont enregistrées dans ta fiche. Seuls toi et les profs de ton club peuvent les voir. Ton état physique et tes notes restent visibles par toi seul. Tu peux tout supprimer à tout moment depuis ton profil.</p>
    <div className="uzu-form">
      <label htmlFor="w-name">Ton prénom et l'initiale de ton nom</label><input id="w-name" maxLength={40} autoComplete="name" placeholder="Ex. : Yanis B." value={name} onChange={e => setName(e.target.value)} />
      <label htmlFor="w-age">Tranche d'âge (facultatif)</label><select id="w-age" value={age} onChange={e => setAge(e.target.value)}><option value="">Choisis…</option>{AGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <span className="uzu-label">Sexe (facultatif)</span>
      <div className="uzu-seg" role="group" aria-label="Sexe">{SEXES.map(([k, l]) => <button key={k} type="button" className={sex === k ? "on" : ""} aria-pressed={sex === k} onClick={() => setSex(sex === k ? "" : k)}>{l}</button>)}</div>
      <small className="uzu-hint">Âge et sexe servent uniquement aux statistiques anonymes du club (bilan d'activité, dossiers de subvention).</small>
      {age === "lt16" && <label className="uzu-check-row"><input type="checkbox" checked={parent} onChange={e => setParent(e.target.checked)} /><span>Mon représentant légal (parent ou tuteur) a donné son accord pour que j'utilise UZU.</span></label>}
      <label className="uzu-check-row"><input type="checkbox" checked={data} onChange={e => setData(e.target.checked)} /><span>J'accepte que mes données d'entraînement soient enregistrées et visibles par les profs de mon club</span></label>
      {msg && <p className="uzu-error" role="alert">{msg}</p>}
      <button className="button button--dark uzu-submit" type="button" disabled={busy} onClick={start}>Commencer<ArrowRight size={16} /></button>
      <button className="text-link uzu-small" type="button" onClick={onLogout}>Se déconnecter</button>
    </div>
  </section></main>
}
