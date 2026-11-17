// Génère db/bibliotheque/catalogue.json et la partie « données » du script SQL de la bibliothèque.
// Source unique : programme-source.txt (texte extrait du document PROGRAMME_TECHNIQUE_GI__NO_g.docx).
// Les descriptions du document sont reprises MOT POUR MOT. Tout ce qui n'en vient pas
// (fiches complémentaires, corrections, suites de branche) est marqué origin = 'proposition'
// et reste « à valider » par un professeur qualifié.
// Usage : node db/bibliotheque/build.mjs
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const DIR = path.dirname(fileURLToPath(import.meta.url))
const SRC = fs.readFileSync(path.join(DIR, "programme-source.txt"), "utf8")
const PROPOSITION = "Proposition UZU du 17/11/2026 — à valider par un professeur qualifié"
const DOCUMENT = "Programme technique JJB Gi & No-Gi (document fourni par le club)"

// ---------------------------------------------------------------------------------------------
// 1. Lecture des 60 fiches du document (ordre, catégorie, nom, description d'origine)
// ---------------------------------------------------------------------------------------------
function splitName(line) {
  // « Nom (… : …) : description » — on coupe au premier « : » hors parenthèses
  let depth = 0
  for (let i = 0; i < line.length - 2; i++) {
    const c = line[i]
    if (c === "(") depth++
    else if (c === ")") depth = Math.max(0, depth - 1)
    else if (depth === 0 && line.slice(i, i + 3) === " : ") return [line.slice(0, i).trim(), line.slice(i + 3).trim()]
  }
  throw new Error("Ligne sans séparateur : " + line.slice(0, 60))
}

const lines = SRC.split(/\r?\n/)
const parts = []
let part = null, cat = null
for (const raw of lines) {
  const l = raw.trim()
  if (/^PARTIE 1/.test(l)) { part = { key: "jjb_gi", cats: [] }; parts.push(part); continue }
  if (/^PARTIE 2/.test(l)) { part = { key: "grappling_nogi", cats: [] }; parts.push(part); continue }
  if (/^PARTIE 3|FLOWCHART|^Le JJB moderne ne se résume/.test(l)) { part = null; continue }
  if (!part) continue
  const mc = l.match(/^(\d)\. (.+) \((\d+)\)$/)
  if (mc) { cat = { n: Number(mc[1]), name: mc[2], expected: Number(mc[3]), items: [] }; part.cats.push(cat); continue }
  if (l.startsWith("-   ") && cat) { const [name, desc] = splitName(l.slice(4)); cat.items.push({ name, desc }) }
}
if (parts.length !== 2) throw new Error("Deux parties attendues")
for (const p of parts) {
  if (p.cats.length !== 6) throw new Error(p.key + " : 6 catégories attendues")
  for (const c of p.cats) if (c.items.length !== c.expected) throw new Error(`${p.key} ${c.name} : ${c.items.length}/${c.expected}`)
}

// ---------------------------------------------------------------------------------------------
// 2. Métadonnées par fiche (rapport d'audit du 17/11/2026, sections 3, 4 et 6)
//    a = autres noms ; l = lien avec la progression existante ; v = points à valider ; r = restriction
//    Liens : "tech:<id TECHNIQUES>" ou "sys:<clé SYSTEMS>[:<item exact>]"
// ---------------------------------------------------------------------------------------------
const META = {
  G01: { l: ["sys:lutte:Takedowns"], v: ["V1"] },
  G02: { a: ["Tomoe Nage", "Sumi Gaeshi"], l: ["sys:lutte:Takedowns"], v: ["V2", "S2"] },
  G03: { l: ["sys:lutte:Takedowns"], v: ["V3"] },
  G04: { a: ["Col-Manche"], l: ["sys:fond"], v: ["V4"] },
  G05: { a: ["DLR"] },
  G06: { l: ["sys:fond"], v: ["V4"] },
  G07: { a: ["Berimbolo"], l: ["tech:sw-berimbolo"], v: ["T2"] },
  G08: { a: ["Spider-Lasso", "Spider Guard"] },
  G09: { a: ["Worm Guard", "Squid Guard"] },
  G10: { a: ["Kiss of the Dragon", "RDLR"], v: ["S3"] },
  G11: { a: ["Granby Roll", "Framing"], l: ["sys:fond:Rétention de garde"], v: ["S3"] },
  G12: { a: ["Sickle Sweep"], l: ["tech:sw-tripod"], v: ["V5"] },
  G13: { l: ["tech:sw-scissor"] },
  G14: { a: ["Deep Half Guard"], v: ["V6"] },
  G15: {},
  G16: { a: ["Crab Ride"], l: ["tech:sw-berimbolo"], v: ["T2"] },
  G17: { a: ["Toreando"], l: ["tech:gp-toreando"] },
  G18: { a: ["Knee Slice"], l: ["tech:gp-kneeslice"] },
  G19: { l: ["tech:gp-legdrag"], v: ["V7"] },
  G20: { l: ["tech:gp-overunder"] },
  G21: { a: ["Stack Pass"], l: ["tech:gp-doubleund"], v: ["S2"] },
  G22: {},
  G23: { a: ["Seatbelt"], l: ["sys:controle:Back attack"] },
  G24: { a: ["Crossface", "Side Control"], l: ["sys:fond:Contrôle latéral et monte"] },
  G25: { a: ["Langouste", "Shrimp"], l: ["sys:fond:Sorties de monte et contrôle latéral"] },
  G26: { a: ["Knee Shield"], l: ["sys:fond:Demi-garde"], v: ["V8"] },
  G27: {},
  G28: {},
  G29: { v: ["V9"] },
  G30: { a: ["Triangle", "Armbar"] },
  N01: { a: ["Front Headlock"], l: ["sys:lutte:Snap down", "sys:controle:Front headlock"] },
  N02: { a: ["Run the Pipe"], l: ["sys:lutte:Takedowns"] },
  N03: { a: ["Arm Drag"], l: ["sys:lutte:Takedowns"] },
  N04: { a: ["Body Lock"], l: ["sys:lutte:Takedowns"], v: ["S2"] },
  N05: { l: ["sys:lutte:Transitions dynamiques"] },
  N06: { a: ["Hand Fighting"], l: ["sys:lutte:Hand-fighting"] },
  N07: {},
  N08: { a: ["SLX", "Ashi Garami"], l: ["sys:jambes:Entrées de leglocks"], v: ["V10", "S1"] },
  N09: { a: ["Z-Guard"], l: ["sys:fond:Demi-garde"] },
  N10: { l: ["sys:jambes:Entrées de leglocks"], v: ["V11", "S1"] },
  N11: { a: ["Supine Guard", "High Pummel"], l: ["sys:fond:Rétention de garde"] },
  N12: { l: ["tech:sw-butterfly"] },
  N13: { a: ["Technical Stand-Up"], l: ["sys:lutte:Wrestle-up"] },
  N14: {},
  N15: { a: ["Giggler"], v: ["V12"] },
  N16: { a: ["Lockdown", "Electric Chair"], v: ["V13"] },
  N17: { l: ["tech:gp-bodylock"] },
  N18: { a: ["Knee Slice"], l: ["tech:gp-kneeslice"] },
  N19: { v: ["V14"] },
  N20: { a: ["Toreando"], l: ["tech:gp-toreando"] },
  N21: { l: ["tech:gp-legdrag"] },
  N22: { a: ["Headquarters"], v: ["F2"] },
  N23: { a: ["Body Triangle", "Straight Jacket"], l: ["sys:controle:Back attack"], v: ["V15"] },
  N24: { a: ["Dogfight"], l: ["sys:fond:Demi-garde"] },
  N25: { l: ["sys:jambes"], v: ["V16", "S1"], r: "cles_talon" },
  N26: { a: ["Kipping"], l: ["sys:fond:Sorties de monte et contrôle latéral"] },
  N27: { a: ["RNC", "Mata Leão"], l: ["sys:controle:RNC / étranglement arrière"], v: ["V17"] },
  N28: { a: ["Heel Hook"], l: ["sys:jambes:Clés de talon / cheville / genou"], v: ["V18", "S1"], r: "cles_talon" },
  N29: { a: ["Guillotine", "Darce"], l: ["sys:controle:Guillotine / Anaconda"] },
  N30: { a: ["Kata Gatame"] },
}

// Corrections proposées (V16, V17, V18) : le texte d'origine reste intact, la correction est à côté
const CORRECTIONS = {
  N25: "Sortir avant que la prise se ferme : dès que l'adversaire va chercher le talon, cacher le talon, dégager la ligne du genou (amener son genou au-delà des hanches de l'adversaire), pousser sur sa hanche avec le pied libre et retirer la jambe en ligne droite, sans rotation, hors de son aisselle. Sécurité : si la clé est déjà serrée, ne pas tourner, taper. Aucune consigne de rotation tant qu'un professeur ne l'a pas précisée selon la clé (interne ou externe).",
  N27: "Glisser l'avant-bras sous son menton, le pli du coude centré sous le menton, le biceps et l'avant-bras de part et d'autre du cou. Version à une main (son bras piégé) : la main du bras qui étrangle saisit votre épaule opposée, l'autre main contrôle sa tête ou son poignet. Serrer en rapprochant le coude, tête collée contre la sienne. Sécurité : pas de pression sur la trachée. Étranglement sanguin : la perte de connaissance peut survenir en quelques secondes. Serrer progressivement, relâcher immédiatement au premier tap ou si le partenaire ne répond plus.",
  N28: "Depuis le Saddle (N32) ou le Backside 50/50 (N33) : genou de l'adversaire bloqué entre vos cuisses, genoux serrés. Son talon calé dans le creux du poignet, ses orteils coincés sous votre aisselle, mains jointes paume contre paume. Rotation lente du buste qui entraîne le talon, sans à-coup. Sécurité : application très lente, arrêt au premier tap. Le partenaire doit taper tôt, car la douleur arrive souvent après la lésion. Réservée aux pratiquants avancés, et seulement dans les règles et catégories qui l'autorisent.",
}

// Fiches complémentaires (F1 à F4), décision du 17/11/2026 : toutes créées, statut « à valider »
const EXTRA = [
  { code: "G31", d: "jjb_gi", c: 6, name: "Omoplata (Clé d'épaule avec les jambes)", lvl: 2, v: ["F1"],
    desc: "Depuis Col-Manche, contrôler la manche, pivoter les hanches et passer la jambe par-dessus son épaule. S'asseoir face à ses jambes, bloquer sa hanche pour l'empêcher de rouler, puis pencher le buste vers l'avant. Sécurité : pression lente, l'épaule cède vite ; si le partenaire roule pour s'échapper, le laisser rouler." },
  { code: "G32", d: "jjb_gi", c: 4, name: "Headquarters (Position de départ du passage)", lvl: 1, v: ["F2"],
    desc: "Un genou entre ses jambes, l'autre pied à l'extérieur, contrôle du pantalon et du col. Hanches basses, poids sur la jambe qui écrase sa cuisse. Position d'attente d'où partent le Torreando et le Knee Cut." },
  { code: "G33", d: "jjb_gi", c: 5, name: "Passage en montée (Mount)", lvl: 1, v: ["F2"], l: ["sys:fond:Contrôle latéral et monte"],
    desc: "Depuis le contrôle latéral, garder le Crossface, bloquer sa hanche avec la main, glisser le genou sur son ventre puis le passer de l'autre côté. S'installer genoux serrés contre ses côtes, pieds crochetés sous ses jambes." },
  { code: "G34", d: "jjb_gi", c: 4, name: "Smash Pass en kimono", lvl: 2, v: ["F2"],
    desc: "Même principe que N22 : plaquer ses deux jambes au sol, l'une sur l'autre, épaule sur sa hanche, puis contourner. En kimono, tenir le pantalon pour garder les jambes collées. Sécurité : ne pas tordre son genou en écrasant." },
  { code: "N31", d: "grappling_nogi", c: 2, name: "X-Guard", lvl: 2, v: ["F3"], l: ["sys:jambes:Entrées de leglocks"],
    desc: "Sous l'adversaire debout : un crochet derrière son genou, l'autre pied sur sa hanche, une main sur sa cheville. Étendre les jambes pour le faire basculer et l'obliger à poser les mains au tapis." },
  { code: "N32", d: "grappling_nogi", c: 2, name: "Saddle (4/11, Honey Hole)", lvl: 3, v: ["F3", "S1"], r: "cles_talon", a: ["4/11", "Honey Hole", "Inside Sankaku"], l: ["sys:jambes:Ashi garami"],
    desc: "Sa jambe entre les tiennes, ta jambe intérieure en travers de sa hanche, ta jambe extérieure par-dessus qui se verrouille derrière ton genou (forme en 4), genoux serrés. Contrôler le talon avant toute rotation. Sécurité : position des clés de talon, réservée aux pratiquants avancés et aux règles qui les autorisent." },
  { code: "N33", d: "grappling_nogi", c: 2, name: "Backside 50/50", lvl: 3, v: ["F3", "S1"], r: "cles_talon", a: ["50/50"], l: ["sys:jambes:Ashi garami"],
    desc: "Depuis la 50/50, passer derrière sa jambe pour que son talon soit exposé, contrôler son genou avant d'attaquer. Même sécurité que N32." },
  { code: "N34", d: "grappling_nogi", c: 5, name: "Crab Ride sans kimono", lvl: 3, v: ["F3"], a: ["Crab Ride"], l: ["sys:controle:Back attack"],
    desc: "Assis derrière ses hanches, un crochet à l'intérieur de sa cuisse, contrôle de sa hanche (pas de ceinture en No-Gi). Suivre ses déplacements pour remonter vers son dos. G16 reste la version kimono." },
  { code: "N35", d: "grappling_nogi", c: 5, name: "Dagestani Handcuff (Piège du bras en menottes)", lvl: 3, v: ["F4"], a: ["Handcuff"],
    desc: "Depuis le côté ou la tortue, saisir un bras de l'adversaire à deux mains pour le bloquer contre lui, puis rouler pour le mettre sur le dos avec le bras piégé, ce qui ouvre l'étranglement tête-bras. Description générale à préciser par un professeur." },
  { code: "N36", d: "grappling_nogi", c: 5, name: "Contrôle latéral Chest-to-Chest (No-Gi)", lvl: 1, v: ["F4"], a: ["Chest-to-Chest", "Side Control"], l: ["sys:fond:Contrôle latéral et monte"],
    desc: "Poitrine contre poitrine, bras sous sa nuque ou Crossface, underhook sur le bras éloigné, hanches basses, genoux collés contre lui pour bloquer la langouste." },
]

const DISCIPLINES = [
  { id: "jjb_gi", label: "JJB Gi", long: "Jiu-jitsu brésilien en kimono", pos: 1, active: true },
  { id: "grappling_nogi", label: "Grappling No-Gi", long: "Grappling sans kimono", pos: 2, active: true },
  { id: "mma", label: "MMA", long: "Arts martiaux mixtes", pos: 3, active: false },
]

const categories = [], techniques = []
for (const p of parts) {
  const prefix = p.key === "jjb_gi" ? "G" : "N"
  let n = 0
  for (const c of p.cats) {
    categories.push({ id: `${p.key}_${c.n}`, discipline: p.key, pos: c.n, label: c.name })
    c.items.forEach((it, i) => {
      n++
      const code = prefix + String(n).padStart(2, "0")
      const m = META[code]
      if (!m) throw new Error("Métadonnées manquantes : " + code)
      techniques.push({
        id: code, discipline: p.key, category: `${p.key}_${c.n}`, pos: i + 1, name: it.name,
        aliases: m.a || [], source_text: it.desc, proposed_text: CORRECTIONS[code] || null,
        origin: "document", level: null, validation_refs: m.v || [], restricted: m.r || null,
        links: m.l || [], source: DOCUMENT,
      })
    })
  }
}
if (techniques.length !== 60) throw new Error("60 fiches attendues, " + techniques.length)
for (const e of EXTRA) {
  const cid = `${e.d}_${e.c}`
  const pos = techniques.filter(t => t.category === cid).length + 1
  techniques.push({
    id: e.code, discipline: e.d, category: cid, pos, name: e.name, aliases: e.a || [],
    source_text: null, proposed_text: e.desc, origin: "proposition", level: e.lvl,
    validation_refs: e.v, restricted: e.r || null, links: e.l || [], source: PROPOSITION,
  })
}

// ---------------------------------------------------------------------------------------------
// 3. Les 4 enchaînements : étapes en arbre (parent), libellés du document mot pour mot
//    t = fiches liées ; tp = fiches liées proposées (fiches complémentaires) ; o = proposition
// ---------------------------------------------------------------------------------------------
const FLOWS = [
  { id: "FC1", d: "jjb_gi", pos: 1, title: "Le système « Garde Ouverte vers Prise de Dos »",
    intro: "En kimono, tout part de la connexion à distance pour forcer l'adversaire à réagir, créant ainsi un accès à son dos.",
    steps: [
      { k: "depart", txt: "Guard Pull vers Collar-Sleeve (Col-Manche).", t: ["G04", "G06"] },
      { k: "action", txt: "Vous menacez le Triangle ou l'Omoplata.", t: ["G30"], tp: ["G31"] },
      { k: "reaction", txt: "Il recule et redresse sa posture pour défendre le haut du corps." },
      { k: "transition", txt: "Passage en De La Riva (DLR) en accrochant sa jambe avant.", t: ["G05", "G07"] },
      { k: "action", txt: "Vous déséquilibrez vers l'arrière pour le Tripod Sweep ou le Berimbolo.", t: ["G12", "G07"] },
      { k: "reaction", txt: "Il plie son genou vers l'intérieur pour écraser votre crochet DLR et tenter un Knee Cut Pass.", t: ["G18"] },
      { k: "transition", txt: "Bascule en Reverse De La Riva (RDLR).", t: ["G10"] },
      { k: "action", txt: "Vous inversez sous ses hanches (Kiss of the Dragon) pour exposer son dos.", t: ["G10"] },
      { k: "finalisation", txt: "Prise de dos (Seatbelt + prise de col) → Bow and Arrow Choke.", t: ["G23", "G27"] },
    ] },
  { id: "FC2", d: "jjb_gi", pos: 2, title: "Le système « Passage de Garde en Dilemme »",
    intro: "Pour passer une garde moderne en kimono, il faut alterner entre vitesse (contourner) et pression (écraser).",
    steps: [
      { k: "depart", txt: "Entrée en position Headquarters (un pied entre ses jambes, contrôle du pantalon et du col).", tp: ["G32"] },
      { k: "action", txt: "Vous lancez un Torreando Pass sur le côté pour contourner les jambes.", t: ["G17"] },
      { k: "reaction", txt: "Il tourne ses hanches vers vous et lève les jambes pour bloquer votre passage." },
      { k: "transition", txt: "Changement d'angle vers le Knee Cut Pass à l'opposé (en tirant fort son col pour coller son dos au tapis).", t: ["G18"] },
      { k: "reaction", txt: "Il insère un bouclier de genou (Knee Shield) ou ferme la demi-garde.", t: ["G26"] },
      { k: "transition", txt: "Écrasement en Smash Pass ou Over-Under Pass pour neutraliser ses hanches.", t: ["G20"], tp: ["G34"] },
      { k: "finalisation", txt: "Contrôle latéral (Crossface) → Passage en montée → Cross Collar Choke ou Armbar.", t: ["G24", "G28", "G30"], tp: ["G33"] },
    ] },
  { id: "FC3", d: "grappling_nogi", pos: 3, title: "Le système « Garde Assise, Wrestle-Up & Leg Locks »",
    intro: "En No-Gi, le joueur du dessous crée un dilemme constant entre le haut du corps (lutte) et le bas du corps (clés de jambes).",
    steps: [
      { id: "d", k: "depart", txt: "Seated Guard (Garde assise) avec bataille de mains (Hand Fighting).", t: ["N06"] },
      { id: "a1", k: "action", txt: "Vous attaquez un Arm Drag ou un Butterfly Sweep.", t: ["N14", "N12"] },
      { id: "ra", parent: "a1", k: "reaction", b: "Réaction A : il recule", txt: "Réaction A (Il recule) : Vous déclenchez un Wrestle-Up (Single Leg) pour le faire tomber et passer au-dessus.", t: ["N13"] },
      { id: "pa", parent: "ra", k: "transition", o: true, txt: "Après le Wrestle-Up, finir la chute puis passer la garde avec le Body Lock Pass ; s'il tourne le dos pour se relever, Seatbelt puis Rear Naked Choke.", t: ["N17", "N23", "N27"] },
      { id: "rb", parent: "a1", k: "reaction", b: "Réaction B : il avance et met son poids sur vous", txt: "Réaction B (Il avance et met son poids sur vous) : Vous glissez sous lui pour entrer en Single Leg X (SLX) ou K-Guard.", t: ["N08", "N10"] },
      { id: "t", parent: "rb", k: "transition", txt: "Déséquilibre depuis SLX / X-Guard.", t: ["N08"], tp: ["N31"] },
      { id: "a2", k: "action", txt: "Vous le forcez à poser les mains au tapis, exposant son talon." },
      { id: "f", k: "finalisation", txt: "Entrée en Saddle (4/11) ou Backside 50/50 → Inside Heel Hook.", t: ["N28"], tp: ["N32", "N33"] },
      { id: "alt", k: "alternative", b: "S'il cache son talon", txt: "(Alternative si il cache son talon :) Vous remontez dans son dos via Crab Ride → Rear Naked Choke.", t: ["G16", "N27"], tp: ["N34"] },
    ] },
  { id: "FC4", d: "grappling_nogi", pos: 4, title: "Le système « Lutte, Pression & Étranglements Tête-Bras »",
    intro: "Le jeu moderne du dessus en No-Gi consiste à fatiguer l'adversaire par la pression constante avant de verrouiller la tête et un bras.",
    steps: [
      { id: "d", k: "depart", txt: "Debout → Snap Down vers Front Headlock.", t: ["N01"] },
      { id: "r1", k: "reaction", txt: "Il rentre la tête et baisse les coudes pour éviter la Guillotine.", t: ["N29"] },
      { id: "t1", k: "transition", txt: "Vous contournez vers le dos (Slide By) ou vous le forcez au sol pour passer en Body Lock Pass.", t: ["N05", "N17"] },
      { id: "ps", parent: "t1", k: "transition", o: true, b: "Slide By", txt: "Après le contournement, ceinture arrière, retour au sol, puis Seatbelt + Body Triangle et Rear Naked Choke.", t: ["N04", "N23", "N27"] },
      { id: "a", parent: "t1", k: "action", b: "Body Lock Pass", txt: "Vous écrasez ses hanches et passez en contrôle latéral (Chest-to-Chest).", tp: ["N36"] },
      { id: "r2", k: "reaction", txt: "Il se met sur le côté et pousse avec son bras pour créer de l'espace (langouste)." },
      { id: "t2", k: "transition", txt: "Piégeage du bras (Dagestani Handcuff) ou passage en Arm Triangle (Kata Gatame).", t: ["N30"], tp: ["N35"] },
      { id: "alt", k: "alternative", b: "S'il tourne le dos pour fuir", txt: "(S'il tourne le dos pour fuir :) Vous verrouillez la Seatbelt + Body Triangle → Rear Naked Choke (à une main).", t: ["N23", "N27"] },
    ] },
]
// Vérifie que chaque libellé du document figure bien dans la source (fidélité mot pour mot)
const norm = s => s.replace(/\s+/g, " ").replace(/^\(|\)$/g, "").trim()
const srcFlat = SRC.replace(/\s+/g, " ")
const flowSteps = []
for (const f of FLOWS) {
  if (!srcFlat.includes(f.intro)) throw new Error("Intro absente du document : " + f.id)
  let prev = null
  f.steps.forEach((s, i) => {
    const sid = `${f.id}-${s.id || String(i + 1)}`
    if (!s.o) {
      const probe = norm(s.txt).replace(/^Réaction [AB] \((.+?)\) : /, "").replace(/^Alternative si il cache son talon : /, "").replace(/^S'il tourne le dos pour fuir : /, "")
      if (!srcFlat.includes(probe.slice(0, 40))) throw new Error("Libellé absent du document : " + sid + " / " + probe.slice(0, 40))
    }
    const parent = s.parent ? `${f.id}-${s.parent}` : prev
    flowSteps.push({ id: sid, flow: f.id, pos: i + 1, parent, kind: s.k, branch: s.b || null, text: s.txt,
      origin: s.o ? "proposition" : "document", techs: (s.t || []).map(t => ({ t, o: s.o ? "proposition" : "document" })).concat((s.tp || []).map(t => ({ t, o: "proposition" }))) })
    prev = sid
  })
}
// Les étapes suivant une branche reprennent la bonne branche (FC3 : a2 suit t ; FC4 : r2 suit a)
const fixParent = { "FC3-a2": "FC3-t", "FC4-r2": "FC4-a" }
for (const s of flowSteps) if (fixParent[s.id]) s.parent = fixParent[s.id]
const ids = new Set(techniques.map(t => t.id))
for (const s of flowSteps) for (const x of s.techs) if (!ids.has(x.t)) throw new Error("Fiche inconnue " + x.t + " dans " + s.id)

const catalogue = { version: 1, generated: "2026-11-17", disciplines: DISCIPLINES, categories, techniques, flows: FLOWS.map(f => ({ id: f.id, discipline: f.d, pos: f.pos, title: f.title, intro: f.intro })), steps: flowSteps }
fs.writeFileSync(path.join(DIR, "catalogue.json"), JSON.stringify(catalogue, null, 1) + "\n")

// ---------------------------------------------------------------------------------------------
// 4. SQL des données (rejouable : upsert ; ne touche jamais aux tables des clubs)
// ---------------------------------------------------------------------------------------------
const q = v => v === null || v === undefined ? "null" : "'" + String(v).replace(/'/g, "''") + "'"
const arr = a => a && a.length ? "array[" + a.map(q).join(",") + "]::text[]" : "'{}'::text[]"
const js = v => q(JSON.stringify(v)) + "::jsonb"
let sql = "-- Données générées par db/bibliotheque/build.mjs — ne pas modifier à la main\n"
sql += "insert into public.lib_disciplines (id, label, long_label, position, active) values\n" +
  DISCIPLINES.map(d => `  (${q(d.id)}, ${q(d.label)}, ${q(d.long)}, ${d.pos}, ${d.active})`).join(",\n") +
  "\non conflict (id) do update set label = excluded.label, long_label = excluded.long_label, position = excluded.position, active = excluded.active;\n\n"
sql += "insert into public.lib_categories (id, discipline_id, position, label) values\n" +
  categories.map(c => `  (${q(c.id)}, ${q(c.discipline)}, ${c.pos}, ${q(c.label)})`).join(",\n") +
  "\non conflict (id) do update set discipline_id = excluded.discipline_id, position = excluded.position, label = excluded.label;\n\n"
sql += "insert into public.lib_techniques (id, discipline_id, category_id, position, name, aliases, source_text, proposed_text, origin, level, validation_refs, restricted, uzu_links, source) values\n" +
  techniques.map(t => `  (${q(t.id)}, ${q(t.discipline)}, ${q(t.category)}, ${t.pos}, ${q(t.name)}, ${arr(t.aliases)}, ${q(t.source_text)}, ${q(t.proposed_text)}, ${q(t.origin)}, ${t.level ?? "null"}, ${arr(t.validation_refs)}, ${q(t.restricted)}, ${js(t.links)}, ${q(t.source)})`).join(",\n") +
  "\non conflict (id) do update set discipline_id = excluded.discipline_id, category_id = excluded.category_id, position = excluded.position, name = excluded.name, aliases = excluded.aliases,\n" +
  "  source_text = excluded.source_text, proposed_text = excluded.proposed_text, origin = excluded.origin, level = excluded.level, validation_refs = excluded.validation_refs,\n" +
  "  restricted = excluded.restricted, uzu_links = excluded.uzu_links, source = excluded.source,\n" +
  "  version = case when (lib_techniques.name, lib_techniques.source_text, lib_techniques.proposed_text) is distinct from (excluded.name, excluded.source_text, excluded.proposed_text) then lib_techniques.version + 1 else lib_techniques.version end,\n" +
  "  updated_at = case when (lib_techniques.name, lib_techniques.source_text, lib_techniques.proposed_text) is distinct from (excluded.name, excluded.source_text, excluded.proposed_text) then now() else lib_techniques.updated_at end;\n\n"
sql += "insert into public.lib_flows (id, discipline_id, position, title, intro) values\n" +
  catalogue.flows.map(f => `  (${q(f.id)}, ${q(f.discipline)}, ${f.pos}, ${q(f.title)}, ${q(f.intro)})`).join(",\n") +
  "\non conflict (id) do update set discipline_id = excluded.discipline_id, position = excluded.position, title = excluded.title, intro = excluded.intro;\n\n"
sql += "-- Étapes : remplacées en bloc (aucune donnée de club n'y fait référence)\n"
sql += "delete from public.lib_flow_steps where flow_id in (" + FLOWS.map(f => q(f.id)).join(",") + ");\n"
sql += "insert into public.lib_flow_steps (id, flow_id, position, parent_id, kind, branch_label, label, origin) values\n" +
  flowSteps.map(s => `  (${q(s.id)}, ${q(s.flow)}, ${s.pos}, ${q(s.parent)}, ${q(s.kind)}, ${q(s.branch)}, ${q(s.text)}, ${q(s.origin)})`).join(",\n") + ";\n\n"
const links = flowSteps.flatMap(s => s.techs.map((x, i) => `  (${q(s.id)}, ${q(x.t)}, ${i + 1}, ${q(x.o)})`))
sql += "insert into public.lib_flow_step_techniques (step_id, technique_id, position, origin) values\n" + links.join(",\n") + ";\n"
fs.writeFileSync(path.join(DIR, "donnees.generated.sql"), sql)
console.log(`OK : ${techniques.length} fiches (${techniques.filter(t => t.origin === "document").length} du document), ${categories.length} catégories, ${FLOWS.length} enchaînements, ${flowSteps.length} étapes, ${links.length} liens étape-fiche`)

// 5. Script final à exécuter dans Supabase : schéma + données + contrôle
const full = fs.readFileSync(path.join(DIR, "schema.sql"), "utf8") + sql + fs.readFileSync(path.join(DIR, "tail.sql"), "utf8")
fs.writeFileSync(path.join(DIR, "..", "uzu-9-bibliotheque.sql"), full)
console.log("Script : db/uzu-9-bibliotheque.sql (" + full.split("\n").length + " lignes)")
