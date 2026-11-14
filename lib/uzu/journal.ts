"use client"
// Saisie dans le carnet (séance, compétition), à l'identique de l'ancienne application.
//
// Fidélité : toutes les règles métier (catalogues, normalisation, étoiles, corps des documents envoyés,
// fusion hors ligne) viennent du code de l'ancienne application, extrait automatiquement dans
// legacy-core.generated.js. Seul l'enchaînement des étapes est écrit ici ; il reproduit :
//   - le gestionnaire « submit » du formulaire de séance et de compétition ;
//   - save() / flush() / adopt() : écriture d'abord sur le téléphone (cache « uzu_cached_training »),
//     puis envoi au serveur ; en cas d'échec, la saisie reste sur le téléphone et repartira
//     (depuis cette application ou depuis l'ancienne, qui partagent le même cache).
import { createLegacyCore } from "./legacy-core.generated"
import { uzu } from "./client"
import type { UzuContext } from "./context"
import { legacyRole } from "./training"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export type Core = Any
export type SessionForm = Any // forme de blankForm() de l'ancienne application
export type SessionInputs = { date: string; note: string; exos: string; cuName: string; cuProf: string }
export type CompForm = { type: string; result: string; wins: number; losses: number; subs: number }
export type CompInputs = { date: string; event: string }
export type SaveResult = { ok: true; synced: boolean; item: Any } | { ok: false; msg: string }

const CACHE_KEY = "uzu_cached_training"

export function newCore(): Core {
  if (typeof window !== "undefined" && (window as Any).UZU_SOLO === undefined) (window as Any).UZU_SOLO = false
  return createLegacyCore()
}

// ---------- Construction de l'élément (port du gestionnaire « submit » de #logForm) ----------
/** Construit la séance exactement comme l'ancienne application. Modifie `skills` (étoile ★ auto). */
export function buildSessionItem(core: Core, form: SessionForm, inp: SessionInputs, starsOf: (techs: string[]) => number, skills: Any): Any {
  const C = core
  const prepa = form.cat === "prepa", isOpen = !prepa && form.kind === "open"
  let item: Any
  const base: Any = { date: inp.date || C.ymd(C.TODAY), dur: form.dur, note: inp.note.trim(), forme: form.forme }
  if (prepa) {
    item = Object.assign(base, {
      cat: "prepa", kind: "", type: "", theme: C.EFFORTS[form.effort], effort: form.effort, rpe: form.rpe, exos: inp.exos.trim().slice(0, 600),
      sys: "", flow: "", blocks: undefined, prepa: undefined, stars: 0, rounds: 0, subs: [], sparring_details: C.blankGm(), gm: undefined,
      sys_counts: C.gmSysCounts(C.blankGm()), customs: [], placed: 0, takenW: 0, takenG: 0, taken: 0,
    })
    C.ACT_KEYS.forEach((k: string) => { item[k] = 0 })
  } else {
    // addCustom(true) : une technique perso tapée mais pas encore ajoutée n'est pas perdue
    const n = inp.cuName.trim().replace(/\s+/g, " ").slice(0, 60), p = inp.cuProf
    if (n && form.customs.length < C.CUSTOM_MAX && !form.customs.some((x: Any) => x.n.toLowerCase() === n.toLowerCase() && x.p === p))
      form.customs.push({ n, p: C.OPP_PROFILES[p] ? p : "autre" })
    const subs = C.normSubs(form.subs), t = C.subTotals(subs)
    const cb = form.tech || form.sys ? { sys: form.sys || "", flow: form.flow || "", tech: form.tech || "" } : null
    let blocks: Any[] = (form.blocks || []).slice()
    if (cb && !blocks.some((b: Any) => C.sameBlock(b, cb))) blocks.push(cb)
    if (isOpen) blocks = blocks.filter((b: Any) => C.SYSTEMS[b.sys]).map((b: Any) => ({ sys: b.sys, flow: b.flow, tech: "" }))
      .filter((b: Any, i: number, a: Any[]) => a.findIndex((x: Any) => x.sys === b.sys) === i)
    const b0 = blocks[0] || { sys: "", flow: "", tech: "" }
    item = Object.assign(base, {
      cat: "jjb", kind: form.kind || "cours", type: form.type, theme: isOpen ? "Open Mat / Libre" : (b0.tech || (b0.sys ? C.SYSTEMS[b0.sys].n : "Séance libre")),
      sys: b0.sys || "", flow: b0.flow || "", blocks: blocks.length > 1 ? blocks : undefined,
      prepa: form.withPrepa ? { effort: C.EFFORTS[form.effort] ? form.effort : "force", rpe: form.rpe || 0, exos: inp.exos.trim().slice(0, 600), dur: form.pdur || 30 } : undefined,
      rounds: form.rounds, stars: 0, subs, customs: C.normCustoms(form.customs),
      placed: t.placee, takenW: t.subieW, takenG: t.subieG, taken: t.subieW + t.subieG,
      effort: "", rpe: 0, exos: "",
    })
    C.FORM_ACT_KEYS.forEach((k: string) => { item[k] = form[k] || 0 })
    item.sparring_details = C.normGm(form.gm); item.gm = undefined; item.sys_counts = C.gmSysCounts(item.sparring_details)
    Object.keys(C.GM_FIELDS).forEach(f => { item[C.GM_FIELDS[f]] = C.gmTotal(item.sparring_details[f]) })
  }
  const techs: string[] = (!prepa && !isOpen) ? C.sessBlocks(item).map((x: Any) => x.tech).filter(Boolean) : []
  techs.forEach(tn => C.touchSkill(tn, item.date, skills))
  if (techs.length) item.stars = starsOf(techs)
  return item
}

export function buildCompItem(core: Core, cform: CompForm, inp: CompInputs): Any {
  return { date: inp.date || core.ymd(core.TODAY), event: inp.event.trim(), type: cform.type, result: cform.result, wins: cform.wins, losses: cform.losses, subs: cform.subs }
}

// ---------- Cache du téléphone (même format que l'objet Local de l'ancienne application) ----------
type CacheEntry = { v: 1; at: string; dirty: boolean; deleted: { s: string[]; c: string[] }; state: Any }
function cacheAll(): Record<string, CacheEntry> {
  try { const m = JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); return m && typeof m === "object" ? m : {} } catch { return {} }
}
function cacheRead(id: string): CacheEntry | null { const o = cacheAll()[id]; return o && o.state ? o : null }
function cacheWrite(id: string, state: Any, dirty: boolean, deleted: { s: string[]; c: string[] }): boolean {
  try { const m = cacheAll(); m[id] = { v: 1, at: new Date().toISOString(), dirty, deleted, state }; localStorage.setItem(CACHE_KEY, JSON.stringify(m)); return true } catch { return false }
}

// Gymnase en sous-sol : on n'attend pas le réseau indéfiniment, la saisie part d'abord sur le téléphone.
const NET_TIMEOUT = 6000
function withTimeout<T>(p: PromiseLike<T>): Promise<T> {
  return Promise.race([Promise.resolve(p), new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Réseau indisponible")), NET_TIMEOUT))])
}
async function getDoc(path: string): Promise<Any | null> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("Hors ligne")
  const { data, error } = await withTimeout(uzu().from("docs").select("path,data").eq("path", path).maybeSingle())
  if (error) throw new Error(error.message)
  return data ? data.data : null
}
async function setDoc(path: string, data: Any): Promise<void> {
  const { error } = await withTimeout(uzu().from("docs").upsert({ path, data, updated_at: new Date().toISOString() }))
  if (error) throw new Error(error.message)
}

type Loaded = { core: Core; role: "teacher" | "student" | "solo"; cacheId: string; hydrated: boolean; dirty: boolean; deleted: { s: string[]; c: string[] }; grade: Any }

/** Prépare l'état comme le fait l'ancienne application au démarrage (restoreLocal puis adopt). */
async function prepare(uid: string, ctx: UzuContext | null): Promise<Loaded> {
  const core = newCore()
  const role = legacyRole(ctx)
  const acct = role === "solo" ? "solo" : "club"
  core.__set("mode", "cloud")
  core.__set("role", role === "teacher" ? "teacher" : "student")
  const cacheId = role === "teacher" ? uid + ":coach" : uid
  const c = cacheRead(cacheId)
  let state: Any = c ? core.normalize(c.state) : core.emptyState()
  let dirty = !!c?.dirty
  let deleted = { s: c?.deleted?.s ?? [], c: c?.deleted?.c ?? [] }
  if (role !== "teacher") state.acct = acct
  let hydrated = false, grade: Any = null
  try {
    const own = role === "teacher" ? `data/users/${uid}/training` : `members/${uid}`
    const [sv, priv, roll, gr] = await Promise.all([
      getDoc(own),
      role !== "teacher" ? getDoc(`data/users/${uid}/private`) : Promise.resolve(null),
      role === "student" ? getDoc(`roll/${uid}`) : Promise.resolve(null),
      role === "student" ? getDoc(`grades/${uid}`) : Promise.resolve(null),
    ])
    hydrated = true
    grade = gr
    core.__set("myRoll", roll?.s || [])
    core.__set("myGrade", gr)
    // adopt()
    if (sv) {
      const svN = core.normalize(sv)
      if (dirty) { core.__set("pendingDel", deleted); state = core.mergeStates(svN, state) } else state = svN
      if (role !== "teacher") {
        state.acct = acct
        const solo = acct === "solo"
        state.feed = { on: !solo && !!ctx?.share_activity, at: state.feed.at }
        if (sv.acct === "solo" && !solo) { const nw = new Date().toISOString(); state.consent = Object.assign({ at: nw }, state.consent || {}, { share: true, sharedAt: nw }); dirty = true }
      }
    } else if (role !== "teacher" && (state.consent || state.sessions.length || state.comps.length)) dirty = true
    else if (role === "teacher") {
      // coachMig : premier entraînement perso d'un membre de l'équipe → reprise de son ancienne fiche
      const md = await getDoc(`members/${uid}`)
      if (md && Array.isArray(md.sessions) && md.sessions.length && !state.sessions.some((x: Any) => !x.sample)) { state = core.normalize(md); dirty = true }
    }
    // mergePriv() : état physique et notes privées
    if (role !== "teacher") {
      const pm = priv && priv.s ? priv.s : {}
      state.sessions.forEach((s: Any) => {
        const p = pm[s.id]
        if (dirty) { if (p && !s.note && !s.forme) { s.note = p.n; s.forme = p.f } return }
        s.note = p ? p.n : ""; s.forme = p ? p.f : ""
      })
    }
  } catch { hydrated = false }
  core.__set("state", state)
  // applyGrade() : en club, la ceinture de l'élève est celle validée par le professeur
  if (hydrated) core.applyGrade()
  return { core, role, cacheId, hydrated, dirty, deleted, grade }
}

/** save() + flush() + publishFeed() de l'ancienne application. */
async function commit(uid: string, L: Loaded): Promise<boolean> {
  const { core, role, cacheId } = L
  cacheWrite(cacheId, core.__get("state"), true, L.deleted)
  if (!L.hydrated) return false // jamais d'envoi avant la première lecture du serveur
  try {
    if (role === "teacher") await setDoc(`data/users/${uid}/training`, core.coachBody())
    else await Promise.all([setDoc(`members/${uid}`, core.memberBody()), setDoc(`data/users/${uid}/private`, { s: core.privBody() })])
  } catch { return false }
  cacheWrite(cacheId, core.__get("state"), false, { s: [], c: [] })
  // Fil du club (feed/<uid>) : même document que l'ancienne application
  try {
    const st = core.__get("state")
    if (!core.isSolo()) {
      const isT = role === "teacher"
      if (isT || core.feedEnabled()) {
        await setDoc(`feed/${uid}`, { on: !isT, name: isT ? "" : String(st.name || "").slice(0, 40), belt: isT ? null : { rank: st.belt.rank, stripes: st.belt.stripes }, ev: isT ? [] : core.myEvents(), checks: st.fx.checks, vals: st.fx.vals, updatedAt: new Date().toISOString() })
      }
    }
  } catch { /* le fil sera republié à la prochaine synchronisation */ }
  return true
}

export async function addSession(uid: string, ctx: UzuContext | null, form: SessionForm, inp: SessionInputs): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    const item = buildSessionItem(C, form, inp, techs => C.skillInfo(C.me(), techs[0]).lvl, state.skills)
    item.id = "u" + Date.now(); item.sample = false
    state.sessions.push(item)
    const synced = await commit(uid, L)
    return { ok: true, synced, item }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

export async function addComp(uid: string, ctx: UzuContext | null, cform: CompForm, inp: CompInputs): Promise<SaveResult> {
  if (!inp.event.trim()) return { ok: false, msg: "Indique le nom de la compétition" }
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    const item = buildCompItem(C, cform, inp)
    item.id = "k" + Date.now(); item.sample = false
    state.comps.push(item)
    const synced = await commit(uid, L)
    return { ok: true, synced, item }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

/** Saisies restées sur le téléphone : envoi dès que possible (démarrage, retour du réseau, retour sur l'appli). */
export async function syncPending(uid: string, ctx: UzuContext | null): Promise<boolean> {
  const role = legacyRole(ctx)
  const c = cacheRead(role === "teacher" ? uid + ":coach" : uid)
  if (!c || !c.dirty) return false
  const L = await prepare(uid, ctx)
  if (!L.hydrated) return false
  return commit(uid, L)
}

/** État complet du carnet pour l'affichage (mêmes données que l'ancienne application). */
export async function loadCore(uid: string, ctx: UzuContext | null): Promise<{ core: Core; role: "teacher" | "student" | "solo"; hydrated: boolean; pending: boolean; grade: Any }> {
  const L = await prepare(uid, ctx)
  return { core: L.core, role: L.role, hydrated: L.hydrated, pending: L.dirty, grade: L.grade }
}

/** Déclaration de ceinture (bouton « bSave » de l'ancienne application) :
 *  équipe ou compte solo → mise à jour directe ; élève de club → demande envoyée au professeur. */
export async function declareBelt(uid: string, ctx: UzuContext | null, nb: { rank: string; stripes: number; since: string }): Promise<SaveResult & { direct?: boolean }> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    const direct = L.role === "teacher" || C.isSolo()
    if (direct) state.belt = { rank: nb.rank, stripes: nb.stripes, since: nb.since || "" }
    else state.request = { rank: nb.rank, stripes: nb.stripes, since: nb.since || "", at: new Date().toISOString() }
    const synced = await commit(uid, L)
    return { ok: true, synced, item: direct ? state.belt : state.request, direct }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}
