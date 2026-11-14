"use client"
// Espace Athlete — Techniques (parcours, systèmes, encyclopédie, ceinture) et Progression.
// Tous les calculs viennent de l'ancienne application (legacy-core) : mêmes pourcentages, mêmes ratios.
import { useEffect, useMemo, useState } from "react"
import { Award, ChevronDown, Dumbbell, Flame, Medal, Scale, Target, TrendingUp } from "lucide-react"
import type { UzuContext } from "@/lib/uzu/context"
import { declareBelt, loadCore } from "@/lib/uzu/journal"
import { beltColor, normSched } from "@/lib/uzu/training"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
type Loaded = { core: Any; role: "teacher" | "student" | "solo"; hydrated: boolean; pending: boolean; grade: Any; state: Any; S: Any[]; P: Any }

function useCore(uid: string, ctx: UzuContext | null) {
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState("")
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!ctx) return
    let live = true
    loadCore(uid, ctx).then(r => {
      if (!live) return
      const st = r.core.__get("state")
      setData({ ...r, state: st, S: r.core.allSessions(), P: r.core.me() })
    }, e => { if (live) setError((e as Error).message) })
    return () => { live = false }
  }, [uid, ctx, tick])
  return { data, error, reload: () => setTick(t => t + 1) }
}

function Eyebrow({ children }: { children: React.ReactNode }) { return <div className="eyebrow">{children}</div> }
function Loading({ error, onRetry }: { error: string; onRetry: () => void }) {
  if (error) return <div className="uzu-banner uzu-banner--error" role="alert">Lecture impossible : {error} <button className="text-link" onClick={onRetry}>Réessayer</button></div>
  return <div className="uzu-banner" aria-busy="true">Chargement…</div>
}
function Stars({ lvl, review }: { lvl: number; review?: boolean }) {
  return <span className="uzu-stars" aria-label={`${lvl} étoile${lvl > 1 ? "s" : ""} sur 3${review ? ", à réviser" : ""}`}>
    {[1, 2, 3].map(i => <i key={i} className={i <= lvl ? "on" : ""}>★</i>)}{review && <em>À réviser</em>}</span>
}
export function BeltMark({ rank, stripes, size = 44 }: { rank: string; stripes: number; size?: number }) {
  const bar = rank === "noire" ? "#C8102E" : "#151515"
  return <span className="uzu-belt" style={{ width: size, height: Math.max(10, Math.round(size * 0.27)) }} aria-hidden="true">
    <span style={{ background: beltColor(rank) }} />
    <span className="uzu-belt-bar" style={{ background: bar }}>{[0, 1, 2, 3].map(i => <i key={i} className={i < stripes ? "on" : ""} />)}</span>
  </span>
}
function Bar({ a, b, la, lb }: { a: number; b: number; la: string; lb: string }) {
  const t = a + b
  return <div className="uzu-duo"><div className="uzu-duo-track"><span className="a" style={{ width: `${t ? a / t * 100 : 0}%` }} /><span className="b" style={{ width: `${t ? b / t * 100 : 0}%` }} /></div>
    <div className="uzu-duo-legend"><span><i className="a" />{la} <b>{a}</b></span><span><i className="b" />{lb} <b>{b}</b></span></div></div>
}
function TopList({ rows, empty }: { rows: [string, number][]; empty: string }) {
  if (!rows.length) return <p className="uzu-text uzu-muted">{empty}</p>
  return <ul className="uzu-top">{rows.map(([n, v]) => <li key={n}><span>{n}</span><b>{v}</b></li>)}</ul>
}

// ---------------------------------------------------------------- Techniques
export function AthleteTechniques({ uid, ctx }: { uid: string; ctx: UzuContext | null }) {
  const { data, error, reload } = useCore(uid, ctx)
  const [beltForm, setBeltForm] = useState(false)
  if (!data) return <><Heading kind="path" /><Loading error={error} onRetry={reload} /></>
  const C = data.core, st = data.state, b = st.belt, ci = C.BELTS.findIndex((x: Any) => x.k === b.rank)
  const ss = C.sysStats(data.P)
  const gsy = C.gmSysSum(data.S, C.ymd(C.addDays(C.TODAY, -30)))
  const solo = C.isSolo(), team = data.role === "teacher"
  const pending = !team && !solo && C.isPending(st.request, data.grade)
  const refused = !team && !solo && data.grade && data.grade.decidedAt && data.grade.status === "refusé" && st.request && data.grade.decidedAt >= st.request.at
  const direct = team || solo
  const focus = [ (ctx?.club?.tactical_focus as Any)?.focusFrom, (ctx?.club?.tactical_focus as Any)?.focusTo ]
  return <>
    <Heading kind="path" />
    <section className="panel uzu-belt-card">
      <div className="uzu-belt-head"><BeltMark rank={b.rank} stripes={b.stripes} size={96} />
        <div><Eyebrow>{direct ? "CEINTURE DÉCLARÉE" : "CEINTURE VALIDÉE PAR TON PROF"}</Eyebrow><h2 className="uzu-h2">{C.beltLabel(b)}</h2>
          <p className="uzu-text">{C.stripesTxt(b.stripes)} · {b.since ? "depuis le " + C.frDate(b.since) : "date de passage à renseigner"}</p></div></div>
      <p className={`uzu-note ${pending ? "wait" : team ? "ok" : ""}`}>{solo ? "Carnet solo : ta ceinture est déclarée par toi. Rejoins un club pour la faire valider par ton prof."
        : team ? "Tu fais partie de l'équipe : ta ceinture est mise à jour directement."
        : pending ? `Demande envoyée : ${C.beltLabel(st.request)}, ${C.stripesTxt(st.request.stripes)}. En attente de validation par ton prof.`
        : refused ? "Ton prof n'a pas validé ta dernière demande. Parles-en avec lui au prochain cours."
        : "Ta ceinture est validée par ton prof. Déclare un nouveau grade quand tu le reçois."}</p>
      {beltForm ? <BeltForm C={C} init={pending ? st.request : b} direct={direct} onCancel={() => setBeltForm(false)} onSave={async nb => { const r = await declareBelt(uid, ctx, nb); if (r.ok) { setBeltForm(false); reload() } return r.ok ? "" : r.msg }} />
        : <button className="button button--outline" onClick={() => setBeltForm(true)}><Award size={15} />{direct ? "Mettre à jour ma ceinture" : "Déclarer ma ceinture"}</button>}
      <ol className="uzu-ladder">{C.BELTS.map((x: Any, i: number) => <li key={x.k} className={i > ci ? "future" : ""}>
        <BeltMark rank={x.k} stripes={i === ci ? b.stripes : i < ci ? 4 : 0} size={48} />
        <div><b>Ceinture {x.n}</b><small>{x.p}</small></div>
        <span className={`uzu-pill ${i < ci ? "done" : i === ci ? "now" : ""}`}>{i < ci ? "Validée" : i === ci ? "En cours" : "À venir"}</span></li>)}</ol>
    </section>

    <div className="section-title uzu-section"><h2>Tes systèmes</h2><span className="uzu-muted uzu-small">Maîtrise moyenne {ss.avg} %</span></div>
    <div className="uzu-systems">{C.SYS_KEYS.map((k: string) => {
      const x = ss[k], it: string[] = C.SYSTEMS[k].items
      return <details key={k} className="panel uzu-sys" open={focus.includes(k)}>
        <summary><span className={`uzu-dot sd-${k}`} /><b>{C.SYSTEMS[k].n}</b><span className="uzu-pct">{x.pct} %</span><ChevronDown size={16} /></summary>
        <p className="uzu-text">{C.SYSTEMS[k].s}</p>
        <div className="progress-track"><i style={{ width: `${x.pct}%` }} /></div>
        <p className="uzu-text uzu-small">En sparring sur 30 jours : imposé <b>{x.imp}</b> · subi <b>{x.sub}</b><br />Passages et renversements sur 30 jours : placés <b>{gsy[k].placed}</b> · subis <b>{gsy[k].suffered}</b></p>
        <ul className="uzu-skill-list">{it.map(t => { const i = C.skillInfo(data.P, t); return <li key={t}><span>{t}</span><Stars lvl={i.lvl} review={i.review} /></li> })}</ul>
      </details>
    })}</div>

    <div className="section-title uzu-section"><h2>Encyclopédie technique</h2></div>
    {Object.keys(C.TECH_CATS).map(cat => <section key={cat} className="panel uzu-ency">
      <h3 className="uzu-h3">{C.TECH_CATS[cat].pl}</h3>
      <ul className="uzu-skill-list">{(C.TECHNIQUES as Any[]).filter(t => t.categorie === cat).map(t => { const i = C.skillInfo(data.P, t.nom); return <li key={t.id}>
        <span><b>{t.nom}</b><small>{t.position_depart} → {t.position_arrivee} · {t.niveau}</small></span><Stars lvl={i.lvl} review={i.review} /></li> })}</ul>
    </section>)}
    <p className="uzu-text uzu-small uzu-muted">★ Découverte : ajoutée en saisissant une séance. ★★ Confirmée par un partenaire. ★★★ Maîtrisée : {solo ? "réservée aux profs de club." : "attribuée par ton prof, définitive."} Sans pratique pendant {C.REVIEW_DAYS} jours, une ★ ou ★★ passe « À réviser ».</p>
  </>
}

function BeltForm({ C, init, direct, onCancel, onSave }: { C: Any; init: Any; direct: boolean; onCancel: () => void; onSave: (nb: { rank: string; stripes: number; since: string }) => Promise<string> }) {
  const [rank, setRank] = useState<string>(init.rank)
  const [stripes, setStripes] = useState<number>(init.stripes || 0)
  const [since, setSince] = useState<string>(init.since || C.ymd(C.TODAY))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  return <form className="uzu-belt-form" onSubmit={async e => { e.preventDefault(); setBusy(true); const m = await onSave({ rank, stripes, since }); setBusy(false); setErr(m) }}>
    <div className="uzu-row2">
      <label className="uzu-field"><span className="uzu-label">Ceinture</span><select className="uzu-input" value={rank} onChange={e => setRank(e.target.value)}>{C.BELTS.map((x: Any) => <option key={x.k} value={x.k}>Ceinture {x.n}</option>)}</select></label>
      <label className="uzu-field"><span className="uzu-label">Date de passage</span><input className="uzu-input" type="date" value={since} max={C.ymd(C.TODAY)} onChange={e => setSince(e.target.value)} /></label>
    </div>
    <div className="uzu-field"><span className="uzu-label">Barrettes</span><div className="uzu-seg">{[0, 1, 2, 3, 4].map(n => <button key={n} type="button" className={stripes === n ? "on" : ""} aria-pressed={stripes === n} onClick={() => setStripes(n)}>{n}</button>)}</div></div>
    {err && <div className="uzu-banner uzu-banner--error" role="alert">{err}</div>}
    <div className="uzu-actions"><button className="button button--outline" type="button" onClick={onCancel}>Annuler</button>
      <button className="button button--dark" type="submit" disabled={busy}>{busy ? "Envoi…" : direct ? "Enregistrer ma ceinture" : "Envoyer à mon prof pour validation"}</button></div>
  </form>
}

function Heading({ kind }: { kind: "path" | "prog" }) {
  return <div className="page-heading"><div>
    <Eyebrow>{kind === "path" ? "TON PARCOURS" : "THE MAT DOESN'T LIE"}</Eyebrow>
    <h1>{kind === "path" ? "Techniques" : "Progression"}<span className="heading-period">.</span></h1>
    <p>{kind === "path" ? "Un socle de fondamentaux et trois systèmes connectés : tu progresses en montant ta maîtrise de ★ à ★★★." : "Tes chiffres, à niveau égal, sans tricher."}</p>
  </div></div>
}

// ---------------------------------------------------------------- Progression
export function AthleteProgress({ uid, ctx }: { uid: string; ctx: UzuContext | null }) {
  const { data, error, reload } = useCore(uid, ctx)
  const view = useMemo(() => {
    if (!data) return null
    const C = data.core, S = data.S, st = data.state, b = st.belt
    const since = b.since, nb = since ? S.filter((s: Any) => s.date >= since).length : null
    const pl = S.reduce((a: number, s: Any) => a + (s.placed || 0), 0), tk = S.reduce((a: number, s: Any) => a + C.tw(s), 0), tkG = S.reduce((a: number, s: Any) => a + C.tg(s), 0)
    const act = C.actStats(S), sb = C.subStats(S), gs = C.gmStats(S), SL = C.skillList(data.P), pst = C.prepaStats(S)
    const lim30 = C.ymd(C.addDays(C.TODAY, -30)), fc: Record<string, number> = { ok: 0, fatigue: 0, douleur: 0 }
    S.forEach((s: Any) => { if (s.date > lim30 && fc[s.forme] !== undefined) fc[s.forme]++ })
    const lastPain = S.filter((s: Any) => s.forme === "douleur").sort((a: Any, c: Any) => (a.date < c.date ? 1 : -1))[0]
    const top = (m: Record<string, number>, name: (k: string) => string): [string, number][] => Object.keys(m).sort((a, c) => m[c] - m[a] || name(a).localeCompare(name(c), "fr")).slice(0, 5).map(k => [name(k), m[k]])
    // Assiduité (même calcul que l'ancienne application)
    const sch = normSched(ctx?.club?.schedule), solo = C.isSolo()
    let tot = 0, pr = 0
    for (let k = 0; k < 30; k++) {
      const dd = C.addDays(C.TODAY, -k), dS = C.ymd(dd), dn = ((dd.getDay() + 6) % 7) + 1
      sch.forEach(x => { if (x.d !== dn) return; tot++; const a = st.att[dS + "|" + x.id]; if (a === "oui" || (a !== "non" && S.some((s: Any) => s.date === dS && !C.isPrepa(s)))) pr++ })
    }
    const n30s = C.mat(S).filter((s: Any) => s.date > lim30).length
    // 8 dernières semaines
    const start = C.addDays(C.weekStart(C.TODAY), -49), cnt = Array(8).fill(0)
    S.forEach((s: Any) => { const idx = Math.round((C.weekStart(C.parse(s.date)) - start) / (7 * 864e5)); if (idx >= 0 && idx < 8) cnt[idx]++ })
    const customs: Record<string, Record<string, number>> = {}
    C.mat(S).forEach((x: Any) => C.normCustoms(x.customs).forEach((c: Any) => { const g = customs[c.p] || (customs[c.p] = {}); g[c.n] = (g[c.n] || 0) + 1 }))
    const comps = st.comps.slice().sort((a: Any, c: Any) => (a.date < c.date ? 1 : -1))
    const med: Record<string, number> = { or: 0, argent: 0, bronze: 0 }; let w = 0, l = 0, su = 0
    comps.forEach((c: Any) => { if (med[c.result] !== undefined) med[c.result]++; w += c.wins || 0; l += c.losses || 0; su += c.subs || 0 })
    return { C, S, b, since, nb, pl, tk, tkG, act, sb, gs, SL, pst, fc, lastPain, top, tot, pr, n30s, solo, cnt, start, customs, comps, med, w, l, su, avg: C.sysStats(data.P).avg }
  }, [data, ctx])
  if (!data || !view) return <><Heading kind="prog" /><Loading error={error} onRetry={reload} /></>
  const v = view, C = v.C
  const max = Math.max(4, ...v.cnt)
  const n3 = v.SL.filter((i: Any) => i.lvl === 3).length, n2 = v.SL.filter((i: Any) => i.lvl === 2).length, nr = v.SL.filter((i: Any) => i.review).length
  const RESULT: Record<string, string> = { or: "Or", argent: "Argent", bronze: "Bronze", aucun: "Sans podium" }
  return <>
    <Heading kind="prog" />
    <div className="metric-grid">
      <article className="metric-card"><div className="metric-top"><span>Séances au total</span><span className="metric-icon"><Dumbbell size={16} /></span></div><div className="metric-main"><strong>{v.S.length}</strong><span>séance{v.S.length > 1 ? "s" : ""}</span></div><div className="metric-footer"><span className="uzu-caption">{v.since ? `${v.nb} depuis ton passage` : "date de passage à renseigner"}</span></div></article>
      <article className="metric-card"><div className="metric-top"><span>Maîtrise des systèmes</span><span className="metric-icon"><Target size={16} /></span></div><div className="metric-main"><strong>{v.avg}</strong><span>%</span></div><div className="metric-footer"><span className="uzu-caption">moyenne des 4 systèmes</span></div></article>
      <article className="metric-card"><div className="metric-top"><span>Ratio à niveau égal</span><span className="metric-icon"><Scale size={16} /></span></div><div className="metric-main"><strong>{v.pl}/{v.tk}</strong></div><div className="metric-footer"><span className="uzu-caption">placées / subies contre des blanches</span></div></article>
      <article className="rank-card"><div className="rank-top"><span>CEINTURE</span><Award size={17} /></div><div className="rank-body"><BeltMark rank={v.b.rank} stripes={v.b.stripes} /><div><strong>{C.beltLabel(v.b)}</strong><small>{C.stripesTxt(v.b.stripes)}{v.since ? ` · depuis ${C.duration(v.since)}` : ""}</small></div></div></article>
    </div>

    <section className="panel uzu-chart-panel">
      <div className="panel-header"><div className="section-title"><h2>Séances par semaine</h2></div><span className="uzu-muted uzu-small">8 dernières semaines</span></div>
      <div className="bar-chart" role="img" aria-label={`Séances par semaine : ${v.cnt.join(", ")}`}>{v.cnt.map((c: number, i: number) => {
        const ws = C.addDays(v.start, i * 7)
        return <div key={i} className={`bar-group ${i === 7 ? "bar-group--today" : ""}`}><i style={{ height: `${c / max * 100}%` }} /><span>{ws.getDate()}/{ws.getMonth() + 1}</span><small>{c || ""}</small></div>
      })}</div>
    </section>

    <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Soumissions</h2></div>
        <Bar a={v.pl} b={v.tk} la="Placées" lb="Subies (blanches)" />
        <p className="uzu-text uzu-small">{v.tkG ? `${v.tkG} soumission${v.tkG > 1 ? "s" : ""} subie${v.tkG > 1 ? "s" : ""} contre des gradés. Elles ne comptent pas dans ton ratio : chaque tap contre plus fort que toi est une leçon.` : "Aucune soumission subie contre un gradé pour l'instant. Roule avec eux : c'est en tapant contre plus fort que toi qu'on progresse le plus vite."}</p>
        <div className="uzu-row2"><div><span className="uzu-sublabel">Mes armes</span><TopList rows={v.top(v.sb.placee, C.subName)} empty="Aucune pour l'instant." /></div>
          <div><span className="uzu-sublabel">Mes failles</span><TopList rows={v.top(v.sb.subie, C.subName)} empty="Aucune pour l'instant." /></div></div>
      </section>
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Lutte et garde</h2></div>
        <span className="uzu-sublabel">Amenées au sol {v.act.tdTot ? `· ${v.act.tdPct} % réussies` : "· pas encore de données"}</span>
        <Bar a={v.act.lucha_takedowns_done} b={v.act.lucha_takedowns_suffered} la="Réussies" lb="Subies" />
        <span className="uzu-sublabel">Efficacité de garde {v.act.guardTot ? `· ${v.act.guardPct} %` : "· pas encore de données"}</span>
        <Bar a={v.act.guard_retentions + v.act.sweeps_done} b={v.act.guard_passes_suffered} la="Rétentions + renversements" lb="Passages subis" />
        <div className="uzu-row2"><div><span className="uzu-sublabel">Placés</span><TopList rows={v.top(v.gs.placed, (k: string) => { const p = k.split(":"); return C.gmName(p[0], p[1]) })} empty="Aucun pour l'instant." /></div>
          <div><span className="uzu-sublabel">Subis</span><TopList rows={v.top(v.gs.suffered, (k: string) => { const p = k.split(":"); return C.gmName(p[0], p[1]) })} empty="Aucun pour l'instant." /></div></div>
      </section>
    </div>

    <section className="panel uzu-panel-col uzu-grid-gap">
      <div className="section-title"><h2>Mes techniques</h2></div>
      <p className="uzu-text uzu-small">{v.SL.length ? `${v.SL.length} technique${v.SL.length > 1 ? "s" : ""} dans ton carnet · ${v.solo ? "" : n3 + " à ★★★ · "}${n2} à ★★${nr ? " · " + nr + " à réviser" : ""}` : "Choisis une technique quand tu saisis une séance : elle entre dans ton carnet à ★ Découverte."}</p>
      {v.SL.length > 0 && <ul className="uzu-skill-list">{v.SL.slice(0, 40).map((i: Any) => <li key={i.name}><span><b>{i.name}</b><small>{C.skillMeta(i)}</small></span><Stars lvl={i.lvl} review={i.review} /></li>)}</ul>}
      {Object.keys(v.customs).length > 0 && <><span className="uzu-sublabel">Techniques perso par profil d'adversaire</span>
        {Object.keys(C.OPP_PROFILES).filter(p => v.customs[p]).map(p => <div key={p}><b className="uzu-small">{C.OPP_PROFILES[p]}</b><TopList rows={Object.keys(v.customs[p]).sort((a, c) => v.customs[p][c] - v.customs[p][a] || a.localeCompare(c, "fr")).map(n => [n, v.customs[p][n]] as [string, number])} empty="" /></div>)}</>}
    </section>

    <div className="content-grid uzu-grid-gap">
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Régularité</h2></div>
        <p className="uzu-text">{v.solo ? `${v.n30s} séance${v.n30s > 1 ? "s" : ""} de tapis sur 30 jours, soit ${String(Math.round(v.n30s / 30 * 7 * 10) / 10).replace(".", ",")} par semaine.` : v.tot ? `Tu as participé à ${v.pr} cours sur ${v.tot} (${Math.round(v.pr / v.tot * 100)} %) sur 30 jours.` : "Aucun cours au planning sur cette période."}</p>
        <span className="uzu-sublabel">État physique sur 30 jours (privé)</span>
        <div className="uzu-forme"><span><i className="ok" />En forme <b>{v.fc.ok}</b></span><span><i className="fat" />Fatigué <b>{v.fc.fatigue}</b></span><span><i className="pain" />Douleur <b>{v.fc.douleur}</b></span></div>
        <p className="uzu-text uzu-small">{v.lastPain ? `Dernière douleur signalée le ${C.frDate(v.lastPain.date)}. Parles-en à ton prof si elle persiste.` : (v.fc.ok + v.fc.fatigue ? "Aucune douleur signalée sur la période." : "Indique ton état physique quand tu saisis tes séances.")}</p>
        {v.pst.n > 0 && <><span className="uzu-sublabel"><Flame size={13} /> Prépa physique sur 30 jours</span>
          <p className="uzu-text uzu-small">{v.pst.n} séance{v.pst.n > 1 ? "s" : ""} · {String(Math.round(v.pst.min / 6) / 10).replace(".", ",")} h · RPE moyen {v.pst.rpeN ? String(Math.round(v.pst.rpeSum / v.pst.rpeN * 10) / 10).replace(".", ",") : "–"}<br />{Object.keys(v.pst.mix).map(k => `${k} : ${v.pst.mix[k]}`).join(" · ")}</p></>}
      </section>
      <section className="panel uzu-panel-col"><div className="section-title"><h2>Palmarès</h2><Medal size={17} /></div>
        <div className="uzu-medals"><span className="or"><b>{v.med.or}</b>Or</span><span className="argent"><b>{v.med.argent}</b>Argent</span><span className="bronze"><b>{v.med.bronze}</b>Bronze</span></div>
        <p className="uzu-text uzu-small">{v.comps.length ? `${v.comps.length} compétition${v.comps.length > 1 ? "s" : ""} · ${v.w} victoire${v.w > 1 ? "s" : ""}, ${v.l} défaite${v.l > 1 ? "s" : ""}${v.w + v.l ? ` (${Math.round(v.w / (v.w + v.l) * 100)} % de victoires)` : ""} · ${v.su} par soumission` : "Aucune compétition enregistrée pour l'instant."}</p>
        {v.comps.length > 0 && <ul className="uzu-top">{v.comps.slice(0, 8).map((c: Any) => <li key={c.id}><span>{c.event || "Compétition"}<small>{C.frShort(c.date)} · {c.type} · {c.wins || 0} V / {c.losses || 0} D</small></span><b className={`uzu-res ${c.result}`}>{RESULT[c.result] || c.result}</b></li>)}</ul>}
      </section>
    </div>
    {data.pending && <div className="uzu-banner"><TrendingUp size={14} /> Des saisies de ce téléphone sont en attente d'envoi : elles sont déjà comptées ici.</div>}
  </>
}
