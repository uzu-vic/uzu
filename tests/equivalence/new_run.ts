// Côté NOUVELLE application : mêmes scénarios, via lib/uzu/journal.ts, puis comparaison stricte.
import fs from "node:fs"
;(globalThis as any).window = {}
import { buildCompItem, buildSessionItem, newCore } from "../../lib/uzu/journal"

const [, , scenPath, legacyPath] = process.argv
const S = JSON.parse(fs.readFileSync(scenPath, "utf8"))
const L = JSON.parse(fs.readFileSync(legacyPath, "utf8"))
const clean = (x: any) => { const o = JSON.parse(JSON.stringify(x)); delete o.id; delete o.sample; return o }
const stable = (x: any): string => JSON.stringify(x, (_k, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v)
let ok = 0, ko = 0
const report: any[] = []
S.sessions.forEach((sc: any, i: number) => {
  const C = newCore(); C.__set("mode", L.mode); C.__set("role", L.role)
  const state = C.normalize(JSON.parse(JSON.stringify(S.baseState))); C.__set("state", state)
  const form = Object.assign(C.blankForm(), JSON.parse(JSON.stringify(sc.form)))
  const item = buildSessionItem(C, form, { ...sc.inputs }, techs => C.skillInfo(C.me(), techs[0]).lvl, state.skills)
  item.id = "u0"; item.sample = false; state.sessions.push(item)
  const want = L.sessions[i]
  const same = stable(clean(item)) === stable(clean(want.item)) && stable(state.skills) === stable(want.skills)
  same ? ok++ : ko++
  report.push({ label: sc.label, same, ...(same ? {} : { new: clean(item), old: clean(want.item), newSkills: state.skills, oldSkills: want.skills }) })
})
S.comps.forEach((sc: any, i: number) => {
  const C = newCore()
  const item = buildCompItem(C, sc.form, sc.inputs)
  const same = stable(clean(item)) === stable(clean(L.comps[i].item))
  same ? ok++ : ko++
  report.push({ label: sc.label, same, ...(same ? {} : { new: item, old: clean(L.comps[i].item) }) })
})
report.forEach(r => console.log((r.same ? "IDENTIQUE  " : "DIFFÉRENT  ") + r.label + (r.same ? "" : "\n" + JSON.stringify(r, null, 1))))
console.log(`\n${ok}/${ok + ko} enregistrements identiques à l'ancienne application`)
fs.writeFileSync("tests/equivalence/results.json", JSON.stringify({ ok, total: ok + ko, report }, null, 1))
process.exit(ko ? 1 : 0)
