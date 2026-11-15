"use client"
// Calendrier partagé (athlète et club) : affichage semaine ou mois, bandeau des vacances et fermetures.
import { useEffect, useState, type ReactNode } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

export type CalItem = { key: string; title: string; sub?: string; tone: "wine" | "sand" | "dark"; off?: string; onClick?: () => void }
type View = "week" | "month"

const DSHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const pad = (n: number) => String(n).padStart(2, "0")
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addD = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const mondayOf = (d: Date) => addD(dayOf(d), -((d.getDay() + 6) % 7))
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function Calendar({ eyebrow, itemsOn, closedOn, legend, storeKey }: {
  eyebrow: string
  itemsOn: (d: Date, ds: string) => CalItem[]
  closedOn: (ds: string) => string | null
  legend?: ReactNode
  storeKey: string
}) {
  const [view, setView] = useState<View>("week")
  const [off, setOff] = useState(0)
  const today = dayOf(new Date()), tds = ymdOf(today)
  const [sel, setSel] = useState(tds)
  useEffect(() => { try { if (localStorage.getItem(storeKey) === "month") setView("month") } catch { /* rien */ } }, [storeKey])
  const pick = (v: View) => { setView(v); setOff(0); setSel(tds); try { localStorage.setItem(storeKey, v) } catch { /* rien */ } }

  const wStart = addD(mondayOf(today), off * 7)
  const mFirst = new Date(today.getFullYear(), today.getMonth() + off, 1)
  const title = cap((view === "week" ? wStart : mFirst).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }))
  const unit = view === "week" ? "Semaine" : "Mois"

  const toolbar = <div className="calendar-toolbar uzu-cal-toolbar">
    <div><div className="eyebrow">{eyebrow}</div><h2>{title}</h2></div>
    <div className="calendar-controls">
      <div className="uzu-cal-view" role="group" aria-label="Affichage du calendrier">
        <button type="button" className={view === "week" ? "on" : ""} aria-pressed={view === "week"} onClick={() => pick("week")}>Semaine</button>
        <button type="button" className={view === "month" ? "on" : ""} aria-pressed={view === "month"} onClick={() => pick("month")}>Mois</button>
      </div>
      <button className="icon-button" aria-label={`${unit} précédent${view === "week" ? "e" : ""}`} onClick={() => setOff(off - 1)}><ChevronLeft size={17} /></button>
      <button className="panel-select" onClick={() => { setOff(0); setSel(tds) }}>Aujourd&apos;hui</button>
      <button className="icon-button" aria-label={`${unit} suivant${view === "week" ? "e" : ""}`} onClick={() => setOff(off + 1)}><ChevronRight size={17} /></button>
    </div>
  </div>

  const chip = (x: CalItem) => {
    const body = <><strong>{x.title}</strong>{x.sub && <small>{x.sub}</small>}{x.off && <small className="uzu-cal-offtxt">{x.off}</small>}</>
    const cls = `calendar-event calendar-event--${x.tone}${x.off ? " is-off" : ""}`
    return x.onClick ? <button type="button" key={x.key} className={cls + " uzu-cal-btn"} onClick={x.onClick}>{body}</button> : <div key={x.key} className={cls}>{body}</div>
  }

  if (view === "week") {
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => addD(wStart, i))
    return <section className="panel calendar-panel">
      {toolbar}
      <div className="calendar-grid">
        {days.map((d, i) => { const c = closedOn(ymdOf(d)); return <div key={"h" + i} className={`calendar-day-head ${+d === +today ? "is-today" : ""} ${c ? "is-closed" : ""}`}>{DSHORT[i].toUpperCase()} <strong>{d.getDate()}</strong></div> })}
        {days.map((d, i) => {
          const ds = ymdOf(d), c = closedOn(ds)
          return <div className={`calendar-day ${c ? "is-closed" : ""}`} key={"d" + i}>
            {c && <div className="uzu-cal-hol" title={c}>{c}</div>}
            {itemsOn(d, ds).map(chip)}
          </div>
        })}
      </div>
      {legend}
    </section>
  }

  // Mois : grille du lundi précédant le 1er au dimanche suivant la fin du mois
  const gStart = mondayOf(mFirst), mLast = new Date(mFirst.getFullYear(), mFirst.getMonth() + 1, 0)
  const nDays = Math.round((+addD(mondayOf(mLast), 7) - +gStart) / 864e5)
  const cells = Array.from({ length: nDays }, (_, i) => addD(gStart, i))
  const selD = cells.find(d => ymdOf(d) === sel && d.getMonth() === mFirst.getMonth())
  const selItems = selD ? itemsOn(selD, sel) : [], selClosed = selD ? closedOn(sel) : null
  return <section className="panel calendar-panel">
    {toolbar}
    <div className="uzu-mgrid" role="grid" aria-label={title}>
      {DSHORT.map(d => <div key={d} className="uzu-mgrid-head" role="columnheader">{d}</div>)}
      {cells.map(d => {
        const ds = ymdOf(d), inM = d.getMonth() === mFirst.getMonth(), c = inM ? closedOn(ds) : null, it = inM ? itemsOn(d, ds) : []
        const on = it.filter(x => !x.off)
        return <button type="button" role="gridcell" key={ds} disabled={!inM}
          className={`uzu-mgrid-cell ${inM ? "" : "is-out"} ${ds === tds ? "is-today" : ""} ${c ? "is-closed" : ""} ${ds === sel && inM ? "is-sel" : ""}`}
          aria-label={inM ? `${d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}${c ? ", " + c : ""}${on.length ? ", " + on.length + " élément" + (on.length > 1 ? "s" : "") : ""}` : undefined}
          onClick={() => setSel(ds)}>
          <span className="uzu-mgrid-num">{inM ? d.getDate() : ""}</span>
          {inM && <span className="uzu-mgrid-dots">{on.slice(0, 3).map(x => <i key={x.key} className={"dot-" + x.tone} />)}{on.length > 3 && <em>+{on.length - 3}</em>}</span>}
          {inM && <span className="uzu-mgrid-labels">{on.slice(0, 2).map(x => <b key={x.key} className={"lbl-" + x.tone}>{x.title}</b>)}{on.length > 2 && <em>+{on.length - 2}</em>}</span>}
        </button>
      })}
    </div>
    {selD && <div className="uzu-mgrid-day">
      <div className="uzu-mgrid-day-title">{cap(selD.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }))}</div>
      {selClosed && <div className="uzu-cal-hol">{selClosed}</div>}
      {selItems.length ? <div className="uzu-mgrid-list">{selItems.map(chip)}</div> : !selClosed && <p className="uzu-text uzu-muted">Rien de prévu ce jour-là.</p>}
    </div>}
    {legend}
  </section>
}
