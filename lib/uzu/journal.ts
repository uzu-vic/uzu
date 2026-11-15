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
  core.__set("myUid", uid)
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


// ---------- Modification et suppression (boutons « Modifier » / « Supprimer » de l'ancienne application) ----------
/** Formulaire prérempli à partir d'une séance enregistrée (port de renderLogForm en mode modification). */
export function formFromSession(C: Core, es: Any): { form: SessionForm; note: string; exos: string } {
  const f = C.blankForm(), pp = C.isPrepa(es)
  f.cat = pp ? "prepa" : "jjb"; f.kind = pp ? "cours" : C.kindOf(es); f.sys = es.sys || C.sysOfTech(es.theme); f.flow = es.flow || ""; f.tech = C.sysOfTech(es.theme) ? es.theme : ""
  f.type = es.type || "Gi"; f.dur = es.dur; f.rounds = es.rounds || 0; f.forme = es.forme || ""; f.stars = +es.stars || 0
  f.subs = C.subsOf(es); f.gm = C.gmOf(es); f.customs = C.normCustoms(es.customs); f.effort = C.EFFORTS[es.effort] ? es.effort : "force"; f.rpe = +es.rpe || 0
  C.FORM_ACT_KEYS.forEach((k: string) => { f[k] = C.actOf(es, k) })
  f.blocks = pp ? [] : C.normBlocks(es.blocks); if (f.blocks.length > 1) { f.sys = ""; f.flow = ""; f.tech = "" } else f.blocks = []
  if (!pp && es.prepa) { f.withPrepa = true; f.effort = C.EFFORTS[es.prepa.effort] ? es.prepa.effort : "force"; f.rpe = +es.prepa.rpe || 0; f.pdur = +es.prepa.dur || 30 }
  return { form: f, note: es.note || "", exos: ((!pp && es.prepa ? es.prepa.exos : es.exos) || "") as string }
}

export async function loadEntry(uid: string, ctx: UzuContext | null, kind: "s" | "c", id: string): Promise<{ core: Core; entry: Any } | null> {
  const L = await prepare(uid, ctx)
  const st = L.core.__get("state")
  const entry = (kind === "s" ? st.sessions : st.comps).find((x: Any) => x.id === id)
  return entry ? { core: L.core, entry } : null
}

export async function updateSession(uid: string, ctx: UzuContext | null, id: string, form: SessionForm, inp: SessionInputs): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    if (!state.sessions.some((s: Any) => s.id === id)) return { ok: false, msg: "Séance introuvable" }
    const item = buildSessionItem(C, form, inp, techs => C.skillInfo(C.me(), techs[0]).lvl, state.skills)
    state.sessions = state.sessions.map((s: Any) => (s.id === id ? Object.assign({}, s, item) : s))
    const synced = await commit(uid, L)
    return { ok: true, synced, item }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

export async function updateComp(uid: string, ctx: UzuContext | null, id: string, cform: CompForm, inp: CompInputs): Promise<SaveResult> {
  if (!inp.event.trim()) return { ok: false, msg: "Indique le nom de la compétition" }
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    const item = buildCompItem(C, cform, inp)
    state.comps = state.comps.map((c: Any) => (c.id === id ? Object.assign({}, c, item) : c))
    const synced = await commit(uid, L)
    return { ok: true, synced, item }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

export async function deleteEntry(uid: string, ctx: UzuContext | null, kind: "s" | "c", id: string): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    if (kind === "s") { state.sessions = state.sessions.filter((s: Any) => s.id !== id); L.deleted.s.push(id) }
    else { state.comps = state.comps.filter((c: Any) => c.id !== id); L.deleted.c.push(id) }
    const synced = await commit(uid, L)
    return { ok: true, synced, item: null }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Suppression impossible" } }
}

// ---------- Profil ----------
export async function saveProfileInfo(uid: string, ctx: UzuContext | null, p: { name: string; age: string; sex: string; parental: boolean }): Promise<SaveResult> {
  const nn = p.name.trim().replace(/\s+/g, " ")
  if (!nn) return { ok: false, msg: "Indique ton nom et ton prénom" }
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state"), t = L.role === "teacher"
    if (!t && p.age === "lt16" && !p.parental) return { ok: false, msg: "Moins de 16 ans : coche l'accord de ton représentant légal" }
    state.name = nn.slice(0, 40)
    if (!t) { state.demo = { age: p.age, sex: p.sex }; if (state.consent) state.consent.parental = p.age === "lt16" }
    const synced = await commit(uid, L)
    // Le prénom sert aussi à l'accueil (« Salut … ») : on le garde sur le compte (sans bloquer si hors ligne)
    uzu().auth.updateUser({ data: { name: state.name } }).catch(() => {})
    return { ok: true, synced, item: null }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

// ---------- Fil du club (feed/<uid>) ----------
export async function loadFeedDocs(): Promise<Record<string, Any>> {
  const { data, error } = await withTimeout(uzu().from("docs").select("path,data").like("path", "feed/%"))
  if (error) throw new Error(error.message)
  const out: Record<string, Any> = {}
  for (const r of (data ?? []) as { path: string; data: Any }[]) out[r.path.slice(5)] = r.data
  return out
}

export async function loadFeed(uid: string, ctx: UzuContext | null): Promise<{ core: Core; role: string; feedOk: boolean }> {
  const L = await prepare(uid, ctx)
  let feedOk = true
  try { L.core.__set("feedDocs", await loadFeedDocs()) } catch { feedOk = false; L.core.__set("feedDocs", {}) }
  return { core: L.core, role: L.role, feedOk }
}

/** setFeedShare() de l'ancienne application. */
export async function setFeedShare(uid: string, ctx: UzuContext | null, on: boolean): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    state.feed = on ? { on: true, at: new Date().toISOString() } : { on: false, at: "" }
    try { await uzu().rpc("set_share_activity", { on_off: !!on }) } catch { /* le réglage serveur sera repris au prochain envoi */ }
    if (!on && L.role !== "teacher") { try { await uzu().from("docs").delete().eq("path", `feed/${uid}`) } catch { /* rien */ } }
    const synced = await commit(uid, L)
    return { ok: true, synced, item: null }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

/** Encouragement « Check 👊 » (toggleCheck) ou validation ★★ d'un coéquipier (feedValidate). */
export async function feedReact(uid: string, ctx: UzuContext | null, kind: "check" | "validate", key: string): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const C = L.core, state = C.__get("state")
    if (kind === "check") { if (state.fx.checks[key]) delete state.fx.checks[key]; else state.fx.checks[key] = { at: new Date().toISOString() } }
    else { if (L.role === "teacher") return { ok: false, msg: "Réservé aux élèves" }; state.fx.vals[key] = { at: new Date().toISOString() } }
    const synced = await commit(uid, L)
    return { ok: true, synced, item: null }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

/** Changement de mot de passe (même vérification que l'ancienne application : mot de passe actuel requis). */
export async function changePassword(oldPw: string, newPw: string): Promise<string> {
  const sb = uzu()
  const { data } = await sb.auth.getUser()
  const em = data.user?.email
  if (!em) return "Session expirée : reconnecte-toi."
  const a = await sb.auth.signInWithPassword({ email: em, password: oldPw })
  if (a.error) return "Mot de passe actuel incorrect."
  const u = await sb.auth.updateUser({ password: newPw })
  if (!u.error) return "Mot de passe modifié."
  const m = u.error.message || ""
  if (/weak|should be|at least/i.test(m)) return "Nouveau mot de passe trop faible : 8 caractères minimum."
  if (/same|different from the old/i.test(m)) return "Choisis un mot de passe différent de l'actuel."
  if (/reauthenticat|nonce/i.test(m)) return "Supabase demande une vérification par e-mail pour changer de mot de passe."
  return "Modification impossible : " + m
}

// ---------- Mes données (profil) : mêmes effets que l'ancienne application ----------
export function cacheClear(id: string) {
  try { const m = cacheAll(); delete m[id]; if (Object.keys(m).length) localStorage.setItem(CACHE_KEY, JSON.stringify(m)); else localStorage.removeItem(CACHE_KEY) } catch { /* rien */ }
}
async function delDoc(path: string): Promise<void> {
  const { error } = await withTimeout(uzu().from("docs").delete().eq("path", path))
  if (error) throw new Error(error.message)
}
/** Texte d'avertissement avant suppression, selon le type de compte (repris de l'ancienne application). */
export function deleteAllText(ctx: UzuContext | null): string {
  const role = legacyRole(ctx)
  return role === "teacher" ? "Ton entraînement perso (séances, compétitions, progression) sera effacé définitivement. Ton club, tes élèves et leurs données ne sont pas touchés."
    : role === "solo" ? "Ton carnet solo (séances, compétitions, techniques, progression) sera effacé définitivement. Aucun club ni prof n'y a accès."
    : "Tes séances, tes compétitions, ta progression et ton accord seront effacés définitivement, ainsi que ta présence dans le fil Tatami. Ta ceinture et tes ★★★ validées restent enregistrées par ton prof : demande-lui de les retirer si tu quittes le club."
}
/** Supprime toutes les données d'entraînement de l'utilisateur (le compte reste ouvert). */
export async function deleteAllData(uid: string, ctx: UzuContext | null): Promise<{ ok: true } | { ok: false; msg: string }> {
  const role = legacyRole(ctx)
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, msg: "Suppression impossible hors connexion : réessaie avec du réseau" }
    if (role === "teacher") { await delDoc(`data/users/${uid}/training`); cacheClear(uid + ":coach"); return { ok: true } }
    await delDoc(`members/${uid}`)
    await delDoc(`feed/${uid}`).catch(() => {})
    if (role !== "solo") await delDoc(`roll/${uid}`).catch(() => {})
    await delDoc(`data/users/${uid}/private`).catch(() => {})
    cacheClear(uid)
    return { ok: true }
  } catch { return { ok: false, msg: "Suppression impossible pour l'instant, réessaie plus tard" } }
}
/** Carnet solo → club : rattachement par code ; l'historique du carnet suit (accord de partage enregistré à la prochaine ouverture). */
export async function joinClubByCode(code: string): Promise<{ ok: true } | { ok: false; msg: string }> {
  const { error } = await uzu().rpc("join_club_by_code", { invite_code_input: code })
  if (error) return { ok: false, msg: error.message }
  try { localStorage.removeItem("uzu-solo"); localStorage.setItem("uzu-owner", "solo-migrate") } catch { /* rien */ }
  return { ok: true }
}
export async function createClubFromSolo(name: string, code: string): Promise<{ ok: true; code: string } | { ok: false; msg: string }> {
  const { data, error } = await uzu().rpc("create_new_club", { club_name: name, invite_code_input: code })
  if (error) return { ok: false, msg: error.message }
  return { ok: true, code: String((data as Any)?.invite_code || code) }
}

// ---------- Première ouverture : accord sur les données (écran de bienvenue de l'ancienne application) ----------
/** Applique le profil saisi à l'inscription (« uzu-signup ») s'il existe ; renvoie true si l'accord est (désormais) enregistré. */
export async function ensureConsent(uid: string, ctx: UzuContext | null): Promise<boolean> {
  if (legacyRole(ctx) === "teacher") return true
  const L = await prepare(uid, ctx)
  const C = L.core, state = C.__get("state")
  if (state.consent || !L.hydrated) return true // hors ligne : on ne redemande jamais un accord peut-être déjà donné
  let su: Any = null
  try { su = JSON.parse(localStorage.getItem("uzu-signup") || "null") } catch { /* rien */ }
  if (!su || !su.name) return false
  try { localStorage.removeItem("uzu-signup") } catch { /* rien */ }
  state.name = String(su.name).slice(0, 40)
  if (su.demo) state.demo = { age: C.ageIdx(su.demo.age) > -1 ? su.demo.age : "", sex: C.SEXES[su.demo.sex] ? su.demo.sex : "" }
  if (su.acct === "solo") state.acct = "solo"
  state.consent = { at: String(su.at || new Date().toISOString()), share: state.acct !== "solo", parental: !!su.parental }
  await commit(uid, L)
  return true
}
export async function giveConsent(uid: string, ctx: UzuContext | null, p: { name: string; age: string; sex: string; parental: boolean }): Promise<SaveResult> {
  try {
    const L = await prepare(uid, ctx)
    const state = L.core.__get("state")
    state.consent = { at: new Date().toISOString(), share: true, parental: p.age === "lt16" }
    state.demo = { age: p.age, sex: p.sex }
    state.name = p.name.trim().slice(0, 40)
    const synced = await commit(uid, L)
    return { ok: true, synced, item: null }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Enregistrement impossible" } }
}

/** Aperçu d'une séance (lecture seule) : séances saisies et séances issues de l'appel, avec l'état physique et la note privée de l'élève. */
export async function loadSessionDetail(uid: string, ctx: UzuContext | null, id: string): Promise<{ core: Core; s: Any } | null> {
  const L = await prepare(uid, ctx)
  const s = L.core.allSessions().find((x: Any) => x.id === id)
  return s ? { core: L.core, s } : null
}
