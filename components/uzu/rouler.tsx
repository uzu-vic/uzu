"use client"
// « Où rouler ? » étape 2 — volet Partenaires : profil de roulage, créneaux précis, recherche par temps en commun,
// déplacement, blocage, signalement. Invisible par défaut ; l'écran n'affiche que ce que le serveur renvoie
// (aucun identifiant de compte). Les heures sont celles du lieu de roulage ; le serveur calcule les raccourcis.
import { useEffect, useMemo, useState } from "react"
import { ArrowLeft, CalendarDays, EyeOff, Flag, MapPin, Plus, Settings2, ShieldCheck, UserX } from "lucide-react"
import { CommunePicker, Tick } from "@/components/uzu/directory"
import { DISC_LBL, lastCommune, rememberCommune, type Commune, type DirDisc } from "@/lib/uzu/directory"
import {
  BELTS, BELT_LBL, COMMON_MINUTES, INT_LBL, PLACE_LBL, REASONS, SLOT_MINUTES, VIS_LBL, WHEN_LBL, WHEN_OFFSET, addDaysIso, dayLabel, fmtMinutes, fmtTime,
  localDate, nextQuarter, parisNote, quarterTimes, rangeLine, roulerActivate, roulerBlock, roulerDeleteProfile, roulerEndAvailability, roulerExtendAvailability,
  roulerMe, roulerMyBlocks, roulerReport, roulerSaveAvailability, roulerSaveProfile, roulerSearch, roulerSetVisibility, roulerUnblock, serverNow, shortcutStart,
  syncClock, tzName, tzOfDep, untilLine,
  type Belt, type BlockedPartner, type Intensity, type MyAvailability, type Partner, type PartnerSearch, type Place, type RoulerMe, type Visibility, type When,
} from "@/lib/uzu/rouler"

const toggle = <T,>(list: T[], v: T) => list.includes(v) ? list.filter(x => x !== v) : [...list, v]
const communeOf = (insee: string | null | undefined, label: string | null | undefined): Commune | null => {
  if (!insee) return null
  const m = /^(.*) \(([^)]+)\)$/.exec(label || "")
  return { insee, nom: m ? m[1] : (label || insee), departement: m ? m[2] : "", code_postal: "" }
}
const QUICK: Exclude<When, "slot" | "custom">[] = ["30", "60", "120", "240"]
const SHORT: Record<string, string> = { "30": "30 min", "60": "1 h", "120": "2 h", "240": "4 h" }

function Heading({ sub }: { sub?: string }) {
  return <div className="page-heading"><div><div className="eyebrow">TATAMI · PARTENAIRES</div><h1>Partenaires<span className="heading-period">.</span></h1><p>{sub || "Trouve un partenaire de roulage maintenant ou bientôt, chez toi ou en déplacement."}</p></div></div>
}
function Back({ onClick, children = "Retour" }: { onClick: () => void; children?: React.ReactNode }) {
  return <button type="button" className="button button--outline uzu-small-btn uzu-lib-back" onClick={onClick}><ArrowLeft size={15} aria-hidden="true" />{children}</button>
}
function Chips<T extends string>({ label, all, value, onChange, lbl, multi = true }: { label: string; all: T[]; value: T[]; onChange: (v: T[]) => void; lbl: (v: T) => string; multi?: boolean }) {
  return <div className="uzu-field"><span className="uzu-label">{label}</span><div className="uzu-chips uzu-chips--small" role="group" aria-label={label}>
    {all.map(k => <button key={k} type="button" className={value.includes(k) ? "on" : ""} aria-pressed={value.includes(k)} onClick={() => onChange(multi ? toggle(value, k) : [k])}>{lbl(k)}</button>)}
  </div></div>
}
// Grille des moments : « Maintenant » mis en avant, puis 30 min, 1 h, 2 h, 4 h, Autre ; chaque bouton montre l'heure obtenue
function WhenPicker({ value, onChange, tz, label, extra }: { value: When; onChange: (w: When) => void; tz: string; label: string; extra?: React.ReactNode }) {
  return <div className="uzu-field"><span className="uzu-label">{label}</span>
    <div className="uzu-rl-when" role="group" aria-label={label}>
      {extra}
      <button type="button" className={"uzu-rl-now" + (value === "now" ? " on" : "")} aria-pressed={value === "now"} onClick={() => onChange("now")}>
        <span><i aria-hidden="true" />Maintenant</span><small>dès {fmtTime(shortcutStart(0), tz)}</small></button>
      <div className="uzu-rl-quick">
        {QUICK.map(k => <button key={k} type="button" className={value === k ? "on" : ""} aria-pressed={value === k} aria-label={`${WHEN_LBL[k]}, ${fmtTime(shortcutStart(WHEN_OFFSET[k]), tz)}`} onClick={() => onChange(k)}>
          {SHORT[k]}<small>{fmtTime(shortcutStart(WHEN_OFFSET[k]), tz)}</small></button>)}
        <button type="button" className={value === "custom" ? "on" : ""} aria-pressed={value === "custom"} onClick={() => onChange("custom")}>Autre<small>date</small></button>
      </div>
    </div></div>
}
function DateTime({ date, time, onDate, onTime, tz, idp }: { date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; tz: string; idp: string }) {
  const min = localDate(serverNow(), tz)
  return <div className="uzu-rl-dates">
    <label><span>Date</span><input id={`${idp}-date`} type="date" className="uzu-input" value={date} min={min} max={addDaysIso(min, 30)} onChange={e => onDate(e.target.value)} /></label>
    <label><span>Heure ({tzName(tz) ? `heure de ${tzName(tz)}` : "heure locale"})</span><select id={`${idp}-time`} className="uzu-input" value={time} onChange={e => onTime(e.target.value)}>{quarterTimes().map(t => <option key={t} value={t}>{t}</option>)}</select></label>
  </div>
}

type Screen = { k: "home"; slot?: string; when?: When } | { k: "activate" } | { k: "profile"; activation?: { adult: boolean; consent: boolean; safety: boolean } }
  | { k: "avail"; edit?: MyAvailability; when?: When } | { k: "mine" } | { k: "partner"; p: Partner; tz: string }

// ---------------------------------------------------------------- Volet Partenaires
// initial : « dispo:now », « dispo:30 »… (raccourci de l'Accueil) ou « slot:<id> » (rappel de l'Accueil)
export function PartnersPane({ tabs, onToast, initial }: { tabs: React.ReactNode; onToast: (m: string) => void; initial?: string }) {
  const first: Screen = useMemo(() => {
    const [k, v] = (initial || "").split(":")
    if (k === "dispo" && ["now", "30", "60", "120", "240", "custom"].includes(v)) return { k: "avail", when: v as When }
    if (k === "slot" && v) return { k: "home", slot: v }
    return { k: "home" }
  }, [initial])
  const [me, setMe] = useState<RoulerMe | null>(null), [err, setErr] = useState(""), [screen, setScreen] = useState<Screen>(first), [tick, setTick] = useState(0)
  useEffect(() => { let live = true; roulerMe().then(r => { if (!live) return; if (r.ok) { syncClock(r.data.now); setMe(r.data); setErr("") } else setErr(r.msg) }); return () => { live = false } }, [tick])
  const go = (s: Screen) => { setScreen(s); window.scrollTo(0, 0) }
  const upd = (m: RoulerMe) => { syncClock(m.now); setMe(m) }
  const done = (m: RoulerMe | null, msg?: string, next: Screen = { k: "home" }) => { if (m) upd(m); else setTick(t => t + 1); if (msg) onToast(msg); go(next) }
  const wrap = (body: React.ReactNode) => <><Heading />{tabs}{body}</>
  if (err) return wrap(<div className="uzu-banner uzu-banner--error" role="alert">{err}</div>)
  if (!me) return wrap(<div className="uzu-banner" aria-busy="true">Chargement…</div>)

  if (!me.profile) {
    if (screen.k === "activate") return wrap(<Activation me={me} onBack={() => go({ k: "home" })} onNext={a => go({ k: "profile", activation: a })} />)
    if (screen.k === "profile" && screen.activation) return wrap(<ProfileForm me={me} activation={screen.activation} onBack={() => go({ k: "activate" })} onSaved={m => done(m, "Profil de roulage activé. Tu restes invisible tant que tu ne changes pas « Qui peut me voir ? ».")} />)
    return wrap(<Intro me={me} onActivate={() => go({ k: "activate" })} />)
  }
  if (screen.k === "profile") return wrap(<ProfileForm me={me} onBack={() => go({ k: "home" })} onSaved={m => done(m, "Profil de roulage enregistré")} />)
  if (screen.k === "avail") return wrap(<AvailabilityForm me={me} edit={screen.edit} initialWhen={screen.when} onBack={() => go({ k: me.availabilities.length ? "mine" : "home" })}
    onSaved={m => {
      const before = new Set(me.availabilities.map(a => a.id)), created = m.availabilities.find(a => !before.has(a.id))
      done(m, screen.edit ? "Créneau modifié" : "Créneau publié", { k: "home", slot: (created || screen.edit)?.id })
    }} />)
  if (screen.k === "mine") return wrap(<MyCreneaux me={me} onToast={onToast} onBack={() => go({ k: "home" })} onNew={() => go({ k: "avail" })} onEdit={a => go({ k: "avail", edit: a })}
    onSee={a => go({ k: "home", slot: a.id })} onChanged={upd} onDeleted={() => done(null, "Profil de roulage supprimé")} onProfile={() => go({ k: "profile" })} />)
  if (screen.k === "partner") return wrap(<PartnerSheet p={screen.p} tz={screen.tz} onBack={() => go({ k: "home" })} onToast={onToast} />)
  return wrap(<Search me={me} initialSlot={screen.k === "home" ? screen.slot : undefined} onOpen={(p, tz) => go({ k: "partner", p, tz })} onDispo={() => go({ k: "avail" })} onMine={() => go({ k: "mine" })} onProfile={() => go({ k: "profile" })}
    onVisible={async v => { const r = await roulerSetVisibility(v); if (r.ok) { upd(r.data); onToast(`Visibilité : ${VIS_LBL[v]}`) } else onToast(r.msg) }} />)
}

// ---------------------------------------------------------------- Présentation (avant activation)
function Intro({ me, onActivate }: { me: RoulerMe; onActivate: () => void }) {
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Partenaires de roulage">
    <h2 className="uzu-h2"><EyeOff size={18} aria-hidden="true" /> Tu es invisible</h2>
    <p className="uzu-text">Personne ne te voit tant que tu n&apos;as pas activé ton profil de roulage et déclaré un créneau. Tu peux tout arrêter à tout moment.</p>
    <div className="uzu-rl-box"><b>Ce que les autres verront</b>
      <p className="uzu-text uzu-small">Ton prénom et l&apos;initiale de ton nom, tes disciplines, l&apos;horaire de tes créneaux, une distance approximative (« moins de 10 km »). Ta ceinture, ton club et tes années de pratique seulement si tu le choisis.</p></div>
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
        <span className="uzu-dir-meta">Distance, horaire et lieu selon ton créneau</span></div>
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <button type="submit" className="button button--dark" disabled={busy}>{activation ? "Activer mon profil" : "Enregistrer"}</button>
    </form></>
}


// ---------------------------------------------------------------- Je suis dispo (créneau précis)
function AvailabilityForm({ me, edit, initialWhen, onBack, onSaved }: { me: RoulerMe; edit?: MyAvailability; initialWhen?: When; onBack: () => void; onSaved: (m: RoulerMe) => void }) {
  const p = me.profile!
  const [travel, setTravel] = useState(!!edit?.is_travel), [commune, setCommune] = useState<Commune | null>(edit?.is_travel ? communeOf(edit.insee, edit.commune) : null)
  const tz = travel ? (commune ? tzOfDep(commune.departement) : p.home_tz) : p.home_tz
  const nq = nextQuarter(tz)
  const [when, setWhen] = useState<When>(edit ? "custom" : (initialWhen || "now"))
  const [date, setDate] = useState(edit ? localDate(new Date(edit.starts_at), edit.tz) : nq.date), [time, setTime] = useState(edit ? fmtTime(edit.starts_at, edit.tz) : nq.time)
  const [minutes, setMinutes] = useState<number>(edit && SLOT_MINUTES.includes(edit.minutes) ? edit.minutes : 120)
  const [disc, setDisc] = useState<DirDisc[]>(edit?.disciplines || p.disciplines), [ints, setInts] = useState<Intensity[]>(edit?.intensities || p.intensities)
  const [places, setPlaces] = useState<Place[]>(edit?.places || ["club", "open_mat"]), [note, setNote] = useState(edit?.note || "")
  const [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const placeName = travel ? (commune?.nom || "la commune choisie") : (communeOf(p.home_insee, p.home_commune)?.nom || "ta ville")
  // Aperçu : pour un raccourci, l'heure exacte est fixée par le serveur au moment de la publication
  const preview = useMemo(() => {
    if (when === "custom") {
      if (!date || !time) return null
      return { label: `${date === localDate(serverNow(), tz) ? "Aujourd'hui" : new Date(date + "T12:00:00Z").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })} de ${time} à ${addMin(time, minutes)}`, a: null as Date | null, b: null as Date | null }
    }
    const a = shortcutStart(WHEN_OFFSET[when] ?? 0), b = new Date(a.getTime() + minutes * 60000)
    return { label: `${dayLabel(a, tz)} de ${fmtTime(a, tz)} à ${fmtTime(b, tz)}`, a: a as Date | null, b: b as Date | null }
  }, [when, date, time, minutes, tz])
  const save = async () => {
    setErr("")
    if (travel && !commune) return setErr("Choisis la commune où tu veux rouler")
    if (when === "custom" && (!date || !time)) return setErr("Indique la date et l'heure de début")
    if (!disc.length) return setErr("Choisis au moins une discipline")
    if (!ints.length) return setErr("Choisis au moins un type de roulage")
    if (!places.length) return setErr("Choisis au moins un lieu")
    setBusy(true)
    const r = await roulerSaveAvailability({ id: edit?.id || null, is_travel: travel, insee: travel ? commune?.insee : p.home_insee, when, date: when === "custom" ? date : null, time: when === "custom" ? time : null,
      minutes, disciplines: disc, intensities: ints, places, note: note.trim() })
    setBusy(false)
    if (!r.ok) return setErr(r.msg)
    onSaved(r.data)
  }
  return <><Back onClick={onBack} />
    <form noValidate className="panel uzu-panel-col uzu-grid-gap" aria-label="Je suis dispo" onSubmit={e => { e.preventDefault(); save() }}>
      <div className="eyebrow">PARTENAIRES · JE SUIS DISPO</div><h2 className="uzu-h2">{edit ? "Modifier mon créneau" : "Je suis dispo"}</h2>
      <WhenPicker label="À partir de quand ?" value={when} onChange={w => { setWhen(w); setErr("") }} tz={tz} />
      {when === "custom" && <DateTime idp="rl-av" date={date} time={time} onDate={setDate} onTime={setTime} tz={tz} />}
      <Chips label="Pendant" all={SLOT_MINUTES.map(String)} value={[String(minutes)]} onChange={v => setMinutes(Number(v[0]))} lbl={v => fmtMinutes(Number(v))} multi={false} />
      {preview && <div className="uzu-rl-sum" role="status"><b>{preview.label}</b>
        <span>{tzName(tz) ? `Heure de ${tzName(tz)}` : `Heure locale de ${placeName}`}{when !== "custom" ? ` · disparaît seule à la fin` : ""}{preview.a && preview.b ? (parisNote(preview.a.toISOString(), preview.b.toISOString(), tz) ? ` · ${parisNote(preview.a.toISOString(), preview.b.toISOString(), tz)}` : "") : ""}</span></div>}
      <div className="uzu-field"><span className="uzu-label">Où veux-tu rouler ?</span>
        <div className="uzu-chips uzu-chips--small" role="group" aria-label="Où veux-tu rouler ?">
          <button type="button" className={!travel ? "on" : ""} aria-pressed={!travel} onClick={() => setTravel(false)}>{p.home_commune || "Ma ville"} · ma ville</button>
          <button type="button" className={travel ? "on" : ""} aria-pressed={travel} onClick={() => setTravel(true)}>Ailleurs</button>
        </div></div>
      {travel && <><CommunePicker id="rl-travel" label="Commune où tu veux rouler" value={commune} onPick={c => { setCommune(c); setErr("") }} />
        <p className="uzu-text uzu-small uzu-muted">Ta ville habituelle ne change pas et n&apos;est montrée à personne.</p></>}
      <Chips label="Discipline" all={Object.keys(DISC_LBL) as DirDisc[]} value={disc} onChange={setDisc} lbl={d => DISC_LBL[d]} />
      <Chips label="Roulage" all={Object.keys(INT_LBL) as Intensity[]} value={ints} onChange={setInts} lbl={i => INT_LBL[i]} />
      <Chips label="Lieu souhaité" all={Object.keys(PLACE_LBL) as Place[]} value={places} onChange={setPlaces} lbl={x => PLACE_LBL[x]} />
      <label className="uzu-label" htmlFor="rl-note">Un mot ({140 - note.length} caractères restants)</label>
      <input id="rl-note" className="uzu-input" maxLength={140} value={note} placeholder="Ex. De passage, partant pour 5 rounds" onChange={e => setNote(e.target.value)} />
      <p className="uzu-text uzu-small uzu-muted">N&apos;indique ni téléphone, ni adresse, ni réseau social.</p>
      {p.visibility === "hidden" && <div className="uzu-banner" role="status">Tu es invisible : ce créneau ne sera montré à personne tant que tu ne changes pas « Qui peut me voir ? » dans ton profil.</div>}
      {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
      <button type="submit" className="button button--dark" disabled={busy}>{edit ? "Enregistrer" : "Publier et voir les partenaires"}</button>
      <p className="uzu-text uzu-small uzu-muted">L&apos;heure de début est fixée par le serveur au moment où tu publies, pas par l&apos;horloge du téléphone.</p>
    </form></>
}
const addMin = (hm: string, m: number) => { const [h, mi] = hm.split(":").map(Number); const t = (h * 60 + mi + m) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}` }

// ---------------------------------------------------------------- Mes créneaux, visibilité, suppression
function MyCreneaux({ me, onToast, onBack, onNew, onEdit, onSee, onChanged, onDeleted, onProfile }: {
  me: RoulerMe; onToast: (m: string) => void; onBack: () => void; onNew: () => void; onEdit: (a: MyAvailability) => void; onSee: (a: MyAvailability) => void
  onChanged: (m: RoulerMe) => void; onDeleted: () => void; onProfile: () => void
}) {
  const [confirm, setConfirm] = useState(false), [busy, setBusy] = useState(false), [blocks, setBlocks] = useState<BlockedPartner[] | null>(null), [tick, setTick] = useState(0)
  useEffect(() => { let live = true; roulerMyBlocks().then(r => { if (live) setBlocks(r.ok ? r.data : []) }); return () => { live = false } }, [tick])
  const list = me.availabilities, p = me.profile!
  const act = async (fn: () => Promise<{ ok: true; data: RoulerMe } | { ok: false; msg: string }>, msg: string) => { const r = await fn(); if (r.ok) { onChanged(r.data); onToast(msg) } else onToast(r.msg) }
  const invisible = () => act(() => roulerSetVisibility("hidden"), "Tu es invisible")
  const del = async () => { setBusy(true); const r = await roulerDeleteProfile(); setBusy(false); if (r.ok) onDeleted(); else onToast(r.msg) }
  return <><Back onClick={onBack}>Retour à la recherche</Back>
    <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Mes créneaux">
      <div className="uzu-rl-head"><div><div className="eyebrow">PARTENAIRES · MES CRÉNEAUX</div><h2 className="uzu-h2">Mes créneaux</h2>
        <p className="uzu-text uzu-small uzu-muted">{list.length} sur 3 possibles</p></div>
        {list.length < 3 && <button type="button" className="button button--dark uzu-small-btn" onClick={onNew}><Plus size={15} aria-hidden="true" />Nouveau</button>}</div>
      {!list.length ? <p className="uzu-text uzu-muted">Aucun créneau en cours ou à venir.</p>
        : <ul className="uzu-dir-list">{list.map(a => {
          const cur = a.state === "current", note = parisNote(a.starts_at, a.ends_at, a.tz)
          return <li key={a.id}><article className="uzu-dir-card uzu-dir-card--static" aria-label={`Créneau à ${a.commune || ""}`}>
            <span className="uzu-dir-card-top"><b>{a.commune}{a.is_travel ? " · ailleurs" : ""}</b><span className={"uzu-dir-badge" + (cur ? " uzu-rl-badge-ok" : " uzu-dir-badge--ref")}>{cur ? "En cours" : `Dans ${untilLine(a.starts_at)}`}</span></span>
            <span className="uzu-rl-slotline">{rangeLine(a.starts_at, a.ends_at, a.tz)}{cur ? ` · se termine dans ${untilLine(a.ends_at)}` : ""}</span>
            {(tzName(a.tz) || note) && <span className="uzu-dir-meta">{tzName(a.tz) ? `Heure de ${tzName(a.tz)}` : ""}{note ? ` · ${note}` : ""}</span>}
            <span className="uzu-dir-meta">{a.disciplines.map(d => DISC_LBL[d]).join(", ")} · {a.intensities.map(i => INT_LBL[i].toLowerCase()).join(", ")}</span>
            {a.note && <span className="uzu-text uzu-small">« {a.note} »</span>}
            <span className={"uzu-small " + (a.compatible ? "uzu-rl-ok" : "uzu-muted")}>{a.compatible ? `${a.compatible} partenaire${a.compatible > 1 ? "s" : ""} compatible${a.compatible > 1 ? "s" : ""}` : "Aucun partenaire compatible pour l'instant"}
              {" · "}<button type="button" className="text-link uzu-dir-link" onClick={() => onSee(a)}>Voir</button></span>
            <span className="uzu-actions uzu-actions--start">
              {cur ? <><button type="button" className="button button--outline uzu-small-btn" onClick={() => act(() => roulerExtendAvailability(a.id), "Créneau prolongé de 30 min")}>Prolonger 30 min</button>
                <button type="button" className="button button--dark uzu-small-btn" onClick={() => act(() => roulerEndAvailability(a.id), "Tu n'es plus dispo")}>Je ne suis plus dispo</button></>
                : <><button type="button" className="button button--outline uzu-small-btn" onClick={() => onEdit(a)}>Modifier</button>
                  <button type="button" className="button button--outline uzu-small-btn" onClick={() => act(() => roulerEndAvailability(a.id), "Créneau annulé")}>Annuler</button></>}
            </span>
          </article></li>
        })}</ul>}
      <p className="uzu-text uzu-small uzu-muted">Un créneau disparaît des résultats dès son heure de fin.</p>
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
        : <><p className="uzu-text">Ton profil et tous tes créneaux seront effacés. Ton compte UZU, tes séances et ton club ne changent pas.</p>
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
function Search({ me, initialSlot, onOpen, onDispo, onMine, onProfile, onVisible }: {
  me: RoulerMe; initialSlot?: string; onOpen: (p: Partner, tz: string) => void; onDispo: () => void; onMine: () => void; onProfile: () => void; onVisible: (v: Visibility) => void
}) {
  const p = me.profile!, slots = me.availabilities
  // Créneau proposé par défaut : celui demandé, sinon un créneau en déplacement (en cours ou à venir)
  const defSlot = slots.find(a => a.id === initialSlot) || slots.find(a => a.is_travel) || null
  const [slotId, setSlotId] = useState<string | null>(defSlot?.id || null)
  const slot = slots.find(a => a.id === slotId) || null
  const [when, setWhen] = useState<When>(defSlot ? "slot" : "now")
  const [minutes, setMinutes] = useState(60)
  const home = communeOf(p.home_insee, p.home_commune)
  const [picked, setPicked] = useState<Commune | null>(null)   // commune choisie à la main ; sinon celle du créneau ou la dernière
  const commune: Commune | null = picked || (when === "slot" && slot ? communeOf(slot.insee, slot.commune) : (lastCommune() || home))
  const tz = when === "slot" && slot && !picked ? slot.tz : tzOfDep(commune?.departement)
  const nq = nextQuarter(tz)
  const [date, setDate] = useState(nq.date), [time, setTime] = useState(nq.time)
  const [radius, setRadius] = useState(25), [disc, setDisc] = useState<DirDisc | null>(null), [intensity, setIntensity] = useState<Intensity | null>(null)
  const [bmin, setBmin] = useState<Belt | "">(""), [bmax, setBmax] = useState<Belt | "">(""), [filters, setFilters] = useState(false)
  const [res, setRes] = useState<PartnerSearch | null>(null), [err, setErr] = useState(""), [busy, setBusy] = useState(false), [run, setRun] = useState(0)
  const blocked = p.status === "paused" || p.visibility === "hidden"
  const travelSlot = slots.find(a => a.is_travel) || null
  useEffect(() => {
    if (blocked || (!commune && when !== "slot")) return
    let live = true; setBusy(true); setErr("")
    const t = window.setTimeout(() => roulerSearch({ insee: when === "slot" && !picked ? null : commune?.insee, radius, when, minutes, slot: when === "slot" ? slotId : null,
      date: when === "custom" ? date : undefined, time: when === "custom" ? time : undefined, disc, intensity, belt_min: bmin || null, belt_max: bmax || null }).then(r => {
      if (!live) return; setBusy(false); if (r.ok) { syncClock(r.data.now); setRes(r.data) } else { setRes(null); setErr(r.msg) }
    }), 250)
    return () => { live = false; window.clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commune?.insee, radius, when, minutes, slotId, date, time, disc, intensity, bmin, bmax, blocked, picked, run])
  const wtz = res?.window?.tz || tz
  const summary = res?.window ? (when === "slot"
    ? `Dans ton créneau ${fmtTime(res.window.start, wtz)} → ${fmtTime(res.window.end, wtz)}, au moins ${fmtMinutes(res.required_minutes || minutes)} en commun`
    : when === "now" ? `Dispo maintenant et jusqu'à ${fmtTime(res.window.end, wtz)} au moins`
    : `Dispo ${dayLabel(res.window.start, wtz).toLowerCase()} de ${fmtTime(res.window.start, wtz)} à ${fmtTime(res.window.end, wtz)}`) : ""
  const n = res?.results?.length || 0
  return <>
    <div className="uzu-actions uzu-actions--start uzu-rl-menu">
      <button type="button" className="button button--dark uzu-small-btn" onClick={onDispo}><CalendarDays size={15} aria-hidden="true" />Je suis dispo</button>
      {slots.length > 0 && <button type="button" className="button button--outline uzu-small-btn" onClick={onMine}>Mes créneaux ({slots.length})</button>}
      <button type="button" className="button button--outline uzu-small-btn" onClick={onProfile}><Settings2 size={15} aria-hidden="true" />Mon profil</button>
    </div>
    {p.status === "paused" ? <div className="uzu-banner" role="status">{NEED_MSG.paused}</div>
      : p.visibility === "hidden" ? <section className="panel uzu-panel-col uzu-grid-gap"><p className="uzu-text">{NEED_MSG.visible}</p>
        <div className="uzu-actions uzu-actions--start"><button type="button" className="button button--outline uzu-small-btn" onClick={() => onVisible("clubs")}>Visible de mes clubs</button>
          <button type="button" className="button button--outline uzu-small-btn" onClick={() => onVisible("uzu")}>Visible de tout UZU</button></div></section>
      : <>
        {travelSlot && <div className="uzu-rl-ban" role="status"><b>Tu es en déplacement à {travelSlot.commune}</b>
          <span><span>Ville habituelle</span><b>{home?.nom || "—"} · inchangée, jamais montrée aux autres</b></span>
          <span><span>Recherche active</span><b>{commune ? `${commune.nom}${commune.departement ? ` (${commune.departement})` : ""}` : "—"} · {radius} km</b></span></div>}
        <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Recherche de partenaires">
          <WhenPicker label="Je veux rouler" value={when} onChange={w => { setWhen(w); setPicked(null) }} tz={tz}
            extra={slots.length > 0 && <>
              <button type="button" className={"uzu-rl-mine" + (when === "slot" ? " on" : "")} aria-pressed={when === "slot"} onClick={() => { setWhen("slot"); setPicked(null); if (!slotId) setSlotId(slots[0].id) }}>
                <span>Mon créneau{(slot || slots[0]).is_travel ? ` à ${communeOf((slot || slots[0]).insee, (slot || slots[0]).commune)?.nom}` : ""}</span>
                <small>{rangeLine((slot || slots[0]).starts_at, (slot || slots[0]).ends_at, (slot || slots[0]).tz)}</small></button>
              {when === "slot" && slots.length > 1 && <select className="uzu-input" aria-label="Choisir mon créneau" value={slotId || ""} onChange={e => { setSlotId(e.target.value); setPicked(null) }}>
                {slots.map(a => <option key={a.id} value={a.id}>{a.commune} · {rangeLine(a.starts_at, a.ends_at, a.tz)}</option>)}</select>}
            </>} />
          {when === "custom" && <DateTime idp="rl-se" date={date} time={time} onDate={setDate} onTime={setTime} tz={tz} />}
          <Chips label="Temps commun minimum" all={COMMON_MINUTES.map(String)} value={[String(minutes)]} onChange={v => setMinutes(Number(v[0]))} lbl={v => fmtMinutes(Number(v))} multi={false} />
          <CommunePicker id="rl-search" label="Où" value={commune} onPick={c => { setPicked(c); rememberCommune(c) }} />
          {when === "slot" && <p className="uzu-text uzu-small uzu-muted">Commune de ton créneau par défaut ; en changer ne modifie ni ton créneau ni ta ville habituelle.</p>}
          <div className="uzu-field"><span className="uzu-label">Rayon</span><div className="uzu-chips uzu-chips--small">{[10, 25, 50].map(r => <button key={r} type="button" className={radius === r ? "on" : ""} aria-pressed={radius === r} onClick={() => setRadius(r)}>{r} km</button>)}</div></div>
          <button type="button" className="text-link uzu-dir-link" aria-expanded={filters} onClick={() => setFilters(!filters)}>{filters ? "Masquer les filtres" : "Discipline, roulage, niveau"}</button>
          {filters && <>
            <div className="uzu-field"><span className="uzu-label">Discipline</span><div className="uzu-chips uzu-chips--small">
              <button type="button" className={!disc ? "on" : ""} aria-pressed={!disc} onClick={() => setDisc(null)}>Toutes</button>
              {(Object.keys(DISC_LBL) as DirDisc[]).map(k => <button key={k} type="button" className={disc === k ? "on" : ""} aria-pressed={disc === k} onClick={() => setDisc(k)}>{DISC_LBL[k]}</button>)}</div></div>
            <div className="uzu-field"><span className="uzu-label">Roulage</span><div className="uzu-chips uzu-chips--small">
              <button type="button" className={!intensity ? "on" : ""} aria-pressed={!intensity} onClick={() => setIntensity(null)}>Tous</button>
              {(Object.keys(INT_LBL) as Intensity[]).map(k => <button key={k} type="button" className={intensity === k ? "on" : ""} aria-pressed={intensity === k} onClick={() => setIntensity(k)}>{INT_LBL[k]}</button>)}</div></div>
            <div className="uzu-field"><span className="uzu-label">Niveau (ceinture)</span><div className="uzu-rl-dates">
              <label><span>De</span><select className="uzu-input" aria-label="Ceinture minimale" value={bmin} onChange={e => setBmin(e.target.value as Belt | "")}><option value="">Indifférent</option>{BELTS.map(b => <option key={b} value={b}>{BELT_LBL[b]}</option>)}</select></label>
              <label><span>À</span><select className="uzu-input" aria-label="Ceinture maximale" value={bmax} onChange={e => setBmax(e.target.value as Belt | "")}><option value="">Indifférent</option>{BELTS.map(b => <option key={b} value={b}>{BELT_LBL[b]}</option>)}</select></label></div></div>
          </>}
          {summary && <div className="uzu-rl-sum"><b>{summary}</b><span>{when === "now" ? "Créneau déjà commencé, avec au moins " + fmtMinutes(minutes) + " devant lui" : `Au moins ${fmtMinutes(res?.required_minutes || minutes)} en commun`} · heure {tzName(wtz) ? `de ${tzName(wtz)}` : "locale"}</span></div>}
        </section>
        {!slots.length && <p className="uzu-text uzu-small uzu-muted" role="status">Tu cherches sans être montré : déclare-toi dispo pour que d&apos;autres te trouvent. Visibilité : {VIS_LBL[p.visibility]}.</p>}
        {!commune && when !== "slot" ? <p className="uzu-text uzu-muted">Choisis une ville pour voir les partenaires autour.</p>
          : err ? <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>
          : res?.need ? <div className="uzu-banner" role="status">{NEED_MSG[res.need] || "Recherche indisponible."}</div>
          : busy && !res ? <div className="uzu-banner" aria-busy="true">Recherche…</div>
          : res && <section aria-label="Partenaires trouvés" aria-busy={busy}>
            {n > 0 ? <p className="uzu-text uzu-small" role="status"><b>{n} partenaire{n > 1 ? "s" : ""} avec au moins {fmtMinutes(res.required_minutes || minutes)} en commun</b> · à moins de {res.radius} km de {res.commune?.nom}{(bmin || bmax) ? " · ceux qui n'affichent pas leur ceinture sont exclus quand le niveau est filtré" : ""}</p>
              : <div className="panel uzu-panel-col uzu-grid-gap" role="status"><h3 className="uzu-h3">Personne avec au moins {fmtMinutes(res.required_minutes || minutes)} en commun{when === "now" ? " maintenant" : ""}</h3>
                <p className="uzu-text uzu-small uzu-muted">À moins de {res.radius} km de {res.commune?.nom}.</p>
                <div className="uzu-actions uzu-actions--start">
                  {when === "now" && <button type="button" className="button button--outline uzu-small-btn" onClick={() => setWhen("120")}>Voir dans 2 h</button>}
                  {radius < 50 && <button type="button" className="button button--outline uzu-small-btn" onClick={() => setRadius(radius === 10 ? 25 : 50)}>Élargir à {radius === 10 ? 25 : 50} km</button>}
                  {!slots.length && <button type="button" className="button button--dark uzu-small-btn" onClick={onDispo}>Je suis dispo maintenant</button>}
                </div></div>}
            <ul className="uzu-dir-list">{(res.results || []).map(x => <li key={x.handle}><PartnerCard p={x} win={res.window!} onOpen={() => onOpen(x, wtz)} /></li>)}</ul>
          </section>}
      </>}
  </>
}

// ---------------------------------------------------------------- Carte de résultat : créneau, temps en commun, frise
function Frise({ win, p, tz }: { win: { start: string; end: string }; p: Partner; tz: string }) {
  const t = (s: string) => Date.parse(s)
  const H = 3600000, lo = Math.floor(Math.min(t(win.start), t(p.starts_at)) / H) * H, hi = Math.ceil(Math.max(t(win.end), t(p.ends_at)) / H) * H
  const span = Math.max(hi - lo, H), pc = (x: number) => `${((x - lo) * 100 / span).toFixed(1)}%`, w = (a: number, b: number) => `${((b - a) * 100 / span).toFixed(1)}%`
  const ticks: number[] = []; for (let x = lo; x <= hi; x += span > 6 * H ? 2 * H : H) ticks.push(x)
  const row = (label: string, a: number, b: number, cls: string) => <><span>{label}</span><span className="uzu-rl-tr"><i className={cls} style={{ left: pc(a), width: w(a, b) }} /></span></>
  return <div className="uzu-rl-frise" aria-hidden="true">
    {row("Toi", t(win.start), t(win.end), "me")}
    {row(p.name.split(" ")[0], t(p.starts_at), t(p.ends_at), "him")}
    {row("Commun", t(p.common_start), t(p.common_end), "co")}
    <span /><span className="uzu-rl-ax">{ticks.map(x => <span key={x}>{fmtTime(new Date(x), tz)}</span>)}</span>
  </div>
}
function PartnerCard({ p, win, onOpen }: { p: Partner; win: { start: string; end: string }; onOpen: () => void }) {
  const tz = p.tz, extra = [p.club || "", p.years != null ? `${p.years} an${p.years > 1 ? "s" : ""} de pratique` : ""].filter(Boolean).join(" · ")
  return <article className="uzu-dir-card uzu-dir-card--static uzu-rl-card" aria-label={`${p.name}, ${fmtMinutes(p.common_minutes)} en commun, ${p.band}`}>
    <span className="uzu-dir-card-top"><button type="button" className="uzu-rl-name" onClick={onOpen}>{p.name}</button><span className="uzu-dir-badge uzu-dir-badge--ref">{p.band}</span></span>
    <span className="uzu-rl-cm">
      <span><small>Dispo {dayLabel(p.starts_at, tz).toLowerCase()}</small><b>{fmtTime(p.starts_at, tz)} → {fmtTime(p.ends_at, tz)}</b></span>
      <span className="uzu-rl-common"><b>{fmtMinutes(p.common_minutes)}</b><small>en commun · {fmtTime(p.common_start, tz)} → {fmtTime(p.common_end, tz)}</small></span>
    </span>
    <Frise win={win} p={p} tz={tz} />
    <span className="uzu-rl-tags">{p.disciplines.map(d => <span key={d}>{d === "jjb_gi" ? "Gi" : "No-Gi"}</span>)}{p.places.filter(x => x !== "a_convenir").map(x => <span key={x}>{x === "open_mat" ? "Open mat" : "Club"}</span>)}
      {p.is_travel && <span>De passage</span>}{p.belt && <span className={`uzu-rl-belt uzu-rl-belt--${p.belt}`}>{BELT_LBL[p.belt]}</span>}</span>
    <span className="uzu-dir-meta">{p.commune} ({p.dep}) · {p.intensities.map(i => INT_LBL[i].toLowerCase()).join(", ")}{extra ? ` · ${extra}` : ""}</span>
    {p.note && <span className="uzu-text uzu-small">« {p.note} »</span>}
    <span className="uzu-actions uzu-actions--start" style={{ flexWrap: "nowrap" }}>
      <button type="button" className="button button--dark uzu-small-btn" disabled aria-disabled="true" style={{ flex: 1 }}>Proposer un roulage · bientôt</button>
      <button type="button" className="button button--outline uzu-small-btn" onClick={onOpen} aria-label={`Ne plus voir ou signaler ${p.name}`}>···</button>
    </span>
  </article>
}

// ---------------------------------------------------------------- Fiche d'un partenaire : blocage et signalement
function PartnerSheet({ p, tz, onBack, onToast }: { p: Partner; tz: string; onBack: () => void; onToast: (m: string) => void }) {
  const [mode, setMode] = useState<"" | "block" | "report">(""), [reason, setReason] = useState(""), [details, setDetails] = useState(""), [err, setErr] = useState(""), [busy, setBusy] = useState(false)
  const block = async () => { setBusy(true); const r = await roulerBlock(p.handle); setBusy(false); if (!r.ok) return setErr(r.msg); onToast(`Tu ne verras plus ${p.name}`); onBack() }
  const report = async () => { if (!reason) return setErr("Choisis un motif"); setBusy(true); const r = await roulerReport(p.handle, reason, details); setBusy(false); if (!r.ok) return setErr(r.msg); onToast("Signalement transmis au référent UZU"); onBack() }
  void tz
  return <article className="uzu-dir-sheet" aria-labelledby="rl-name">
    <Back onClick={onBack}>Retour aux partenaires</Back>
    <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="eyebrow">PARTENAIRES · {p.name.toUpperCase()}</div>
      <h2 id="rl-name" className="uzu-dir-title">{p.name}</h2>
      {(p.belt || p.club || p.years != null) && <p className="uzu-text">{[p.belt ? `Ceinture ${BELT_LBL[p.belt].toLowerCase()}` : "", p.club || "", p.years != null ? `${p.years} an${p.years > 1 ? "s" : ""} de pratique` : ""].filter(Boolean).join(" · ")}</p>}
      <p className="uzu-text"><MapPin size={14} aria-hidden="true" /> {p.commune} ({p.dep}) · {p.band}{p.is_travel ? " · de passage" : ""}</p>
      <p className="uzu-text">Dispo {rangeLine(p.starts_at, p.ends_at, p.tz).toLowerCase()} · <b className="uzu-rl-ok">{fmtMinutes(p.common_minutes)} en commun</b> ({fmtTime(p.common_start, p.tz)} → {fmtTime(p.common_end, p.tz)}){tzName(p.tz) ? ` · heure de ${tzName(p.tz)}` : ""}</p>
      <p className="uzu-text">{p.disciplines.map(d => DISC_LBL[d]).join(", ")} · {p.intensities.map(i => INT_LBL[i].toLowerCase()).join(", ")} · {p.places.map(x => PLACE_LBL[x].toLowerCase()).join(", ")}</p>
      {p.note && <p className="uzu-text">« {p.note} »</p>}
      <button type="button" className="button button--dark" disabled aria-disabled="true">Proposer un roulage · bientôt</button>
      <p className="uzu-text uzu-small uzu-muted">La proposition arrivera à l&apos;étape suivante : {p.name} devra l&apos;accepter, rien ne sera confirmé avant.</p>
      <p className="uzu-text uzu-small uzu-muted">Pour rouler en sécurité : choisis un club ou un open mat, préviens un proche, signale tout comportement inapproprié.</p>
    </section>
    {mode === "" && <div className="uzu-actions uzu-actions--start">
      <button type="button" className="button button--outline uzu-small-btn" onClick={() => { setMode("block"); setErr("") }}><UserX size={15} aria-hidden="true" />Ne plus voir {p.name}</button>
      <button type="button" className="button button--outline uzu-small-btn" onClick={() => { setMode("report"); setErr("") }}><Flag size={15} aria-hidden="true" />Signaler</button></div>}
    {mode === "block" && <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Ne plus voir">
      <h3 className="uzu-h3">Ne plus voir {p.name}</h3>
      <p className="uzu-text">Vous ne vous verrez plus, ni l&apos;un ni l&apos;autre. Tu peux annuler depuis Mes créneaux.</p>
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

// ---------------------------------------------------------------- Accueil : raccourcis « Je suis dispo » et rappel du créneau
// Les heures affichées sont un aperçu ; le serveur fixe l'heure exacte au moment de la publication.
export function RoulerHome({ onNavigate }: { onNavigate: (arg: string) => void }) {
  const [me, setMe] = useState<RoulerMe | null>(null)
  useEffect(() => { let live = true; roulerMe().then(r => { if (live && r.ok) { syncClock(r.data.now); setMe(r.data) } }); return () => { live = false } }, [])
  const tz = me?.profile?.home_tz || "Europe/Paris"
  const a = me?.profile ? (me.availabilities.find(x => x.state === "current") || me.availabilities[0] || null) : null
  return <>
    <div className="uzu-rl-homeq" role="group" aria-label="Je suis dispo">
      {(["now", ...QUICK, "custom"] as When[]).map(k => <button key={k} type="button" onClick={() => onNavigate(`partners:dispo:${k}`)}>
        {k === "now" ? "Maintenant" : k === "custom" ? "Autre moment" : WHEN_LBL[k as keyof typeof WHEN_LBL]}<small>{k === "custom" ? "date et heure" : fmtTime(shortcutStart(WHEN_OFFSET[k]), tz)}</small></button>)}
    </div>
    {a && <div className="uzu-rl-remind" role="status"><b>{a.state === "current" ? "Tu es dispo" : `Dispo ${dayLabel(a.starts_at, a.tz).toLowerCase()}`} · {communeOf(a.insee, a.commune)?.nom}</b>
      <span>{fmtTime(a.starts_at, a.tz)} → {fmtTime(a.ends_at, a.tz)}{a.state === "current" ? ` · se termine dans ${untilLine(a.ends_at)}` : ` · dans ${untilLine(a.starts_at)}`}</span>
      <span>{a.compatible ? `${a.compatible} partenaire${a.compatible > 1 ? "s" : ""} compatible${a.compatible > 1 ? "s" : ""}` : "Aucun partenaire compatible pour l'instant"} · <button type="button" className="text-link" onClick={() => onNavigate(`partners:slot:${a.id}`)}>Voir</button></span></div>}
  </>
}
