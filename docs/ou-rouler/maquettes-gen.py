import json, os
R = "/home/claude/uzu-design/project"
CSS = """body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#171717}
a{color:#941b2b}a:hover{color:#6f1420}
.ph{width:390px;height:844px;box-sizing:border-box;background:#f5f2ed;display:flex;flex-direction:column;overflow:hidden}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#fbfaf8;border-bottom:1px solid #e9e4dd}
.brand{display:flex;flex-direction:column;gap:1px}.brand b{font-size:15px;letter-spacing:.18em}.brand i{font-family:Georgia,serif;font-size:11px;color:#941b2b}
.ib{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1px solid #e5dfd8;border-radius:12px;background:#fff;color:#171717}
.main{flex:1;overflow:hidden;padding:16px 16px 0;display:flex;flex-direction:column;gap:12px}
.eye{font-size:9px;font-weight:700;letter-spacing:.12em;color:#6e6761}
h1{margin:0;font-family:Georgia,'Times New Roman',serif;font-weight:400;font-size:30px;letter-spacing:-.04em;line-height:1.1}
h1 span{color:#941b2b}
h2{margin:0;font-size:15px}
.tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border:1px solid #e5dfd8;border-radius:12px;background:#fff}
.tab{min-height:40px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:13px;font-weight:600;color:#4c4641}
.tab.on{background:#171717;color:#fff}
.card{background:#fff;border:1px solid #e9e4dd;border-radius:14px;padding:14px;display:flex;flex-direction:column;gap:10px}
.muted{color:#6e6761;font-size:12px;line-height:1.45}
.row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.chip{min-height:36px;padding:0 12px;border:1px solid #e5dfd8;border-radius:999px;background:#fff;font:inherit;font-size:12px;font-weight:600;color:#292522;display:inline-flex;align-items:center}
.chip.on{background:#941b2b;border-color:#941b2b;color:#fff}
.btn{min-height:46px;border:0;border-radius:12px;background:#171717;color:#fff;font:inherit;font-size:14px;font-weight:700;padding:0 16px;display:flex;align-items:center;justify-content:center;gap:8px;text-decoration:none}
.btn.red{background:#941b2b}.btn.out{background:#fff;color:#171717;border:1px solid #e5dfd8}
.field{display:flex;flex-direction:column;gap:6px}.field label{font-size:12px;font-weight:700;color:#3b3531}
.input{min-height:44px;box-sizing:border-box;border:1px solid #e5dfd8;border-radius:10px;background:#fbfaf8;padding:0 12px;font:inherit;font-size:15px;color:#292522;display:flex;align-items:center;justify-content:space-between}
.belt{display:inline-block;width:26px;height:8px;border-radius:2px;vertical-align:middle;margin-right:6px}
.badge{font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:#f4eeeb;color:#941b2b}
.badge.ok{background:#e7f3ea;color:#1f6b35}.badge.grey{background:#eee9e2;color:#4c4641}
.nav{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));border-top:1px solid #e9e4dd;background:#fbfaf8;padding:6px 4px 10px}
.nav a{display:flex;flex-direction:column;align-items:center;gap:3px;min-height:44px;justify-content:center;font-size:10px;color:#6e6761;text-decoration:none}
.nav a.on{color:#941b2b;font-weight:700}
.opt{display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border:1px solid #e5dfd8;border-radius:12px;background:#fff;font-size:13px}
.opt.on{border-color:#941b2b;background:#fbf4f5}
.dot{flex:none;width:18px;height:18px;border-radius:50%;border:2px solid #8a827b;box-sizing:border-box;margin-top:1px}
.opt.on .dot{border:6px solid #941b2b}
.tick{flex:none;width:20px;height:20px;border-radius:6px;border:2px solid #8a827b;box-sizing:border-box;display:flex;align-items:center;justify-content:center}
.tick.on{background:#941b2b;border-color:#941b2b;color:#fff}
.sep{height:1px;background:#e9e4dd}
.small{font-size:11px;color:#6e6761}"""
I = {
 "bell": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
 "home": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
 "dumb": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6v12M18 6v12M3 9v6M21 9v6M6 12h12"/></svg>',
 "target": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
 "trend": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
 "more": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>',
 "pin": '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
 "back": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>',
 "dots": '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>',
 "check": '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" aria-hidden="true"><path d="M5 12l5 5L20 7"/></svg>',
 "filter": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5h18l-7 8v6l-4-2v-4z"/></svg>',
 "shield": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
}
def top(back=None):
    left = f'<a class="ib" href="{back}" aria-label="Retour">{I["back"]}</a>' if back else '<div class="brand"><b>UZU</b><i>The mat doesn&#39;t lie</i></div>'
    return f'<div class="top">{left}<button class="ib" aria-label="Notifications">{I["bell"]}</button></div>'
def nav(active):
    items=[("home","Accueil"),("dumb","Séances"),("target","Techniques"),("trend","Progression"),("more","Plus")]
    return '<nav class="nav" aria-label="Navigation mobile">' + "".join(f'<a href="#" class="{"on" if l==active else ""}">{I[i]}<span>{l}</span></a>' for i,l in items) + '</nav>'
def tabs(on):
    links={"Fil":"Main.dc.html","Partenaires":"Resultats.dc.html","Clubs":"Clubs.dc.html"}
    return '<div class="tabs" role="tablist">' + "".join(f'<a role="tab" href="{links[t]}" class="tab{" on" if t==on else ""}" style="display:flex;align-items:center;justify-content:center;text-decoration:none">{t}</a>' for t in ["Fil","Partenaires","Clubs"]) + '</div>'
def page(title, body, active="Plus", back=None):
    return f'''<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<style>
{CSS}
</style>
</helmet>
<div class="ph">
{top(back)}
<main class="main">
{body}
</main>
{nav(active)}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":390,"height":844}}}}'>
class Component extends DCLogic {{
renderVals() {{
return {{}};
}}
}}
</script>
</body>
</html>
'''
B = {}
B["Main.dc.html"] = ("Tatami — Fil (par défaut)", f'''<div class="eye">TATAMI</div>
<h1>Le fil du club<span>.</span></h1>
{tabs("Fil")}
<a href="Activation.dc.html" class="card" style="text-decoration:none;color:inherit;background:#171717;border-color:#171717">
<div class="eye" style="color:#d9b8b0">NOUVEAU · OÙ ROULER ?</div>
<div style="font-family:Georgia,serif;font-size:21px;color:#fff;line-height:1.2">Trouve un partenaire ou un open mat, chez toi ou en déplacement.</div>
<div class="row"><span class="chip" style="background:#941b2b;border-color:#941b2b;color:#fff">Trouver un partenaire</span><span class="chip">Trouver un club</span></div>
</a>
<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:14px">Yanis B.</b><span class="small">il y a 2 h</span></div><div class="muted">Séance No-Gi · 1 h 30 · Système demi-garde</div><div class="row"><span class="badge grey">3 encouragements</span></div></div>
<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:14px">Sarah M.</b><span class="small">hier</span></div><div class="muted">Nouvelle barrette · ceinture bleue</div></div>
<p class="small" style="margin:0">Le fil actuel reste identique ; les volets Partenaires et Clubs s&#39;ajoutent à côté.</p>''')
B["Activation.dc.html"] = ("Partenaires — première ouverture", f'''<div class="eye">TATAMI · PARTENAIRES</div>
<h1>Où rouler<span> ?</span></h1>
{tabs("Partenaires")}
<p class="muted" style="margin:0">Trouve des partenaires de roulage, chez toi ou en déplacement. Rien n&#39;est visible tant que tu ne l&#39;actives pas.</p>
<div class="opt on"><span class="tick on">{I["check"]}</span><span>J&#39;ai 18 ans ou plus</span></div>
<div class="field"><label>Qui peut me voir ?</label>
<div class="opt"><span class="dot"></span><span><b>Personne</b><br><span class="small">Par défaut. Pour voir les autres pratiquants, il faut être visible toi aussi.</span></span></div>
<div class="opt on"><span class="dot"></span><span><b>Les membres de mes clubs</b></span></div>
<div class="opt"><span class="dot"></span><span><b>Tous les pratiquants UZU</b></span></div></div>
<div class="field"><label>Ma ville habituelle</label><div class="input"><span>Grigny (91)</span><span class="small">▾</span></div><span class="small">Seule la commune est utilisée, jamais ton adresse ni ta position.</span></div>
<div class="field"><label>Je montre</label><div class="row"><span class="chip on">Ma ceinture</span><span class="chip">Mon club</span><span class="chip">Mes années de pratique</span></div></div>
<a href="Dispo.dc.html" class="btn red">Activer</a>''')
B["Dispo.dc.html"] = ("Je suis dispo", f'''<div class="eye">OÙ ROULER ? · DISPONIBILITÉ</div>
<h1>Je suis dispo<span>.</span></h1>
<div class="field"><label>Où ?</label><div class="row"><span class="chip">Dans ma ville</span><span class="chip on">En déplacement</span></div><div class="input"><span>{I["pin"]} Annecy (74)</span><span class="small">▾</span></div><span class="small">Ta ville habituelle (Grigny) ne change pas.</span></div>
<div class="field"><label>Quand ?</label><div class="row" style="flex-wrap:nowrap"><div class="input" style="flex:1">22 déc.</div><span>→</span><div class="input" style="flex:1">29 déc.</div></div><span class="small">14 jours au plus. Expire automatiquement le 29 déc. au soir.</span></div>
<div class="field"><label>Créneaux</label><div class="row"><span class="chip on">Matin</span><span class="chip">Midi</span><span class="chip on">Soir</span></div></div>
<div class="field"><label>Discipline</label><div class="row"><span class="chip">JJB Gi</span><span class="chip on">No-Gi / Grappling</span></div></div>
<div class="field"><label>Roulage accepté</label><div class="row"><span class="chip">Technique</span><span class="chip on">Modéré</span><span class="chip on">Intense</span></div></div>
<div class="field"><label>Un mot (140 caractères)</label><div class="input" style="font-size:13px;color:#4c4641">En vacances, dispo le soir, open mat bienvenu</div></div>
<a href="Resultats.dc.html" class="btn red">Publier ma disponibilité</a>''')
def pcard(name, belt, beltc, dist, disc, inten, slots, club):
    clubline = f'<div class="small">Club : {club}</div>' if club else '<div class="small">Club non affiché</div>'
    return f'''<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:15px">{name}</b><span class="badge grey">{dist}</span></div>
<div class="muted"><span class="belt" style="background:{beltc}"></span>Ceinture {belt} · {disc}</div>
<div class="muted">{inten} · {slots}</div>{clubline}
<div class="row" style="flex-wrap:nowrap"><a href="Demande.dc.html" class="btn" style="flex:1">Proposer un roulage</a><button class="ib" aria-label="Masquer ou signaler">{I["dots"]}</button></div></div>'''
B["Resultats.dc.html"] = ("Partenaires — résultats", f'''<div class="eye">TATAMI · PARTENAIRES</div>
<h1>Partenaires<span>.</span></h1>
{tabs("Partenaires")}
<div class="row" style="justify-content:space-between"><span class="muted"><b style="color:#171717">Annecy (74)</b> · 25 km · 22–29 déc. · No-Gi</span><button class="chip" aria-label="Filtres">{I["filter"]}&#160;Filtres</button></div>
<div class="card" style="background:#fbf4f5;border-color:#e7c9ce;padding:10px 12px"><span class="small" style="color:#5a1c24">Ta disponibilité est active jusqu&#39;au 29 déc. · <a href="Dispo.dc.html">Modifier</a></span></div>
{pcard("Karim B.","violette","#6b3fa0","moins de 10 km","No-Gi","Modéré, intense","Soir","[Club local]")}
{pcard("Léo T.","marron","#6b4226","10 à 25 km","Gi, No-Gi","Technique, modéré","Matin, soir","")}
<a href="Clubs.dc.html" class="small" style="text-align:center">2 open mats à proximité → voir les clubs</a>''')
B["Demande.dc.html"] = ("Proposer un roulage", f'''<div class="eye">OÙ ROULER ? · DEMANDE</div>
<h1>Proposer un roulage<span>.</span></h1>
<div class="card"><b>Karim B.</b><div class="muted"><span class="belt" style="background:#6b3fa0"></span>Ceinture violette · No-Gi · moins de 10 km</div></div>
<div class="field"><label>Créneau</label><div class="input"><span>Mar. 23 déc. · soir</span><span class="small">▾</span></div><span class="small">Parmi les créneaux de Karim.</span></div>
<div class="field"><label>Type de roulage</label><div class="row"><span class="chip">Technique</span><span class="chip on">Modéré</span><span class="chip">Intense</span></div></div>
<div class="field"><label>Lieu</label><div class="input"><span>Open mat — [Club de l&#39;annuaire]</span><span class="small">▾</span></div><span class="small">On propose toujours un club ou un open mat, jamais une adresse privée.</span></div>
<div class="field"><label>Un mot</label><div class="input" style="font-size:13px;color:#4c4641">Dispo pour 5 rounds de 6 min</div></div>
<div class="card" style="flex-direction:row;align-items:flex-start;gap:10px;background:#fbfaf8"><span style="color:#941b2b">{I["shield"]}</span><span class="small">Conseils : roule dans un club ou un open mat, préviens un proche. Tu peux annuler, masquer ou signaler à tout moment.</span></div>
<a href="MesRoulages.dc.html" class="btn red">Envoyer la demande</a>''')
def roll(date, who, place, status, cls, actions):
    return f'''<div class="card"><div class="row" style="justify-content:space-between"><b style="font-size:14px">{date}</b><span class="badge {cls}">{status}</span></div><div class="muted">{who} · {place}</div><div class="row">{actions}</div></div>'''
B["MesRoulages.dc.html"] = ("Mes roulages", f'''<div class="eye">OÙ ROULER ? · HISTORIQUE</div>
<h1>Mes roulages<span>.</span></h1>
<div class="row"><span class="chip on">À venir</span><span class="chip">Reçues · 1</span><span class="chip">Envoyées</span><span class="chip">Passés</span></div>
{roll("Mar. 23 déc. · soir","Karim B.","Open mat — [Club de l&#39;annuaire]","Confirmé","ok",'<span class="chip">Annuler</span><span class="chip">Partager mon numéro ?</span>')}
{roll("Sam. 27 déc. · matin","Léo T.","[Club de l&#39;annuaire]","En attente","grey",'<span class="chip">Relancer</span><span class="chip">Annuler</span>')}
<div class="sep"></div>
<div class="eye">PASSÉS</div>
{roll("Sam. 6 déc.","Mehdi R.","Open mat — [Club de l&#39;annuaire]","Effectué","grey",'<a href="#" class="btn out" style="flex:1;min-height:40px;font-size:13px">Enregistrer la séance dans mon Journal</a>')}''')
def club(name, uzu, dist, disc, session, cond):
    b = '<span class="badge">◆ Club UZU</span>' if uzu else '<span class="badge grey">Référencé</span>'
    return f'''<a href="FicheClub.dc.html" class="card" style="text-decoration:none;color:inherit"><div class="row" style="justify-content:space-between"><b style="font-size:15px">{name}</b>{b}</div>
<div class="muted">{disc} · {dist}</div><div class="muted"><b style="color:#171717">{session}</b></div><div class="small">{cond}</div></a>'''
B["Clubs.dc.html"] = ("Clubs — recherche", f'''<div class="eye">TATAMI · CLUBS</div>
<h1>Clubs<span>.</span></h1>
{tabs("Clubs")}
<div class="input"><span>{I["pin"]} Annecy (74) · 25 km</span><span class="small">▾</span></div>
<div class="row"><span class="chip on">No-Gi</span><span class="chip">Gi</span><span class="chip on">Open mat</span><span class="chip">Visiteurs</span><span class="chip">Cours d&#39;essai</span></div>
{club("[Club A]", True, "moins de 10 km", "JJB Gi · No-Gi", "Open mat : sam. 11:00–13:00", "Visiteurs acceptés · [TARIF] · vérifié le [DATE]")}
{club("[Club B]", False, "10 à 25 km", "Grappling", "Cours ouvert : mer. 19:00–20:30", "Prendre contact avant · vérifié le [DATE]")}
<p class="small" style="margin:0">« Club UZU » : club client, horaires tenus à jour par le club. « Référencé » : fiche vérifiée par l&#39;équipe UZU.</p>''')
B["FicheClub.dc.html"] = ("Fiche club", f'''<div class="eye">CLUBS · FICHE</div>
<h1>[Club A]<span>.</span></h1>
<div class="row"><span class="badge">◆ Club UZU</span><span class="badge grey">JJB Gi</span><span class="badge grey">No-Gi</span></div>
<div class="card"><h2>Open mats et cours ouverts</h2><div class="muted"><b style="color:#171717">Sam. 11:00–13:00</b> · Open mat · tous niveaux</div><div class="muted"><b style="color:#171717">Mer. 19:00–20:30</b> · Cours No-Gi ouvert aux visiteurs</div><div class="muted"><b style="color:#171717">Cours d&#39;essai</b> · sur demande</div></div>
<div class="card"><h2>Conditions d&#39;accueil</h2><div class="muted">Tarif visiteur : [TARIF] · Licence ou assurance : [À PRÉCISER] · Kimono propre, ongles coupés · Prévenir avant de venir</div></div>
<div class="card"><h2>Salle</h2><div class="muted">{I["pin"]} [ADRESSE DE LA SALLE], Annecy (74)</div><div class="muted">[TÉLÉPHONE OU COURRIEL PUBLIC DU CLUB]</div></div>
<div class="row" style="justify-content:space-between"><span class="small">Vérifiée le [DATE]</span><a href="#" class="small">Signaler une erreur</a></div>
<a href="Resultats.dc.html" class="btn">Voir les partenaires près de ce club</a>''')
order = ["Main.dc.html","Activation.dc.html","Dispo.dc.html","Resultats.dc.html","Demande.dc.html","MesRoulages.dc.html","Clubs.dc.html","FicheClub.dc.html"]
boards = {}
for i,f in enumerate(order):
    title, body = B[f]
    open(os.path.join(R,f),"w").write(page(title, body))
    row = 0 if i < 6 else 1; col = i if i < 6 else i-6
    boards[f] = {"x": col*470, "y": row*1260, "w":390, "h":844, "title": title}
canvas = {"v":3,"createdOnFiles":{"v":1,"at":"2026-11-20T17:40:00Z"},"title":"UZU — « Où rouler ? » : maquettes des premiers écrans","launch":{"view":"canvas"},"pages":[],"boards":boards,"order":order,
 "notes":{"t1":{"x":0,"y":-300,"text":"Partenaires : activation, disponibilité, recherche, demande, historique","kind":"title1","maxW":2740},
          "t2":{"x":0,"y":960,"text":"Clubs : recherche et fiche","kind":"title1","maxW":860}},"designSystems":[]}
json.dump(canvas, open(os.path.join(R,"canvas.json"),"w"), ensure_ascii=False, indent=1)
print("ok", len(order))
