"use client"
// Partenaires d'entraînement : choix dans le formulaire de séance, confirmations dans le fil,
// réglage « m'identifier » dans le profil.
import { useEffect, useMemo, useState } from "react"
import { Check, Search, UserPlus, X } from "lucide-react"
import { answerTag, getAllowTag, listCandidates, setAllowTag, tagsForMe, type Candidate, type Partner, type TagForMe } from "@/lib/uzu/partners"

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const STATUS: Record<string, string> = { pending: "en attente", confirmed: "confirmé", declined: "pas confirmé" }

/** Champ du formulaire : partenaires choisis parmi les membres du club. Masqué en carnet solo ou sans fonction serveur. */
export function PartnersField({ value, onChange, existing }: { value: string[]; onChange: (ids: string[]) => void; existing: Partner[] }) {
  const [cands, setCands] = useState<Candidate[] | null | undefined>(undefined)
  const [q, setQ] = useState("")
  useEffect(() => { let live = true; listCandidates().then(c => { if (live) setCands(c) }); return () => { live = false } }, [])
  const byId = useMemo(() => { const m: Record<string, string> = {}; (cands || []).forEach(c => { m[c.user_id] = c.name }); existing.forEach(p => { m[p.user_id] = m[p.user_id] || p.name }); return m }, [cands, existing])
  if (cands === null) return null
  const st = (id: string) => existing.find(p => p.user_id === id)?.status
  const hits = q.trim() ? (cands || []).filter(c => !value.includes(c.user_id) && norm(c.name).includes(norm(q.trim()))).slice(0, 8) : []
  return <div className="uzu-field uzu-partners"><span className="uzu-label">Partenaires d&apos;entraînement (facultatif)</span>
    {value.length > 0 && <div className="uzu-partner-chips">{value.map(id => <span key={id} className="uzu-partner-chip">{byId[id] || "Membre"}{st(id) && <em> · {STATUS[st(id)!]}</em>}
      <button type="button" aria-label={`Retirer ${byId[id] || "ce partenaire"}`} onClick={() => onChange(value.filter(x => x !== id))}><X size={13} /></button></span>)}</div>}
    {value.length < 8 && cands !== undefined && <div className="uzu-partner-search"><Search size={15} aria-hidden="true" />
      <input className="uzu-input" type="search" placeholder={cands && cands.length ? "Cherche un partenaire du club…" : "Aucun membre à identifier pour l'instant"} disabled={!cands || !cands.length} value={q} onChange={e => setQ(e.target.value)} aria-label="Chercher un partenaire du club" /></div>}
    {hits.length > 0 && <ul className="uzu-partner-hits" role="listbox" aria-label="Partenaires trouvés">{hits.map(c => <li key={c.user_id}>
      <button type="button" role="option" aria-selected="false" onClick={() => { onChange([...value, c.user_id]); setQ("") }}><UserPlus size={14} />{c.name}</button></li>)}</ul>}
    {q.trim() && !hits.length && cands && <small className="uzu-hint">Personne de ce nom parmi les membres qui acceptent d&apos;être identifiés.</small>}
    <small className="uzu-hint">Ils reçoivent une notification et confirment d&apos;un geste. Leur nom apparaît sur ta Story.</small>
  </div>
}

/** Fil du club : séances où l'on m'a identifié, à confirmer. `extra` = actions proposées après confirmation (★★). */
export function TagsInbox({ onToast, extra }: { onToast: (m: string) => void; extra: (authorId: string) => React.ReactNode }) {
  const [list, setList] = useState<TagForMe[] | null>(null)
  const [tick, setTick] = useState(0)
  const [busy, setBusy] = useState("")
  useEffect(() => { let live = true; tagsForMe().then(l => { if (live) setList(l) }); return () => { live = false } }, [tick])
  if (!list || !list.length) return null
  const answer = async (t: TagForMe, ok: boolean) => {
    setBusy(t.id); const r = await answerTag(t.id, ok); setBusy("")
    if (!r.ok) { onToast(r.msg); return }
    onToast(ok ? `Séance confirmée avec ${t.author_name.split(" ")[0]} 👊` : "C'est noté : séance non confirmée"); setTick(x => x + 1)
  }
  const day = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })
  return <section className="panel uzu-panel-col uzu-grid-gap" aria-label="Séances où tu as été identifié">
    <div className="eyebrow">TES PARTENAIRES T&apos;ONT IDENTIFIÉ</div>
    <ul className="uzu-tag-list">{list.map(t => <li key={t.id} className="uzu-tag-row">
      <div><b>{t.author_name}</b> a noté une séance avec toi<small>{day(t.date)}{t.summary ? " · " + t.summary : ""}</small></div>
      {t.status === "pending" ? <div className="uzu-actions uzu-actions--start">
        <button className="button button--dark uzu-small-btn" disabled={busy === t.id} onClick={() => answer(t, true)}><Check size={14} />Confirmer</button>
        <button className="button button--outline uzu-small-btn" disabled={busy === t.id} onClick={() => answer(t, false)}>Je n&apos;y étais pas</button>
      </div> : <div className="uzu-grid-gap"><span className={`uzu-pill ${t.status === "confirmed" ? "done" : ""}`}>{t.status === "confirmed" ? <><Check size={12} /> Confirmée</> : "Non confirmée"}</span>
        {t.status === "confirmed" && extra(t.author_id)}</div>}
    </li>)}</ul>
  </section>
}

/** Profil : accepter ou non d'être identifié par les membres du club. */
export function AllowTagToggle({ onToast }: { onToast: (m: string) => void }) {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { let live = true; getAllowTag().then(v => { if (live) setOn(v) }); return () => { live = false } }, [])
  if (on === null) return null
  return <label className="uzu-check-row"><input type="checkbox" checked={on} onChange={async e => { const v = e.target.checked; setOn(v); const r = await setAllowTag(v); if (!r.ok) { setOn(!v); onToast(r.msg) } else onToast(v ? "Tes partenaires peuvent t'identifier sur leurs séances" : "Plus personne ne pourra t'identifier sur une séance") }} />
    Mes partenaires du club peuvent m&apos;identifier sur leurs séances</label>
}
