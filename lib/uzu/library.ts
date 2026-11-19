"use client"
// Bibliothèque technique (lot B : consultation).
// Lecture seule : catalogue UZU (fiches, enchaînements) et contenus PUBLIÉS du club.
// Les droits sont appliqués côté serveur (script uzu-9-bibliotheque) : on ne lit que ce que la base
// autorise pour l'académie de l'utilisateur. Si le script n'est pas encore appliqué, la bibliothèque
// est simplement absente (status « unavailable ») et l'écran Techniques reste celui d'avant.
import { uzu } from "./client"

export type LibDiscipline = { id: string; label: string; long_label: string; position: number }
export type LibCategory = { id: string; discipline_id: string; position: number; label: string }
export type LibTechnique = {
  id: string; discipline_id: string; category_id: string; position: number; name: string; aliases: string[]
  source_text: string | null; proposed_text: string | null; origin: "document" | "proposition"
  level: number | null; validation_status: "a_valider" | "validee" | "a_corriger"; validation_refs: string[]
  restricted: string | null; uzu_links: string[]
}
export type LibFlow = { id: string; discipline_id: string; position: number; title: string; intro: string }
export type LibStep = { id: string; flow_id: string; position: number; parent_id: string | null; kind: StepKind; branch_label: string | null; label: string; origin: "document" | "proposition" }
export type StepKind = "depart" | "action" | "reaction" | "transition" | "finalisation" | "alternative"
export type LibStepTech = { step_id: string; technique_id: string; position: number; origin: "document" | "proposition" }
export type ItemKind = "technique" | "variante" | "note" | "lien" | "astuce" | "question"
export type ItemStatus = "brouillon" | "en_attente" | "a_completer" | "publie" | "refuse" | "archive"
export type ClubItem = { id: string; kind: ItemKind; technique_id: string | null; discipline_id: string | null; title: string; body: string; url: string | null; status: ItemStatus; published_at: string | null; review_note?: string; updated_at?: string; rights_declared_at?: string | null }
export type Collection = { id: string; name: string; description: string; position: number; items: { technique_id: string | null; item_id: string | null }[] }
export type LibContext = { academy: string | null; disciplines: string[]; can_review: boolean; can_manage: boolean; can_configure: boolean; hidden: string[]; pending: number }

export type Library = {
  disciplines: LibDiscipline[]; categories: LibCategory[]; techniques: LibTechnique[]; flows: LibFlow[]
  steps: LibStep[]; stepTechs: LibStepTech[]; items: ClubItem[]; ctx: LibContext; collections: Collection[]
  byId: Record<string, LibTechnique>
  /** Toutes les fiches des disciplines ouvertes, masquées comprises (réglages du club) */
  all: LibTechnique[]
  /** Étapes pédagogiques, vigilance, niveau saisis par les professeurs du club (décision D3) */
  details: Record<string, FicheDetails>
}
export type FicheDetails = { steps: string; vigilance: string; level: number | null; updated_at?: string }
export type LibraryState = { status: "loading" } | { status: "unavailable" } | { status: "error"; msg: string } | { status: "ok"; lib: Library }

const absent = (e: { code?: string; message?: string } | null) => !!e && (e.code === "42P01" || e.code === "PGRST205" || e.code === "PGRST202" || /does not exist|schema cache|could not find/i.test(e.message || ""))

let cache: { key: string; at: number; p: Promise<LibraryState> } | null = null
/** Charge la bibliothèque (mise en cache 5 min par académie active). */
export function loadLibrary(academyKey: string, force = false): Promise<LibraryState> {
  if (!force && cache && cache.key === academyKey && Date.now() - cache.at < 300_000) return cache.p
  const p = fetchLibrary().catch(e => ({ status: "error", msg: (e as Error).message || "Réseau indisponible" }) as LibraryState)
  cache = { key: academyKey, at: Date.now(), p }
  p.then(s => { if (s.status !== "ok" && cache?.p === p) cache = null })
  return p
}
export function clearLibraryCache() { cache = null }

async function fetchLibrary(): Promise<LibraryState> {
  const db = uzu()
  const ctxR = await db.rpc("library_context")
  if (ctxR.error) return absent(ctxR.error) ? { status: "unavailable" } : { status: "error", msg: ctxR.error.message }
  const ctx = (ctxR.data || {}) as LibContext
  if (!ctx.academy || !Array.isArray(ctx.disciplines) || !ctx.disciplines.length) return { status: "unavailable" }
  const [d, c, t, f, s, st, it, co, ci] = await Promise.all([
    db.from("lib_disciplines").select("id,label,long_label,position").order("position"),
    db.from("lib_categories").select("id,discipline_id,position,label").order("position"),
    db.from("lib_techniques").select("id,discipline_id,category_id,position,name,aliases,source_text,proposed_text,origin,level,validation_status,validation_refs,restricted,uzu_links").order("id"),
    db.from("lib_flows").select("id,discipline_id,position,title,intro").order("position"),
    db.from("lib_flow_steps").select("id,flow_id,position,parent_id,kind,branch_label,label,origin").order("position"),
    db.from("lib_flow_step_techniques").select("step_id,technique_id,position,origin").order("position"),
    db.from("club_lib_items").select("id,kind,technique_id,discipline_id,title,body,url,status,published_at").eq("status", "publie").order("published_at", { ascending: false }),
    db.from("club_lib_collections").select("id,name,description,position").order("position"),
    db.from("club_lib_collection_items").select("collection_id,position,technique_id,item_id").order("position"),
  ])
  for (const r of [d, c, t, f, s, st, it, co, ci]) if (r.error) return absent(r.error) ? { status: "unavailable" } : { status: "error", msg: r.error.message }
  // Détails pédagogiques du club : facultatifs (absents sur une base qui n'a pas la dernière version du script)
  const dt = await db.from("club_lib_technique_details").select("technique_id,steps,vigilance,level,updated_at")
  const details: Record<string, FicheDetails> = {}
  if (!dt.error) for (const x of (dt.data || []) as (FicheDetails & { technique_id: string })[]) details[x.technique_id] = { steps: x.steps || "", vigilance: x.vigilance || "", level: x.level ?? null, updated_at: x.updated_at }
  const open = new Set(ctx.disciplines)
  const hidden = new Set(ctx.hidden || [])
  const all = ((t.data || []) as LibTechnique[]).filter(x => open.has(x.discipline_id))
    .map(x => ({ ...x, aliases: x.aliases || [], validation_refs: x.validation_refs || [], uzu_links: Array.isArray(x.uzu_links) ? x.uzu_links : [] }))
  const techniques = all.filter(x => !hidden.has(x.id))
  const byId: Record<string, LibTechnique> = {}
  for (const x of techniques) byId[x.id] = x
  const flows = ((f.data || []) as LibFlow[]).filter(x => open.has(x.discipline_id))
  const flowIds = new Set(flows.map(x => x.id))
  const steps = ((s.data || []) as LibStep[]).filter(x => flowIds.has(x.flow_id))
  return {
    status: "ok", lib: {
      disciplines: ((d.data || []) as LibDiscipline[]).filter(x => open.has(x.id)),
      categories: ((c.data || []) as LibCategory[]).filter(x => open.has(x.discipline_id)),
      techniques, flows, steps,
      stepTechs: ((st.data || []) as LibStepTech[]).filter(x => byId[x.technique_id]),
      items: ((it.data || []) as ClubItem[]).filter(x => x.status === "publie"),
      collections: ((co.data || []) as Collection[]).map(x => ({ ...x, items: ((ci.data || []) as { collection_id: string; technique_id: string | null; item_id: string | null }[]).filter(y => y.collection_id === x.id) })),
      ctx, byId, all, details,
    },
  }
}

// ---------------------------------------------------------------- Aides d'affichage
/** « Torreando Pass (Passage du torero) » → { main: "Torreando Pass", sub: "Passage du torero" } */
export function splitName(name: string): { main: string; sub: string } {
  const m = name.match(/^(.+?) \(([^()]*(?:\([^()]*\)[^()]*)*)\)$/)
  return m ? { main: m[1], sub: m[2] } : { main: name, sub: "" }
}
export const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9/]+/g, " ").trim()
export function matches(t: LibTechnique, q: string): boolean {
  const n = norm(q); if (!n) return true
  const hay = norm([t.id, t.name, ...t.aliases].join(" "))
  return n.split(" ").every(w => hay.includes(w))
}
export const KIND_LABEL: Record<StepKind, string> = {
  depart: "Départ", action: "Action", reaction: "Réaction de l'adversaire", transition: "Transition", finalisation: "Finalisation", alternative: "Alternative",
}
export const RESTRICTED_TXT: Record<string, string> = {
  cles_talon: "Clé de talon : réservée aux pratiquants avancés et aux règles qui l'autorisent. Application très lente, arrêt au premier tap.",
}

/** Noms de la progression existante (TECHNIQUES et éléments des systèmes) liés à une fiche */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function progressNames(t: LibTechnique, C: any): string[] {
  const out: string[] = []
  for (const l of t.uzu_links) {
    const p = String(l).split(":")
    if (p[0] === "tech") { const x = (C?.TECHNIQUES || []).find((y: { id: string }) => y.id === p[1]); if (x) out.push(x.nom) }
    else if (p[0] === "sys" && p[2]) out.push(p.slice(2).join(":"))
  }
  return out
}
/** Meilleur niveau ★ de l'utilisateur parmi les éléments liés (null : fiche non reliée à la progression) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function starsFor(t: LibTechnique, C: any, P: any): { lvl: number; review: boolean; name: string } | null {
  let best: { lvl: number; review: boolean; name: string } | null = null
  for (const n of progressNames(t, C)) {
    const i = C.skillInfo(P, n)
    if (!best || i.lvl > best.lvl) best = { lvl: i.lvl, review: !!i.review, name: n }
  }
  return best
}
/** Fiches liées à un nom de technique ou d'élément saisi dans une séance */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function fichesForName(lib: Library, name: string, C: any): LibTechnique[] {
  const n = norm(name)
  return lib.techniques.filter(t => progressNames(t, C).some(x => norm(x) === n))
}
/** Enfants d'une étape (ordre du document) */
export function childrenOf(lib: Library, flowId: string, parent: string | null): LibStep[] {
  return lib.steps.filter(s => s.flow_id === flowId && s.parent_id === parent).sort((a, b) => a.position - b.position)
}
export function techsOfStep(lib: Library, stepId: string): { t: LibTechnique; origin: string }[] {
  return lib.stepTechs.filter(x => x.step_id === stepId).sort((a, b) => a.position - b.position).map(x => ({ t: lib.byId[x.technique_id], origin: x.origin })).filter(x => !!x.t)
}
export function flowsOfTechnique(lib: Library, id: string): { flow: LibFlow; step: LibStep }[] {
  const out: { flow: LibFlow; step: LibStep }[] = []
  const seen = new Set<string>()
  for (const x of lib.stepTechs.filter(y => y.technique_id === id)) {
    const step = lib.steps.find(s => s.id === x.step_id); if (!step) continue
    const flow = lib.flows.find(f => f.id === step.flow_id); if (!flow) continue
    if (seen.has(flow.id)) continue
    seen.add(flow.id); out.push({ flow, step })
  }
  return out.sort((a, b) => a.flow.position - b.flow.position)
}
/** Lien vidéo : on n'accepte que YouTube et Instagram en https (même règle que le serveur) */
export function videoSource(url: string | null): "YouTube" | "Instagram" | null {
  if (!url) return null
  try {
    const u = new URL(url); if (u.protocol !== "https:") return null
    const h = u.hostname.replace(/^(www|m)\./, "")
    return h === "youtube.com" || h === "youtu.be" ? "YouTube" : h === "instagram.com" ? "Instagram" : null
  } catch { return null }
}

// ---------------------------------------------------------------- Contributions et gestion (lot C)
// Toutes les écritures passent par les fonctions serveur du script uzu-9 (droits vérifiés côté serveur).
type R<T> = { ok: true; data: T } | { ok: false; msg: string }
async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<R<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée" }
    clearLibraryCache()
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}
export type ItemInput = { kind: ItemKind; technique_id?: string | null; discipline_id?: string | null; title: string; body: string; url?: string | null; rights?: boolean }
export const saveItem = (id: string | null, item: ItemInput, submit: boolean) => rpc<{ id: string; status: ItemStatus }>("library_save_item", { p_id: id, p_item: item, p_submit: submit })
export const reviewItem = (id: string, decision: "publier" | "refuser" | "preciser", note: string, patch?: { title?: string; body?: string } | null) => rpc<ItemStatus>("library_review_item", { p_id: id, p_decision: decision, p_note: note, p_patch: patch || null })
export const archiveItem = (id: string) => rpc<boolean>("library_archive_item", { p_id: id })
export const setHidden = (technique: string, hidden: boolean) => rpc<boolean>("library_set_hidden", { p_technique: technique, p_hidden: hidden })
export const setDisciplines = (ids: string[]) => rpc<string[]>("library_set_disciplines", { p_disciplines: ids })
export const saveCollection = (id: string | null, name: string, description: string, position: number, items: ({ t: string } | { i: string })[]) => rpc<string>("library_save_collection", { p_id: id, p_name: name, p_description: description, p_position: position, p_items: items })
export const setDetails = (technique: string, steps: string, vigilance: string, level: number | null) => rpc<boolean>("library_set_details", { p_technique: technique, p_steps: steps, p_vigilance: vigilance, p_level: level })
export const deleteCollection = (id: string) => rpc<boolean>("library_delete_collection", { p_id: id })
export type QueueItem = ClubItem & { author_name: string; author_role: string; submitted_at: string }
export const reviewQueue = () => rpc<QueueItem[]>("library_review_queue")
/** Mes contributions (tous statuts) : la base ne renvoie que les miennes et les publiées */
export async function myItems(uid: string): Promise<R<ClubItem[]>> {
  const { data, error } = await uzu().from("club_lib_items").select("id,kind,technique_id,discipline_id,title,body,url,status,published_at,review_note,updated_at,rights_declared_at").eq("author_id", uid).order("updated_at", { ascending: false })
  return error ? { ok: false, msg: error.message } : { ok: true, data: (data || []) as ClubItem[] }
}
/** Contenus du club pour l'équipe (publiés et archivés) */
export async function clubItems(): Promise<R<ClubItem[]>> {
  const { data, error } = await uzu().from("club_lib_items").select("id,kind,technique_id,discipline_id,title,body,url,status,published_at,review_note,updated_at").in("status", ["publie", "archive"]).order("updated_at", { ascending: false })
  return error ? { ok: false, msg: error.message } : { ok: true, data: (data || []) as ClubItem[] }
}
export const STATUS_TXT: Record<ItemStatus, string> = { brouillon: "Brouillon", en_attente: "En attente", a_completer: "À compléter", publie: "Validée", refuse: "Refusée", archive: "Archivée" }
export const KIND_TXT: Record<ItemKind, string> = { technique: "Découverte technique", variante: "Variante", lien: "Vidéo ou lien", question: "Question pédagogique", astuce: "Astuce", note: "Annotation du professeur" }
