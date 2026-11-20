"use client"
// « Où rouler ? » étape 2 — volet Partenaires : profil de roulage, disponibilités, recherche, blocage, signalement.
// Invisible par défaut ; l'écran n'affiche que ce que le serveur renvoie (aucun identifiant de compte).
import { useEffect, useState } from "react"
import { ArrowLeft, CalendarDays, EyeOff, Flag, MapPin, Plus, Settings2, ShieldCheck, UserX } from "lucide-react"
import { CommunePicker, Tick } from "@/components/uzu/directory"
import { DISC_LBL, lastCommune, rememberCommune, type Commune, type DirDisc } from "@/lib/uzu/directory"
import {
  BELTS, BELT_LBL, INT_LBL, PART_LBL, PLACE_LBL, REASONS, VIS_LBL, addDays, daysLine, fmtDay, fmtRange, roulerActivate, roulerBlock, roulerDeleteProfile,
  roulerEndAvailability, roulerMe, roulerMyBlocks, roulerReport, roulerSaveAvailability, roulerSaveProfile, roulerSearch, roulerSetVisibility, roulerUnblock, today,
  type Belt, type BlockedPartner, type Intensity, type MyAvailability, type Part, type Partner, type PartnerSearch, type Place, type RoulerMe, type Visibility,
} from "@/lib/uzu/rouler"

const DAYS7 = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const toggle = <T,>(list: T[], v: T) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]
const communeOf = (insee: string | null | undefined, label: string | null | undefined): Commune | null => {
  if (!insee) return null
  const m = /^(.*) \(([^)]+)\)$/.exec(label || "")
  return { insee, nom: m ? m[1] : (label || insee), departement: m ? m[2] : "", code_postal: "" }
}

function Heading({ sub }: { sub?: string }) {
  return <div className="page-heading"><div><div className="eyebrow">TATAMI · PARTENAIRES</div><h1>Partenaires<span className="heading-period">.</span></h1><p>{sub || "Trouve un partenaire de roulage, chez toi ou en déplacement."}</p></div></div>
}
function Back({ onClick, children = "Retour" }: { onClick: () => void; children?: React.ReactNode }) {
  return <button type="button" className="button button--outline uzu-small-btn uzu-lib-back" onClick={onClick}><ArrowLeft size={15} aria-hidden="true" />{children}</button>
}
function Chips<T extends string>({ label, all, value, onChange, lbl, multi = true }: { label: string; all: T[]; value: T[]; onChange: (v: T[]) => void; lbl: (v: T) => string; multi?: boolean }) {
  return <div className="uzu-field"><span className="uzu-label">{label}</span><div className="uzu-chips uzu-chips--small" role="group" aria-label={label}>
    {all.map(k => <button key={k} type="button" className={value.includes(k) ? "on" : ""} aria-pressed={value.includes(k)} onClick={() => onChange(multi ? toggle(value, k) : [k])}>{lbl(k)}</button>)}
  </div></div>
}

type Screen = { k: "home" } | { k: "activate" } | { k: "profile"; activation?: { adult: boolean; consent: boolean; safety: boolean } } | { k: "avail"; edit?: MyAvailability } | { k: "mine" } | { k: "partner"; p: Partner }

// ---------------------------------------------------------------- Volet Partenaires
export function PartnersPane({ tabs, onToast }: { tabs: React.ReactNode; onToast: (m: string) => void }) {
  const [me, setMe] = useState<RoulerMe | null>(null), [err, setErr] = useState(""), [screen, setScreen] = useState<Screen>({ k: "home" }), [tick, setTick] = useState(0)
  useEffect(() => { let live = true; roulerMe().then(r => { if (!live) return; if (r.ok) { setMe(r.data); setErr("") } else setErr(r.msg) }); return () => { live = false } }, [tick])
  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0) }
  const done = (m: RoulerMe | null, msg?: string) => { if (m) setMe(m); else setTick(t => t + 1); if (msg) onToast(msg); go({ k: "home" }) }
  const wrap = (body: React.ReactNode) => <><Heading />{tabs}{body}</>
  if (err) return wrap(<div className="uzu-banner uzu-banner--error" role="alert">{err}</div>)
  if (!me) return wrap(<div className="uzu-banner" aria-busy="true">Chargement…</div>)

  if (!me.profile) {
    if (screen.k === "activate") return wrap(<Activation me={me} onBack={() => go({ k: "home" })} onNext={a => go({ k: "profile", activation: a })} />)
    if (screen.k === "profile" && screen.activation) return wrap(<ProfileForm me={me} activation={screen.activation} onBack={() => go({ k: "activate" })} onSaved={m => done(m, "Profil de roulage activé. Tu restes invisible tant que tu ne changes pas « Qui peut me voir ? ».")} />)
    return wrap(<Intro me={me} onActivate={() => go({ k: "activate" })} />)
  }
  if (screen.k === "profile") return wrap(<ProfileForm me={me} onBack={() => go({ k: "home" })} onSaved={m => done(m, "Profil de roulage enregistré")} />)
  if (screen.k === "avail") return wrap(<AvailabilityForm me={me} edit={screen.edit} onBack={() => go({ k: me.availabilities.length ? "mine" : "home" })} onSaved={m => done(m, screen.edit ? "Disponibilité modifiée" : "Disponibilité publiée")} />)
  if (screen.k === "mine") return wrap(<MyAvailabilities me={me} onToast={onToast} onBack={() => go({ k: "home" })} onNew={() => go({ k: "avail" })} onEdit={a => go({ k: "avail", edit: a })}
    onChanged={m => setMe(m)} onDeleted={() => done(null, "Profil de roulage supprimé")} onProfile={() => go({ k: "profile" })} />)
  if (screen.k === "partner") return wrap(<PartnerSheet p={screen.p} onBack={() => go({ k: "home" })} onToast={onToast} />)
  return wrap(<Search me={me} onOpen={p => go({ k: "partner", p })} onAvail={() => go({ k: me.availabilities.length ? "mine" : "avail" })} onProfile={() => go({ k: "profile" })}
    onVisible={async v => { const r = await roulerSetVisibility(v); if (r.ok) { setMe(r.data); onToast(`Visibilité : ${VIS_LBL[v]}`) } else onToast(r.msg) }} />)
}

// ---------------------------------------------------------------- Présentation (avant activation)
function Intro({ me, onActivate }: { me: RoulerMe; onActivate: () => void }) {
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Partenaires de roulage">
    <h2 className="uzu-h2"><EyeOff size={18} aria-hidden="true" /> Tu es invisible</h2>
    <p className="uzu-text">Personne ne te voit tant que tu n&apos;as pas activé ton profil de roulage et déclaré une disponibilité. Tu peux tout arrêter à tout moment.</p>
    <div className="uzu-rl-box"><b>Ce que les autres verront</b>
      <p className="uzu-text uzu-small">Ton prénom et l&apos;initiale de ton nom, tes disciplines, tes créneaux, une distance approximative (« moins de 10 km »). Ta ceinture, ton club et tes années de pratique seulement si tu le choisis.</p></div>
    <div className="uzu-rl-box uzu-rl-box--never"><b>Ce qu&apos;ils ne verront jamais</b>
      <p className="uzu-text uzu-small">Ton adresse, ta position, ton courriel, ton téléphone, tes séances, tes notes ou tes données de santé.</p></div>
    {me.minor ? <div className="uzu-banner" role="status">Les partenaires de roulage sont réservés aux pratiquants majeurs. Tu fais partie d&apos;un groupe de mineurs dans ton club : cette fonction n&apos;est pas disponible pour toi.</div>
      : <><button type="button" className="button button--dark" onClick={onActivate}>Activer mon profil de roulage</button>
        <p className="uzu-text uzu-small uzu-muted">Réservé aux pratiquants majeurs.</p></>}
  </section>
}

function Activation({ me, onBack, onNext }: { me: RoulerMe; onBack: () => void; onNext: (a: { adult: boolean; consent: boolean; safety: boolean }) => void }) {
  const [a, setA] = useState({ adult: false, consent: false, safety: false }), [err, setErr] = useState("")
  const next = () => {
    if (!a.adult) return setErr("Réservé aux pratiquants majeurs : coche « J'ai 18 ans ou plus ».")
    if (!a.consent) return setErr("Ton accord sur ce qui est montré est nécessaire.")
    if (!a.safety) return setErr("Lis et coche les conseils de sécurité.")
    onNext(a)
  }
  void me
  return <><Back onClick={onBack} />
    <form noValidate className="panel uzu-panel-col uzu-grid-gap" aria-label="Activation du profil de roulage" onSubmit={e => { e.preventDefault(); next() }}>
      <div className="eyebrow">PARTENAIRES · ACTIVATION</div><h2 className="uzu-h2">Avant de commencer</h2>
      <Tick on={a.adult} onClick={() => setA({ ...a, adult: !a.adult })}>J&apos;ai 18 ans ou plus.</Tick>
      <Tick on={a.consent} onClick={() => setA({ ...a, consent: !a.consent })}>J&apos;accepte que les informations que je choisis soient montrées aux pratiquants UZU selon la visibilité que je règle.</Tick>
      <Tick on={a.safety} onClick={() => setA({ ...a, safety: !a.safety })}>J&apos;ai lu les conseils de sécurité : rouler dans un club ou un open mat, prévenir un proche, signaler tout comportement inapproprié.</Tick>
      <p className="uzu-text uzu-small uzu-muted">Si tu fais partie d&apos;un groupe de mineurs dans ton club, l&apos;activation est refusée.</p>
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <button type="submit" className="button button--dark">Continuer</button>
      <p className="uzu-text uzu-small uzu-muted">La date de ta déclaration est conservée. Tu peux supprimer ton profil de roulage à tout moment.</p>
    </form></>
}

// ---------------------------------------------------------------- Mon profil de roulage
function ProfileForm({ me, activation, onBack, onSaved }: { me: RoulerMe; activation?: { adult: boolean; consent: boolean; safety: boolean }; onBack: () => void; onSaved: (m: RoulerMe) => void }) {
  const p = me.profile
  const [home, setHome] = useState<Commune | null>(() => p ? communeOf(p.home_insee, p.home_commune) : lastCommune())
  const [disc, setDisc] = useState<DirDisc[]>(p?.disciplines || ["jjb_gi"]), [ints, setInts] = useState<Intensity[]>(p?.intensities || ["technique", "modere"])
  const [showBelt, setShowBelt] = useState(!!p?.show_belt), [club, setClub] = useState<string | null>(p?.show_club_id || null)
  const [years, setYears] = useState(p?.years != null ? String(p.years) : ""), [showYears, setShowYears] = useState(p?.years != null)
  const [vis, setVis] = useState<Visibility>(p?.visibility || "hidden"), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const save = async () => {
    setErr("")
    if (!home) return setErr("Choisis ta ville habituelle")
    if (!disc.length) return setErr("Choisis au moins une discipline")
    if (!ints.length) return setErr("Choisis au moins un type de roulage")
    const y = showYears ? Number(years) : null
    if (showYears && (!/^\d{1,2}$/.test(years.trim()) || (y as number) > 60)) return setErr("Années de pratique : un nombre entre 0 et 60")
    const body = { home_insee: home.insee, disciplines: disc, intensities: ints, show_belt: showBelt, show_club_id: club, years: y, visibility: vis, ...(activation || {}) }
    setBusy(true); const r = activation ? await roulerActivate(body) : await roulerSaveProfile(body); setBusy(false)
    if (!r.ok) return setErr(r.msg)
    onSaved(r.data)
  }
  const clubName = me.clubs.find(c => c.id === club)?.name
  const preview = [showBelt && me.belt ? `Ceinture ${BELT_LBL[me.belt].toLowerCase()}` : "", disc.map(d => DISC_LBL[d]).join(", ")].filter(Boolean).join(" · ")
  return <><Back onClick={onBack} />
    <form noValidate className="panel uzu-panel-col uzu-grid-gap" aria-label="Mon profil de roulage" onSubmit={e => { e.preventDefault(); save() }}>
      <div className="eyebrow">PARTENAIRES · MON PROFIL</div><h2 className="uzu-h2">Mon profil de roulage</h2>
      <CommunePicker id="rl-home" label="Ma ville habituelle" value={home} onPick={c => { setHome(c); rememberCommune(c); setErr("") }} />
      <p className="uzu-text uzu-small uzu-muted">Jamais montrée : les autres ne voient qu&apos;une distance approximative.</p>
      <Chips label="Disciplines" all={Object.keys(DISC_LBL) as DirDisc[]} value={disc} onChange={setDisc} lbl={d => DISC_LBL[d]} />
      <Chips label="Roulages acceptés" all={Object.keys(INT_LBL) as Intensity[]} value={ints} onChange={setInts} lbl={i => INT_LBL[i]} />
      <div className="uzu-field"><span className="uzu-label">Je montre aussi (rien par défaut)</span>
        <Tick on={showBelt} onClick={() => setShowBelt(!showBelt)}>Ma ceinture{me.belt ? ` (${BELT_LBL[me.belt].toLowerCase()})` : " (aucune ceinture enregistrée)"}</Tick>
        {me.clubs.length > 0 && <Tick on={!!club} onClick={() => setClub(club ? null : me.clubs[0].id)}>Mon club{club && clubName ? ` (${clubName})` : ""}</Tick>}
        {club && me.clubs.length > 1 && <select className="uzu-input" aria-label="Club affiché" value={club} onChange={e => setClub(e.target.value)}>{me.clubs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        <Tick on={showYears} onClick={() => setShowYears(!showYears)}>Mes années de pratique</Tick>
        {showYears && <input className="uzu-input uzu-rl-years" inputMode="numeric" aria-label="Années de pratique" maxLength={2} value={years} onChange={e => setYears(e.target.value.replace(/\D/g, ""))} placeholder="Ex. 5" />}
      </div>
      <Chips label="Qui peut me voir ?" all={["hidden", "clubs", "uzu"] as Visibility[]} value={[vis]} onChange={v => setVis(v[0])} lbl={v => VIS_LBL[v]} multi={false} />
      <p className="uzu-text uzu-small uzu-muted">{vis === "hidden" ? "Personne ne te voit, et tu ne vois personne." : vis === "clubs" ? "Visible des pratiquants de tes clubs ayant choisi d'être visibles." : "Visible des pratiquants de tes clubs, et des pratiquants UZU qui ont aussi choisi « Tout UZU »."} Pour voir les autres, tu dois être visible au même niveau.</p>
      <div className="uzu-rl-preview" aria-label="Aperçu de ta carte"><span className="uzu-label">Aperçu de ta carte</span>
        <b>{me.name}</b><span className="uzu-dir-meta">{preview}</span>
        {(clubName || showYears) && <span className="uzu-dir-meta">{[clubName, showYears && years ? `${years} an${Number(years) > 1 ? "s" : ""} de pratique` : ""].filter(Boolean).join(" · ")}</span>}
        <span className="uzu-dir-meta">Distance, créneaux et lieu selon ta disponibilité</span></div>
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <button type="submit" className="button button--dark" disabled={busy}>{activation ? "Activer mon profil" : "Enregistrer"}</button>
    </form></>
}

// ---------------------------------------------------------------- Disponibilité
function AvailabilityForm({ me, edit, onBack, onSaved }: { me: RoulerMe; edit?: MyAvailability; onBack: () => void; onSaved: (m: RoulerMe) => void }) {
  const p = me.profile!, t0 = today()
  const [travel, setTravel] = useState(!!edit?.is_travel), [commune, setCommune] = useState<Commune | null>(edit?.is_travel ? communeOf(edit.insee, edit.commune) : null)
  const [from, setFrom] = useState(edit?.starts_on || t0), [to, setTo] = useState(edit?.ends_on || addDays(t0, 6))
  const [days, setDays] = useState<number[]>(edit?.days || [0, 1, 2, 3, 4, 5, 6]), [parts, setParts] = useState<Part[]>(edit?.parts || ["soir"])
  const [disc, setDisc] = useState<DirDisc[]>(edit?.disciplines || p.disciplines), [ints, setInts] = useState<Intensity[]>(edit?.intensities || p.intensities)
  const [places, setPlaces] = useState<Place[]>(edit?.places || ["club", "open_mat"]), [note, setNote] = useState(edit?.note || "")
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const maxTo = addDays(from, 13)
  const save = async () => {
    setErr("")
    if (travel && !commune) return setErr("Choisis la ville de ton déplacement")
    if (!from || !to) return setErr("Indique le début et la fin")
    if (from < t0) return setErr("La disponibilité ne peut pas commencer dans le passé")
    if (from > addDays(t0, 90)) return setErr("Début dans les 90 prochains jours au plus")
    if (to < from) return setErr("La fin doit suivre le début")
    if (to > maxTo) return setErr("14 jours au plus par disponibilité")
    if (!days.length) return setErr("Choisis au moins un jour")
    if (!parts.length) return setErr("Choisis au moins un moment")
    if (!disc.length) return setErr("Choisis au moins une discipline")
    if (!ints.length) return setErr("Choisis au moins un type de roulage")
    if (!places.length) return setErr("Choisis au moins un lieu")
    setBusy(true)
    const r = await roulerSaveAvailability({ id: edit?.id || null, is_travel: travel, insee: travel ? commune?.insee : p.home_insee, starts_on: from, ends_on: to, days, parts, disciplines: disc, intensities: ints, places, note: note.trim() })
    setBusy(false)
    if (!r.ok) return setErr(r.msg)
    onSaved(r.data)
  }
  return <><Back onClick={onBack} />
    <form noValidate className="panel uzu-panel-col uzu-grid-gap" aria-label="Je suis dispo" onSubmit={e => { e.preventDefault(); save() }}>
      <div className="eyebrow">PARTENAIRES · DISPONIBILITÉ</div><h2 className="uzu-h2">{edit ? "Modifier ma disponibilité" : "Je suis dispo"}</h2>
      <div className="uzu-chips uzu-chips--small" role="group" aria-label="Où ?">
        <button type="button" className={!travel ? "on" : ""} aria-pressed={!travel} onClick={() => setTravel(false)}>Dans ma ville{p.home_commune ? ` · ${p.home_commune}` : ""}</button>
        <button type="button" className={travel ? "on" : ""} aria-pressed={travel} onClick={() => setTravel(true)}>En déplacement</button>
      </div>
      {travel && <><CommunePicker id="rl-travel" label="Ville du déplacement" value={commune} onPick={c => { setCommune(c); setErr("") }} />
        <p className="uzu-text uzu-small uzu-muted">Ta ville habituelle ne change pas et n&apos;est pas montrée.</p></>}
      <div className="uzu-field"><span className="uzu-label">Quand ?</span>
        <div className="uzu-rl-dates">
          <label><span>Du</span><input type="date" className="uzu-input" value={from} min={t0} max={addDays(t0, 90)} onChange={e => { const v = e.target.value; setFrom(v); if (v && (to < v || to > addDays(v, 13))) setTo(addDays(v, Math.min(6, 13))) }} /></label>
          <label><span>Au</span><input type="date" className="uzu-input" value={to} min={from} max={maxTo} onChange={e => setTo(e.target.value)} /></label>
        </div>
        <p className="uzu-text uzu-small uzu-muted">14 jours au plus, début dans les 90 jours.{to ? ` Expire seule le ${fmtDay(to)} au soir.` : ""}</p></div>
      <div className="uzu-field"><span className="uzu-label">Jours et moments</span>
        <div className="uzu-chips uzu-chips--small" role="group" aria-label="Jours">{DAYS7.map((d, i) => <button key={d} type="button" className={days.includes(i) ? "on" : ""} aria-pressed={days.includes(i)} onClick={() => setDays(toggle(days, i))}>{d}</button>)}</div>
        <div className="uzu-chips uzu-chips--small" role="group" aria-label="Moments">{(Object.keys(PART_LBL) as Part[]).map(k => <button key={k} type="button" className={parts.includes(k) ? "on" : ""} aria-pressed={parts.includes(k)} onClick={() => setParts(toggle(parts, k))}>{PART_LBL[k]}</button>)}</div></div>
      <Chips label="Discipline" all={Object.keys(DISC_LBL) as DirDisc[]} value={disc} onChange={setDisc} lbl={d => DISC_LBL[d]} />
      <Chips label="Roulage" all={Object.keys(INT_LBL) as Intensity[]} value={ints} onChange={setInts} lbl={i => INT_LBL[i]} />
      <Chips label="Lieu souhaité" all={Object.keys(PLACE_LBL) as Place[]} value={places} onChange={setPlaces} lbl={x => PLACE_LBL[x]} />
      <label className="uzu-label" htmlFor="rl-note">Un mot ({140 - note.length} caractères restants)</label>
      <input id="rl-note" className="uzu-input" maxLength={140} value={note} placeholder="Ex. En vacances, dispo le soir, open mat bienvenu" onChange={e => setNote(e.target.value)} />
      <p className="uzu-text uzu-small uzu-muted">N&apos;indique ni téléphone, ni adresse, ni réseau social.</p>
      {p.visibility === "hidden" && <div className="uzu-banner" role="status">Tu es invisible : ta disponibilité ne sera montrée à personne tant que tu ne changes pas « Qui peut me voir ? » dans ton profil.</div>}
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <button type="submit" className="button button--dark" disabled={busy}>{edit ? "Enregistrer" : "Publier ma disponibilité"}</button>
    </form></>
}

// ---------------------------------------------------------------- Mes disponibilités, visibilité, suppression
function MyAvailabilities({ me, onToast, onBack, onNew, onEdit, onChanged, onDeleted, onProfile }: {
  me: RoulerMe; onToast: (m: string) => void; onBack: () => void; onNew: () => void; onEdit: (a: MyAvailability) => void; onChanged: (m: RoulerMe) => void; onDeleted: () => void; onProfile: () => void
}) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [blocks, setBlocks] = useState<BlockedPartner[] | null>(null), [tick, setTick] = useState(0)
  useEffect(() => { let live = true; roulerMyBlocks().then(r => { if (live) setBlocks(r.ok ? r.data : []) }); return () => { live = false } }, [tick])
  const list = me.availabilities, p = me.profile!
  const end = async (a: MyAvailability) => { const r = await roulerEndAvailability(a.id); if (r.ok) { onChanged(r.data); onToast("Disponibilité arrêtée") } else onToast(r.msg) }
  const invisible = async () => { const r = await roulerSetVisibility("hidden"); if (r.ok) { onChanged(r.data); onToast("Tu es invisible") } else onToast(r.msg) }
  const del = async () => { setBusy(true); const r = await roulerDeleteProfile(); setBusy(false); if (r.ok) onDeleted(); else onToast(r.msg) }
  return <><Back onClick={onBack}>Retour à la recherche</Back>
    <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Mes disponibilités">
      <div className="uzu-rl-head"><div><div className="eyebrow">PARTENAIRES · MES DISPONIBILITÉS</div><h2 className="uzu-h2">Mes disponibilités</h2>
        <p className="uzu-text uzu-small uzu-muted">{list.length} en cours sur 3 possibles</p></div>
        {list.length < 3 && <button type="button" className="button button--dark uzu-small-btn" onClick={onNew}><Plus size={15} aria-hidden="true" />Nouvelle</button>}</div>
      {!list.length ? <p className="uzu-text uzu-muted">Aucune disponibilité en cours.</p>
        : <ul className="uzu-dir-list">{list.map(a => <li key={a.id}><article className="uzu-dir-card uzu-dir-card--static" aria-label={`Disponibilité à ${a.commune || ""}`}>
          <span className="uzu-dir-card-top"><b>{a.commune}{a.is_travel ? " · déplacement" : ""}</b><span className={"uzu-dir-badge" + (a.state === "current" ? "" : " uzu-dir-badge--ref")}>{a.state === "current" ? "En cours" : "À venir"}</span></span>
          <span className="uzu-dir-meta">{fmtRange(a.starts_on, a.ends_on)} · {daysLine(a.days)} · {a.parts.map(x => PART_LBL[x].toLowerCase()).join(", ")} · {a.disciplines.map(d => DISC_LBL[d]).join(", ")}</span>
          {a.note && <span className="uzu-text uzu-small">« {a.note} »</span>}
          <span className="uzu-dir-meta">Expire automatiquement le {fmtDay(a.ends_on)} au soir</span>
          <span className="uzu-actions uzu-actions--start"><button type="button" className="button button--outline uzu-small-btn" onClick={() => onEdit(a)}>Modifier</button>
            <button type="button" className="button button--outline uzu-small-btn" onClick={() => end(a)}>Arrêter</button></span>
        </article></li>)}</ul>}
    </section>
    <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Ma visibilité">
      <h3 className="uzu-h3">Ma visibilité : {VIS_LBL[p.visibility]}</h3>
      <div className="uzu-actions uzu-actions--start">
        <button type="button" className="button button--outline uzu-small-btn" onClick={onProfile}><Settings2 size={15} aria-hidden="true" />Mon profil de roulage</button>
        {p.visibility !== "hidden" && <button type="button" className="button button--outline uzu-small-btn" onClick={invisible}><EyeOff size={15} aria-hidden="true" />Me rendre invisible</button>}
      </div>
    </section>
    {blocks && blocks.length > 0 && <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Personnes que tu ne vois plus">
      <h3 className="uzu-h3"><UserX size={16} aria-hidden="true" /> Personnes que tu ne vois plus</h3>
      <ul className="uzu-top">{blocks.map(b => <li key={b.key}><span>{b.name}</span>
        <button type="button" className="button button--outline uzu-small-btn" onClick={async () => { const r = await roulerUnblock(b.key); onToast(r.ok ? `${b.name} est de nouveau visible` : r.msg); if (r.ok) setTick(t => t + 1) }}>Annuler</button></li>)}</ul>
    </section>}
    <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Supprimer mon profil de roulage">
      {!confirm ? <button type="button" className="text-link uzu-dir-link uzu-rl-danger" onClick={() => setConfirm(true)}>Supprimer mon profil de roulage</button>
        : <><p className="uzu-text">Ton profil et toutes tes disponibilités seront effacés. Ton compte UZU, tes séances et ton club ne changent pas.</p>
          <div className="uzu-actions uzu-actions--start"><button type="button" className="button button--dark uzu-small-btn uzu-danger-solid" disabled={busy} onClick={del}>Oui, supprimer</button>
            <button type="button" className="button button--outline uzu-small-btn" onClick={() => setConfirm(false)}>Annuler</button></div></>}
    </section></>
}

// ---------------------------------------------------------------- Recherche
const NEED_MSG: Record<string, string> = {
  visible: "Tu es invisible. Pour voir les autres, choisis « Mes clubs » ou « Tout UZU » : tu ne vois que les personnes visibles au même niveau que toi.",
  paused: "Ton profil de roulage est en pause après des signalements. Le référent UZU va examiner la situation : en attendant, tu n'apparais pas et tu ne peux pas chercher.",
  adult: "Les partenaires de roulage sont réservés aux pratiquants majeurs.",
}
function Search({ me, onOpen, onAvail, onProfile, onVisible }: { me: RoulerMe; onOpen: (p: Partner) => void; onAvail: () => void; onProfile: () => void; onVisible: (v: Visibility) => void }) {
  const p = me.profile!
  const [commune, setCommune] = useState<Commune | null>(() => lastCommune() || communeOf(p.home_insee, p.home_commune))
  const [radius, setRadius] = useState(25), [from, setFrom] = useState(today()), [to, setTo] = useState(addDays(today(), 13))
  const [disc, setDisc] = useState<DirDisc | null>(null), [intensity, setIntensity] = useState<Intensity | null>(null)
  const [bmin, setBmin] = useState<Belt | "">(""), [bmax, setBmax] = useState<Belt | "">("")
  const [res, setRes] = useState<PartnerSearch | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const blocked = p.status === "paused" || p.visibility === "hidden"
  useEffect(() => {
    if (!commune || blocked) return
    let live = true; setBusy(true); setErr("")
    const t = window.setTimeout(() => roulerSearch({ insee: commune.insee, radius, from, to: to < from ? from : to, disc, intensity, beltMin: bmin || null, beltMax: bmax || null }).then(r => {
      if (!live) return; setBusy(false); if (r.ok) setRes(r.data); else { setRes(null); setErr(r.msg) }
    }), 250)
    return () => { live = false; window.clearTimeout(t) }
  }, [commune, radius, from, to, disc, intensity, bmin, bmax, blocked])
  const current = me.availabilities.find(a => a.state === "current")
  return <>
    <div className="uzu-actions uzu-actions--start uzu-rl-menu">
      <button type="button" className="button button--dark uzu-small-btn" onClick={onAvail}><CalendarDays size={15} aria-hidden="true" />{me.availabilities.length ? `Mes disponibilités (${me.availabilities.length})` : "Je suis dispo"}</button>
      <button type="button" className="button button--outline uzu-small-btn" onClick={onProfile}><Settings2 size={15} aria-hidden="true" />Mon profil</button>
    </div>
    {p.status === "paused" ? <div className="uzu-banner" role="status">{NEED_MSG.paused}</div>
      : p.visibility === "hidden" ? <section className="panel uzu-panel-col uzu-grid-gap"><p className="uzu-text">{NEED_MSG.visible}</p>
        <div className="uzu-actions uzu-actions--start"><button type="button" className="button button--outline uzu-small-btn" onClick={() => onVisible("clubs")}>Visible de mes clubs</button>
          <button type="button" className="button button--outline uzu-small-btn" onClick={() => onVisible("uzu")}>Visible de tout UZU</button></div></section>
      : <>
        <p className="uzu-text uzu-small uzu-muted" role="status">{current ? `Ta disponibilité à ${current.commune} est active jusqu'au ${fmtDay(current.ends_on)}.` : me.availabilities.length ? "Ta prochaine disponibilité n'a pas encore commencé." : "Tu cherches sans être montré : déclare une disponibilité pour que d'autres te trouvent."} Visibilité : {VIS_LBL[p.visibility]}.</p>
        <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Recherche de partenaires">
          <CommunePicker id="rl-search" value={commune} onPick={c => { setCommune(c); rememberCommune(c) }} />
          <div className="uzu-field"><span className="uzu-label">Rayon</span><div className="uzu-chips uzu-chips--small">{[10, 25, 50].map(r => <button key={r} type="button" className={radius === r ? "on" : ""} aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</button>)}</div></div>
          <div className="uzu-field"><span className="uzu-label">Période</span><div className="uzu-rl-dates">
            <label><span>Du</span><input type="date" className="uzu-input" value={from} min={today()} onChange={e => { const v = e.target.value || today(); setFrom(v); if (to < v) setTo(addDays(v, 13)) }} /></label>
            <label><span>Au</span><input type="date" className="uzu-input" value={to} min={from} max={addDays(today(), 104)} onChange={e => setTo(e.target.value || addDays(from, 13))} /></label></div></div>
          <div className="uzu-field"><span className="uzu-label">Discipline</span><div className="uzu-chips uzu-chips--small">
            <button type="button" className={!disc ? "on" : ""} aria-pressed={!disc} onClick={() => setDisc(null)}>Toutes</button>
            {(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={disc === k ? "on" : ""} aria-pressed={disc === k} onClick={() => setDisc(k)}>{DISC_LBL[k]}</button>)}</div></div>
          <div className="uzu-field"><span className="uzu-label">Roulage</span><div className="uzu-chips uzu-chips--small">
            <button type="button" className={!intensity ? "on" : ""} aria-pressed={!intensity} onClick={() => setIntensity(null)}>Tous</button>
            {(Object.keys(INT_LBL) as Intensity[]).map(k => <button key={k} type="button" className={intensity === k ? "on" : ""} aria-pressed={intensity === k} onClick={() => setIntensity(k)}>{INT_LBL[k]}</button>)}</div></div>
          <div className="uzu-field"><span className="uzu-label">Niveau (ceinture)</span><div className="uzu-rl-dates">
            <label><span>De</span><select className="uzu-input" aria-label="Ceinture minimale" value={bmin} onChange={e => setBmin(e.target.value as Belt | "")}><option value="">Indifférent</option>{BELTS.map(b => <option key={b} value={b}>{BELT_LBL[b]}</option>)}</select></label>
            <label><span>À</span><select className="uzu-input" aria-label="Ceinture maximale" value={bmax} onChange={e => setBmax(e.target.value as Belt | "")}><option value="">Indifférent</option>{BELTS.map(b => <option key={b} value={b}>{BELT_LBL[b]}</option>)}</select></label></div></div>
        </section>
        {!commune ? <p className="uzu-text uzu-muted">Choisis une ville pour voir les partenaires autour.</p>
          : err ? <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
          : res?.need ? <div className="uzu-banner" role="status">{NEED_MSG[res.need] || "Recherche indisponible."}</div>
          : busy && !res ? <div className="uzu-banner" aria-busy="true">Recherche…</div>
          : res && <section aria-label="Partenaires trouvés" aria-busy={busy}>
            <p className="uzu-text uzu-small uzu-muted" role="status">{(res.results || []).length ? `${res.results!.length} partenaire${res.results!.length > 1 ? "s" : ""} à moins de ${res.radius} km de ${res.commune?.nom}` : `Aucun partenaire disponible à moins de ${res.radius} km de ${res.commune?.nom} sur cette période.`}{(bmin || bmax) ? " · ceux qui n'affichent pas leur ceinture sont exclus quand le niveau est filtré." : ""}</p>
            <ul className="uzu-dir-list">{(res.results || []).map(x => <li key={x.handle}><PartnerCard p={x} onOpen={() => onOpen(x)} /></li>)}</ul>
          </section>}
      </>}
  </>
}

function partnerLines(p: Partner) {
  return {
    top: [p.belt ? `Ceinture ${BELT_LBL[p.belt].toLowerCase()}` : "", p.club || "", p.years != null ? `${p.years} an${p.years > 1 ? "s" : ""} de pratique` : ""].filter(Boolean).join(" · "),
    extra: [p.club || "", p.years != null ? `${p.years} an${p.years > 1 ? "s" : ""} de pratique` : ""].filter(Boolean).join(" · "),
    where: `${p.commune} (${p.dep}) · ${p.band}`,
    when: `${fmtRange(p.starts_on, p.ends_on)} · ${daysLine(p.days)} · ${p.parts.map(x => PART_LBL[x].toLowerCase()).join(", ")}`,
    what: `${p.disciplines.map(d => DISC_LBL[d]).join(", ")} · ${p.intensities.map(i => INT_LBL[i].toLowerCase()).join(", ")} · ${p.places.map(x => PLACE_LBL[x].toLowerCase()).join(", ")}`,
  }
}
function PartnerCard({ p, onOpen }: { p: Partner; onOpen: () => void }) {
  const l = partnerLines(p)
  return <button type="button" className="uzu-dir-card" onClick={onOpen} aria-label={`${p.name}, ${p.commune}, ${p.band}`}>
    <span className="uzu-dir-card-top"><b>{p.name}</b>{p.belt && <span className={`uzu-rl-belt uzu-rl-belt--${p.belt}`}>{BELT_LBL[p.belt]}</span>}</span>
    {l.extra && <span className="uzu-dir-meta">{l.extra}</span>}
    <span className="uzu-dir-meta">{l.where}</span>
    <span className="uzu-dir-meta">{l.when}</span>
    <span className="uzu-dir-meta">{l.what}</span>
    {p.note && <span className="uzu-text uzu-small">« {p.note} »</span>}
  </button>
}

// ---------------------------------------------------------------- Fiche d'un partenaire : blocage et signalement
function PartnerSheet({ p, onBack, onToast }: { p: Partner; onBack: () => void; onToast: (m: string) => void }) {
  const [mode, setMode] = useState<"" | "block" | "report">(""), [reason, setReason] = useState(""), [details, setDetails] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const l = partnerLines(p)
  const block = async () => { setBusy(true); const r = await roulerBlock(p.handle); setBusy(false); if (!r.ok) return setErr(r.msg); onToast(`Tu ne verras plus ${p.name}`); onBack() }
  const report = async () => { if (!reason) return setErr("Choisis un motif"); setBusy(true); const r = await roulerReport(p.handle, reason, details); setBusy(false); if (!r.ok) return setErr(r.msg); onToast("Signalement transmis au référent UZU"); onBack() }
  return <article className="uzu-dir-sheet" aria-labelledby="rl-name">
    <Back onClick={onBack}>Retour aux partenaires</Back>
    <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="eyebrow">PARTENAIRES · {p.name.toUpperCase()}</div>
      <h2 id="rl-name" className="uzu-dir-title">{p.name}</h2>
      {l.top && <p className="uzu-text">{l.top}</p>}
      <p className="uzu-text"><MapPin size={14} aria-hidden="true" /> {l.where}</p>
      <p className="uzu-text">{l.when}</p>
      <p className="uzu-text">{l.what}</p>
      {p.note && <p className="uzu-text">« {p.note} »</p>}
      <button type="button" className="button button--dark" disabled aria-disabled="true">Proposer un roulage · bientôt</button>
      <p className="uzu-text uzu-small uzu-muted">Pour rouler en sécurité : choisis un club ou un open mat, préviens un proche, signale tout comportement inapproprié.</p>
    </section>
    {mode === "" && <div className="uzu-actions uzu-actions--start">
      <button type="button" className="button button--outline uzu-small-btn" onClick={() => { setMode("block"); setErr("") }}><UserX size={15} aria-hidden="true" />Ne plus voir {p.name}</button>
      <button type="button" className="button button--outline uzu-small-btn" onClick={() => { setMode("report"); setErr("") }}><Flag size={15} aria-hidden="true" />Signaler</button></div>}
    {mode === "block" && <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Ne plus voir">
      <h3 className="uzu-h3">Ne plus voir {p.name}</h3>
      <p className="uzu-text">Vous ne vous verrez plus, ni l&apos;un ni l&apos;autre. Tu peux annuler depuis Mes disponibilités.</p>
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <div className="uzu-actions uzu-actions--start"><button type="button" className="button button--dark uzu-small-btn" disabled={busy} onClick={block}>Confirmer</button>
        <button type="button" className="button button--outline uzu-small-btn" onClick={() => setMode("")}>Annuler</button></div></section>}
    {mode === "report" && <form noValidate className="panel uzu-panel-col uzu-grid-gap" aria-label="Signaler" onSubmit={e => { e.preventDefault(); report() }}>
      <h3 className="uzu-h3"><ShieldCheck size={16} aria-hidden="true" /> Signaler</h3>
      <p className="uzu-text uzu-small uzu-muted">Transmis au référent UZU, jamais à la personne signalée.</p>
      <div className="uzu-chips uzu-chips--small" role="radiogroup" aria-label="Motif">{REASONS.map(([k, lb]) => <button key={k} type="button" role="radio" aria-checked={reason === k} className={reason === k ? "on" : ""} onClick={() => setReason(k)}>{lb}</button>)}</div>
      <label className="uzu-label" htmlFor="rl-details">Précision (facultatif)</label>
      <textarea id="rl-details" className="uzu-input" rows={3} maxLength={500} value={details} onChange={e => setDetails(e.target.value)} />
      <p className="uzu-text uzu-small uzu-muted">Après 3 signalements de personnes différentes en 30 jours, le profil est mis en pause jusqu&apos;à la décision du référent.</p>
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <div className="uzu-actions uzu-actions--start"><button type="submit" className="button button--dark uzu-small-btn" disabled={busy}>Envoyer le signalement</button>
        <button type="button" className="button button--outline uzu-small-btn" onClick={() => setMode("")}>Annuler</button></div></form>}
  </article>
}

// ---------------------------------------------------------------- Accueil : rappel d'une disponibilité en cours
// Silencieux si le module n'est pas installé, si aucun profil n'est activé ou si aucune disponibilité n'est en cours.
export function RoulerReminder({ onOpen }: { onOpen: () => void }) {
  const [a, setA] = useState<MyAvailability | null>(null)
  useEffect(() => { let live = true; roulerMe().then(r => { if (live && r.ok && r.data.profile) setA(r.data.availabilities.find(x => x.state === "current") || null) }); return () => { live = false } }, [])
  if (!a) return null
  return <p className="uzu-text uzu-small uzu-rl-remind" role="status">Ta disponibilité à {a.commune} est active jusqu&apos;au {fmtDay(a.ends_on)} · <button type="button" className="text-link uzu-dir-link" onClick={onOpen}>Voir</button></p>
}
