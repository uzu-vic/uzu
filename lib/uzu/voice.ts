"use client"
// Dictée vocale : « raconter sa séance à l'oral ». L'analyse de la phrase (parseVoice) est extraite telle quelle
// de l'ancienne application ; voiceApply reprend la même logique de remplissage, sur l'état du formulaire React.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any

/** « ios-other » : navigateur tiers sur iPhone/iPad (Chrome, Firefox, Edge…), où l'objet existe mais ne reçoit jamais le son. */
export function voiceSupport(): "ok" | "ios-other" | "none" {
  if (typeof navigator === "undefined") return "none"
  const ua = navigator.userAgent || "", ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  if (ios && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua)) return "ios-other"
  return voiceApi() ? "ok" : "none"
}
export function voiceApi(): Any { return typeof window === "undefined" ? null : ((window as Any).SpeechRecognition || (window as Any).webkitSpeechRecognition || null) }

/** Remplit le formulaire à partir d'une phrase dictée. Retourne le nouveau formulaire, la note, les exercices et la liste de ce qui a été rempli. */
export function voiceApply(C: Any, form0: Any, note0: string, exos0: string, text: string): { form: Any; note: string; exos: string; out: string[] } {
  const r = C.parseVoice(text), out: string[] = [], form: Any = JSON.parse(JSON.stringify(form0))
  let exos = exos0
  if (r.prepa && !r.jjb) { form.cat = "prepa"; out.push("Prépa physique") } else if (r.jjb && form.cat === "prepa") form.cat = "jjb"
  const pp = form.cat === "prepa"
  if (r.kind && !pp) { form.kind = r.kind; out.push(C.KINDS[r.kind].n) }
  if (r.type && !pp) { form.type = r.type; out.push(r.type) }
  const durTxt = (m: number) => { const h = Math.floor(m / 60), x = m % 60; return h ? `${h} h${x ? " " + String(x).padStart(2, "0") : ""}` : `${x} min` }
  if (r.dur) { form.dur = r.dur; out.push(durTxt(r.dur)) }
  else if (pp && r.prepa && r.prepa.dur) { form.dur = C.vSnap(r.prepa.dur, [45, 60, 90, 120]); out.push(durTxt(form.dur)) }
  if (r.blocks.length && !pp) {
    let all: Any[] = (form.blocks || []).slice()
    const cb = form.tech || form.sys ? { sys: form.sys || "", flow: form.flow || "", tech: form.tech || "" } : null
    if (cb) all.push(cb)
    r.blocks.forEach((b: Any) => { if (!all.some(a => C.sameBlock(a, b))) all.push(b) })
    all = all.slice(0, 8)
    if (all.length === 1) { form.blocks = []; form.sys = all[0].sys; form.flow = all[0].flow; form.tech = all[0].tech } else { form.blocks = all; form.sys = ""; form.flow = ""; form.tech = "" }
    r.blocks.forEach((b: Any) => out.push(C.blockName(b) + (b.flow === "impose" ? " (imposé)" : b.flow === "subi" ? " (subi)" : "")))
  }
  if (r.rounds && !pp) { form.rounds = r.rounds; out.push(r.rounds + " round" + (r.rounds > 1 ? "s" : "")) }
  if (r.subs.length && !pp) {
    const L = C.normSubs(form.subs)
    r.subs.forEach((sb: Any) => {
      const e = L.find((x: Any) => x.t === sb.t && x.d === sb.d)
      if (e) e.n = Math.min(C.SUB_MAX, e.n + sb.n); else L.push(sb)
      out.push("Soumission " + (sb.d === "placee" ? "placée" : sb.d === "subieG" ? "subie contre un gradé" : "subie contre une blanche") + " : " + C.subName(sb.t) + (sb.n > 1 ? " × " + sb.n : ""))
    })
    form.subs = L
  }
  if ((r.td.done || r.td.suffered) && !pp) {
    form.lucha_takedowns_done = Math.min(40, (form.lucha_takedowns_done || 0) + r.td.done)
    form.lucha_takedowns_suffered = Math.min(40, (form.lucha_takedowns_suffered || 0) + r.td.suffered)
    if (r.td.done) out.push(r.td.done + " amenée" + (r.td.done > 1 ? "s" : "") + " au sol réussie" + (r.td.done > 1 ? "s" : ""))
    if (r.td.suffered) out.push(r.td.suffered + " amenée" + (r.td.suffered > 1 ? "s" : "") + " au sol subie" + (r.td.suffered > 1 ? "s" : ""))
  }
  if (r.prepa) {
    form.effort = r.prepa.effort; if (r.prepa.rpe) form.rpe = r.prepa.rpe
    if (!pp) { form.withPrepa = true; if (r.prepa.dur) form.pdur = r.prepa.dur; out.push("Bloc prépa : " + C.EFFORTS[form.effort] + (r.prepa.dur ? ", " + durTxt(r.prepa.dur) : "")) }
    else out.push(C.EFFORTS[form.effort])
    if (r.prepa.rpe) out.push("RPE " + r.prepa.rpe + "/10")
    if (pp && !exos.trim()) exos = text.slice(0, 600)
  }
  if (r.forme) { form.forme = r.forme; out.push(C.FORME_TXT[r.forme]) }
  const nt = note0.trim()
  return { form, note: (nt ? nt + "\n" : "") + text, exos, out }
}
