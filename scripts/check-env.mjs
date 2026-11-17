// Garde-fous de configuration, exécutés avant chaque construction.
// La configuration Supabase vient des variables d'environnement de Vercel (Production, Preview)
// ou de .env.local en développement. L'ancienne application n'est plus servie (lot 6) : seul son
// fichier source legacy/index.html reste, pour l'extraction du cœur métier (extract-core.mjs).
//
// Garde-fous :
//   - sans variables Supabase, la construction échoue (aucune application ne part sans base connue) ;
//   - un aperçu ou un poste de développement ne peut PAS viser la base de production.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PROD_PROJECT_REF = "ixkewdxtuhxfiodwhhzr";

// .env.local (développement) : lecture simple, sans dépendance
const envFile = path.join(ROOT, ".env.local");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const fail = (msg) => { console.error("\n✖ UZU : " + msg + "\n"); process.exit(1); };
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const target = process.env.VERCEL_ENV || "local";

if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies pour l'environnement « " + target + " ».");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) fail("NEXT_PUBLIC_SUPABASE_URL n'a pas la forme https://xxxx.supabase.co");
if (/service_role|sb_secret_/.test(key)) fail("la clé fournie est une clé secrète : seule la clé publique (anon / publishable) est autorisée.");
if (target === "production" && !url.includes(PROD_PROJECT_REF)) fail("la mise en ligne de PRODUCTION vise une autre base que celle de production (" + url + "). Corrige NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY pour l'environnement Production dans Vercel : la version actuellement en ligne reste inchangée.");
if (url.includes(PROD_PROJECT_REF) && target !== "production") fail("l'environnement « " + target + " » vise la base de PRODUCTION. Les aperçus et le développement doivent utiliser le projet Supabase de test.");

// Ancienne application : plus servie. Nettoyage d'une copie locale éventuelle (hors relais des notifications).
for (const f of ["index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png"]) {
  const p = path.join(ROOT, "public", "legacy", f);
  if (fs.existsSync(p)) fs.rmSync(p);
}
console.log("✔ UZU : configuration vérifiée (environnement « " + target + " », base " + new URL(url).hostname + ").");
