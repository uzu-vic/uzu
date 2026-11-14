// Configuration publique de l'environnement courant (jamais de clé secrète ici).
export const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
export const CONFIG_OK = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(SUPABASE_URL) && SUPABASE_ANON_KEY.length > 20
