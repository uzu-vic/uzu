// Lecture des droits pour l'AFFICHAGE uniquement. Mêmes règles que le serveur :
// non membre / suspendu / retiré → refus ; responsable → toute l'académie ;
// refus explicite → refus ; autorisation → sa portée ; rien → refus.
import { teamOn, type UzuContext } from "./context"

const STAFF = ["owner", "section_lead", "instructor", "assistant"] as const

export function isStaff(ctx: UzuContext | null): boolean {
  if (!ctx) return false
  if (!teamOn(ctx)) return ctx.role === "coach"
  return !!ctx.academy_role && (STAFF as readonly string[]).includes(ctx.academy_role)
}

export function isSuspended(ctx: UzuContext | null): boolean {
  return !!ctx && teamOn(ctx) && isStaff(ctx) && ctx.member_status !== "active"
}

/** Portée accordée pour (ressource, action), ou null si refusé. */
export function scopeOf(ctx: UzuContext | null, resource: string, action: string): string | null {
  if (!ctx || !isStaff(ctx)) return null
  if (!teamOn(ctx)) return "academy" // ancien schéma : le professeur a tous les droits
  if (ctx.member_status !== "active") return null
  if (ctx.perms === null || ctx.academy_role === "owner") return "academy"
  const v = ctx.perms?.[resource]?.[action]
  return !v || v === "deny" ? null : v
}

export function can(ctx: UzuContext | null, resource: string, action: string): boolean {
  return scopeOf(ctx, resource, action) !== null
}
