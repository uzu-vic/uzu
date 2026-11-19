// UZU — Class Media : contrôles sur la base de TEST réelle (les 15 tests obligatoires et R-1 à R-6).
// À lancer depuis ton ordinateur, APRÈS la mise en place décrite dans docs/class-media.md :
//
//   UZU_URL=https://ntypsrdwxrkanahhuixx.supabase.co UZU_KEY=<clé publique (publishable) de la base de test> \
//   UZU_CLUB="<nom exact du club de test>" \
//   STAFF_EMAIL=… STAFF_PASSWORD=…        (responsable du club de test)
//   MEMBER_A_EMAIL=… MEMBER_A_PASSWORD=…  (élève du club de test)
//   MEMBER_B_EMAIL=… MEMBER_B_PASSWORD=…  (autre élève du club de test)
//   OUTSIDER_EMAIL=… OUTSIDER_PASSWORD=…  (compte d'un AUTRE club, ou sans club)
//   node tests/class_media_live.mjs
//
// Le script refuse de tourner sur la production. Il n'affiche jamais de jeton, de mot de passe ni de chemin.
// Il crée dans le club de test deux groupes « CM test A » et « CM test B », des séances de test et des médias,
// puis dépublie et retire ce qu'il a créé (les fichiers retirés partent en quarantaine, effacés après 7 jours).
import fs from "fs"

const E = process.env, URL0 = (E.UZU_URL || "").replace(/\/$/, ""), KEY = E.UZU_KEY || ""
if (!URL0.includes("ntypsrdwxrkanahhuixx") || URL0.includes("ixkewdxtuhxfiodwhhzr")) { console.error("Arrêt : ce script ne tourne que sur la base de test ntypsrdwxrkanahhuixx."); process.exit(2) }
for (const k of ["UZU_KEY", "UZU_CLUB", "STAFF_EMAIL", "STAFF_PASSWORD", "MEMBER_A_EMAIL", "MEMBER_A_PASSWORD", "MEMBER_B_EMAIL", "MEMBER_B_PASSWORD", "OUTSIDER_EMAIL", "OUTSIDER_PASSWORD"])
  if (!E[k]) { console.error("Variable manquante : " + k); process.exit(2) }
if (KEY.startsWith("sb_secret") || /service_role/.test(Buffer.from((KEY.split(".")[1] || ""), "base64").toString())) { console.error("Arrêt : utilise la clé PUBLIQUE, jamais la clé secrète."); process.exit(2) }

const FN = URL0 + "/functions/v1/class-media", FIX = new URL("./fixtures/class-media/", import.meta.url)
const R = []; const ok = (l, c, g = "") => { R.push(!!c); console.log((c ? "✔ " : "✖ ") + l + (c ? "" : " → " + String(g).slice(0, 160))) }
const sleep = ms => new Promise(r => setTimeout(r, ms))
async function login(email, password) {
  const r = await fetch(`${URL0}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) })
  const j = await r.json(); if (!r.ok) throw new Error("Connexion impossible pour " + email.replace(/(.).*@/, "$1…@"))
  return { token: j.access_token, id: j.user.id }
}
const rpc = async (u, fn, args = {}) => {
  const r = await fetch(`${URL0}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + u.token, "Content-Type": "application/json" }, body: JSON.stringify(args) })
  const t = await r.text(); let j = null; try { j = JSON.parse(t) } catch { j = t }
  return r.ok ? { ok: true, data: j } : { ok: false, msg: (j && j.message) || t }
}
const must = async (p, what) => { const r = await p; if (!r.ok) throw new Error(what + " : " + r.msg); return r.data }
const stream = (tok, range, method = "GET") => fetch(`${FN}/stream?t=${tok}`, { method, headers: range ? { Range: range } : {} })
const fnPost = (u, action, body) => fetch(`${FN}/${action}`, { method: "POST", headers: { Authorization: "Bearer " + u.token, "Content-Type": "application/json" }, body: JSON.stringify(body) })
const upload = (u, path, bytes, mime) => fetch(`${URL0}/storage/v1/object/class-media/${path}`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + u.token, "Content-Type": mime, "x-upsert": "false", "cache-control": "max-age=0" }, body: bytes })
const noStore = r => /no-store/.test(r.headers.get("cache-control") || "") && /private/.test(r.headers.get("cache-control") || "")
async function addMedia(u, session, file, kind, mime, opts = {}) {
  const bytes = fs.readFileSync(new URL(file, FIX))
  const res = await rpc(u, "media_reserve", { p_session: session, p_kind: kind, p_mime: mime, p_size: bytes.length, p_rights: true, p_minors: !!opts.minors })
  if (!res.ok) return res
  const up = await upload(u, res.data.path, opts.body || bytes, opts.uploadMime || mime)
  if (!up.ok) return { ok: false, msg: "envoi " + up.status }
  const f = await fnPost(u, "finalize", { media: res.data.id })
  const j = await f.json().catch(() => ({}))
  return f.ok ? { ok: true, data: { id: res.data.id, validation: j.validation } } : { ok: false, msg: j.error || f.status, id: res.data.id }
}

const staff = await login(E.STAFF_EMAIL, E.STAFF_PASSWORD), A = await login(E.MEMBER_A_EMAIL, E.MEMBER_A_PASSWORD)
const B = await login(E.MEMBER_B_EMAIL, E.MEMBER_B_PASSWORD), X = await login(E.OUTSIDER_EMAIL, E.OUTSIDER_PASSWORD)
const ctx = await must(rpc(staff, "get_my_context"), "contexte")
if ((ctx.club?.name || "") !== E.UZU_CLUB) { console.error("Arrêt : le club actif du responsable n'est pas « " + E.UZU_CLUB + " »."); process.exit(2) }
console.log(`Club de test : ${ctx.club.name}\n`)

// Préparation : deux groupes, un élève dans chacun, une séance publiée et une séance en brouillon du groupe A
let secs = (await must(rpc(staff, "section_minors_list"), "groupes")).sections
for (const n of ["CM test A", "CM test B"]) if (!secs.some(s => s.name === n)) await must(rpc(staff, "upsert_section", { p_id: null, p_name: n, p_discipline: "" }), "création du groupe")
secs = (await must(rpc(staff, "section_minors_list"), "groupes")).sections
const GA = secs.find(s => s.name === "CM test A").id, GB = secs.find(s => s.name === "CM test B").id
await rpc(staff, "set_section_minors", { p_section: GA, p_minors: false })
await must(rpc(staff, "set_student_groups", { p_user: A.id, p_primary: GA, p_secondary: [] }), "groupe de l'élève A")
await must(rpc(staff, "set_student_groups", { p_user: B.id, p_primary: GB, p_secondary: [] }), "groupe de l'élève B")
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ")
const sess = (theme, publish) => must(rpc(staff, "journal_save_session", { p_id: null, p: { section_id: GA, course_key: null, session_date: new Date().toISOString().slice(0, 10), discipline_id: null, theme, objective: "", exercises: "", comment: "", previous_session_id: null, techniques: [] }, p_publish: publish }), "séance")
const S1 = (await sess("Test Class Media " + stamp, true)).id, S2 = (await sess("Test Class Media brouillon " + stamp, false)).id

// ---- Envoi et refus
ok("6 · adhérent : ne peut pas ajouter", !(await rpc(A, "media_reserve", { p_session: S1, p_kind: "photo", p_mime: "image/jpeg", p_size: 1000, p_rights: true, p_minors: false })).ok)
ok("11 · sans confirmation d'accord : refusé", !(await rpc(staff, "media_reserve", { p_session: S1, p_kind: "photo", p_mime: "image/jpeg", p_size: 1000, p_rights: false, p_minors: false })).ok)
ok("9 · plus de 50 Mo : refusé", !(await rpc(staff, "media_reserve", { p_session: S1, p_kind: "video", p_mime: "video/mp4", p_size: 52428801, p_rights: true, p_minors: false })).ok)
let r = await addMedia(staff, S1, "clean.jpg", "photo", "image/png")
ok("10 · JPEG annoncé en PNG : refusé par la fonction serveur", !r.ok && /Format réel/.test(r.msg), r.msg)
r = await addMedia(staff, S1, "photo_gps.jpg", "photo", "image/jpeg")
ok("photo avec EXIF et position : refusée par la fonction serveur", !r.ok && /métadonnées/.test(r.msg), r.msg)
r = await addMedia(staff, S1, "iphone_like.mov", "video", "video/quicktime")
ok("vidéo MOV avec position (non neutralisée) : refusée", !r.ok && /position/.test(r.msg), r.msg)
const P1 = await addMedia(staff, S1, "clean.jpg", "photo", "image/jpeg")
const V1 = await addMedia(staff, S1, "long.webm", "video", "video/webm")
ok("photo et vidéo valides : acceptées et validées (groupe sans mineurs)", P1.ok && V1.ok && V1.data.validation === "approved", P1.msg || V1.msg)

// ---- Lecture
let m = await must(rpc(A, "session_media", { p_session: S1 }), "médias A")
ok("1 · adhérent du groupe A : voit les médias de son groupe", m.items.length === 2 && !JSON.stringify(m).includes(S1 + "/"))
let tk = (await must(rpc(A, "media_ticket", { p_media: V1.data.id }), "jeton")).token
let s = await stream(tk, "bytes=0-1")
ok("iPhone · sonde bytes=0-1 : 206, 2 octets, taille totale, plages acceptées", s.status === 206 && (await s.arrayBuffer()).byteLength === 2 && /^bytes 0-1\/\d+$/.test(s.headers.get("content-range") || "") && s.headers.get("accept-ranges") === "bytes")
s = await stream(tk, null, "HEAD"); ok("iPhone · requête HEAD acceptée", s.status === 206 || s.status === 200)
s = await stream(tk, "bytes=0-")
ok("R-4 · réponses sans cache (no-store, private), morceau de 2 Mo au plus", s.status === 206 && noStore(s) && Number(s.headers.get("content-length")) <= 2097152 && !(s.headers.get("location") || "").includes("storage"))
await s.arrayBuffer()
ok("2 · adhérent du groupe B : ni liste ni jeton", !(await rpc(B, "session_media", { p_session: S1 })).ok && !(await rpc(B, "media_ticket", { p_media: V1.data.id })).ok)
ok("5 · compte extérieur au club : refusé", !(await rpc(X, "session_media", { p_session: S1 })).ok && !(await rpc(X, "media_ticket", { p_media: P1.data.id })).ok)
ok("15 · autre club : ni retrait ni validation", !(await rpc(X, "media_remove", { p_media: P1.data.id, p_reason: "" })).ok && !(await rpc(X, "media_validate", { p_media: P1.data.id, p_decision: "rejected", p_note: "" })).ok)
ok("7 · adhérent : ne peut pas supprimer", !(await rpc(A, "media_remove", { p_media: P1.data.id, p_reason: "" })).ok)
const st = await fetch(`${URL0}/storage/v1/object/authenticated/class-media/${ctx.club.id}/${S1}/${V1.data.id}.webm`, { headers: { apikey: KEY, Authorization: "Bearer " + A.token } })
const sg = await fetch(`${URL0}/storage/v1/object/sign/class-media/${ctx.club.id}/${S1}/${V1.data.id}.webm`, { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + staff.token, "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }) })
ok("R-5 · lecture directe du stockage ou lien signé : refusés, même pour l'équipe", !st.ok && !sg.ok, `${st.status} ${sg.status}`)
const D1 = await addMedia(staff, S2, "clean.jpg", "photo", "image/jpeg")
ok("3 · brouillon : rien pour l'adhérent", D1.ok && !(await rpc(A, "session_media", { p_session: S2 })).ok && !(await rpc(A, "media_ticket", { p_media: D1.data.id })).ok)

// ---- R-1 / R-3 / R-6 : dépublication pendant la lecture, quarantaine, republication
tk = (await must(rpc(A, "media_ticket", { p_media: V1.data.id }), "jeton")).token
s = await stream(tk, "bytes=0-65535"); await s.arrayBuffer()
const t0 = Date.now()
await must(rpc(staff, "journal_set_status", { p_id: S1, p_status: "depublie" }), "dépublication")
s = await stream(tk, "bytes=65536-131071")
ok(`R-1 / 4 · dépublication : morceau suivant refusé (${Date.now() - t0} ms après)`, s.status === 403 && noStore(s), s.status)
s = await stream(tk, "bytes=0-65535")
ok("R-3 · la même requête rejouée : refusée", s.status === 403)
await fnPost(staff, "reconcile", { session: S1 }); await sleep(1500)
let sm = await must(rpc(staff, "session_media", { p_session: S1 }), "médias équipe")
ok("quarantaine : les deux fichiers ont été déplacés (emplacement constaté après le déplacement)", sm.items.filter(i => i.location === "quarantine").length === 2, JSON.stringify(sm.items.map(i => i.location)))
await must(rpc(staff, "journal_set_status", { p_id: S1, p_status: "publie" }), "republication")
await fnPost(staff, "reconcile", { session: S1 }); await sleep(1500)
sm = await must(rpc(staff, "session_media", { p_session: S1 }), "médias équipe")
const tk2 = (await must(rpc(A, "media_ticket", { p_media: V1.data.id }), "nouveau jeton")).token
ok("R-6 · republication : fichiers revenus, ancien jeton refusé, nouveau jeton accepté", sm.items.every(i => i.location === "main") && (await stream(tk, "bytes=0-1")).status === 403 && (await stream(tk2, "bytes=0-1")).status === 206)

// ---- R-2 : autres coupures pendant la lecture
const cut = async (label, act, undo) => {
  const t = (await rpc(A, "media_ticket", { p_media: V1.data.id })).data?.token
  const a = t ? (await stream(t, "bytes=0-1")).status : 0
  await act()
  const b = t ? (await stream(t, "bytes=2-3")).status : 0
  ok(`R-2 · ${label} : refus dès la requête suivante`, a === 206 && b === 403, `${a} → ${b}`)
  if (undo) await undo()
}
await cut("sortie du groupe", () => rpc(staff, "set_student_groups", { p_user: A.id, p_primary: GB, p_secondary: [] }), () => rpc(staff, "set_student_groups", { p_user: A.id, p_primary: GA, p_secondary: [] }))
await cut("passage en groupe de mineurs (V3)", () => rpc(staff, "set_section_minors", { p_section: GA, p_minors: true }), async () => { await rpc(staff, "set_section_minors", { p_section: GA, p_minors: false }); await rpc(staff, "media_validate", { p_media: V1.data.id, p_decision: "approved", p_note: "test" }); await rpc(staff, "media_validate", { p_media: P1.data.id, p_decision: "approved", p_note: "test" }) })
ok("12 · groupe de mineurs : sans deuxième confirmation, refusé", await (async () => { await rpc(staff, "set_section_minors", { p_section: GA, p_minors: true }); const x = await rpc(staff, "media_reserve", { p_session: S1, p_kind: "photo", p_mime: "image/jpeg", p_size: 1667, p_rights: true, p_minors: false }); return !x.ok })())
const M1 = await addMedia(staff, S1, "clean.jpg", "photo", "image/jpeg", { minors: true })
ok("D4 · groupe de mineurs : média en attente, invisible pour l'adhérent", M1.ok && M1.data.validation === "pending_validation" && !(await rpc(A, "media_ticket", { p_media: M1.data.id })).ok)
await rpc(staff, "media_validate", { p_media: M1.data.id, p_decision: "rejected", p_note: "test" })
ok("D4 · média refusé : jamais visible", !(await rpc(A, "media_ticket", { p_media: M1.data.id })).ok)
await rpc(staff, "set_section_minors", { p_section: GA, p_minors: false })
await cut("retrait par l'équipe (13)", () => rpc(staff, "media_remove", { p_media: V1.data.id, p_reason: "test" }))
ok("8 · cinquième média refusé", await (async () => { const out = []; for (let i = 0; i < 4; i++) out.push(await rpc(staff, "media_reserve", { p_session: S1, p_kind: "photo", p_mime: "image/jpeg", p_size: 1667, p_rights: true, p_minors: false })); return out.some(x => !x.ok && /Limite/.test(x.msg)) })())
const t30 = (await must(rpc(A, "media_ticket", { p_media: P1.data.id, p_seconds: 30 }), "jeton court")).token
const d1 = (await stream(t30, null)).status
const rq = await rpc(A, "media_request_removal", { p_media: P1.data.id, p_reason: "test" })
ok("R-2 · demande de retrait par l'adhérent : refus dès la requête suivante", d1 === 200 && rq.ok && (await stream(t30, null)).status === 403)
const t31 = (await rpc(staff, "media_ticket", { p_media: D1.data.id, p_seconds: 30 })).data?.token
console.log("  … attente de 32 s pour l'expiration du jeton (test 14)"); await sleep(32000)
s = t31 ? await stream(t31, null) : null
ok("14 · jeton expiré : plus d'accès", s && s.status === 403 && (await s.json()).code === "expired")

// ---- Nettoyage : séances dépubliées, médias retirés (quarantaine, effacement automatique)
await rpc(staff, "journal_set_status", { p_id: S1, p_status: "depublie" }); await fnPost(staff, "reconcile", { session: S1 })
for (const id of [P1, D1].map(x => x.data?.id).filter(Boolean)) await rpc(staff, "media_remove", { p_media: id, p_reason: "fin du test" })
await fnPost(staff, "reconcile", { session: S2 })
console.log(`\n${R.filter(Boolean).length}/${R.length} vérifications réussies`)
console.log("À vérifier à la main : lecture d'une vidéo sur un iPhone (Safari) dans l'aperçu, et journaux de la fonction (aucun jeton ni chemin).")
process.exit(R.every(Boolean) ? 0 : 1)
