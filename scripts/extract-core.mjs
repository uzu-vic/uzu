// Extrait de l'ancienne application (legacy/index.html) le code EXACT des règles métier du carnet :
// catalogues (techniques, soumissions, systèmes…) et fonctions pures de normalisation.
// Le résultat (lib/uzu/legacy-core.generated.js) est régénéré à chaque construction : la nouvelle
// application applique donc toujours les mêmes règles que l'ancienne, sans copie manuelle.
//
// Méthode : analyse syntaxique (acorn) du script principal, puis fermeture des dépendances à partir
// d'une liste de points d'entrée. Toute déclaration touchant au DOM, au stockage ou au réseau fait
// échouer l'extraction (garde-fou).
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import * as acorn from "acorn"
import * as walk from "acorn-walk"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const SRC = path.join(ROOT, "legacy", "index.html")
const OUT = path.join(ROOT, "lib", "uzu", "legacy-core.generated.js")

const ROOTS = [
  // état et normalisation
  "normalize", "emptyState", "normBelt", "copy",
  // dates
  "TODAY", "ymd", "parse", "addDays", "day10",
  // catalogues
  "BELTS", "SYSTEMS", "SYS_KEYS", "SYS_MAIN", "KINDS", "EFFORTS", "RPE_DESC", "TECHNIQUES", "TECH_CATS",
  "SUBMISSIONS", "SUB_DIRS", "SUB_MAX", "OPP_PROFILES", "CUSTOM_MAX", "GM_TECHS", "GM_CATS", "GM_DIRS", "GM_MAX", "GM_FIELDS",
  "FORM_ACT_KEYS", "ACT_KEYS",
  // saisie
  "blankForm", "blankGm", "normSubs", "subTotals", "normCustoms", "normGm", "gmSysCounts", "gmTotal",
  "sessBlocks", "normBlocks", "sameBlock", "blockName", "isTech", "sysOfTech", "techByName", "subById", "subName", "gmName",
  "touchSkill", "skillInfo", "isPrepa",
  // stockage et synchronisation (mêmes corps de documents que l'ancienne application)
  "memberBody", "privBody", "coachBody", "mergeStates", "unionById", "applyGrade",
  "allSessions", "me", "isSolo", "normCoach", "myEvents", "feedEnabled",
  // progression (vues Parcours et Progrès)
  "sysStats", "gmSysSum", "skillList", "subStats", "gmStats", "prepaStats", "actStats", "skillMeta", "lvMap",
  "beltLabel", "stripesTxt", "duration", "tw", "tg", "REVIEW_DAYS", "weekStart", "effortName", "isPending", "mat", "frShort", "frDate",
]
// Variables d'exécution réglables depuis la nouvelle application (même rôle que dans l'ancienne)
const SETTABLE = ["state", "pendingDel", "mode", "role", "myRoll", "myGrade", "priv", "privHydrated", "dirty", "ACCT"]
// Identifiants interdits dans le code extrait (DOM, stockage, réseau, interface)
const FORBIDDEN = new Set(["$", "document", "localStorage", "sessionStorage", "fetch", "XMLHttpRequest", "toast", "showModal", "navigator", "location", "history"])
// Variables d'exécution de l'ancienne application : jamais modifiées par le code extrait
const RUNTIME = new Set(["state", "form", "cform", "editing", "club", "mode", "role", "raw"])

const html = fs.readFileSync(SRC, "utf8")
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1])
const code = scripts.reduce((a, b) => (b.length > a.length ? b : a), "")
const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "script" })
let body = ast.body
if (body.length === 1 && body[0].type === "ExpressionStatement") {
  const ex = body[0].expression
  const fn = ex.callee || (ex.argument && ex.argument.callee)
  if (fn && fn.body) body = fn.body.body
}

function idsOf(node) {
  const ids = new Set()
  walk.full(node, n => { if (n.type === "Identifier") ids.add(n.name) })
  // retire les propriétés non calculées (obj.prop) et les clés d'objet littéral
  walk.full(node, n => {
    if (n.type === "MemberExpression" && !n.computed && n.property.type === "Identifier") ids.delete("\u0000")
  })
  return ids
}
// Version précise : identifiants en position de référence uniquement
function refsOf(node) {
  const refs = new Set()
  walk.ancestor(node, {
    Identifier(n, _st, anc) {
      const p = anc[anc.length - 2]
      if (p && p.type === "MemberExpression" && p.property === n && !p.computed) return
      if (p && p.type === "Property" && p.key === n && !p.computed && !p.shorthand) return
      refs.add(n.name)
    },
  })
  return refs
}

const decls = new Map() // nom → { order, text, refs }
const others = [] // instructions d'expression
body.forEach((st, i) => {
  if (st.type === "FunctionDeclaration") {
    decls.set(st.id.name, { order: i * 1000, text: code.slice(st.start, st.end), refs: refsOf(st) })
  } else if (st.type === "VariableDeclaration") {
    st.declarations.forEach((d, j) => {
      if (d.id.type !== "Identifier") return
      const text = "var " + code.slice(d.start, d.end) + ";"
      decls.set(d.id.name, { order: i * 1000 + j, text, refs: d.init ? refsOf(d.init) : new Set() })
    })
  } else if (st.type === "ExpressionStatement") {
    others.push({ order: i * 1000, text: code.slice(st.start, st.end), refs: refsOf(st) })
  }
})

const keep = new Set()
for (const r of ROOTS) if (!decls.has(r)) { console.error("✖ point d'entrée introuvable : " + r); process.exit(1) }
const isVar = n => decls.has(n) && decls.get(n).text.startsWith("var ")
function close(names) {
  const todo = [...names]
  while (todo.length) {
    const n = todo.pop()
    if (keep.has(n) || !decls.has(n)) continue
    keep.add(n)
    for (const r of decls.get(n).refs) if (decls.has(r) && !keep.has(r)) todo.push(r)
  }
}
close(ROOTS)
// Instructions qui complètent un catalogue conservé (ex. GM_TECHS rempli après sa déclaration) :
// on les garde, ainsi que leurs propres dépendances, jusqu'à stabilité.
const extra = []
let changed = true
while (changed) {
  changed = false
  for (const o of others) {
    if (extra.includes(o)) continue
    const refs = [...o.refs]
    if (refs.some(r => FORBIDDEN.has(r) || RUNTIME.has(r))) continue
    if (refs.some(r => isVar(r) && keep.has(r))) { extra.push(o); close(refs.filter(r => decls.has(r))); changed = true }
  }
}
const parts = [...keep].map(n => decls.get(n)).concat(extra).sort((a, b) => a.order - b.order)
const bad = parts.filter(p => [...p.refs].some(r => FORBIDDEN.has(r)))
if (bad.length) {
  console.error("✖ code extrait dépendant du DOM ou du stockage :\n" + bad.map(b => "  - " + b.text.slice(0, 120)).join("\n"))
  process.exit(1)
}
const settable = SETTABLE.filter(k => keep.has(k))
const hash = crypto.createHash("sha256").update(html).digest("hex").slice(0, 16)
const out = `/* eslint-disable */
// FICHIER GÉNÉRÉ par scripts/extract-core.mjs — NE PAS MODIFIER À LA MAIN.
// Source : legacy/index.html (sha256 ${hash}). ${keep.size} déclarations, ${extra.length} instructions complémentaires.
// Code identique à l'ancienne application : mêmes catalogues, mêmes règles de normalisation.
export function createLegacyCore() {
${parts.map(p => p.text).join("\n")}
return { ${ROOTS.join(", ")},
  __set: function (k, v) { switch (k) { ${settable.map(k => `case "${k}": ${k} = v; return;`).join(" ")} } throw new Error("variable inconnue : " + k) },
  __get: function (k) { switch (k) { ${settable.map(k => `case "${k}": return ${k};`).join(" ")} } throw new Error("variable inconnue : " + k) } };
}
`
fs.writeFileSync(OUT, out)
console.log(`✔ UZU : règles du carnet extraites (${keep.size} déclarations, ${extra.length} instructions, source ${hash}).`)
