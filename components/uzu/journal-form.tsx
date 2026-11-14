"use client"
// Formulaire de saisie (séance et compétition) au design UZU Athlete.
// Les choix proposés (systèmes, techniques, soumissions, renversements, passages, profils) viennent
// des catalogues de l'ancienne application ; l'enregistrement passe par lib/uzu/journal.ts.
import { useMemo, useState } from "react"
import { Check, Minus, Plus, Trash2, X } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { addComp, addSession, newCore, type CompForm } from "@/lib/uzu/journal"

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

export function JournalForm({ uid, ctx, onDone, onCancel }: { uid: string; ctx: UzuContext | null; onDone: (msg: string) => void; onCancel: () => void }) {
  const C = useMemo(() => newCore(), [])
  const today = C.ymd(C.TODAY) as string
  const [mode, setMode] = useState<"session" | "comp">("session")
  const [f, setF] = useState<Any>(() => C.blankForm())
  const [date, setDate] = useState(today)
  const [note, setNote] = useState("")
  const [exos, setExos] = useState("")
  const [cuName, setCuName] = useState("")
  const [cuProf, setCuProf] = useState("flexible")
  const [cf, setCf] = useState<CompForm>({ type: "Gi", result: "aucun", wins: 0, losses: 0, subs: 0 })
  const [cDate, setCDate] = useState(today)
  const [cEvent, setCEvent] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

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
      const r = await addSession(uid, ctx, JSON.parse(JSON.stringify(f)), { date, note, exos, cuName, cuProf })
      setBusy(false)
      if (!r.ok) { setError(r.msg); return }
      const hurt = f.forme === "douleur"
      onDone(!r.synced ? "Séance enregistrée sur ce téléphone. Elle sera synchronisée dès le retour du réseau."
        : hurt ? "Séance enregistrée. Ménage-toi si la douleur persiste." : "Séance enregistrée")
    } else {
      const r = await addComp(uid, ctx, cf, { date: cDate, event: cEvent })
      setBusy(false)
      if (!r.ok) { setError(r.msg); return }
      onDone(r.synced ? "Compétition enregistrée" : "Compétition enregistrée sur ce téléphone. Elle sera synchronisée dès le retour du réseau.")
    }
  }

  return <>
    <div className="page-heading"><div><div className="eyebrow">{mode === "session" ? "APRÈS LE COURS" : "APRÈS LA COMPÉTITION"}</div><h1>{mode === "session" ? "Ta séance" : "Ton résultat"}<span className="heading-period">.</span></h1><p>{mode === "session" ? "Quelques touches suffisent : tout le reste est facultatif." : "Chaque combat compte dans ta progression."}</p></div>
      <button className="button button--outline" type="button" onClick={onCancel}><X size={16} />Fermer</button></div>
    <div className="subnav"><div className="subnav-tabs">
      <button type="button" className={mode === "session" ? "active" : ""} onClick={() => setMode("session")}>Séance</button>
      <button type="button" className={mode === "comp" ? "active" : ""} onClick={() => setMode("comp")}>Compétition</button>
    </div></div>

    <form className="uzu-journal" onSubmit={submit} noValidate>
      {mode === "session" ? <>
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
        <button className="button button--dark uzu-submit-main" type="submit" disabled={busy} aria-busy={busy}><Check size={16} />{busy ? "Enregistrement…" : mode === "session" ? "Enregistrer la séance" : "Enregistrer la compétition"}</button>
      </div>
    </form>
  </>
}
