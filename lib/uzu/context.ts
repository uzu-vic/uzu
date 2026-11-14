"use client"
// Contexte de l'utilisateur connecté, tel que le renvoie la fonction serveur get_my_context.
// Le serveur reste seul juge des droits : ce contexte sert uniquement à adapter l'affichage.
import { rpc } from "./client"

export type AcademyRole = "owner" | "section_lead" | "instructor" | "assistant" | "student"
export type MemberStatus = "active" | "suspended" | "removed"
/** Droits par ressource : action → portée accordée, ou "deny". null = responsable (tous les droits). */
export type PermMap = Record<string, Record<string, string>>

export type Membership = { academy_id: string; name: string; role: AcademyRole; status: MemberStatus }
export type Club = {
  id: string
  name: string
  accent_color?: string
  news?: string
  schedule?: unknown
  tactical_focus?: unknown
  profile?: Record<string, unknown>
  invite_code?: string | null
}
export type UzuContext = {
  role: "solo" | "student" | "coach"
  share_activity?: boolean
  academy_role?: AcademyRole | null
  member_status?: MemberStatus | null
  member_id?: string | null
  section_id?: string | null
  perms?: PermMap | null
  memberships?: Membership[]
  club: Club | null
}

export async function fetchContext(): Promise<UzuContext> {
  return rpc<UzuContext>("get_my_context")
}

export async function switchAcademy(academyId: string): Promise<UzuContext> {
  return rpc<UzuContext>("switch_academy", { p_academy: academyId })
}

/** La migration « équipe » est-elle présente côté serveur ? (même test que l'ancienne application) */
export function teamOn(ctx: UzuContext | null): boolean {
  return !!ctx && Object.prototype.hasOwnProperty.call(ctx, "memberships")
}
