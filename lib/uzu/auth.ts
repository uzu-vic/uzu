"use client"
// Connexion, inscription, mot de passe oublié et invitations d'équipe : mêmes appels et mêmes messages
// que l'ancienne application. Aucune autorisation n'est accordée ici : le code club, l'invitation
// et l'adresse e-mail sont vérifiés par le serveur.
import { uzu } from "./client"

export const INVALID = "Code club invalide. Demande le code à ton prof sur le tatami."
export const PENDING = "uzu-pending-club"
const INV_KEY = "uzu-invite"

export function frAuth(e: { message?: string } | null | undefined): string {
  const m = (e && e.message) || ""
  if (/Invalid login/i.test(m)) return "Adresse ou mot de passe incorrect."
  if (/Database error saving new user|Code club invalide/i.test(m)) return INVALID
  if (/already registered|already exists/i.test(m)) return "Un compte existe déjà avec cet e-mail : connecte-toi."
  if (/Password should be|weak/i.test(m)) return "Mot de passe trop faible : 8 caractères minimum."
  if (/not confirmed/i.test(m)) return "Confirme d'abord ton e-mail avec le lien reçu."
  if (/not authorized|Signups not allowed/i.test(m)) return "Les inscriptions sont fermées pour l'instant."
  if (/rate limit/i.test(m)) return "Trop de tentatives, réessaie dans quelques minutes."
  return "Connexion impossible : " + m
}
export const emailOk = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)

export type SignupInfo = { name: string; demo?: { age: string; sex: string } | null; parental?: boolean }
/** Profil saisi à l'inscription, appliqué une seule fois à l'arrivée dans l'application (accord inclus). */
export function keepSignup(o: SignupInfo, acct: "solo" | "club") {
  try { localStorage.setItem("uzu-signup", JSON.stringify({ name: o.name, demo: o.demo || null, parental: !!o.parental, acct, at: new Date().toISOString(), fresh: false })) } catch { /* rien */ }
}
export function dropSignup() { try { localStorage.removeItem("uzu-signup") } catch { /* rien */ } }

export async function signUp(email: string, password: string, data: Record<string, string>): Promise<{ ok: true; session: boolean } | { ok: false; msg: string }> {
  try {
    const r = await uzu().auth.signUp({ email, password, options: { data } })
    if (r.error) return { ok: false, msg: frAuth(r.error) }
    return { ok: true, session: !!r.data.session }
  } catch (e) { return { ok: false, msg: frAuth(e as Error) } }
}
export async function inviteCodeAvailable(code: string): Promise<boolean | null> {
  const { data, error } = await uzu().rpc("invite_code_available", { code })
  return error ? null : data !== false
}
export async function resetPassword(email: string): Promise<string> {
  const { error } = await uzu().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + "/" })
  return error ? frAuth(error) : ""
}
export async function setNewPassword(pw: string): Promise<string> {
  const { error } = await uzu().auth.updateUser({ password: pw })
  return error ? "Échec : " + error.message : ""
}

// ---------- Invitations d'équipe (lien ?invite=) ----------
/** Garde le jeton d'un lien d'invitation et nettoie l'adresse (même stockage que l'ancienne application). */
export function captureInviteToken() {
  try {
    const m = /[?&#]invite=([A-Za-z0-9]{32,80})/.exec(window.location.search + window.location.hash)
    if (m) localStorage.setItem(INV_KEY, m[1])
  } catch { /* rien */ }
}
/** Retire le jeton de l'adresse affichée (après l'initialisation du routeur). */
export function cleanInviteUrl() {
  try { if (/[?&#]invite=/.test(window.location.search + window.location.hash)) window.history.replaceState(null, "", window.location.pathname) } catch { /* rien */ }
}
export function inviteToken(): string { try { return localStorage.getItem(INV_KEY) || "" } catch { return "" } }
export function dropInviteToken() { try { localStorage.removeItem(INV_KEY) } catch { /* rien */ } }
export type InvitePreview = { status: string; academy: string; role: string; email_hint: string }
export async function previewInvitation(token: string): Promise<InvitePreview | null> {
  const { data, error } = await uzu().rpc("preview_invitation", { p_token: token })
  return error || !data ? null : data as InvitePreview
}
export async function acceptInvitation(token: string): Promise<{ ok: true; club: string } | { ok: false; msg: string }> {
  const { data, error } = await uzu().rpc("accept_invitation", { p_token: token })
  if (error) return { ok: false, msg: error.message }
  return { ok: true, club: String((data as { club?: { name?: string } } | null)?.club?.name || "l'académie") }
}
