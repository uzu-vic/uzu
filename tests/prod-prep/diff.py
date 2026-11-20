import glob, collections
files = sorted(glob.glob("[0-9][0-9]-*.txt"))
def load(f):
    d = {}
    for l in open(f):
        p = l.rstrip("\n").split("|")
        if len(p) < 2: continue
        d[(p[0], p[1])] = tuple(p[2:])
    return d
base = load(files[0]); prev = base
CAT = {"F":"fonction","P":"politique (RLS)","T":"colonne","G":"droits de table","R":"déclencheur","S":"RLS activée","B":"espace de stockage","V":"vue","D":"données"}
report = []
for f in files[1:]:
    cur = load(f); name = f[3:-4]
    added = [k for k in cur if k not in prev]; removed = [k for k in prev if k not in cur]
    changed = [k for k in cur if k in prev and cur[k] != prev[k]]
    pre_changed = [k for k in changed if k in base]   # objets existants AVANT tout déploiement
    pre_removed = [k for k in removed if k in base]
    report.append((name, added, removed, changed, pre_changed, pre_removed, cur, prev))
    prev = cur
for name, added, removed, changed, pc, pr, cur, prv in report:
    print(f"\n=== {name} : {len(added)} ajouts, {len(changed)} modifications, {len(removed)} suppressions")
    print("  ajouts par type :", dict(collections.Counter(CAT[k[0]] for k in added)))
    for k in pc: 
        detail = ""
        if k[0] == "D": detail = f" lignes {prv[k][0]} -> {cur[k][0]}"
        if k[0] == "G": detail = f" {prv[k][0]} -> {cur[k][0]}"
        if k[0] == "F": detail = " (définition " + ("identique" if prv[k][0]==cur[k][0] else "modifiée") + (", droits modifiés" if prv[k][2]!=cur[k][2] else "") + ")"
        if k[0] == "P": detail = " (" + ("règle modifiée" if prv[k][1]!=cur[k][1] else "") + (" rôles/commande modifiés" if prv[k][0]!=cur[k][0] else "") + ")"
        print(f"  ⚠ EXISTANT MODIFIÉ  {CAT[k[0]]:<18} {k[1]}{detail}")
    for k in pr: print(f"  ⚠ EXISTANT SUPPRIMÉ {CAT[k[0]]:<18} {k[1]}")
    for k in changed:
        if k not in pc: pass
