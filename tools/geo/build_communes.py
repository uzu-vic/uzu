#!/usr/bin/env python3
"""Génère db/data/geo_communes.csv : communes actuelles (métropole + DROM), centre arrondi à 0,01°.

Sources (données ouvertes) :
  - Etalab, @etalab/decoupage-administratif 6.0.0 (npm) : data/communes.json — codes INSEE, noms,
    départements, codes postaux, population.
  - Contours communaux france-geojson (gregoiredavid/france-geojson, communes-avec-outre-mer.geojson) :
    centre = barycentre surfacique des polygones.
  - Communes nouvelles absentes des contours : moyenne des communes déléguées ; à défaut, moyenne
    des communes partageant le même code postal (@etalab codes-postaux 4.1.2).
Les collectivités d'outre-mer (zone « com ») sont exclues de la première version.

Usage : python3 build_communes.py <communes.json> <communes-avec-outre-mer.geojson> <codes-postaux.json> <sortie.csv>
"""
import csv, json, sys


def ring_centroid(r):
    a = cx = cy = 0.0
    for (x0, y0), (x1, y1) in zip(r, r[1:] + r[:1]):
        f = x0 * y1 - x1 * y0
        a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f
    return (a / 2, cx / (3 * a), cy / (3 * a)) if a else (0.0, r[0][0], r[0][1])


def main(communes_json, geojson, cp_json, out):
    cent = {}
    for ft in json.load(open(geojson))["features"]:
        geom = ft["geometry"]
        if not geom:
            continue
        polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
        A = X = Y = 0.0
        for p in polys:
            a, x, y = ring_centroid(p[0]); a = abs(a) or 1e-12
            A += a; X += x * a; Y += y * a
        cent[ft["properties"]["code"]] = [round(Y / A, 2), round(X / A, 2)]
    communes = json.load(open(communes_json))
    deleg = {}
    for x in communes:
        if x["type"] in ("commune-deleguee", "commune-associee") and x.get("chefLieu") and x["code"] in cent:
            deleg.setdefault(x["chefLieu"], []).append(cent[x["code"]])
    bycp = {}
    for r in json.load(open(cp_json)):
        bycp.setdefault(r["codePostal"], set()).add(r["codeCommune"])
    avg = lambda L: [round(sum(p[0] for p in L) / len(L), 2), round(sum(p[1] for p in L) / len(L), 2)]
    rows = []
    for x in communes:
        if x["type"] != "commune-actuelle" or x["zone"] == "com":
            continue
        p = cent.get(x["code"]) or (avg(deleg[x["code"]]) if x["code"] in deleg else None)
        if not p:
            near = [cent[k] for z in x.get("codesPostaux", []) for k in bycp.get(z, ()) if k in cent and k != x["code"]]
            p = avg(near) if near else None
        if p:
            rows.append((x["code"], x["nom"], x["departement"], (x.get("codesPostaux") or [""])[0], x.get("population") or 0, p[0], p[1]))
    with open(out, "w", newline="") as f:
        w = csv.writer(f); w.writerow(["insee", "nom", "departement", "code_postal", "population", "lat", "lon"]); w.writerows(rows)
    print(len(rows), "communes")


if __name__ == "__main__":
    main(*sys.argv[1:5])
