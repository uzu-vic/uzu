"use client"
// Espace Club — accès aux données de l'académie.
// Toutes les écritures passent par les fonctions serveur de la migration « équipe » (vérification des
// droits, de l'académie active et journalisation côté serveur). Les lectures passent par les règles RLS :
// chacun ne reçoit que ce que ses droits autorisent. Les contrôles faits ici servent seulement à
// adapter l'affichage.
import { uzu } from "./client"
import type { UzuContext } from "./context"
import { can, scopeOf } from "./permissions"
import { normSched, slotOpenOn, type Slot } from "./training"
import { newCore } from "./journal"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any
export type RpcResult<T> = { ok: true; data: T } | { ok: false; msg: string }

export async function call<T = Any>(name: string, args: Record<string, unknown> = {}): Promise<RpcResult<T>> {
  try {
    const { data, error } = await uzu().rpc(name, args)
    if (error) return { ok: false, msg: error.message || "Action refusée" }
    return { ok: true, data: data as T }
  } catch (e) { return { ok: false, msg: (e as Error).message || "Réseau indisponible" } }
}

async function docsLike(prefix: string): Promise<Record<string, Any>> {
  const { data, error } = await uzu().from("docs").select("path,data").like("path", prefix + "%")
  if (error) throw new Error(error.message)
  const out: Record<string, Any> = {}
  for (const r of (Array.isArray(data) ? data : []) as { path: string; data: Any }[]) out[r.path.slice(prefix.length)] = r.data
  return out
}

// ---------- Mes cours (portées « Ses cours » et « Sa section ») ----------
export type MyCourses = { assigned: string[]; section: string[]; staff: { course_key: string; name: string; role: string; date: string | null }[] }
export async function getMyCourses(): Promise<MyCourses> {
  const r = await call<MyCourses>("get_my_courses")
  return r.ok && r.data && (r.data as Any).staff ? r.data : { assigned: [], section: [], staff: [] }
}
export function courseAllowed(ctx: UzuContext | null, mc: MyCourses, res: string, act: string, key: string): boolean {
  const s = scopeOf(ctx, res, act)
  if (!s) return false
  if (s === "academy") return true
  if (s === "assigned_courses") return mc.assigned.includes(key)
  if (s === "section") return mc.section.includes(key)
  return false
}

// ---------- Appel ----------
const DSHORT = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"]
const pad = (n: number) => String(n).padStart(2, "0")
const ymdOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const isoDay = (d: Date) => ((d.getDay() + 6) % 7) + 1
const slotMin = (x: Slot) => { const a = x.s.split(":"), b = x.e.split(":"); return (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]) }
export type RollOption = { key: string; course: string; date: string; title: string; dur: number; label: string }

/** Cours des 8 derniers jours ouverts à l'appel (même liste que l'ancienne application). */
export function rollOptions(ctx: UzuContext | null, mc: MyCourses, now = new Date()): RollOption[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), t = ymdOf(today), S = normSched(ctx?.club?.schedule)
  const out: RollOption[] = []
  for (let k = 0; k < 8; k++) {
    const dd = new Date(today); dd.setDate(dd.getDate() - k)
    const ds = ymdOf(dd), dn = isoDay(dd)
    S.filter(x => x.d === dn && slotOpenOn(ctx?.club, x, ds)).sort((a, b) => (a.s < b.s ? 1 : -1)).forEach(x => out.push({ key: ds + "|" + x.id, course: x.id, date: ds, title: x.t, dur: Math.max(30, slotMin(x)), label: (k === 0 ? "Aujourd'hui" : DSHORT[dn - 1] + " " + dd.getDate()) + " · " + x.s + " · " + x.t }))
  }
  if (!out.length || out[0].date !== t) out.unshift({ key: t + "|libre", course: "libre", date: t, title: "Cours du jour", dur: 90, label: "Aujourd'hui · cours hors planning" })
  return out.filter(o => o.course === "libre" ? scopeOf(ctx, "attendance", "create") === "academy" : (courseAllowed(ctx, mc, "attendance", "view", o.course) || courseAllowed(ctx, mc, "attendance", "create", o.course)))
}
export async function getRollStudents(course: string, myUid: string): Promise<{ id: string; name: string }[]> {
  const r = await call<{ id: string; name: string }[]>("get_roll_students", { p_course: course })
  return r.ok ? (r.data || []).filter(x => x.id !== myUid) : []
}
export async function getRollDocs(): Promise<Record<string, { s?: Any[]; a?: string[] }>> {
  try { return await docsLike("roll/") } catch { return {} }
}
export async function saveAttendance(ctx: UzuContext | null, o: RollOption, marks: Record<string, "p" | "a" | null>): Promise<RpcResult<Any>> {
  const tf = (ctx?.club?.tactical_focus || {}) as Any
  return call("set_attendance", { p_course: o.course, p_date: o.date, p_title: o.title, p_dur: o.dur, p_theme: tf.weekTheme || o.title, p_sys: tf.focusFrom || "", p_marks: marks })
}

// ---------- Élèves (même calcul que l'ancienne application, règles extraites telles quelles) ----------
export type StudentRow = {
  id: string; name: string; belt: { rank: string; stripes: number; since: string }; req: Any | null
  n30: number; days: number; sess: Any[]; P: Any; joined: string; comps: Any[]; hist: Any[]; hours: number
  ver: Record<string, Any>; mast: number; stars3: number; medals: { or: number; argent: number; bronze: number }; grade: Any | null; att: Any; demo: Any
}
export type ClubData = { rows: StudentRow[]; roll: Record<string, { s?: Any[]; a?: string[] }>; grades: Record<string, Any>; C: Any }

export async function loadClubData(myUid: string): Promise<ClubData> {
  const [members, grades, roll] = await Promise.all([docsLike("members/"), docsLike("grades/").catch(() => ({})), docsLike("roll/").catch(() => ({}))])
  const C = newCore(), lim = C.ymd(C.addDays(C.TODAY, -30))
  const rows: StudentRow[] = Object.keys(members).filter(id => id !== myUid).map(id => {
    const x = C.normalize(members[id]), g = (grades as Any)[id] || null, vr = (g && g.verified) || {}
    // Confidentialité : l'état physique et les notes de l'élève ne quittent jamais son espace
    const own = x.sessions.map((s: Any) => { const c = { ...s }; delete c.note; delete c.forme; return c })
    const S = C.mergeRoll(own, ((roll as Any)[id] && (roll as Any)[id].s) || [])
    const last = S.reduce((a: string, s: Any) => (s.date > a ? s.date : a), "")
    const days = last ? Math.round((C.TODAY - C.parse(last)) / 864e5) : 999
    const P = { sessions: S, skills: x.skills, coach: C.normCoach(vr) }
    return {
      id, name: String(x.name || "Élève"), belt: g ? C.normBelt(g) : { rank: "blanche", stripes: 0, since: "" }, req: C.isPending(x.request, g) ? x.request : null,
      n30: S.filter((s: Any) => s.date > lim).length, days, sess: S, P, joined: (x.consent && x.consent.at) || "", comps: x.comps || [], hist: C.gradeHist(g),
      hours: Math.round(C.mat(S).reduce((a: number, s: Any) => a + (+s.dur || 0), 0) / 60), ver: vr, mast: C.sysStats(P).avg, stars3: C.count3(P),
      medals: C.medalsOf(x.comps), grade: g, att: x.att, demo: x.demo || {},
    }
  })
  return { rows: rows.sort((a, b) => a.days - b.days), roll: roll as Any, grades: grades as Any, C }
}

/** Synthèse des appels (présents / absents par cours) sur N jours. */
export function rollSummary(C: Any, roll: ClubData["roll"], schedule: unknown, days: number) {
  const lim = C.ymd(C.addDays(C.TODAY, -days)), S = normSched(schedule), agg: Record<string, { key: string; date: string; title: string; p: number; a: number }> = {}
  const title = (k: string) => { const sid = String(k).split("|")[1]; if (sid === "libre") return "Cours du jour"; return S.find(x => x.id === sid)?.t || "Cours" }
  const add = (k: string, date: string, t: string, isP: boolean) => { if (!date || date < lim) return; const o = agg[k] || (agg[k] = { key: k, date, title: t || title(k), p: 0, a: 0 }); if (isP) o.p++; else o.a++ }
  Object.keys(roll).forEach(uid => { const d = roll[uid] || {}; (d.s || []).forEach((e: Any) => add(e.k, e.date, e.title, true)); (d.a || []).forEach(k => add(k, String(k).split("|")[0], "", false)) })
  return Object.values(agg).sort((a, b) => (a.date < b.date ? 1 : -1))
}
export const hasRoll = (roll: ClubData["roll"], uid: string, key: string) => !!(roll[uid]?.s || []).some((r: Any) => r.k === key)
export const hasAbs = (roll: ClubData["roll"], uid: string, key: string) => (roll[uid]?.a || []).includes(key)

/** Texte d'une demande de ceinture (même formulation que l'ancienne application). */
export function reqText(C: Any, a: Any, b: Any): string {
  const bn = C.BELTS[C.beltIdx(b.rank)].n
  if (a.rank === b.rank && b.stripes > a.stripes) return "Demande de " + C.ordFr(b.stripes) + " barrette " + bn
  if (a.rank !== b.rank) return "Demande de ceinture " + bn + (b.stripes ? ", " + C.stripesTxt(b.stripes) : "")
  return "Correction de grade"
}

/** Assiduité aux cours du planning sur 30 jours. */
export function assidOf(C: Any, schedule: unknown, att: Any, sessions: Any[], club?: unknown) {
  const sch = normSched(schedule); let tot = 0, pr = 0
  for (let k = 0; k < 30; k++) {
    const dd = C.addDays(C.TODAY, -k), dS = C.ymd(dd), dn = isoDay(dd)
    sch.forEach(x => { if (x.d !== dn || (club && !slotOpenOn(club, x, dS))) return; tot++; const a = (att || {})[dS + "|" + x.id]; if (a === "oui" || (a !== "non" && sessions.some(s => s.date === dS && !C.isPrepa(s)))) pr++ })
  }
  return { pr, tot }
}
export const removeStudent = (id: string) => call<boolean>("remove_student", { p_student: id })

// ---------- Notes pédagogiques (table dédiée, notes privées réservées à leur auteur) ----------
export type Note = { id: string; author_user_id: string; visibility: "private" | "team"; body: string; legacy: boolean; created_at: string; updated_at?: string }
export async function listNotes(academyId: string, studentId: string): Promise<Note[]> {
  const { data, error } = await uzu().from("pedagogical_notes").select("id,author_user_id,visibility,body,legacy,created_at,updated_at")
    .eq("student_id", studentId).eq("academy_id", academyId).is("deleted_at", null).order("created_at", { ascending: false })
  if (error) throw new Error(error.message)
  return Array.isArray(data) ? (data as Note[]) : []
}
export async function addNote(academyId: string, studentId: string, myUid: string, body: string, vis: "private" | "team"): Promise<RpcResult<null>> {
  const { error } = await uzu().from("pedagogical_notes").insert({ academy_id: academyId, student_id: studentId, author_user_id: myUid, visibility: vis, body: body.trim().slice(0, 2000) })
  return error ? { ok: false, msg: error.message } : { ok: true, data: null }
}
export async function deleteNote(id: string): Promise<RpcResult<null>> {
  const { error } = await uzu().from("pedagogical_notes").update({ deleted_at: new Date().toISOString() }).eq("id", id)
  return error ? { ok: false, msg: error.message } : { ok: true, data: null }
}

// ---------- Grades ----------
export type Proposal = { id: string; student_id: string; rank: string; stripes: number; since: string; comment: string; proposed_by: string; created_at: string }
export async function listProposals(academyId: string): Promise<Proposal[]> {
  const { data, error } = await uzu().from("belt_history").select("id,student_id,rank,stripes,since,comment,proposed_by,created_at")
    .eq("academy_id", academyId).eq("status", "proposed").order("created_at", { ascending: false })
  if (error) return []
  return Array.isArray(data) ? (data as Proposal[]) : []
}
export const decideGrade = (student: string, rank: string, stripes: number, since: string, status: "validé" | "refusé", comment = "") =>
  call("decide_grade", { p_student: student, p_rank: rank, p_stripes: stripes, p_since: since, p_status: status, p_comment: comment })
export const proposeGrade = (student: string, rank: string, stripes: number, since: string, comment = "") =>
  call("propose_grade", { p_student: student, p_rank: rank, p_stripes: stripes, p_since: since, p_comment: comment })
export const cancelProposal = (id: string) => call("cancel_grade_proposal", { p_id: id })
export const verifyTechnique = (student: string, tech: string, on: boolean) => call("verify_technique", { p_student: student, p_tech: tech, p_on: on })

// ---------- Équipe, académie, journal ----------
export const getTeam = () => call<Any>("get_team")
export const getAudit = (limit = 50, before: number | null = null) => call<Any[]>("get_audit_log", { p_limit: limit, p_before: before })

export function canAny(ctx: UzuContext | null, pairs: [string, string][]): boolean { return pairs.some(([r, a]) => can(ctx, r, a)) }

// ---------- Catalogues de l'équipe (mêmes libellés et modèles que l'ancienne application) ----------
export const ROLE_LBL: Record<string, string> = { owner: "Responsable", section_lead: "Responsable de section", instructor: "Professeur", assistant: "Assistant", student: "Élève" }
export const STATUS_LBL: Record<string, string> = { active: "Actif", suspended: "Suspendu", removed: "Retiré", pending: "Invitation en attente", expired: "Invitation expirée" }
export const SCOPE_LBL: Record<string, string> = { academy: "Toute l'académie", section: "Sa section", assigned_courses: "Ses cours", authorized_students: "Élèves confiés", own_content: "Ses contenus" }
export const SENSITIVE: Record<string, 1> = { "instructors.create": 1, "instructors.update": 1, "instructors.delete": 1, "academy_settings.update": 1, "belts.approve": 1, "academy_audit_logs.view": 1, "students.delete": 1 }
export const PERM_CAT: [string, string, string[], string[]][] = [
  ["dashboard", "Tableau de bord", ["view"], ["academy"]],
  ["students", "Élèves", ["view", "create", "delete"], ["academy", "section", "assigned_courses", "authorized_students"]],
  ["courses", "Cours", ["view", "create", "update", "delete", "manage"], ["academy", "section", "assigned_courses"]],
  ["sessions", "Séances", ["view", "update"], ["academy", "section", "assigned_courses"]],
  ["attendance", "Présences", ["view", "create", "update", "delete"], ["academy", "section", "assigned_courses"]],
  ["progression", "Progression", ["view", "update"], ["academy", "section", "assigned_courses", "authorized_students"]],
  ["belts", "Grades et ceintures", ["view", "create", "approve"], ["academy", "section", "assigned_courses", "authorized_students"]],
  ["pedagogical_notes", "Notes pédagogiques", ["view", "create", "update", "delete"], ["academy", "section", "assigned_courses", "authorized_students"]],
  ["contents", "Contenus", ["view", "create", "update", "delete"], ["academy", "own_content"]],
  ["schedule", "Planning", ["view"], ["academy"]],
  ["instructors", "Équipe pédagogique", ["view", "create", "update", "delete"], ["academy"]],
  ["academy_statistics", "Statistiques", ["view"], ["academy"]],
  ["communications", "Communication", ["view", "create", "delete"], ["academy"]],
  ["academy_settings", "Paramètres", ["view", "update"], ["academy"]],
  ["academy_audit_logs", "Journal d'activité", ["view"], ["academy"]],
  ["library", "Bibliothèque technique", ["approve", "manage"], ["academy"]],
]
export const ACT_LBL: Record<string, string> = { view: "Consulter", create: "Créer", update: "Modifier", delete: "Supprimer", approve: "Valider", manage: "Gérer" }
export const ACT_OVR: Record<string, Record<string, string>> = {
  students: { create: "Inviter (code club)", delete: "Retirer de l'académie" }, courses: { manage: "Affecter l'encadrement" }, sessions: { update: "Encadrement d'une séance" },
  attendance: { create: "Faire l'appel", update: "Corriger un appel", delete: "Effacer un pointage" }, progression: { update: "Valider les ★★★" }, belts: { create: "Proposer", approve: "Valider définitivement" },
  contents: { create: "Publier", update: "Modifier", delete: "Retirer" }, instructors: { create: "Inviter", update: "Rôles, droits, affectations", delete: "Suspendre ou retirer" },
  communications: { create: "Publier une annonce", delete: "Retirer une annonce" },
  library: { approve: "Valider les contributions", manage: "Collections et fiches masquées" },
}
export const actLabel = (r: string, a: string) => ACT_OVR[r]?.[a] || ACT_LBL[a] || a
const T = (l: string) => l.split(" ").map(x => { const p = x.split(":"); return { r: p[0], a: p[1], s: p[2] || "academy" } })
export const PERM_TPL: Record<string, { r: string; a: string; s: string }[]> = {
  instructor: T("dashboard:view schedule:view students:view courses:view sessions:view:assigned_courses sessions:update:assigned_courses attendance:view attendance:create:assigned_courses attendance:update:assigned_courses progression:view progression:update belts:view belts:create pedagogical_notes:view pedagogical_notes:create pedagogical_notes:update contents:view contents:create:own_content contents:update:own_content communications:view"),
  assistant: T("dashboard:view schedule:view students:view:assigned_courses courses:view:assigned_courses sessions:view:assigned_courses attendance:view:assigned_courses attendance:create:assigned_courses attendance:update:assigned_courses communications:view"),
  section_lead: T("dashboard:view schedule:view students:view:section courses:view courses:update:section courses:manage:section sessions:view:section sessions:update:section attendance:view:section attendance:create:section attendance:update:section attendance:delete:section progression:view:section progression:update:section belts:view:section belts:create:section belts:approve:section pedagogical_notes:view:section pedagogical_notes:create:section pedagogical_notes:update:section contents:view contents:create:own_content contents:update:own_content contents:delete:own_content communications:view academy_statistics:view instructors:view"),
  custom: [],
}
export const TPL_LBL: Record<string, string> = { instructor: "Professeur standard", assistant: "Assistant", section_lead: "Responsable de section", custom: "Personnalisé (tout désactivé)" }
export type PermDraft = Record<string, Record<string, string>>
export function tplMap(k: string): PermDraft { const m: PermDraft = {}; (PERM_TPL[k] || []).forEach(p => { (m[p.r] = m[p.r] || {})[p.a] = p.s }); return m }
export function mapToList(m: PermDraft | null | undefined) {
  const o: { r: string; a: string; s: string; e: "allow" }[] = []
  Object.keys(m || {}).forEach(r => Object.keys(m![r]).forEach(a => { const s = m![r][a]; if (s && s !== "deny") o.push({ r, a, s, e: "allow" }) }))
  return o
}
export const AUDIT_LBL: Record<string, string> = {
  "academy.created": "Académie créée", "academy.updated": "Académie modifiée", "academy.invite_code": "Code invitation changé", "academy.ownership_transferred": "Responsabilité transférée",
  "invitation.created": "Invitation envoyée", "invitation.revoked": "Invitation annulée", "invitation.resent": "Nouveau lien d'invitation", "invitation.accepted": "Invitation acceptée",
  "member.role_changed": "Rôle modifié", "member.permissions_changed": "Droits modifiés", "member.suspended": "Membre suspendu", "member.reactivated": "Membre réactivé", "member.removed": "Membre retiré", "member.left": "Membre parti", "member.students_assigned": "Élèves confiés",
  "attendance.saved": "Appel enregistré", "grade.validated": "Grade validé", "grade.refused": "Grade refusé", "grade.proposed": "Grade proposé", "grade.proposal_cancelled": "Proposition annulée",
  "technique.verified": "★★★ validée", "technique.unverified": "★★★ retirée", "course.staff_changed": "Encadrement modifié", "course.updated": "Cours modifié", "section.saved": "Section enregistrée", "student.removed": "Élève retiré",
}
export const DISCIPLINES: [string, string][] = [["jjb", "JJB"], ["grappling", "Grappling"], ["mma", "MMA"], ["lutte", "Lutte"], ["boxe", "Boxe anglaise"], ["muaythai", "Muay-thaï"], ["kick", "Kick / K-1"], ["judo", "Judo"], ["prepa", "Préparation physique"]]
export const PRESETS: Record<string, { n: string; l: string }> = {
  cyan: { n: "Cyan électrique", l: "#0891B2" }, sceau: { n: "Bordeaux UZU", l: "#941B2B" }, vif: { n: "Rouge vif", l: "#C8102E" }, orange: { n: "Orange", l: "#C2410C" },
  or: { n: "Or", l: "#8A6A0E" }, vert: { n: "Vert", l: "#1F6B45" }, turquoise: { n: "Turquoise", l: "#0F766E" }, marine: { n: "Bleu marine", l: "#1E3A5F" },
}
export const STAFF_ROLES: [string, string][] = [["", "—"], ["lead", "Prof principal"], ["associate", "Prof associé"], ["assistant", "Assistant"]]

// ---------- Écritures : équipe, cours, académie (fonctions serveur, droits revérifiés côté serveur) ----------
export type TeamMember = { id: string; user_id: string; role: string; status: string; section_id: string | null; name: string; email: string; joined_at: string; is_me: boolean; courses: number; last_activity: string | null; perms: PermDraft | null; students: string[] }
export type Team = { members: TeamMember[]; invitations: { id: string; email: string; role: string; status: string; expires_at: string }[]; sections: { id: string; name: string; discipline: string }[]; course_staff: { course_key: string; member_id: string; role: string; date: string | null }[]; course_meta: { course_key: string; section_id: string | null; discipline: string; level: string }[] }
export const createInvitation = (email: string, role: string, perms: ReturnType<typeof mapToList>) => call<Any>("create_invitation", { p_email: email, p_role: role, p_section: null, p_perms: role === "owner" ? [] : perms })
export const revokeInvitation = (id: string) => call("revoke_invitation", { p_id: id })
export const resendInvitation = (id: string) => call<Any>("resend_invitation", { p_id: id })
export const setMemberRole = (id: string, role: string, section: string | null) => call("set_member_role", { p_member: id, p_role: role, p_section: section })
export const setMemberPermissions = (id: string, perms: ReturnType<typeof mapToList>) => call("set_member_permissions", { p_member: id, p_perms: perms })
export const setMemberStatus = (id: string, status: "active" | "suspended" | "removed") => call("set_member_status", { p_member: id, p_status: status })
export const transferOwnership = (id: string) => call("transfer_ownership", { p_member: id })
export const setStudentAccess = (id: string, students: string[]) => call("set_student_access", { p_member: id, p_students: students })
export const upsertSection = (name: string) => call<string>("upsert_section", { p_id: null, p_name: name, p_discipline: "" })
export const setCourseStaff = (course: string, date: string | null, staff: { member_id: string; role: string }[]) => call("set_course_staff", { p_course: course, p_date: date, p_staff: staff })
export const setCourseMeta = (course: string, section: string | null, discipline: string, level: string) => call("set_course_meta", { p_course: course, p_section: section, p_discipline: discipline, p_level: level })
/** Modification partielle de l'académie : le serveur ne contrôle que les champs réellement changés. */
export const updateAcademy = (patch: Record<string, unknown>) => call<Any>("update_academy", { p_patch: patch })
export const updateInviteCode = (code: string) => call<string>("update_invite_code", { new_code: code })
export const leaveAcademy = () => call("leave_academy", {})
export const inviteUrl = (token: string) => window.location.origin + "/?invite=" + encodeURIComponent(token)

// ---------- Bilan d'activité (subventions) : même calcul que l'ancienne application ----------
export const seasonYear = (d: Date) => (d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1)
export function seasonOf(C: Any, y: number) {
  const a = new Date(y, 8, 1), b = new Date(y + 1, 7, 31), e = b < C.TODAY ? b : C.TODAY
  return { y, label: y + "-" + (y + 1), from: C.ymd(a), to: C.ymd(b), until: C.ymd(e), weeks: Math.max(1, Math.round((+e - +a) / (7 * 864e5) + 1 / 7)), closed: b < C.TODAY }
}
export function bilanCalc(C: Any, rows: StudentRow[], se: ReturnType<typeof seasonOf>) {
  const R = rows.map(r => ({ demo: r.demo || {}, sessions: C.mat(r.sess || []).filter((x: Any) => x.date >= se.from && x.date <= se.to), comps: (r.comps || []).filter((c: Any) => c.date >= se.from && c.date <= se.to), hist: r.hist || [] }))
  const act = R.filter(r => r.sessions.length > 0)
  const z = () => ({ h: 0, f: 0, a: 0, n: 0 })
  const o: Any = { inscrits: R.length, actifs: act.length, sex: z(), pyr: {}, sessions: 0, minutes: 0, ceintures: 0, barrettes: 0, byBelt: {}, medals: { or: 0, argent: 0, bronze: 0 }, podiums: 0, parts: 0, competiteurs: 0, wins: 0, losses: 0 }
  ;(C.AGES as Any[]).forEach(a => { o.pyr[a.k] = z() }); o.pyr.nr = z()
  act.forEach(r => {
    const sx = C.SEXES[r.demo && r.demo.sex] ? r.demo.sex : "n", ag = C.ageIdx(r.demo && r.demo.age) > -1 ? r.demo.age : "nr"
    o.sex[sx]++; o.pyr[ag][sx]++
    r.sessions.forEach((x: Any) => { o.sessions++; o.minutes += +x.dur || 0 })
  })
  R.forEach(r => {
    if (r.comps.length) { o.competiteurs++; o.parts += r.comps.length }
    r.comps.forEach((c: Any) => { if (o.medals[c.result] !== undefined) { o.medals[c.result]++; o.podiums++ } o.wins += +c.wins || 0; o.losses += +c.losses || 0 })
    const H = r.hist.filter((h: Any) => h.status !== "refusé").slice().sort((a: Any, b: Any) => (a.at < b.at ? -1 : 1))
    let prev: Any = { rank: "blanche", stripes: 0 }
    H.forEach((h: Any) => {
      const d = C.day10(h.at)
      if (d >= se.from && d <= se.to) {
        const bk = C.BELTS[C.beltIdx(h.rank)].k; o.byBelt[bk] = o.byBelt[bk] || { c: 0, b: 0 }
        if (h.rank !== prev.rank) { o.ceintures++; o.byBelt[bk].c++ } else if (+h.stripes > +prev.stripes) { o.barrettes += (+h.stripes - +prev.stripes); o.byBelt[bk].b += (+h.stripes - +prev.stripes) }
      }
      prev = h
    })
  })
  o.hours = Math.round(o.minutes / 60)
  o.perWeek = o.actifs ? Math.round(o.sessions / o.actifs / se.weeks * 10) / 10 : 0
  o.perMonth = o.actifs ? Math.round(o.sessions / o.actifs / (se.weeks / 4.345) * 10) / 10 : 0
  return o
}
