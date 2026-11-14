// Prépare l'ancienne application (legacy/) pour qu'elle soit servie sur /legacy/ pendant la fusion.
// La configuration Supabase n'est plus écrite en dur : elle vient des variables d'environnement
// de l'environnement Vercel (Production, Preview) ou de .env.local en développement.
//
// Garde-fous :
//   - sans variables Supabase, la construction échoue (aucune application ne part sans base connue) ;
//   - un aperçu ou un poste de développement ne peut PAS viser la base de production.
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const SRC = path.join(ROOT, "legacy");
const OUT = path.join(ROOT, "public", "legacy");
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
const vapid = (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "").trim();
const target = process.env.VERCEL_ENV || "local";

if (!url || !key) fail("NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY doivent être définies pour l'environnement « " + target + " ».");
if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(url)) fail("NEXT_PUBLIC_SUPABASE_URL n'a pas la forme https://xxxx.supabase.co");
if (/service_role|sb_secret_/.test(key)) fail("la clé fournie est une clé secrète : seule la clé publique (anon / publishable) est autorisée.");
if (url.includes(PROD_PROJECT_REF) && target !== "production") fail("l'environnement « " + target + " » vise la base de PRODUCTION. Les aperçus et le développement doivent utiliser le projet Supabase de test.");

const full = fs.readFileSync(path.join(SRC, "index.html"), "utf8");
// On ne touche qu'au bloc window.UZU_CONFIG = { ... };
const start = full.indexOf("window.UZU_CONFIG = {");
const end = start < 0 ? -1 : full.indexOf("};", start);
if (start < 0 || end < 0 || full.indexOf("window.UZU_CONFIG = {", start + 1) >= 0) fail("bloc window.UZU_CONFIG introuvable ou en double dans legacy/index.html.");
let block = full.slice(start, end);
const swap = (re, value, label) => {
  const n = [...block.matchAll(new RegExp(re.source, "g"))].length;
  if (n !== 1) fail("configuration de l'ancienne application introuvable (" + label + ", " + n + " occurrence(s)).");
  block = block.replace(re, (_, a, b) => a + JSON.stringify(value) + b);
};
swap(/(\n\s*url:\s*)"[^"]*"(,)/, url.replace(/\/$/, ""), "url");
swap(/(\n\s*anonKey:\s*)"[^"]*"(,)/, key, "anonKey");
swap(/(\n\s*vapidPublicKey:\s*)"[^"]*"(\s*\n)/, vapid, "vapidPublicKey");
let html = full.slice(0, start) + block + full.slice(end);
// Chemins relatifs (sw.js, manifeste, icônes) rattachés à /legacy/, avec ou sans barre finale.
if (!/<head>/i.test(html) || /<base\s/i.test(html)) fail("balise <head> absente ou <base> déjà présente dans legacy/index.html.");
html = html.replace(/<head>/i, '<head>\n<base href="/legacy/">');

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "index.html"), html);
for (const f of ["sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"]) {
  fs.copyFileSync(path.join(SRC, f), path.join(OUT, f));
}
console.log("✔ UZU : ancienne application prête sur /legacy/ (environnement « " + target + " », base " + new URL(url).hostname + ").");
