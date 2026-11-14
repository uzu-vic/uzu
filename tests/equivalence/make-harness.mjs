// Construit une copie de TEST de l'ancienne application, en mode démo (aucune base), avec un point
// d'accès aux fonctions internes pour comparer ses enregistrements à ceux de la nouvelle application.
// Ce fichier n'est jamais publié.
import fs from "node:fs"
import * as acorn from "acorn"
const [, , src, out] = process.argv
let html = fs.readFileSync(src, "utf8")
html = html.replace(/(\n\s*url:\s*)"[^"]*"/, '$1""').replace(/(\n\s*anonKey:\s*)"[^"]*"/, '$1""')
const scripts = [...html.matchAll(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/g)]
const main = scripts.reduce((a, b) => (b[1].length > a[1].length ? b : a))
const code = main[1]
const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: "script" })
const ex = ast.body[0].expression, fn = ex.callee || ex.argument.callee
const at = fn.body.end - 1
const hook = `
window.__UZU_T={
 setState:function(s){state=normalize(s)},
 state:function(){return JSON.parse(JSON.stringify(state))},
 setForm:function(f){form=Object.assign(blankForm(),JSON.parse(JSON.stringify(f)))},
 setInputs:function(o){$("fDate").value=o.date||"";$("fNote").value=o.note||"";$("fExos").value=o.exos||"";$("fCuName").value=o.cuName||"";if(o.cuProf){var s=$("fCuProf");if(![].some.call(s.options,function(x){return x.value===o.cuProf})){var op=document.createElement("option");op.value=o.cuProf;s.appendChild(op)}s.value=o.cuProf}},
 submit:function(){editing=null;$("logForm").dispatchEvent(new Event("submit",{cancelable:true}))},
 setComp:function(c,i){cform=Object.assign({type:"Gi",result:"aucun",wins:0,losses:0,subs:0},c);$("cDate").value=i.date||"";$("cEvent").value=i.event||""},
 submitComp:function(){editing=null;$("compForm").dispatchEvent(new Event("submit",{cancelable:true}))},
 mode:function(){return mode},role:function(){return role}
};`
const newCode = code.slice(0, at) + hook + code.slice(at)
html = html.slice(0, main.index) + main[0].replace(code, newCode) + html.slice(main.index + main[0].length)
fs.writeFileSync(out, html)
console.log("harness écrit :", out)
