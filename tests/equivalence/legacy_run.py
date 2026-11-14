# Côté ANCIENNE application : applique chaque scénario dans la copie de test et relève ce qu'elle enregistre.
import json, sys
from playwright.sync_api import sync_playwright
harness, scen_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
S = json.load(open(scen_path))
res = {"sessions": [], "comps": []}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/google-chrome")
    pg = b.new_page(); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("file://" + harness); pg.wait_for_function("window.__UZU_T", timeout=15000)
    res["mode"] = pg.evaluate("__UZU_T.mode()"); res["role"] = pg.evaluate("__UZU_T.role()")
    for sc in S["sessions"]:
        pg.evaluate("s=>__UZU_T.setState(s)", S["baseState"])
        pg.evaluate("f=>__UZU_T.setForm(f)", sc["form"])
        pg.evaluate("i=>__UZU_T.setInputs(i)", sc["inputs"])
        pg.evaluate("__UZU_T.submit()")
        st = pg.evaluate("__UZU_T.state()")
        item = st["sessions"][-1]
        res["sessions"].append({"label": sc["label"], "item": item, "skills": st["skills"], "count": len(st["sessions"])})
    for sc in S["comps"]:
        pg.evaluate("s=>__UZU_T.setState(s)", S["baseState"])
        pg.evaluate("([c,i])=>__UZU_T.setComp(c,i)", [sc["form"], sc["inputs"]])
        pg.evaluate("__UZU_T.submitComp()")
        st = pg.evaluate("__UZU_T.state()")
        res["comps"].append({"label": sc["label"], "item": st["comps"][-1]})
    res["errors"] = errs
    b.close()
json.dump(res, open(out, "w"), ensure_ascii=False, indent=1)
print("ancienne application :", len(res["sessions"]), "séances,", len(res["comps"]), "compétitions, mode", res["mode"], ", erreurs :", errs)
