"use client"
// Espace Athlete — Fil du club (Tatami) et Mon profil.
// Même contenu et mêmes règles que l'ancienne application : le fil ne montre jamais les soumissions
// subies, l'état physique ni les notes privées ; on n'y apparaît que si on l'a choisi.
import { useEffect, useState } from "react"
import { Check, KeyRound, LogOut, Plus, Share2, ShieldCheck, Trash2, Users } from "lucide-react"
import type { Session } from "@supabase/supabase-js"
import { uzu } from "@/lib/uzu/client"
import type { UzuContext } from "@/lib/uzu/context"
import { changePassword, createClubFromSolo, deleteAllData, deleteAllText, feedReact, joinClubByCode, loadCore, loadFeed, saveProfileInfo, setFeedShare } from "@/lib/uzu/journal"
import { BeltMark } from "@/components/uzu/progress"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
const LEGACY = "/legacy/"

function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div> }

function evText(C: Any, it: Any): { big: string; rest: string; badge?: string } {
  const e = it.e
  if (e.t === "s" && e.k === "prepa") return { big: "Prépa physique", rest: [durTxt(e.dur), e.ef].filter(Boolean).join(" · "), badge: "Prépa physique" }
  if (e.t === "s") return { big: "Séance validée", rest: [durTxt(e.dur), e.gi, e.sys ? C.SYSTEMS[e.sys].n : ""].filter(Boolean).join(" · "), badge: (C.KINDS[e.k] || C.KINDS.cours).n }
  if (e.t === "m") return e.k === "n" ? { big: `${e.n}e séance`, rest: "enregistrée sur UZU" } : { big: `${e.n} semaines d'affilée`, rest: "sur le tatami" }
  if (e.t === "c") return { big: "Médaille " + ({ or: "d'or", argent: "d'argent", bronze: "de bronze" } as Any)[e.res], rest: e.ev || "" }
  if (e.t === "g") {
    const bn = (C.BELTS.find((b: Any) => b.k === e.rank) || C.BELTS[0]).n
    return { big: "Grade validé par le prof", rest: e.nb ? `ceinture ${bn}${e.st ? ", " + C.stripesTxt(e.st) : ""}` : `${C.ordFr(e.st)} barrette, ceinture ${bn}` }
  }
  if (e.t === "r") return { big: "Demande une validation ★★", rest: e.tech }
  return { big: "", rest: "" }
}
/** feedStats() de l'ancienne application, avec une correction : dans l'original, un commentaire placé
 *  sur la même ligne neutralise le cumul du mois, si bien que le défi collectif affiche toujours 0 h.
 *  Le podium (calcul hebdomadaire) est repris tel quel. */
function feedStatsFixed(C: Any, role: string) {
  const base = C.feedStats(), mo = C.ymd(C.TODAY).slice(0, 7), members = new Set<string>(), feedDocs = C.__get("feedDocs") || {}, myUid = C.__get("myUid")
  let mins = 0
  const add = (uid: string, e: Any) => { if (e.t !== "s" || e.k === "prepa") return; if (String(e.d).slice(0, 7) === mo) { mins += e.dur; members.add(uid) } }
  Object.keys(feedDocs).forEach(uid => { if (uid === myUid) return; const d = feedDocs[uid]; if (d && d.on && Array.isArray(d.ev)) d.ev.forEach((e: Any) => add(uid, e)) })
  if (role !== "teacher" && (C.feedEnabled() || C.isSolo())) C.myEvents().forEach((e: Any) => add("me", e))
  const nm = members.size
  return { ...base, hours: Math.round(mins / 6) / 10, members: nm, goal: Math.max(20, Math.ceil(Math.max(1, nm) * 8 / 10) * 10) }
}
function durTxt(m: number) { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? " " + String(r).padStart(2, "0") : ""}` : `${r} min` }

// ---------------------------------------------------------------- Fil du club
export function AthleteFeed({ uid, ctx, onCompose, onToast }: { uid: string; ctx: UzuContext | null; onCompose: () => void; onToast: (m: string) => void }) {
  const [data, setData] = useState<{ core: Any; role: string; feedOk: boolean } | null>(null)
  const [error, setError] = useState("")
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState("")
  useEffect(() => {
    if (!ctx) return
    let live = true
    loadFeed(uid, ctx).then(r => { if (live) setData(r) }, e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [uid, ctx, tick])
  const act = async (kind: "check" | "validate", key: string) => {
    setBusy(key)
    const r = await feedReact(uid, ctx, kind, key)
    setBusy("")
    if (!r.ok) onToast(r.msg); else { if (kind === "validate") onToast("Validation ★★ envoyée"); setTick(t => t + 1) }
  }
  const share = async () => {
    setBusy("share")
    const r = await setFeedShare(uid, ctx, true)
    setBusy("")
    onToast(r.ok ? "Ton activité apparaît maintenant dans le fil" : r.msg); setTick(t => t + 1)
  }
  if (!data) return <><FeedHeading solo={false} />{error ? <div className="uzu-banner uzu-banner--error" role="alert">Lecture impossible : {error}</div> : <div className="uzu-banner" aria-busy="true">Chargement du fil…</div>}</>
  const C = data.core, st = C.__get("state"), solo = C.isSolo(), team = data.role === "teacher"
  const s = feedStatsFixed(C, data.role), items: Any[] = C.feedItems()
  const medal = ["🥇", "🥈", "🥉"]
  return <>
    <FeedHeading solo={solo} />
    {!solo && !team && !C.feedEnabled() && data.feedOk && <section className="panel uzu-panel">
      <Eyebrow>REJOINS LE FIL</Eyebrow><h2 className="uzu-h2">Partage ton activité avec le club</h2>
      <p className="uzu-text">Le fil montre à ton club tes séances (durée, tenue, système travaillé), tes étapes franchies, tes podiums et tes grades validés. Jamais tes soumissions subies, ton état physique ni tes notes.</p>
      <button className="button button--dark" disabled={busy === "share"} onClick={share}><Share2 size={15} />Partager mon activité dans le fil</button>
    </section>}
    <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col"><Eyebrow>{solo ? "TON MOIS SUR LE TATAMI" : "DÉFI COLLECTIF DU MOIS"}</Eyebrow>
        <div className="uzu-big"><strong>{String(s.hours).replace(".", ",")} h</strong><span>{solo ? "de tapis ce mois-ci" : `sur ${s.goal} h · objectif du club`}</span></div>
        {!solo && <div className="progress-track"><i style={{ width: `${Math.min(100, s.hours / s.goal * 100)}%` }} /></div>}
        <p className="uzu-text uzu-small">{solo ? "Heures réelles de tes séances saisies ce mois-ci." : s.members ? `${s.members} membre${s.members > 1 ? "s" : ""} actif${s.members > 1 ? "s" : ""} ce mois. Objectif : 8 h par membre actif.` : "Aucune séance partagée ce mois-ci pour l'instant."}</p>
      </section>
      {!solo && <section className="panel uzu-panel-col"><Eyebrow>PODIUM DE LA SEMAINE · ASSIDUITÉ</Eyebrow>
        {s.pod.length ? <ul className="uzu-top">{s.pod.map((p: Any, i: number) => <li key={p.uid}><span className="uzu-pod"><em>{medal[i]}</em><BeltMark rank={p.belt.rank} stripes={p.belt.stripes} size={28} />{p.uid === "me" ? `${st.name || "Toi"} (toi)` : p.name}</span><b>{p.n} séance{p.n > 1 ? "s" : ""} · {durTxt(p.m)}</b></li>)}</ul>
          : <p className="uzu-text">Personne n'a encore saisi de séance cette semaine. Ouvre le bal !</p>}
      </section>}
    </div>
    {!solo && !data.feedOk ? <div className="uzu-banner uzu-banner--error">Le fil n'est pas encore activé sur le serveur du club.</div>
      : items.length === 0 ? <section className="panel uzu-panel uzu-grid-gap"><p className="uzu-text">Le tatami est calme pour l'instant. Enregistre ta séance pour lancer la dynamique du groupe !</p><button className="button button--dark" onClick={onCompose}><Plus size={15} />Saisir ma séance</button></section>
      : <ul className="uzu-feed uzu-grid-gap">{items.map((it: Any) => {
        const e = it.e, key = it.uid + "|" + e.id, n = C.checkCount(key), on = !!st.fx.checks[key], tx = evText(C, it)
        const vk = it.uid + "|" + e.tech, done = !!st.fx.vals[vk]
        return <li key={key} className={`panel uzu-fcard ${it.mine ? "mine" : ""}`}>
          <div className="uzu-fc-head"><BeltMark rank={it.belt.rank} stripes={it.belt.stripes} size={30} /><b>{it.name}{it.mine && <span className="uzu-muted"> (toi)</span>}</b><span className="uzu-muted uzu-small">{C.feedWhen(e.d)}</span></div>
          <p className="uzu-fc-body"><strong>{tx.big}</strong>{tx.rest ? <> · {tx.rest}</> : null}{tx.badge && <span className="uzu-pill">{tx.badge}</span>}</p>
          {!solo && <div className="uzu-fc-foot">
            {e.t === "r" && (it.mine ? <span className="uzu-muted uzu-small">En attente d'un coéquipier qui a tourné avec toi</span>
              : done ? <span className="uzu-pill done"><Check size={12} /> Validé par toi</span>
              : !team && <button className="button button--outline uzu-small-btn" disabled={busy === vk} onClick={() => act("validate", vk)}>J'ai tourné avec {String(it.name).split(" ")[0]}, je valide ★★</button>)}
            {it.mine ? <span className="uzu-check" aria-label={`${n} encouragement${n > 1 ? "s" : ""}`}>👊 {n}</span>
              : <button type="button" className={`uzu-check ${on ? "on" : ""}`} aria-pressed={on} disabled={busy === key} onClick={() => act("check", key)}>Check 👊 {n || ""}</button>}
          </div>}
        </li>
      })}</ul>}
    {items.length > 0 && <p className="uzu-text uzu-small uzu-muted uzu-grid-gap">Activité des 30 derniers jours. Le fil n'affiche jamais les soumissions subies, l'état physique ni les notes privées.</p>}
  </>
}
function FeedHeading({ solo }: { solo: boolean }) {
  return <div className="page-heading"><div><Eyebrow>TATAMI</Eyebrow><h1>{solo ? "Ton fil" : "Le fil du club"}<span className="heading-period">.</span></h1>
    <p>{solo ? "En carnet solo, ton fil montre ton activité. Rejoins un club pour retrouver tes coéquipiers." : "Les séances, les étapes et les grades de ton club, en direct."}</p></div></div>
}

// ---------------------------------------------------------------- Mon profil
export function AthleteProfile({ session, ctx, onToast }: { session: Session; ctx: UzuContext | null; onToast: (m: string) => void }) {
  const uid = session.user.id
  const [d, setD] = useState<{ core: Any; role: string } | null>(null)
  const [tick, setTick] = useState(0)
  const [name, setName] = useState("")
  const [age, setAge] = useState("")
  const [sex, setSex] = useState("")
  const [parental, setParental] = useState(false)
  const [busy, setBusy] = useState("")
  const [pw, setPw] = useState({ o: "", n: "", n2: "" })
  const [pwMsg, setPwMsg] = useState("")
  useEffect(() => {
    if (!ctx) return
    let live = true
    loadCore(uid, ctx).then(r => {
      if (!live) return
      const st = r.core.__get("state")
      setD({ core: r.core, role: r.role }); setName(st.name || String(session.user.user_metadata?.name || "")); setAge(st.demo?.age || ""); setSex(st.demo?.sex || ""); setParental(!!st.consent?.parental)
    }, () => {})
    return () => { live = false }
  }, [uid, ctx, tick]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return <><ProfileHeading /><div className="uzu-banner" aria-busy="true">Chargement du profil…</div></>
  const C = d.core, st = C.__get("state"), t = d.role === "teacher", solo = C.isSolo()
  const n = C.allSessions().filter((x: Any) => !x.sample).length
  const pending = !t && !solo && C.isPending(st.request, C.__get("myGrade"))
  const initials = (name || "U").trim().split(/\s+/).map((x: string) => x[0]).slice(0, 2).join("").toUpperCase()

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy("info")
    const r = await saveProfileInfo(uid, ctx, { name, age, sex, parental })
    setBusy(""); onToast(r.ok ? (r.synced ? "Informations enregistrées" : "Informations gardées sur ce téléphone : envoi au retour du réseau") : r.msg)
    if (r.ok) setTick(x => x + 1)
  }
  const toggleFeed = async () => {
    const on = !C.feedEnabled(); setBusy("feed")
    const r = await setFeedShare(uid, ctx, on)
    setBusy(""); onToast(r.ok ? (on ? "Ton activité apparaît maintenant dans le fil" : "Tu n'apparais plus dans le fil Tatami") : r.msg)
    if (r.ok) setTick(x => x + 1)
  }
  const submitPw = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pw.o) { setPwMsg("Indique ton mot de passe actuel."); return }
    if (pw.n.length < 8) { setPwMsg("Nouveau mot de passe : 8 caractères minimum."); return }
    if (pw.n !== pw.n2) { setPwMsg("Les deux nouveaux mots de passe ne sont pas identiques."); return }
    if (pw.n === pw.o) { setPwMsg("Choisis un mot de passe différent de l'actuel."); return }
    setBusy("pw"); const m = await changePassword(pw.o, pw.n); setBusy("")
    setPwMsg(m); if (m === "Mot de passe modifié.") setPw({ o: "", n: "", n2: "" })
  }
  const logout = async () => { setBusy("out"); try { await uzu().auth.signOut() } catch { /* session locale effacée quand même */ } }

  return <>
    <ProfileHeading />
    <section className="panel uzu-profile-head">
      <span className="avatar avatar--large avatar--light" aria-hidden="true">{initials}</span>
      <div><h2 className="uzu-h2">{name || (t ? "Professeur" : "Ton nom")}</h2>
        <p className="uzu-text uzu-small"><BeltMark rank={st.belt.rank} stripes={st.belt.stripes} size={34} /> {C.beltLabel(st.belt)} · {t ? "Équipe pédagogique" : solo ? "Pratiquant solo" : "Élève du club"} · {n} séance{n > 1 ? "s" : ""}{t ? " perso" : ""}{pending ? " · grade en attente de validation" : ""}</p>
        <p className="uzu-text uzu-small uzu-muted">{ctx?.club?.name ? `Académie : ${ctx.club.name}` : "Aucune académie"} · {session.user.email}</p></div>
    </section>

    <div className="content-grid uzu-grid-gap">
      <form className="panel uzu-fs" onSubmit={saveInfo}>
        <h2 className="uzu-h3">Mes informations</h2>
        <label className="uzu-field"><span className="uzu-label">Nom et prénom</span><input className="uzu-input" value={name} maxLength={40} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        {!t && <div className="uzu-row2">
          <label className="uzu-field"><span className="uzu-label">Âge (tranche)</span><select className="uzu-input" value={age} onChange={e => setAge(e.target.value)}><option value="">Non précisé</option>{C.AGES.map((a: Any) => <option key={a.k} value={a.k}>{a.n}</option>)}</select></label>
          <label className="uzu-field"><span className="uzu-label">Sexe</span><select className="uzu-input" value={sex} onChange={e => setSex(e.target.value)}><option value="">Non précisé</option>{Object.keys(C.SEXES).map(k => <option key={k} value={k}>{C.SEXES[k]}</option>)}</select></label>
        </div>}
        {!t && age === "lt16" && <label className="uzu-check-row"><input type="checkbox" checked={parental} onChange={e => setParental(e.target.checked)} /> <span>Mon représentant légal a donné son accord.</span></label>}
        <p className="uzu-hint">{t ? "Ton nom s'affiche dans l'espace Club. Ton entraînement perso reste visible par toi seul." : solo ? "Ton carnet reste privé. Âge et sexe ne serviront aux statistiques anonymes d'un club que si tu en rejoins un." : "Ton nom est visible par ton prof (et dans le fil si tu l'actives). Âge et sexe servent uniquement aux statistiques anonymes de ton club."}</p>
        <button className="button button--dark" type="submit" disabled={busy === "info"}><Check size={15} />Enregistrer</button>
      </form>

      <div className="uzu-stack">
        <section className="panel uzu-panel-col"><h2 className="uzu-h3"><Users size={16} /> Mon club</h2>
          {t ? <><p className="uzu-text">Académie : <b>{ctx?.club?.name || "ton académie"}</b></p>{ctx?.club?.invite_code && <p className="uzu-text">Code d'invitation élèves : <span className="uzu-code">{ctx.club.invite_code}</span></p>}<p className="uzu-text uzu-small uzu-muted">Le nom et le code se modifient dans l'espace Club, rubrique Mon académie.</p></>
            : solo ? <JoinClub hasName={!!name.trim()} onToast={onToast} />
            : <><p className="uzu-text">Club actuel : <b>{ctx?.club?.name || "ton club"}</b></p><p className="uzu-text uzu-small uzu-muted">Ton rattachement au club est géré par ton prof.</p></>}
        </section>
        {!t && !solo && <section className="panel uzu-panel-col"><h2 className="uzu-h3">Fil du club</h2>
          <div className="settings-row uzu-setting"><div><strong>Partager mon activité</strong><small>{C.feedEnabled() ? "Activé : les membres du club voient tes séances, ta ceinture et tes compétitions. Ton état physique et tes notes restent privés." : "Désactivé : tu n'apparais pas dans le fil. Ton prof voit toujours ta progression."}</small></div>
            <button className={`toggle ${C.feedEnabled() ? "is-on" : ""}`} role="switch" aria-checked={C.feedEnabled()} aria-label="Partager mon activité dans le fil" disabled={busy === "feed"} onClick={toggleFeed}><i /></button></div>
        </section>}
      </div>
    </div>

    <div className="content-grid uzu-grid-gap">
      <form className="panel uzu-fs" onSubmit={submitPw}>
        <h2 className="uzu-h3"><KeyRound size={16} /> Mot de passe</h2>
        <label className="uzu-field"><span className="uzu-label">Mot de passe actuel</span><input className="uzu-input" type="password" autoComplete="current-password" value={pw.o} onChange={e => setPw({ ...pw, o: e.target.value })} /></label>
        <div className="uzu-row2">
          <label className="uzu-field"><span className="uzu-label">Nouveau mot de passe</span><input className="uzu-input" type="password" autoComplete="new-password" value={pw.n} onChange={e => setPw({ ...pw, n: e.target.value })} /></label>
          <label className="uzu-field"><span className="uzu-label">Confirmation</span><input className="uzu-input" type="password" autoComplete="new-password" value={pw.n2} onChange={e => setPw({ ...pw, n2: e.target.value })} /></label>
        </div>
        {pwMsg && <p className={`uzu-note ${pwMsg === "Mot de passe modifié." ? "ok" : "wait"}`} role="status">{pwMsg}</p>}
        <button className="button button--outline" type="submit" disabled={busy === "pw"}>Changer mon mot de passe</button>
      </form>
      <section className="panel uzu-panel-col"><h2 className="uzu-h3"><ShieldCheck size={16} /> Compte et confidentialité</h2>
        <p className="uzu-text uzu-small">Connecté avec {session.user.email}. Ton état physique et tes notes privées ne sont jamais visibles par ton prof ni par le club.</p>
        <details className="uzu-legal"><summary>Mentions légales et confidentialité</summary><Legal clubName={ctx?.club?.name || ""} /></details>
        <button className="button button--dark" onClick={logout} disabled={busy === "out"}><LogOut size={15} />Se déconnecter</button>
      </section>
    </div>
    <DeleteAll uid={uid} ctx={ctx} onToast={onToast} onDone={() => setTick(x => x + 1)} />
  </>
}
function ProfileHeading() {
  return <div className="page-heading"><div><Eyebrow>TON ESPACE PERSONNEL</Eyebrow><h1>Mon profil<span className="heading-period">.</span></h1><p>Tes informations, ton club et ta confidentialité.</p></div></div>
}

// ---------------------------------------------------------------- Carnet solo : rejoindre ou créer un club
function JoinClub({ hasName, onToast }: { hasName: boolean; onToast: (m: string) => void }) {
  const [code, setCode] = useState("")
  const [share, setShare] = useState(false)
  const [err, setErr] = useState("")
  const [busy, setBusy] = useState("")
  const [cName, setCName] = useState("")
  const [cCode, setCCode] = useState("")
  const [cErr, setCErr] = useState("")
  const join = async () => {
    setErr("")
    const c = code.trim().toUpperCase()
    if (!c) { setErr("Indique le code invitation de ton club."); return }
    if (!hasName) { setErr("Enregistre d'abord ton prénom dans ton profil, juste à côté."); return }
    if (!share) { setErr("Coche l'accord de partage avec les profs du club."); return }
    setBusy("join"); const r = await joinClubByCode(c)
    if (!r.ok) { setBusy(""); setErr(r.msg); return }
    onToast("Connexion au club…"); window.location.reload()
  }
  const create = async () => {
    setCErr("")
    const nm = cName.trim().replace(/\s+/g, " "), cd = cCode.trim().replace(/\s+/g, "").toUpperCase()
    if (nm.length < 2) { setCErr("Indique le nom du club."); return }
    if (!/^[A-Z0-9-]{6,20}$/.test(cd)) { setCErr("Code invitation : 6 à 20 lettres, chiffres ou tirets (ex. : TEAM2026)."); return }
    setBusy("create"); const r = await createClubFromSolo(nm, cd)
    if (!r.ok) { setBusy(""); setCErr(r.msg); return }
    onToast(`Ton club est prêt. Code invitation : ${r.code}`); window.setTimeout(() => window.location.reload(), 1200)
  }
  return <>
    <p className="uzu-text">Ton carnet n'est relié à aucun club : personne d'autre que toi n'y a accès.</p>
    <span className="uzu-sublabel">Rejoindre un club avec un code d'invitation</span>
    <input className="uzu-input" aria-label="Code invitation club" autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Demande-le à ton prof sur le tatami" value={code} onChange={e => setCode(e.target.value)} />
    <label className="uzu-check-row"><input type="checkbox" checked={share} onChange={e => setShare(e.target.checked)} /><span>J'accepte que mes séances, compétitions, ceinture, techniques, tranche d'âge et sexe soient visibles par les profs de ce club. Mon état physique et mes notes restent visibles par moi seul.</span></label>
    {err && <p className="uzu-note wait" role="alert">{err}</p>}
    <button className="button button--dark uzu-small-btn" disabled={busy === "join"} onClick={join}><Plus size={14} />{busy === "join" ? "Connexion au club…" : "Rejoindre le club avec mon historique"}</button>
    <details className="uzu-legal"><summary>Tu es prof ? Crée ton club</summary>
      <div className="uzu-panel-col">
        <label className="uzu-label" htmlFor="jc-name">Nom du club</label><input id="jc-name" className="uzu-input" maxLength={60} value={cName} onChange={e => setCName(e.target.value)} />
        <label className="uzu-label" htmlFor="jc-code">Code invitation pour tes élèves</label><input id="jc-code" className="uzu-input" maxLength={20} autoComplete="off" autoCapitalize="characters" spellCheck={false} placeholder="Ex. : TEAM2026" value={cCode} onChange={e => setCCode(e.target.value)} />
        <p className="uzu-text uzu-small uzu-muted">Ton compte devient responsable de ce club : tu accèdes à l'espace Club. Ton entraînement perso reste visible par toi seul.</p>
        {cErr && <p className="uzu-note wait" role="alert">{cErr}</p>}
        <button className="button button--outline uzu-small-btn" disabled={busy === "create"} onClick={create}>{busy === "create" ? "Création du club…" : "Créer mon club"}</button>
      </div></details>
  </>
}

// ---------------------------------------------------------------- Suppression de toutes les données d'entraînement
function DeleteAll({ uid, ctx, onToast, onDone }: { uid: string; ctx: UzuContext | null; onToast: (m: string) => void; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  return <section className="panel uzu-panel-col uzu-grid-gap">
    <h2 className="uzu-h3"><Trash2 size={16} /> Supprimer toutes mes données</h2>
    {step === 0 ? <button className="button button--outline uzu-small-btn uzu-danger" onClick={() => setStep(1)}>Supprimer toutes mes données</button> : <>
      <p className="uzu-text">{deleteAllText(ctx)}</p>
      <p className="uzu-text">Ton compte reste ouvert et tu restes connecté : ce n'est ni une déconnexion ni une fermeture de compte.</p>
      <p className="uzu-text"><b>Cette action est irréversible.</b></p>
      <div className="uzu-actions uzu-actions--start">
        <button className="button button--dark uzu-small-btn uzu-danger-solid" disabled={busy} onClick={async () => { setBusy(true); const r = await deleteAllData(uid, ctx); setBusy(false); onToast(r.ok ? (ctx?.role === "coach" ? "Ton entraînement perso a été effacé" : "Toutes tes données ont été supprimées") : r.msg); if (r.ok) { setStep(0); onDone() } }}>Oui, tout supprimer définitivement</button>
        <button className="button button--outline uzu-small-btn" onClick={() => setStep(0)}>Annuler</button></div></>}
  </section>
}

function Legal({ clubName }: { clubName: string }) {
  return <div className="uzu-text uzu-small">
    <p><b>Conformément au RGPD, UZU collecte vos données d'entraînement pour votre suivi pédagogique. Vos données de santé (état physique, fatigue) restent strictement privées et invisibles par les professeurs.</b></p>
    <ul>
      <li><b>Responsable du traitement</b> : {clubName || "le club"}. UZU — The mat doesn't lie.</li>
      <li><b>Données collectées</b> : prénom, e-mail de connexion, séances de JJB et de préparation physique (dont soumissions, passages de garde et renversements placés ou subis, intensité ressentie, exercices), présences, compétitions, ceinture et barrettes, niveau de confort sur les techniques.</li>
      <li><b>Données de santé</b> : état physique et notes privées, enregistrés dans un espace que seul l'élève peut lire.</li>
      <li><b>Finalité</b> : suivi pédagogique et organisation des cours du club. Aucune revente, aucune publicité.</li>
      <li><b>Base légale</b> : ton consentement, donné à la première ouverture et retirable à tout moment.</li>
      <li><b>Destinataires</b> : toi et les professeurs du club (sans les données de santé). Si tu rejoins le fil Tatami, les membres du club voient tes séances (durée, tenue, système), tes étapes, tes podiums et tes grades, jamais tes soumissions, ton état physique ni tes notes.</li>
      <li><b>Carnet solo</b> : ton compte n'est rattaché à aucun club ; aucun prof n'y a accès.</li>
      <li><b>Âge et sexe</b> : facultatifs, utilisés uniquement dans les statistiques anonymes du club (bilan d'activité).</li>
      <li><b>Conservation</b> : tant que ton compte existe. Tu peux tout supprimer depuis ton profil, en bas de page.</li>
      <li><b>Tes droits</b> : accès, rectification, effacement, opposition. Contact : depuis ton club, ou en écrivant à l'éditeur de l'application. Tu peux aussi saisir la CNIL (cnil.fr).</li>
      <li><b>Hébergement</b> : Vercel (page de l'application) et Supabase (données, hébergées dans l'Union européenne).</li>
      <li><b>Mineurs</b> : en dessous de 16 ans, l'accord du représentant légal est requis.</li>
    </ul>
    <p className="uzu-muted">Mentions légales. Éditeur : UZU — The mat doesn't lie. Directeur de la publication : l'éditeur de l'application.</p>
  </div>
}
