"use client"
// Formulaire de saisie (séance et compétition) au design UZU Athlete.
// Les choix proposés (systèmes, techniques, soumissions, renversements, passages, profils) viennent
// des catalogues de l'ancienne application ; l'enregistrement passe par lib/uzu/journal.ts.
import { useEffect, useMemo, useRef, useState } from "react"
import { Check, Mic, Minus, Plus, Trash2, X } from "lucide-react"
import { voiceApi, voiceApply, voiceSupport } from "@/lib/uzu/voice"
import type { UzuContext } from "@/lib/uzu/context"
import { addComp, addSession, formFromSession, loadEntry, newCore, updateComp, updateSession, type CompForm } from "@/lib/uzu/journal"
import { mySessionPartners, sessionSummary, setSessionPartners, type Partner } from "@/lib/uzu/partners"
import { PartnersField } from "@/components/uzu/partners"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

function Seg<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return <div className="uzu-seg" role="group" aria-label={label}>{options.map(([v, l]) => <button key={String(v)} type="button" aria-pressed={value === v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{l}</button>)}</div>
}
function Stepper({ label, value, onChange, max = 99 }: { label: string; value: number; onChange: (v: number) => void; max?: number }) {
  return <div className="uzu-stepper"><span>{label}</span><div>
    <button type="button" aria-label={`Moins : ${label}`} onClick={() => onChange(Math.max(0, value - 1))}><Minus size={16} /></button>
    <output aria-live="polite">{value}</output>
    <button type="button" aria-label={`Plus : ${label}`} onClick={() => onChange(Math.min(max, value + 1))}><Plus size={16} /></button>
  </div></div>
}
function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return <div className="uzu-field"><span className="uzu-label">{label}</span>{children}{hint && <small className="uzu-hint">{hint}</small>}</div>
}

const DURS: [number, string][] = [[45, "45 min"], [60, "1 h"], [90, "1 h 30"], [120, "2 h"]]
const PDURS: [number, string][] = [[15, "15 min"], [30, "30 min"], [45, "45 min"], [60, "1 h"]]
const SUBDIRS: [string, string][] = [["placee", "Placée"], ["subieW", "Subie · blanche"], ["subieG", "Subie · gradé"]]
const GMDIRS: [string, string][] = [["placed", "Placé"], ["suffered", "Subi"]]
const FORMES: [string, string][] = [["ok", "En forme"], ["fatigue", "Fatigué"], ["douleur", "Douleur / blessé"]]
const RESULTS: [string, string][] = [["or", "Or"], ["argent", "Argent"], ["bronze", "Bronze"], ["aucun", "Sans podium"]]

export function JournalForm({ uid, ctx, onDone, onCancel, edit, prefill }: { uid: string; ctx: UzuContext | null; onDone: (msg: string, savedId?: string) => void; onCancel: () => void; edit?: { kind: "s" | "c"; id: string } | null; prefill?: { date: string; note: string; type: string } | null }) {
  const C = useMemo(() => newCore(), [])
  const today = C.ymd(C.TODAY) as string
  const [mode, setMode] = useState<"session" | "comp">("session")
  const [f, setF] = useState<Any>(() => { const b = C.blankForm(); if (prefill?.type === "Gi" || prefill?.type === "No-gi") b.type = prefill.type; return b })
  // Pré-remplissage depuis « Cours du groupe » : date et rappel du thème, l'adhérent complète et enregistre lui-même
  const [date, setDate] = useState(prefill && /^\d{4}-\d{2}-\d{2}$/.test(prefill.date) && prefill.date <= today ? prefill.date : today)
  const [note, setNote] = useState(prefill?.note || "")
  const [exos, setExos] = useState("")
  const [cuName, setCuName] = useState("")
  const [cuProf, setCuProf] = useState("flexible")
  const [cf, setCf] = useState<CompForm>({ type: "Gi", result: "aucun", wins: 0, losses: 0, subs: 0 })
  const [cDate, setCDate] = useState(today)
  const [cEvent, setCEvent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [partners, setPartners] = useState<string[]>([])
  const [existingP, setExistingP] = useState<Partner[]>([])
  const club = !!ctx?.club

  const [loaded, setLoaded] = useState(!edit)
  // Modification : le formulaire reprend l'enregistrement existant (comme l'ancienne application)
  useEffect(() => {
    if (!edit) return
    let live = true
    setMode(edit.kind === "s" ? "session" : "comp")
    loadEntry(uid, ctx, edit.kind, edit.id).then(r => {
      if (!live) return
      if (!r) { setError("Enregistrement introuvable"); setLoaded(true); return }
      if (edit.kind === "s") {
        const p = formFromSession(r.core, r.entry); setF(p.form); setNote(p.note); setExos(p.exos); setDate(r.entry.date)
        if (ctx?.club) mySessionPartners(r.entry.date).then(m => { if (!live) return; const l = (m[edit.id] || []); setExistingP(l); setPartners(l.filter(x => x.status !== "declined").map(x => x.user_id)) })
      }
      else { const c = r.entry; setCf({ type: c.type, result: c.result, wins: c.wins || 0, losses: c.losses || 0, subs: c.subs || 0 }); setCEvent(c.event || ""); setCDate(c.date) }
      setLoaded(true)
    }, e => { if (live) { setError((e as Error).message); setLoaded(true) } })
    return () => { live = false }
  }, [edit?.kind, edit?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const up = (patch: Any) => setF((x: Any) => ({ ...x, ...patch }))
  const prepa = f.cat === "prepa", open = !prepa && f.kind === "open"
  const sysKeys: string[] = ["lutte", "controle", "jambes", "fond"]
  const items: string[] = f.sys ? C.SYSTEMS[f.sys].items : []
  const encyclo: Any[] = C.TECHNIQUES as Any[]
  const curBlock = f.tech || f.sys ? { sys: f.sys || "", flow: f.flow || "", tech: f.tech || "" } : null
  const blockName = (b: Any) => C.blockName(b) + (b.flow === "impose" ? " · imposé" : b.flow === "subi" ? " · subi" : "")

  const addBlock = () => {
    if (!curBlock) return
    if (f.blocks.length >= 8 || f.blocks.some((b: Any) => C.sameBlock(b, curBlock))) { up({ sys: "", flow: "", tech: "" }); return }
    up({ blocks: [...f.blocks, curBlock], sys: "", flow: "", tech: "" })
  }
  const pickTech = (name: string) => {
    if (!name) { up({ tech: "" }); return }
    up({ tech: f.tech === name ? "" : name, sys: C.sysOfTech(name) || f.sys })
  }
  const addSub = (t: string) => {
    const subs = f.subs.map((x: Any) => ({ ...x }))
    const ex = subs.find((x: Any) => x.t === t && x.d === f.subDir)
    if (ex) ex.n = Math.min(C.SUB_MAX, ex.n + 1); else subs.push({ t, d: f.subDir, n: 1 })
    up({ subs })
  }
  const addGm = (cat: "sweeps" | "passes", id: string) => {
    const key = `${cat}_${f.gmDir}`
    const gm = JSON.parse(JSON.stringify(f.gm))
    gm[key][id] = Math.min(C.GM_MAX, (gm[key][id] || 0) + 1)
    up({ gm })
  }
  const gmRows = () => Object.keys(C.GM_FIELDS).flatMap(k => Object.keys(f.gm[k] || {}).map(id => ({ k, id, n: f.gm[k][id] })))
  const addCustom = () => {
    const n = cuName.trim().replace(/\s+/g, " ").slice(0, 60)
    if (!n || f.customs.length >= C.CUSTOM_MAX) return
    if (!f.customs.some((x: Any) => x.n.toLowerCase() === n.toLowerCase() && x.p === cuProf)) up({ customs: [...f.customs, { n, p: cuProf }] })
    setCuName("")
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError("")
    if (mode === "session") {
      const inp = { date, note, exos, cuName, cuProf }
      const r = edit ? await updateSession(uid, ctx, edit.id, JSON.parse(JSON.stringify(f)), inp) : await addSession(uid, ctx, JSON.parse(JSON.stringify(f)), inp)
      if (!r.ok) { setBusy(false); setError(r.msg); return }
      const hurt = f.forme === "douleur"
      // Partenaires : envoyés au serveur après l'enregistrement (notification et confirmation)
      let pNote = ""
      const key = edit ? edit.id : String(r.item?.id || "")
      if (club && key && (partners.length || existingP.length)) {
        const pr = await setSessionPartners(key, date, r.item ? sessionSummary(C, r.item) : "", partners)
        if (!pr.ok) pNote = " Partenaires non envoyés : " + pr.msg
        else if (pr.data.length < partners.length) pNote = " Certains partenaires n'ont pas pu être identifiés (réglage de leur profil)."
      }
      setBusy(false)
      onDone((!r.synced ? "Séance enregistrée sur ce téléphone. Elle sera synchronisée dès le retour du réseau."
        : edit ? "Séance modifiée" : hurt ? "Séance enregistrée. Ménage-toi si la douleur persiste." : "Séance enregistrée") + pNote, edit ? "" : key)
    } else {
      const r = edit ? await updateComp(uid, ctx, edit.id, cf, { date: cDate, event: cEvent }) : await addComp(uid, ctx, cf, { date: cDate, event: cEvent })
      setBusy(false)
      if (!r.ok) { setError(r.msg); return }
      onDone(r.synced ? (edit ? "Compétition modifiée" : "Compétition enregistrée") : "Compétition enregistrée sur ce téléphone. Elle sera synchronisée dès le retour du réseau.")
    }
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">{edit ? "MODIFICATION" : mode === "session" ? "APRÈS LE COURS" : "APRÈS LA COMPÉTITION"}</div><h1>{edit ? (mode === "session" ? "Modifier la séance" : "Modifier la compétition") : mode === "session" ? "Ta séance" : "Ton résultat"}<span className="heading-period">.</span></h1><p>{mode === "session" ? "Quelques touches suffisent : tout le reste est facultatif." : "Chaque combat compte dans ta progression."}</p></div>
      <button className="button button--outline" type="button" onClick={onCancel}><X size={16} />Fermer</button></div>
    {!edit && <div className="subnav"><div className="subnav-tabs">
      <button type="button" className={mode === "session" ? "active" : ""} onClick={() => setMode("session")}>Séance</button>
      <button type="button" className={mode === "comp" ? "active" : ""} onClick={() => setMode("comp")}>Compétition</button>
    </div></div>}
    {!loaded && <div className="uzu-banner" aria-busy="true">Chargement de l'enregistrement…</div>}

    <form className="uzu-journal" onSubmit={submit} noValidate>
      {mode === "session" ? <>
        <VoiceBox submitLabel={edit ? "Enregistrer les modifications" : "Enregistrer la séance"} onText={text => { const before = { f, note, exos }; const r = voiceApply(C, f, note, exos, text); setF(r.form); setNote(r.note); setExos(r.exos); return { out: r.out, undo: () => { setF(before.f); setNote(before.note); setExos(before.exos) } } }} />
        <section className="panel uzu-fs">
          <Field label="Type de séance"><Seg label="Type de séance" value={f.cat} options={[["jjb", "JJB / Lutte"], ["prepa", "Prépa physique"]]} onChange={v => up({ cat: v })} /></Field>
          {!prepa && <Field label="Type d'entraînement" hint={C.KINDS[f.kind]?.d}>
            <div className="uzu-chips">{(["cours", "open", "compet", "prive"] as const).map(k => <button key={k} type="button" className={f.kind === k ? "on" : ""} aria-pressed={f.kind === k} onClick={() => up({ kind: k })}>{C.KINDS[k].n}</button>)}</div></Field>}
          <div className="uzu-row2">
            <Field label="Date"><input className="uzu-input" type="date" value={date} max={today} onChange={e => setDate(e.target.value)} /></Field>
            {!prepa && <Field label="Tenue"><Seg label="Tenue" value={f.type} options={[["Gi", "Gi"], ["No-gi", "No-gi"]]} onChange={v => up({ type: v })} /></Field>}
          </div>
          <Field label="Durée"><Seg label="Durée" value={f.dur} options={DURS} onChange={v => up({ dur: v })} /></Field>
        </section>

        {!prepa && <section className="panel uzu-fs">
          <h2 className="uzu-h3">{open ? "Systèmes travaillés" : "Système et technique"}</h2>
          <Field label="Système travaillé">
            <div className="uzu-chips">{sysKeys.map(k => <button key={k} type="button" className={f.sys === k ? "on" : ""} aria-pressed={f.sys === k} onClick={() => up({ sys: f.sys === k ? "" : k, tech: f.sys === k ? "" : (C.sysOfTech(f.tech) === k ? f.tech : "") })}>{C.SYSTEMS[k].n}</button>)}</div>
            <Seg label="Imposé ou subi" value={f.flow} options={[["impose", "Je l'ai imposé"], ["subi", "Je l'ai subi"]]} onChange={v => up({ flow: f.flow === v ? "" : v })} />
          </Field>
          {!open && <>
            {f.sys && <Field label="Technique travaillée (facultatif)"><div className="uzu-chips">{items.map(t => <button key={t} type="button" className={f.tech === t ? "on" : ""} aria-pressed={f.tech === t} onClick={() => pickTech(t)}>{t}</button>)}</div></Field>}
            {(!f.sys || f.sys === "fond" || f.sys === "controle") && <Field label="Ou un renversement / passage de garde précis">
              <select className="uzu-input" value={encyclo.some(t => t.nom === f.tech) ? f.tech : ""} onChange={e => pickTech(e.target.value)} aria-label="Technique précise">
                <option value="">Choisir…</option>
                {Object.keys(C.TECH_CATS).map(cat => <optgroup key={cat} label={C.TECH_CATS[cat].pl}>{encyclo.filter(t => t.categorie === cat).map(t => <option key={t.id} value={t.nom}>{t.nom} · {t.niveau}</option>)}</optgroup>)}
              </select></Field>}
          </>}
          {(f.blocks.length > 0 || curBlock) && <Field label="Cette séance">
            <ul className="uzu-list">{f.blocks.map((b: Any, i: number) => <li key={i}><span><b>{i + 1}.</b> {blockName(b)}</span><button type="button" aria-label="Retirer" onClick={() => up({ blocks: f.blocks.filter((_: Any, j: number) => j !== i) })}><Trash2 size={15} /></button></li>)}
              {curBlock && <li className="current"><span><b>{f.blocks.length + 1}.</b> {blockName(curBlock)}</span><small>en cours</small></li>}</ul>
            {curBlock && f.blocks.length < 7 && <button type="button" className="button button--outline uzu-small-btn" onClick={addBlock}><Plus size={14} />Valider et ajouter un autre système ou une technique</button>}
          </Field>}
        </section>}

        {!prepa && <section className="panel uzu-fs">
          <h2 className="uzu-h3">Sparring</h2>
          <Stepper label="Rounds" value={f.rounds} onChange={v => up({ rounds: v })} />
          <Field label="Soumissions" hint="Choisis le sens, puis touche la soumission : chaque touche ajoute 1.">
            <Seg label="Sens de la soumission" value={f.subDir} options={SUBDIRS} onChange={v => up({ subDir: v })} />
            <div className="uzu-chips uzu-chips--small">{(C.SUBMISSIONS as Any[]).map(s => <button key={s.id} type="button" onClick={() => addSub(s.id)}>{s.nom}</button>)}</div>
            {f.subs.length > 0 && <ul className="uzu-list">{f.subs.map((s: Any, i: number) => <li key={i}><span>{C.subName(s.t)} · {C.SUB_DIRS[s.d]} <b>× {s.n}</b></span><button type="button" aria-label="Retirer" onClick={() => up({ subs: f.subs.filter((_: Any, j: number) => j !== i) })}><Trash2 size={15} /></button></li>)}</ul>}
          </Field>
          <div className="uzu-row2">
            <Stepper label="Amenées au sol réussies" value={f.lucha_takedowns_done} onChange={v => up({ lucha_takedowns_done: v })} />
            <Stepper label="Amenées au sol subies" value={f.lucha_takedowns_suffered} onChange={v => up({ lucha_takedowns_suffered: v })} />
          </div>
          <Field label="Renversements et passages de garde" hint="Choisis le sens, puis touche la technique : chaque touche ajoute 1.">
            <Seg label="Sens" value={f.gmDir} options={GMDIRS} onChange={v => up({ gmDir: v })} />
            <span className="uzu-sublabel">{C.GM_CATS.sweeps.n}</span>
            <div className="uzu-chips uzu-chips--small">{(C.GM_TECHS.sweeps as Any[]).map(t => <button key={t.id} type="button" onClick={() => addGm("sweeps", t.id)}>{t.nom}</button>)}</div>
            <span className="uzu-sublabel">{C.GM_CATS.passes.n}</span>
            <div className="uzu-chips uzu-chips--small">{(C.GM_TECHS.passes as Any[]).map(t => <button key={t.id} type="button" onClick={() => addGm("passes", t.id)}>{t.nom}</button>)}</div>
            {gmRows().length > 0 && <ul className="uzu-list">{gmRows().map(r => <li key={r.k + r.id}><span>{C.gmName(r.k.split("_")[0], r.id)} · {r.k.endsWith("placed") ? "placé" : "subi"} <b>× {r.n}</b></span><button type="button" aria-label="Retirer" onClick={() => { const gm = JSON.parse(JSON.stringify(f.gm)); delete gm[r.k][r.id]; up({ gm }) }}><Trash2 size={15} /></button></li>)}</ul>}
          </Field>
          <Stepper label="Rétentions de garde validées" value={f.guard_retentions} onChange={v => up({ guard_retentions: v })} />
          <Field label="Technique perso contre un profil d'adversaire (facultatif)">
            <div className="uzu-row2">
              <input className="uzu-input" type="text" maxLength={60} placeholder="Ex. : Passage X" value={cuName} onChange={e => setCuName(e.target.value)} aria-label="Nom de la technique" />
              <select className="uzu-input" value={cuProf} onChange={e => setCuProf(e.target.value)} aria-label="Profil d'adversaire">{Object.keys(C.OPP_PROFILES).map(k => <option key={k} value={k}>{C.OPP_PROFILES[k]}</option>)}</select>
            </div>
            <button type="button" className="button button--outline uzu-small-btn" onClick={addCustom} disabled={!cuName.trim()}><Plus size={14} />Ajouter cette technique</button>
            {f.customs.length > 0 && <ul className="uzu-list">{f.customs.map((c: Any, i: number) => <li key={i}><span>{c.n} · {C.OPP_PROFILES[c.p]}</span><button type="button" aria-label="Retirer" onClick={() => up({ customs: f.customs.filter((_: Any, j: number) => j !== i) })}><Trash2 size={15} /></button></li>)}</ul>}
          </Field>
        </section>}

        {(prepa || f.withPrepa) && <section className="panel uzu-fs">
          <h2 className="uzu-h3">Prépa physique</h2>
          {!prepa && <Field label="Durée de la prépa"><Seg label="Durée de la prépa" value={f.pdur} options={PDURS} onChange={v => up({ pdur: v })} /></Field>}
          <Field label="Type d'effort"><Seg label="Type d'effort" value={f.effort} options={[["force", "Force"], ["cardio", "Cardio"], ["endurance", "Endurance"]]} onChange={v => up({ effort: v })} /></Field>
          <Field label="Intensité ressentie (RPE 1 à 10)" hint={C.RPE_DESC[f.rpe] || C.RPE_DESC[0]}>
            <div className="uzu-rpe">{Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} type="button" className={f.rpe === n ? "on" : ""} aria-pressed={f.rpe === n} onClick={() => up({ rpe: f.rpe === n ? 0 : n })}>{n}</button>)}</div></Field>
          <Field label="Exercices réalisés" hint="Type d'effort, intensité et exercices sont visibles par ton prof.">
            <textarea className="uzu-input" maxLength={600} rows={3} placeholder="Ex. : squat 5×5, tractions 4×8, 6×400 m" value={exos} onChange={e => setExos(e.target.value)} /></Field>
        </section>}
        {!prepa && <button type="button" className="button button--outline uzu-small-btn uzu-prepa-toggle" aria-pressed={f.withPrepa} onClick={() => up({ withPrepa: !f.withPrepa })}>{f.withPrepa ? <><X size={14} />Retirer le bloc prépa physique</> : <><Plus size={14} />Ajouter un bloc prépa physique</>}</button>}

        {club && <section className="panel uzu-fs"><PartnersField value={partners} onChange={setPartners} existing={existingP} /></section>}
        <section className="panel uzu-fs">
          <Field label="État physique après le cours"><Seg label="État physique" value={f.forme} options={FORMES} onChange={v => up({ forme: f.forme === v ? "" : v })} /></Field>
          <Field label="Note privée (facultatif)" hint="Ton état physique et ta note restent privés : ton prof ne les voit pas.">
            <textarea className="uzu-input" rows={3} placeholder="Ex. : genou sensible, ma guillotine passe quand je monte le coude" value={note} onChange={e => setNote(e.target.value)} /></Field>
        </section>
      </> : <section className="panel uzu-fs">
        <div className="uzu-row2">
          <Field label="Date"><input className="uzu-input" type="date" value={cDate} max={today} onChange={e => setCDate(e.target.value)} /></Field>
          <Field label="Tenue"><Seg label="Tenue" value={cf.type} options={[["Gi", "Gi"], ["No-gi", "No-gi"]]} onChange={v => setCf({ ...cf, type: v })} /></Field>
        </div>
        <Field label="Compétition"><input className="uzu-input" type="text" maxLength={80} placeholder="Ex. : Open de l'Essonne" value={cEvent} onChange={e => setCEvent(e.target.value)} /></Field>
        <Field label="Résultat"><Seg label="Résultat" value={cf.result} options={RESULTS} onChange={v => setCf({ ...cf, result: v })} /></Field>
        <div className="uzu-row3">
          <Stepper label="Victoires" value={cf.wins} onChange={v => setCf({ ...cf, wins: v })} />
          <Stepper label="Défaites" value={cf.losses} onChange={v => setCf({ ...cf, losses: v })} />
          <Stepper label="Gagnés par soumission" value={cf.subs} onChange={v => setCf({ ...cf, subs: v })} />
        </div>
      </section>}

      {error && <div className="uzu-banner uzu-banner--error" role="alert">{error}</div>}
      <div className="uzu-submit-bar">
        <button className="button button--dark uzu-submit-main" type="submit" disabled={busy || !loaded} aria-busy={busy}><Check size={16} />{busy ? "Enregistrement…" : edit ? "Enregistrer les modifications" : mode === "session" ? "Enregistrer la séance" : "Enregistrer la compétition"}</button>
      </div>
    </form>
  </>
}

// ---------------------------------------------------------------- Dictée vocale (même comportement que l'ancienne application)
// Une touche démarre, une touche termine ; les pauses ne coupent pas la dictée (redémarrage automatique,
// arrêt de sécurité après 3 minutes ou 4 silences). Le formulaire n'est rempli qu'à « Terminer la dictée ».
const VOICE_MAX_MS = 180000
function VoiceBox({ onText, submitLabel }: { onText: (t: string) => { out: string[]; undo: () => void }; submitLabel: string }) {
  // « speech » : reconnaissance vocale du navigateur ; « keyboard » : phrase dictée avec le micro du clavier (ou écrite), même analyse.
  const [mode, setMode] = useState<"speech" | "keyboard">("speech")
  const [why, setWhy] = useState("")
  const [typed, setTyped] = useState("")
  const [want, setWant] = useState(false)
  const [live, setLive] = useState("")
  const [res, setRes] = useState<{ said: string; out: string[]; err: string } | null>(null)
  const undoRef = useRef<(() => void) | null>(null)
  const onTextRef = useRef(onText); onTextRef.current = onText
  const st = useRef({ rec: null as Any, on: false, want: false, final: "", sess: "", idle: 0, t0: 0, err: "", heard: false, dog: 0 as Any })
  useEffect(() => {
    const s = voiceSupport()
    if (s !== "ok") { setMode("keyboard"); setWhy(s === "ios-other" ? "Sur iPhone, seul Safari donne accès à la dictée intégrée. Ici, utilise le micro 🎤 de ton clavier : dicte ta phrase dans la case ci-dessous, puis touche « Remplir le formulaire »." : "Ton navigateur ne propose pas la dictée intégrée. Utilise le micro 🎤 de ton clavier : dicte ta phrase dans la case ci-dessous, puis touche « Remplir le formulaire ».") }
  }, [])
  useEffect(() => () => { st.current.want = false; clearTimeout(st.current.dog); try { st.current.rec?.abort() } catch { /* déjà arrêtée */ } }, [])
  const all = () => (st.current.final + " " + st.current.sess).replace(/\s+/g, " ").trim()
  const apply = (t: string, err = "") => { const r = onTextRef.current(t); undoRef.current = r.undo; setRes({ said: t, out: r.out, err }) }
  const finish = () => {
    const s = st.current; clearTimeout(s.dog); s.want = false; s.on = false; s.rec = null; setWant(false)
    const t = s.final.trim(), err = s.err; s.final = ""; s.sess = ""; s.err = ""; setLive("")
    if (t) apply(t, err)
    else if (!s.heard) { setRes(null); setMode("keyboard"); setWhy(err || "La dictée du navigateur ne répond pas sur ce téléphone. Utilise le micro 🎤 de ton clavier : dicte ta phrase dans la case ci-dessous, puis touche « Remplir le formulaire ».") }
    else setRes({ said: "", out: [], err: err || "Je n'ai rien entendu. Réessaie en parlant près du téléphone." })
  }
  const listen = () => {
    const API = voiceApi(), rec = new API(), s = st.current
    s.rec = rec; s.sess = ""
    rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = !/Android/i.test(navigator.userAgent || ""); rec.maxAlternatives = 1
    rec.onstart = () => { s.on = true }
    rec.onresult = (e: Any) => { let t = ""; for (let i = 0; i < e.results.length; i++) t += " " + e.results[i][0].transcript; t = t.replace(/\s+/g, " ").trim(); if (t) { s.sess = t; s.idle = 0; s.heard = true } setLive(all()) }
    rec.onerror = (e: Any) => { const c = e && e.error; if (c === "no-speech" || c === "aborted") return
      s.err = c === "not-allowed" || c === "service-not-allowed" ? "Micro refusé ou dictée indisponible. Autorise le micro pour ce site dans les réglages, ou utilise le micro 🎤 de ton clavier ci-dessous." : c === "network" ? "La dictée a besoin d'une connexion internet." : "La dictée s'est interrompue."
      s.want = false }
    rec.onend = () => { s.on = false; if (s.sess) { s.final = all(); s.sess = "" } else s.idle++
      if (s.want && Date.now() - s.t0 < VOICE_MAX_MS && s.idle < 4) { try { listen(); return } catch { /* on termine */ } }
      finish() }
    rec.start()
  }
  const toggle = () => {
    const s = st.current
    if (!voiceApi()) return
    if (s.want) { s.want = false; setWant(false); clearTimeout(s.dog); if (s.rec && s.on) { try { s.rec.stop() } catch { finish() } ; s.dog = setTimeout(() => { if (s.rec) { try { s.rec.abort() } catch { /* rien */ } finish() } }, 2500) } else finish(); return }
    s.want = true; s.final = ""; s.sess = ""; s.idle = 0; s.err = ""; s.heard = false; s.t0 = Date.now(); setRes(null); setWant(true); setLive("")
    // Garde-fou : certains navigateurs démarrent sans jamais transmettre le son (ex. Chrome sur iPhone)
    clearTimeout(s.dog); s.dog = setTimeout(() => { if (s.want && !s.heard) { s.want = false; try { s.rec?.abort() } catch { /* rien */ } finish() } }, 8000)
    try { listen() } catch { s.err = "La dictée n'a pas pu démarrer."; finish() }
  }
  const resultBox = res && <div className="uzu-note" role="status">
    {res.err && res.said && <p className="uzu-small">{res.err}</p>}
    {res.said && <p className="uzu-voice-live">« {res.said} »</p>}
    {!res.said ? <p>{res.err}</p> : res.out.length ? <><p><b>Rempli automatiquement :</b></p><ul>{res.out.map((t, i) => <li key={i}>{t}</li>)}</ul><p className="uzu-small">Ta phrase est aussi ajoutée à ta note privée. Vérifie puis touche « {submitLabel} ».</p></>
      : <p>Je n'ai rien reconnu de précis. Ta phrase est dans ta note privée : complète le formulaire à la main.</p>}
    {res.said && <button type="button" className="button button--outline uzu-small-btn" onClick={() => { undoRef.current?.(); undoRef.current = null; setRes(null) }}>Annuler la dictée</button>}
  </div>
  if (mode === "keyboard") return <section className="panel uzu-fs uzu-voice">
    <span className="uzu-label"><Mic size={14} /> Raconter ma séance</span>
    {why && <small className="uzu-hint">{why}</small>}
    <textarea className="uzu-input" rows={3} aria-label="Ta séance en une phrase" placeholder="Ex. : 1 h 30 en gi, 5 rounds, deux triangles placés, une guillotine subie contre une bleue, un peu fatigué." value={typed} onChange={e => setTyped(e.target.value)} />
    <button type="button" className="button button--dark uzu-wide" disabled={!typed.trim()} onClick={() => { const t = typed.trim(); if (!t) return; setTyped(""); apply(t) }}>Remplir le formulaire</button>
    {voiceSupport() === "ok" && <button type="button" className="text-link uzu-small" onClick={() => { setMode("speech"); setWhy(""); setRes(null) }}>Réessayer la dictée intégrée</button>}
    {resultBox}
  </section>
  return <section className="panel uzu-fs uzu-voice">
    <button type="button" className={`button ${want ? "button--dark uzu-rec" : "button--outline"} uzu-wide`} aria-pressed={want} onClick={toggle}><Mic size={16} />{want ? "Terminer la dictée" : "Raconter ma séance à l'oral"}</button>
    {!want && !res && <small className="uzu-hint">Ex. : « 1 h 30 en gi, 5 rounds, deux triangles placés, une guillotine subie contre une bleue, un peu fatigué. »</small>}
    {want && <p className="uzu-text uzu-voice-live" aria-live="polite">{live ? live + " " : ""}<em>{live ? "… continue, ou touche « Terminer la dictée »" : "Parle maintenant. Tu peux faire des pauses : touche « Terminer la dictée » quand tu as fini."}</em></p>}
    {resultBox}
    {!want && <button type="button" className="text-link uzu-small" onClick={() => { setMode("keyboard"); setWhy(""); setRes(null) }}>Plutôt dicter avec le micro du clavier</button>}
  </section>
}
