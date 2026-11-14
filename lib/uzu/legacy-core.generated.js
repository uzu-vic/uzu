/* eslint-disable */
// FICHIER GÉNÉRÉ par scripts/extract-core.mjs — NE PAS MODIFIER À LA MAIN.
// Source : legacy/index.html (sha256 0b681ad037bc9cb1). 120 déclarations, 2 instructions complémentaires.
// Code identique à l'ancienne application : mêmes catalogues, mêmes règles de normalisation.
export function createLegacyCore() {
var JJB_STRUCTURED_TECHNIQUES = {
  sweeps: {
    label: "Renversements (Sweeps)",
    items: [
      { id: "scissor_sweep", name: "Scissor Sweep", system: "fondamentaux", startPos: "Garde fermée" },
      { id: "hip_bump", name: "Hip Bump Sweep", system: "lutte", startPos: "Garde fermée" },
      { id: "pendulum_sweep", name: "Pendulum Sweep", system: "controle_dos", startPos: "Garde fermée" },
      { id: "single_leg_sweep", name: "Renversement Single Leg", system: "lutte", startPos: "Demi-garde" },
      { id: "tripod_sweep", name: "Tripod Sweep", system: "jeux_jambes", startPos: "Garde ouverte" },
      { id: "butterfly_sweep", name: "Butterfly Sweep", system: "jeux_jambes", startPos: "Garde papillon" },
      { id: "old_school_sweep", name: "Old School Sweep", system: "lutte", startPos: "Demi-garde" },
      { id: "berimbolo", name: "Berimbolo", system: "controle_dos", startPos: "De la Riva" }
    ]
  },
  guard_passes: {
    label: "Passages de Garde",
    items: [
      { id: "toreando", name: "Passage Toreando", system: "jeux_jambes", startPos: "Garde ouverte" },
      { id: "knee_slice", name: "Knee Slice", system: "controle_dos", startPos: "Demi-garde" },
      { id: "over_under", name: "Over-Under Pass", system: "fondamentaux", startPos: "Garde ouverte" },
      { id: "double_under", name: "Double Under Pass", system: "lutte", startPos: "Garde ouverte" },
      { id: "x_pass", name: "X-Pass", system: "jeux_jambes", startPos: "Garde ouverte" },
      { id: "body_lock_pass", name: "Body Lock Pass", system: "controle_dos", startPos: "Demi-garde ou papillon" },
      { id: "leg_drag", name: "Leg Drag", system: "jeux_jambes", startPos: "Garde ouverte (De la Riva)" }
    ]
  }
};
var BELTS=[
 {k:"blanche",n:"blanche",c:"#F4F4F0",bar:"#151515",p:"Fondamentaux solides, découverte des 3 systèmes"},
 {k:"bleue",n:"bleue",c:"#2F57C6",bar:"#151515",p:"Imposer un système et le connecter à un deuxième"},
 {k:"violette",n:"violette",c:"#6C3FA6",bar:"#151515",p:"Les 3 systèmes connectés"},
 {k:"marron",n:"marron",c:"#7A4A2A",bar:"#151515",p:"Jeu complet et compétition"},
 {k:"noire",n:"noire",c:"#151515",bar:"#C8102E",p:"Transmettre et continuer d'apprendre"}];
function beltIdx(k){for(var i=0;i<BELTS.length;i++)if(BELTS[i].k===k)return i;return 0}
function stripesTxt(n){return n?n+" barrette"+(n>1?"s":""):"sans barrette"}
function beltLabel(b){return "Ceinture "+BELTS[beltIdx(b.rank)].n}
function pad(n){return (n<10?"0":"")+n}
function ymd(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate())}
function parse(s){var p=String(s||"").split("-");return new Date(+p[0],+p[1]-1,+p[2])}
function addDays(d,n){var x=new Date(d);x.setDate(x.getDate()+n);return x}
function weekStart(d){var x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
var TODAY=new Date();
TODAY=new Date(TODAY.getFullYear(),TODAY.getMonth(),TODAY.getDate());
function frDate(s){return parse(s).toLocaleDateString("fr-FR",{day:"numeric",month:"long",year:"numeric"})}
function frShort(s){return parse(s).toLocaleDateString("fr-FR",{day:"numeric",month:"short",year:"numeric"})}
function duration(s){var a=parse(s),m=(TODAY.getFullYear()-a.getFullYear())*12+TODAY.getMonth()-a.getMonth();if(TODAY.getDate()<a.getDate())m--;if(m<1)return "moins d'un mois";if(m<12)return m+" mois";var y=Math.floor(m/12),r=m%12;return y+" an"+(y>1?"s":"")+(r?" et "+r+" mois":"")}
var SYSTEMS={
 fond:{n:"Fondamentaux",sh:"Fondamentaux",s:"Le socle commun : garde, renversements, passage, contrôle, sorties",items:["Garde fermée","Demi-garde","Rétention de garde","Renversements","Passage de garde","Contrôle latéral et monte","Sorties de monte et contrôle latéral","Base et posture"]},
 lutte:{n:"Lutte & Scrambles",sh:"Lutte",s:"Takedowns, wrestle-up, hand-fighting, snap down, transitions",items:["Takedowns","Wrestle-up","Hand-fighting","Snap down","Transitions dynamiques"]},
 controle:{n:"Contrôle & Dos",sh:"Contrôle & Dos",s:"Front headlock, guillotine / anaconda, body lock pass, back attack, RNC",items:["Front headlock","Guillotine / Anaconda","Body lock pass","Back attack","RNC / étranglement arrière"]},
 jambes:{n:"Jeux de jambes",sh:"Jambes",s:"Entrées de leglocks, lignes de hanches, ashi garami, clés",items:["Entrées de leglocks","Domination des lignes de hanches","Ashi garami","Clés de talon / cheville / genou"]}};
var SYS_KEYS=["fond","lutte","controle","jambes"];
var SYS_MAIN=["lutte","controle","jambes"];
var TECH_CATS={sweep:{n:"Renversement",pl:"Renversements (sweeps)"},passage:{n:"Passage de garde",pl:"Passages de garde"}};
var TECHNIQUES=[
 {id:"sw-scissor",   nom:"Scissor sweep",          categorie:"sweep",   position_depart:"Garde fermée ouverte (genou en bouclier)", position_arrivee:"Monte",                    niveau:"Débutant",      item:"Renversements"},
 {id:"sw-hipbump",   nom:"Hip bump sweep",         categorie:"sweep",   position_depart:"Garde fermée",                             position_arrivee:"Monte",                    niveau:"Débutant",      item:"Renversements"},
 {id:"sw-pendulum",  nom:"Pendulum sweep",         categorie:"sweep",   position_depart:"Garde fermée",                             position_arrivee:"Monte",                    niveau:"Intermédiaire", item:"Renversements"},
 {id:"sw-butterfly", nom:"Butterfly sweep",        categorie:"sweep",   position_depart:"Garde papillon",                           position_arrivee:"Monte ou contrôle latéral",niveau:"Intermédiaire", item:"Renversements"},
 {id:"sw-oldschool", nom:"Old school sweep",       categorie:"sweep",   position_depart:"Demi-garde (dessous)",                     position_arrivee:"Demi-garde (dessus)",      niveau:"Intermédiaire", item:"Renversements"},
 {id:"sw-berimbolo", nom:"Berimbolo",              categorie:"sweep",   position_depart:"De la Riva",                               position_arrivee:"Dos",                      niveau:"Avancé",        item:"Renversements"},
 {id:"sw-singleleg", nom:"Single leg sweep",       categorie:"sweep",   position_depart:"Demi-garde (dessous)",                     position_arrivee:"Dessus, finition single leg",niveau:"Intermédiaire",item:"Renversements"},
 {id:"sw-tripod",    nom:"Tripod sweep",           categorie:"sweep",   position_depart:"Garde ouverte (pied sur la hanche)",       position_arrivee:"Debout ou monte",          niveau:"Débutant",      item:"Renversements"},
 {id:"gp-toreando",  nom:"Toreando pass",          categorie:"passage", position_depart:"Garde ouverte",                            position_arrivee:"Contrôle latéral",         niveau:"Débutant",      item:"Passage de garde"},
 {id:"gp-doubleund", nom:"Double under pass",      categorie:"passage", position_depart:"Garde ouverte",                            position_arrivee:"Contrôle latéral",         niveau:"Débutant",      item:"Passage de garde"},
 {id:"gp-kneeslice", nom:"Knee slice",             categorie:"passage", position_depart:"Demi-garde (genou en bouclier)",           position_arrivee:"Contrôle latéral",         niveau:"Intermédiaire", item:"Passage de garde"},
 {id:"gp-overunder", nom:"Over-under pass",        categorie:"passage", position_depart:"Garde ouverte / papillon",                 position_arrivee:"Contrôle latéral",         niveau:"Intermédiaire", item:"Passage de garde"},
 {id:"gp-bodylock",  nom:"Body lock pass (garde)", categorie:"passage", position_depart:"Demi-garde ou papillon",                   position_arrivee:"Contrôle latéral ou monte",niveau:"Intermédiaire", item:"Body lock pass"},
 {id:"gp-legdrag",   nom:"Leg drag",               categorie:"passage", position_depart:"Garde ouverte (De la Riva)",               position_arrivee:"Contrôle latéral ou dos",  niveau:"Avancé",        item:"Passage de garde"},
 {id:"gp-xpass",     nom:"X-pass",                 categorie:"passage", position_depart:"Garde ouverte",                            position_arrivee:"Contrôle latéral",         niveau:"Intermédiaire", item:"Passage de garde"}];
var AGES=[{k:"lt16",n:"Moins de 16 ans"},{k:"16-17",n:"16-17 ans"},{k:"18-25",n:"18-25 ans"},{k:"26-39",n:"26-39 ans"},{k:"40p",n:"40 ans et plus"}];
var SEXES={h:"Homme",f:"Femme",a:"Autre"};
function ageIdx(k){for(var i=0;i<AGES.length;i++)if(AGES[i].k===k)return i;return -1}
function normDemo(d){d=d||{};return {age:ageIdx(d.age)>-1?d.age:"",sex:SEXES[d.sex]?d.sex:""}}
var REVIEW_DAYS=30;
function isTech(n){return !!techByName(n)||SYS_KEYS.some(function(k){return SYSTEMS[k].items.indexOf(n)>-1})}
function normSkills(o){var r={};if(!o||typeof o!=="object")return r;
 Object.keys(o).slice(0,400).forEach(function(k){var v=o[k];if(!v||!isTech(k))return;var lv=+v.lvl===2?2:1,pa=v.partner&&v.partner.name?{name:String(v.partner.name).slice(0,40),at:String(v.partner.at||"")}:null,lg=!!v.legacy;
  if(lv===2&&!pa&&!lg)lv=1;r[k]={lvl:lv,at:String(v.at||""),partner:lv===2?pa:null,rev:String(v.rev||"").slice(0,10),legacy:lv===2&&!pa&&lg,req:lv===1?String(v.req||""):""}});return r}
function skillsFromSessions(S){var r={};(Array.isArray(S)?S:[]).forEach(function(x){if(!x||x.cat==="prepa"||!(+x.stars>0)||!isTech(x.theme))return;var lv=Math.min(2,+x.stars),cur=r[x.theme];
  if(!cur)r[x.theme]=cur={lvl:lv,at:String(x.date||""),partner:null,rev:"",legacy:lv===2};else{if(lv>cur.lvl){cur.lvl=lv;cur.legacy=true}if(x.date&&x.date<cur.at)cur.at=x.date}});return r}
function normCoach(o){var r={};if(o&&typeof o==="object")Object.keys(o).forEach(function(k){var v=o[k];if(v&&v.verified_by_coach!==false&&isTech(k))r[k]={at:String(v.at||""),by:String(v.by||"").slice(0,60)}});return r}
function isSolo(){return state.acct==="solo"&&role!=="teacher"}
function myCoach(){if(state.acct==="solo"&&role!=="teacher")return {};if(mode==="cloud"&&role!=="teacher")return normCoach(myGrade&&myGrade.verified);return state.coach3||{}}
function me(){return {sessions:allSessions(),skills:state.skills||{},coach:myCoach()}}
function asP(x,ver){if(Array.isArray(x))return {sessions:x,skills:skillsFromSessions(x),coach:normCoach(ver)};return x||{sessions:[],skills:{},coach:{}}}
function day10(x){return String(x||"").slice(0,10)}
function lastPracticed(P,name){var d="";mat(P.sessions||[]).forEach(function(s){if(s.date>d&&(s.theme===name||sessBlocks(s).some(function(b){return b.tech===name})))d=s.date});
 var sk=P.skills&&P.skills[name];if(sk)[sk.at,sk.rev,sk.partner&&sk.partner.at].forEach(function(x){x=day10(x);if(x>d)d=x});return d}
function skillInfo(P,name){P=asP(P);var c=P.coach&&P.coach[name],sk=P.skills&&P.skills[name],lvl=c?3:(sk?sk.lvl:0),last=lastPracticed(P,name),days=last?Math.max(0,Math.round((TODAY-parse(last))/864e5)):null;
 return {name:name,lvl:lvl,coach:c||null,partner:(sk&&sk.partner)||null,legacy:!!(sk&&sk.legacy),last:last,days:days,review:lvl>0&&lvl<3&&days!=null&&days>REVIEW_DAYS}}
function lvMap(P){P=asP(P);var m={};Object.keys(P.skills||{}).forEach(function(k){m[k]=P.skills[k].lvl});Object.keys(P.coach||{}).forEach(function(k){if(isTech(k))m[k]=3});return m}
function skillList(P){P=asP(P);return Object.keys(lvMap(P)).map(function(k){return skillInfo(P,k)}).sort(function(a,b){return (b.review-a.review)||(b.lvl-a.lvl)||a.name.localeCompare(b.name,"fr")})}
function agoTxt(d){return d==null?"jamais pratiquée":d===0?"aujourd'hui":d===1?"hier":"il y a "+d+" jours"}
function skillMeta(i){if(i.lvl===3)return "Validée par "+(i.coach&&i.coach.by&&!/^[0-9a-f-]{20,}$/i.test(i.coach.by)?i.coach.by:"ton prof")+(i.coach&&i.coach.at?" le "+frShort(day10(i.coach.at)):"")+" · définitive";
 var t=i.lvl===2?(i.partner?"Confirmée par "+i.partner.name+(i.partner.at?" le "+frShort(day10(i.partner.at)):""):"Confirmée (ancienne notation)"):"Découverte";
 return t+" · pratiquée "+agoTxt(i.days)}
function touchSkill(name,date,skills){skills=skills||state.skills;if(!isTech(name))return;var sk=skills[name];if(!sk){skills[name]={lvl:1,at:date||ymd(TODAY),partner:null,rev:"",legacy:false};return}
 if(date&&date>day10(sk.rev))sk.rev=date}
function normFx(x){x=x||{};var o={checks:{},vals:{}},lim=ymd(addDays(TODAY,-90));
 ["checks","vals"].forEach(function(k){var src=x[k];if(src&&typeof src==="object")Object.keys(src).slice(-600).forEach(function(key){var at=String(src[key]&&src[key].at||src[key]||"");if(/^[^|]{1,80}\|.{1,120}$/.test(key)&&day10(at)>=lim)o[k][key]={at:at}})});return o}
function normBelt(b){b=b||{};return {rank:BELTS[beltIdx(b.rank)].k,stripes:Math.max(0,Math.min(4,+b.stripes||0)),since:typeof b.since==="string"?b.since:""}}
function copy(x){return JSON.parse(JSON.stringify(x))}
function normalize(d){d=d||{};var r=d.request&&d.request.rank?d.request:null;
 return {belt:normBelt(d.belt),request:r?{rank:normBelt(r).rank,stripes:normBelt(r).stripes,since:normBelt(r).since,at:String(r.at||"")}:null,
  sessions:Array.isArray(d.sessions)?copy(d.sessions):[],
  comps:Array.isArray(d.comps)?copy(d.comps):[],
  rollLocal:Array.isArray(d.rollLocal)?copy(d.rollLocal):[],
  name:String(d.name||"").slice(0,40),
  att:(d.att&&typeof d.att==="object"&&!Array.isArray(d.att))?copy(d.att):{},
  consent:(d.consent&&d.consent.at)?{at:String(d.consent.at),share:d.consent.share!==false,parental:!!d.consent.parental}:null,
  acct:d.acct==="solo"?"solo":"club",
  demo:normDemo(d.demo),
  skills:(d.skills&&typeof d.skills==="object")?normSkills(d.skills):skillsFromSessions(d.sessions),
  coach3:normCoach(d.coach3),
  feed:{on:!!(d.feed&&d.feed.on),at:String((d.feed&&d.feed.at)||"")},
  fx:normFx(d.fx)}}
function emptyState(){return {belt:{rank:"blanche",stripes:0,since:""},request:null,sessions:[],comps:[],consent:null,att:{},name:"",acct:window.UZU_SOLO?"solo":"club",demo:{age:"",sex:""},skills:{},coach3:{},feed:{on:false,at:""},fx:{checks:{},vals:{}}}}
function notSample(x){return !x.sample}
var state;
var pendingDel={s:[],c:[]};
function unionById(lc,sv,del){var seen={};lc.forEach(function(x){seen[x.id]=1});
 return lc.concat(sv.filter(function(x){return !seen[x.id]&&del.indexOf(x.id)<0}))}
function mergeStates(sv,lc){var out=normalize(lc);
 out.sessions=unionById(out.sessions,sv.sessions,pendingDel.s);out.comps=unionById(out.comps,sv.comps,pendingDel.c);
 out.att=Object.assign({},sv.att,out.att);out.name=out.name||sv.name;out.consent=out.consent||sv.consent;
 // compétences, réactions et profil : la version locale en attente gagne, le reste vient du serveur
 out.skills=Object.assign({},sv.skills,out.skills);
 Object.keys(sv.skills||{}).forEach(function(k){var a=sv.skills[k],b=out.skills[k];if(b&&a&&a.lvl>b.lvl)out.skills[k]=a});
 out.fx={checks:Object.assign({},sv.fx.checks,out.fx.checks),vals:Object.assign({},sv.fx.vals,out.fx.vals)};
 if(!out.demo.age&&!out.demo.sex)out.demo=sv.demo;
 if(sv.request&&(!out.request||sv.request.at>out.request.at))out.request=sv.request;return out}
function memberBody(){return copy({acct:state.acct==="solo"?"solo":"club",belt:state.belt,demo:state.demo||{age:"",sex:""},skills:state.skills||{},feed:state.feed,fx:state.fx,
 consent:state.consent,request:state.request,name:state.name||"",att:state.att,
 sessions:state.sessions.filter(notSample).map(function(s){var c=Object.assign({},s);delete c.note;delete c.forme;return c}),
 comps:state.comps.filter(notSample),updatedAt:new Date().toISOString()})}
function privBody(){var pm={};state.sessions.forEach(function(s){if(!s.sample&&(s.note||s.forme))pm[s.id]={n:s.note||"",f:s.forme||""}});return pm}
function coachBody(){return copy(Object.assign({},state,{sessions:state.sessions.filter(notSample),comps:state.comps.filter(notSample),updatedAt:new Date().toISOString()}))}
var mode="local";
var myGrade=null;
function applyGrade(){if(mode==="cloud"&&role!=="teacher"&&!isSolo())state.belt=myGrade?normBelt(myGrade):{rank:"blanche",stripes:0,since:""}}
function isPending(req,g){return !!(req&&req.at&&(!g||!g.decidedAt||g.decidedAt<req.at))}
var role=null;
function gradeHist(g){if(!g)return [];if(Array.isArray(g.hist))return g.hist.slice();return g.decidedAt&&g.rank?[{rank:g.rank,stripes:+g.stripes||0,since:g.since||"",status:g.status||"validé",at:g.decidedAt}]:[]}
var SUBMISSIONS=[
 {id:"rnc",       nom:"Étranglement arrière (RNC)",  fam:"etr"},
 {id:"guillotine",nom:"Guillotine",                  fam:"etr"},
 {id:"triangle",  nom:"Triangle",                    fam:"etr"},
 {id:"brastete",  nom:"Bras-tête",                   fam:"etr"},
 {id:"darce",     nom:"D'Arce / Anaconda",           fam:"etr"},
 {id:"ezekiel",   nom:"Ezekiel",                     fam:"etr"},
 {id:"col",       nom:"Étranglement au col (kimono)",fam:"etr", gi:true},
 {id:"bowarrow",  nom:"Bow and arrow (kimono)",      fam:"etr", gi:true},
 {id:"armbar",    nom:"Clé de bras",                 fam:"bras"},
 {id:"kimura",    nom:"Kimura",                      fam:"bras"},
 {id:"americana", nom:"Americana",                   fam:"bras"},
 {id:"omoplata",  nom:"Omoplata",                    fam:"bras"},
 {id:"poignet",   nom:"Clé de poignet",              fam:"bras"},
 {id:"cheville",  nom:"Clé de cheville",             fam:"jambes"},
 {id:"talon",     nom:"Clé de talon (heel hook)",    fam:"jambes"},
 {id:"genou",     nom:"Clé de genou",                fam:"jambes"},
 {id:"toehold",   nom:"Toe hold",                    fam:"jambes"},
 {id:"autre",     nom:"Autre / non précisée",        fam:"autre"}];
var SUB_DIRS={placee:"placée",subieW:"subie contre une blanche",subieG:"subie contre un gradé"};
var SUB_MAX=30;
function subById(id){for(var i=0;i<SUBMISSIONS.length;i++)if(SUBMISSIONS[i].id===id)return SUBMISSIONS[i];return null}
function subName(id){var x=subById(id);return x?x.nom:"Autre / non précisée"}
function normSubs(a){return Array.isArray(a)?a.filter(function(x){return x&&SUB_DIRS[x.d]&&+x.n>0}).map(function(x){return {t:subById(x.t)?x.t:"autre",d:x.d,n:Math.min(SUB_MAX,Math.round(+x.n))}}):[]}
function subsOf(x){if(Array.isArray(x.subs))return normSubs(x.subs);var o=[];
 if(+x.placed)o.push({t:"autre",d:"placee",n:+x.placed});if(tw(x))o.push({t:"autre",d:"subieW",n:tw(x)});if(tg(x))o.push({t:"autre",d:"subieG",n:tg(x)});return o}
function subTotals(L){var o={placee:0,subieW:0,subieG:0};L.forEach(function(x){o[x.d]+=x.n});return o}
function subStats(S){var o={placee:{},subie:{}};mat(S).forEach(function(x){subsOf(x).forEach(function(e){var k=e.d==="placee"?"placee":"subie";o[k][e.t]=(o[k][e.t]||0)+e.n})});return o}
var GM_SRC={sweeps:"sweeps",passes:"guard_passes"};
var GM_SYS={fondamentaux:"fond",lutte:"lutte",controle_dos:"controle",jeux_jambes:"jambes"};
var GM_ALIAS={pendulum:"pendulum_sweep",butterfly:"butterfly_sweep",old_school:"old_school_sweep",body_lock:"body_lock_pass"};
var GM_CATS={sweeps:{n:JJB_STRUCTURED_TECHNIQUES.sweeps.label,one:"renversement"},passes:{n:JJB_STRUCTURED_TECHNIQUES.guard_passes.label,one:"passage"}};
var GM_TECHS={};
Object.keys(GM_SRC).forEach(function(c){GM_TECHS[c]=JJB_STRUCTURED_TECHNIQUES[GM_SRC[c]].items.map(function(t){return {id:t.id,nom:t.name,sys:GM_SYS[t.system]||"",pos:t.startPos||""}})
 .concat([{id:"autre",nom:c==="sweeps"?"Autre renversement":"Autre passage",sys:"",pos:""}])});
var GM_DIRS={placed:"placé",suffered:"subi"};
var GM_MAX=20;
var GM_FIELDS={sweeps_placed:"sweeps_done",sweeps_suffered:"sweeps_suffered",passes_placed:"guard_passes_done",passes_suffered:"guard_passes_suffered"};
function blankGm(){var o={};Object.keys(GM_FIELDS).forEach(function(f){o[f]={}});return o}
function gmTech(cat,id){var L=GM_TECHS[cat]||[];for(var i=0;i<L.length;i++)if(L[i].id===id)return L[i];return null}
function gmName(cat,id){var t=gmTech(cat,id)||gmTech(cat,"autre");return t?t.nom:"Autre"}
function normGm(g){var o=blankGm();Object.keys(GM_FIELDS).forEach(function(f){var cat=f.split("_")[0],src=g&&g[f];if(!src||typeof src!=="object")return;
  Object.keys(src).forEach(function(id){var n=Math.round(+src[id]||0);if(n<=0)return;id=GM_ALIAS[id]||id;var k=gmTech(cat,id)?id:"autre";o[f][k]=Math.min(GM_MAX,(o[f][k]||0)+n)})});return o}
function gmOf(x){var d=x&&(x.sparring_details||x.gm);if(d&&typeof d==="object")return normGm(d);var o=blankGm();
 Object.keys(GM_FIELDS).forEach(function(f){var n=actOf(x,GM_FIELDS[f]);if(n)o[f].autre=n});return o}
function gmTotal(map){return Object.keys(map||{}).reduce(function(a,k){return a+map[k]},0)}
function gmStats(S){var o={placed:{},suffered:{}};mat(S).forEach(function(x){var g=gmOf(x);Object.keys(GM_FIELDS).forEach(function(f){var p=f.split("_");
  Object.keys(g[f]).forEach(function(id){var k=p[0]+":"+id;o[p[1]][k]=(o[p[1]][k]||0)+g[f][id]})})});return o}
function gmSysCounts(g){var o={};SYS_KEYS.forEach(function(k){o[k]={placed:0,suffered:0}});
 Object.keys(GM_FIELDS).forEach(function(f){var p=f.split("_");Object.keys(g[f]||{}).forEach(function(id){var t=gmTech(p[0],id);if(t&&o[t.sys])o[t.sys][p[1]]+=g[f][id]})});return o}
function gmSysSum(S,since){var o=gmSysCounts(blankGm());mat(S).forEach(function(x){if(since&&x.date<=since)return;var c=gmSysCounts(gmOf(x));
  SYS_KEYS.forEach(function(k){o[k].placed+=c[k].placed;o[k].suffered+=c[k].suffered})});return o}
var OPP_PROFILES={flexible:"Flexible / garde souple",lourd:"Plus lourd / puissant",explosif:"Explosif / rapide",lutteur:"Lutteur / fort debout",grand:"Grand / longs segments",petit:"Petit / compact",jambes:"Attaquant de jambes",pression:"Passeur en pression",autre:"Autre profil"};
var CUSTOM_MAX=8;
function normCustoms(a){return Array.isArray(a)?a.filter(function(x){return x&&String(x.n||"").trim()}).slice(0,CUSTOM_MAX).map(function(x){return {n:String(x.n).trim().slice(0,60),p:OPP_PROFILES[x.p]?x.p:"autre"}}):[]}
var EFFORTS={force:"Force",cardio:"Cardio",endurance:"Endurance"};
var RPE_DESC=["Touche une case de 1 (très facile) à 10 (effort maximal). Facultatif.","Très facile","Facile","Léger","Modéré","Soutenu","Assez dur","Dur","Très dur","Presque maximal","Effort maximal"];
function isPrepa(x){return !!x&&x.cat==="prepa"}
function mat(S){return (S||[]).filter(function(x){return !isPrepa(x)})}
function effortName(x){return EFFORTS[x.effort]||EFFORTS.force}
function normBlocks(a){return (Array.isArray(a)?a:[]).filter(function(b){return b&&(isTech(b.tech)||SYSTEMS[b.sys])}).slice(0,8).map(function(b){var t=isTech(b.tech)?String(b.tech):"";
 return {sys:SYSTEMS[b.sys]?b.sys:(t?sysOfTech(t):""),flow:b.flow==="impose"||b.flow==="subi"?b.flow:"",tech:t}})}
function sessBlocks(x){if(!x||isPrepa(x))return [];var b=normBlocks(x.blocks);if(b.length)return b;return [{sys:SYSTEMS[x.sys]?x.sys:"",flow:x.flow||"",tech:isTech(x.theme)?x.theme:""}]}
function blockName(b){return b.tech||(SYSTEMS[b.sys]?SYSTEMS[b.sys].n:"Technique libre")}
function sameBlock(a,b){return a.tech?a.tech===b.tech:(!b.tech&&a.sys===b.sys)}
function prepaStats(S){var lim=ymd(addDays(TODAY,-30)),o={n:0,min:0,rpeSum:0,rpeN:0,mix:{}};
 (S||[]).map(function(x){return isPrepa(x)?x:(x&&x.prepa?{cat:"prepa",date:x.date,dur:x.prepa.dur,rpe:x.prepa.rpe,effort:x.prepa.effort}:null)}).forEach(function(x){if(!x||x.date<=lim)return;o.n++;o.min+=+x.dur||0;if(+x.rpe){o.rpeSum+=+x.rpe;o.rpeN++}var e=effortName(x);o.mix[e]=(o.mix[e]||0)+1});return o}
var myRoll=[];
function rollToSession(r){return {id:"r-"+r.k,date:r.date,type:/no.?gi/i.test(r.title||"")?"No-gi":"Gi",dur:+r.dur||90,theme:r.theme||r.title||"Cours du club",rounds:0,placed:0,takenW:0,takenG:0,roll:true,slot:r.title||""}}
function mergeRoll(own,rolls){return (rolls||[]).filter(function(r){return r&&r.date&&!own.some(function(s){return s.date===r.date&&!isPrepa(s)})}).map(rollToSession).concat(own)}
function allSessions(){return mergeRoll(state.sessions,mode==="cloud"?myRoll:(state.rollLocal||[]))}
var FORM_ACT_KEYS=["lucha_takedowns_done","lucha_takedowns_suffered","guard_retentions"];
var ACT_KEYS=["lucha_takedowns_done","lucha_takedowns_suffered","guard_passes_done","guard_passes_suffered","sweeps_done","sweeps_suffered","guard_retentions"];
function actOf(x,k){return Math.max(0,+(x&&x[k])||0)}
function actSum(S,k){return (S||[]).reduce(function(a,x){return a+actOf(x,k)},0)}
function actStats(S){var o={};ACT_KEYS.forEach(function(k){o[k]=actSum(S,k)});
 o.tdTot=o.lucha_takedowns_done+o.lucha_takedowns_suffered;o.tdPct=o.tdTot?Math.round(o.lucha_takedowns_done/o.tdTot*100):null;
 var good=o.guard_retentions+o.sweeps_done,bad=o.guard_passes_suffered;o.guardTot=good+bad;o.guardPct=o.guardTot?Math.round(good/o.guardTot*100):null;return o}
function techByName(n){for(var i=0;i<TECHNIQUES.length;i++)if(TECHNIQUES[i].nom===n)return TECHNIQUES[i];return null}
function sysOfTech(t){var tq=techByName(t);if(tq)t=tq.item;for(var i=0;i<SYS_KEYS.length;i++)if(SYSTEMS[SYS_KEYS[i]].items.indexOf(t)>-1)return SYS_KEYS[i];return ""}
function sysStats(S,ver){var P=asP(S||[],ver),bs=lvMap(P),lim=ymd(addDays(TODAY,-30)),out={};S=P.sessions;
 TECHNIQUES.forEach(function(t){if((bs[t.nom]||0)>(bs[t.item]||0))bs[t.item]=bs[t.nom]});
 SYS_KEYS.forEach(function(k){var it=SYSTEMS[k].items,sum=0;it.forEach(function(t){sum+=bs[t]||0});out[k]={pct:Math.round(sum/(it.length*3)*100),imp:0,sub:0}});
 (S||[]).forEach(function(x){if(!x||x.date<=lim)return;sessBlocks(x).forEach(function(b){if(b.sys&&out[b.sys]){if(b.flow==="subi")out[b.sys].sub++;else if(b.flow==="impose")out[b.sys].imp++}})});
 out.bs=bs;out.avg=Math.round(SYS_KEYS.reduce(function(a,k){return a+out[k].pct},0)/SYS_KEYS.length);return out}
function tw(s){return s.takenW!=null?(+s.takenW||0):(+s.taken||0)}
function tg(s){return +s.takenG||0}
var KINDS={cours:{n:"Cours Collectif",d:"Le cours classique : technique puis sparrings."},open:{n:"Open Mat / Libre",d:"Sparrings libres ou drills perso : pas de thème à choisir, note tes rounds, tes soumissions et ta fatigue."},compet:{n:"Compétition / Prépa",d:"Entraînement intensif ciblé pour les compétiteurs du club."},prive:{n:"Cours Privé",d:"Séance individuelle ou en petit groupe avec le prof."},prepa:{n:"Prépa Physique",d:""}};
function kindOf(x){return isPrepa(x)?"prepa":KINDS[x&&x.kind]&&x.kind!=="prepa"?x.kind:"cours"}
function blankForm(){var f={cat:"jjb",kind:"cours",sys:"",flow:"",tech:"",tqCat:"sweep",type:"Gi",dur:90,rounds:0,forme:"",stars:0,subs:[],subDir:"placee",gm:blankGm(),gmDir:"placed",customs:[],effort:"force",rpe:0,blocks:[],withPrepa:false,pdur:30};
 FORM_ACT_KEYS.forEach(function(k){f[k]=0});return f}
var MILESTONES=[10,25,50,100,150,200,300,400,500,750,1000];
function realSessions(){return allSessions().filter(function(x){return !x.sample}).slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0})}
function weekKey(d){return ymd(weekStart(parse(d)))}
function myEvents(){var S=realSessions(),out=[],weeks={},prevWk="",run=0,lim=ymd(addDays(TODAY,-60));
 S.forEach(function(x,i){var n=i+1;
  out.push({id:"s:"+x.id,t:"s",d:x.date,dur:+x.dur||0,gi:isPrepa(x)?"":x.type==="No-gi"?"No-gi":"Gi",sys:!isPrepa(x)&&SYSTEMS[x.sys]?x.sys:"",k:kindOf(x),ef:isPrepa(x)?effortName(x):""});
  if(MILESTONES.indexOf(n)>-1)out.push({id:"m:n"+n,t:"m",k:"n",n:n,d:x.date});
  var wk=weekKey(x.date);if(!weeks[wk]){weeks[wk]=1;run=prevWk&&ymd(addDays(parse(prevWk),7))===wk?run+1:1;prevWk=wk;if(run>=4&&run%4===0)out.push({id:"m:w"+wk,t:"m",k:"w",n:run,d:x.date})}});
 state.comps.filter(function(c){return !c.sample&&(c.result==="or"||c.result==="argent"||c.result==="bronze")}).forEach(function(c){out.push({id:"c:"+c.id,t:"c",d:c.date,res:c.result,ev:String(c.event||"").slice(0,80)})});
 if(mode==="cloud"&&role!=="teacher"){var prev={rank:"blanche",stripes:0};gradeHist(myGrade).filter(function(h){return h.status!=="refusé"}).sort(function(a,b){return a.at<b.at?-1:1}).forEach(function(h){
  if(h.rank!==prev.rank||+h.stripes>+prev.stripes)out.push({id:"g:"+h.at,t:"g",d:day10(h.at),rank:BELTS[beltIdx(h.rank)].k,st:+h.stripes||0,nb:h.rank!==prev.rank});prev=h})}
 Object.keys(state.skills||{}).forEach(function(k){var sk=state.skills[k];if(sk.lvl===1&&sk.req)out.push({id:"r:"+k,t:"r",d:day10(sk.req),at:sk.req,tech:k})});
 return out.filter(function(e){return e.d>=lim}).sort(function(a,b){return a.d<b.d?1:a.d>b.d?-1:0}).slice(0,150)}
function feedEnabled(){return !!(state.feed&&state.feed.on)}
return { normalize, emptyState, normBelt, copy, TODAY, ymd, parse, addDays, day10, BELTS, SYSTEMS, SYS_KEYS, SYS_MAIN, KINDS, EFFORTS, RPE_DESC, TECHNIQUES, TECH_CATS, SUBMISSIONS, SUB_DIRS, SUB_MAX, OPP_PROFILES, CUSTOM_MAX, GM_TECHS, GM_CATS, GM_DIRS, GM_MAX, GM_FIELDS, FORM_ACT_KEYS, ACT_KEYS, blankForm, blankGm, normSubs, subTotals, normCustoms, normGm, gmSysCounts, gmTotal, sessBlocks, normBlocks, sameBlock, blockName, isTech, sysOfTech, techByName, subById, subName, gmName, touchSkill, skillInfo, isPrepa, memberBody, privBody, coachBody, mergeStates, unionById, applyGrade, allSessions, me, isSolo, normCoach, myEvents, feedEnabled, sysStats, gmSysSum, skillList, subStats, gmStats, prepaStats, actStats, skillMeta, lvMap, beltLabel, stripesTxt, duration, tw, tg, REVIEW_DAYS, weekStart, effortName, isPending, mat, frShort, frDate,
  __set: function (k, v) { switch (k) { case "state": state = v; return; case "pendingDel": pendingDel = v; return; case "mode": mode = v; return; case "role": role = v; return; case "myRoll": myRoll = v; return; case "myGrade": myGrade = v; return; } throw new Error("variable inconnue : " + k) },
  __get: function (k) { switch (k) { case "state": return state; case "pendingDel": return pendingDel; case "mode": return mode; case "role": return role; case "myRoll": return myRoll; case "myGrade": return myGrade; } throw new Error("variable inconnue : " + k) } };
}
