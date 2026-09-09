#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Ustvari ../locations.js iz OpenStreetMap podatkov.

Vzame vsa naselja (place = city/town/village/hamlet) v Sloveniji ter meje
občin (admin_level 8, ISO3166-2 = SI-*) prek Overpass API, nato vsakemu
naselju pripiše občino (točka v poligonu). Rezultat: seznam
{ name: "Kraj (Občina)", lat, lon }.

Zagon:  python tools/build_locations.py
"""
import json
import math
import os
import sys
import urllib.parse
import urllib.request

OVERPASS = "https://overpass-api.de/api/interpreter"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "locations.js")

PLACES_QL = """
[out:json][timeout:240];
area["ISO3166-1"="SI"][admin_level=2]->.si;
node["place"~"^(city|town|village|hamlet)$"]["name"](area.si);
out body;
"""

OBCINE_QL = """
[out:json][timeout:600];
area["ISO3166-1"="SI"][admin_level=2]->.si;
relation["boundary"="administrative"]["admin_level"="8"](area.si);
out geom;
"""


def overpass(query):
    data = urllib.parse.urlencode({"data": query}).encode()
    req = urllib.request.Request(OVERPASS, data=data,
                                 headers={"User-Agent": "soncno-sevanje build"})
    with urllib.request.urlopen(req, timeout=700) as r:
        return json.load(r)


def clean(name):
    return name.split(" / ")[0].strip() if name else name


def rings_for(rel):
    segments = []
    for m in rel["members"]:
        if m["type"] != "way" or "geometry" not in m:
            continue
        if m.get("role", "") not in ("outer", ""):
            continue
        pts = [(p["lon"], p["lat"]) for p in m["geometry"]]
        if len(pts) >= 2:
            segments.append(pts)
    rings, used = [], [False] * len(segments)
    for i in range(len(segments)):
        if used[i]:
            continue
        chain, used[i] = list(segments[i]), True
        changed = True
        while changed and chain[0] != chain[-1]:
            changed = False
            for j in range(len(segments)):
                if used[j]:
                    continue
                s = segments[j]
                if s[0] == chain[-1]:
                    chain.extend(s[1:])
                elif s[-1] == chain[-1]:
                    chain.extend(reversed(s[:-1]))
                elif s[-1] == chain[0]:
                    chain = s[:-1] + chain
                elif s[0] == chain[0]:
                    chain = list(reversed(s[1:])) + chain
                else:
                    continue
                used[j] = changed = True
        if len(chain) >= 4:
            rings.append(chain)
    return rings


def bbox(ring):
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    return (min(xs), min(ys), max(xs), max(ys))


def pip(x, y, ring):
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and \
           (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def main():
    print("Prenašam naselja …")
    places = overpass(PLACES_QL)["elements"]
    print("  ", len(places), "naselij")
    print("Prenašam meje občin …")
    obc = [e for e in overpass(OBCINE_QL)["elements"] if e["type"] == "relation"]

    munis = []
    for rel in obc:
        if not rel["tags"].get("ISO3166-2", "").startswith("SI-"):
            continue
        name = clean(rel["tags"].get("name"))
        rs = rings_for(rel)
        if not name or not rs:
            continue
        cx = sum(p[0] for r in rs for p in r) / sum(len(r) for r in rs)
        cy = sum(p[1] for r in rs for p in r) / sum(len(r) for r in rs)
        munis.append({"name": name, "c": (cx, cy),
                      "rings": [(bbox(r), r) for r in rs]})
    print("  ", len(munis), "občin")

    def find_muni(lon, lat):
        for m in munis:
            for bb, ring in m["rings"]:
                if bb[0] <= lon <= bb[2] and bb[1] <= lat <= bb[3] \
                        and pip(lon, lat, ring):
                    return m["name"]
        return min(munis, key=lambda m: (m["c"][0] - lon) ** 2
                   + (m["c"][1] - lat) ** 2)["name"]

    seen, rows = set(), []
    for e in places:
        tags = e.get("tags", {})
        raw = tags.get("name")
        if not raw:
            continue
        name = tags.get("name:sl") or clean(raw)
        muni = find_muni(e["lon"], e["lat"])
        label = f"{name} ({muni})" if muni and muni != name else name
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        rows.append((label, round(e["lat"], 4), round(e["lon"], 4)))

    rows.sort(key=lambda r: r[0].lower())
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("// Samodejno ustvarjeno: python tools/build_locations.py\n")
        f.write(f"// Vir: OpenStreetMap (naselja) + meje občin. Skupaj {len(rows)} lokacij.\n")
        f.write("// Za dodatno lokacijo lahko dopišeš vrstico kamorkoli v seznam.\n")
        f.write("window.LOCATIONS = [\n")
        for label, lat, lon in rows:
            f.write(f'  {{ name: "{label}", lat: {lat}, lon: {lon} }},\n')
        f.write("];\n\nwindow.DEFAULT_LOCATION = \"Ljubljana\";\n")
    print("Zapisano:", os.path.relpath(OUT), "-", len(rows), "lokacij")


if __name__ == "__main__":
    sys.exit(main())
