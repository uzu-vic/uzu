// UZU — Class Media : point d'entrée de la fonction serveur (Supabase Edge Function).
// Déploiement (base de TEST seulement) : supabase functions deploy class-media --no-verify-jwt --project-ref ntypsrdwxrkanahhuixx
// La vérification d'identité automatique est désactivée car un lecteur vidéo ne sait pas envoyer d'en-tête :
// « stream » s'authentifie par jeton, les autres actions vérifient elles-mêmes la session ou le secret.
// La clé de service est fournie par Supabase à la fonction ; elle n'est jamais renvoyée ni écrite au journal.
import { makeHandler } from "./handler.ts"

const env = {
  url: Deno.env.get("SUPABASE_URL") ?? "",
  anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
  serviceKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY") ?? "",
  origins: (Deno.env.get("CLASS_MEDIA_ALLOWED_ORIGINS") ?? "").split(",").map((s: string) => s.trim()).filter(Boolean),
}
if (!env.url || !env.serviceKey || !env.anonKey) console.log(JSON.stringify({ a: "boot", ok: false, err: "configuration incomplète" }))

Deno.serve(makeHandler(env))
