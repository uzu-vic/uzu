"use client"
// Client Supabase unique, côté navigateur.
// Options par défaut volontairement identiques à l'ancienne application
// (supabase.createClient(url, anonKey)) : la session est rangée sous la même clé
// du navigateur, donc un utilisateur connecté dans l'une l'est aussi dans l'autre.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { CONFIG_OK, SUPABASE_ANON_KEY, SUPABASE_URL } from "./env"

let client: SupabaseClient | null = null

export function uzu(): SupabaseClient {
  if (!CONFIG_OK) throw new Error("Configuration Supabase absente pour cet environnement.")
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  return client
}

// Appel d'une fonction serveur : renvoie la donnée ou lève une erreur au message lisible.
export async function rpc<T = unknown>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await uzu().rpc(name, args ?? {})
  if (error) throw new Error(error.message || "Erreur serveur")
  return data as T
}
