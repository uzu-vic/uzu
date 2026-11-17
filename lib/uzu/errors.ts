"use client"
// Suivi des erreurs : un plantage chez un utilisateur est envoyé au serveur (table client_errors,
// lisible seulement depuis le tableau de bord Supabase). Aucune donnée saisie n'est envoyée :
// page sans paramètres, message, pile d'appels, navigateur, version.
import { uzu } from "./client"

const VERSION = (process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "local").slice(0, 7)
const sent = new Set<string>()
let count = 0
// Bruit sans intérêt : extensions, coupures réseau, avertissements du navigateur
const NOISE = /ResizeObserver loop|Failed to fetch|NetworkError|Load failed|network error|chrome-extension:|moz-extension:|safari-extension:|AbortError|The operation was aborted/i

export function reportError(kind: "render" | "error" | "promise", err: unknown, extra = "") {
  try {
    const e = err instanceof Error ? err : new Error(typeof err === "string" ? err : JSON.stringify(err ?? "erreur inconnue"))
    const message = (e.message || String(e)).slice(0, 500)
    const stack = ((e.stack || "") + (extra ? "\n" + extra : "")).slice(0, 3000)
    if (!message || NOISE.test(message) || NOISE.test(stack)) return
    const sig = kind + "|" + message
    if (sent.has(sig) || count >= 10) return            // 10 rapports au plus par ouverture, sans doublon
    sent.add(sig); count++
    const page = typeof location !== "undefined" ? location.pathname : ""
    const agent = typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : ""
    void uzu().rpc("log_client_error", { p_kind: kind, p_page: page, p_message: message, p_stack: stack, p_agent: agent, p_version: VERSION })
      .then(() => undefined, () => undefined)            // jamais d'erreur en cascade
  } catch { /* le suivi ne doit jamais faire planter l'application */ }
}

let installed = false
/** Erreurs hors rendu (gestionnaires d'événements, promesses non traitées). */
export function installErrorReporting() {
  if (installed || typeof window === "undefined") return
  installed = true
  window.addEventListener("error", ev => { if (ev.error || ev.message) reportError("error", ev.error || ev.message) })
  window.addEventListener("unhandledrejection", ev => reportError("promise", ev.reason))
}
