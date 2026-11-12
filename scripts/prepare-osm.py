"""
OSM (Overpass) → компактное окружение для 3D-сцены: реальные улицы, дома,
газоны, ряды деревьев, арыки, остановки.
Данные © участники OpenStreetMap, лицензия ODbL — атрибуция выводится на сайте.

Запуск:  python -I scripts/prepare-osm.py
Вход:    data-src/osm-raw2.json  (Overpass, радиус ~1,1 км от точки объекта
         42.8290618, 74.5687409: highway, building, landuse, natural, waterway, остановки)
Выход:   src/data/context.json

Система координат сцены: x — на восток, z — на юг (север = −z), метры,
начало — точка объекта из radian.kg.
"""
import json, math, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAT0, LON0 = 42.8290618, 74.5687409
KX = 111320 * math.cos(math.radians(LAT0))
KZ = 110540

# Участок комплекса (см. src/data/building.js: SITE) — дома и проезды внутри убираем
SITE = (-62, -14, 46, 62)  # xmin, zmin, xmax, zmax
WIDTH = {"primary": 11.5, "primary_link": 6.5, "secondary": 10, "tertiary": 8, "residential": 6,
         "unclassified": 6, "living_street": 5, "service": 4.5}
PATHS = {"footway": 2.2, "cycleway": 2.4, "path": 1.6, "pedestrian": 4}
NAMES = {"Аалы Токомбаев проспекти": "Южная магистраль",
         "Карыбек Тыналиев көчөсү": "ул. К. Тыналиева",
         "Дооронбек Садырбаев көчөсү": "ул. Д. Садырбаева",
         "Жеңишгүл көчөсү": "ул. Жеңишгүл",
         "Узун-Булак көчөсү": "ул. Узун-Булак",
         "Баба-Ата көчөсү": "ул. Баба-Ата"}
R_ROAD, R_BLD, R_GREEN = 1000, 620, 700


def xz(p):
    return [round((p["lon"] - LON0) * KX, 1), round(-(p["lat"] - LAT0) * KZ, 1)]


def inside_site(x, z):
    return SITE[0] < x < SITE[2] and SITE[1] < z < SITE[3]


def main():
    raw = json.loads((ROOT / "data-src" / "osm-raw2.json").read_text(encoding="utf-8"))
    roads, paths, buildings, grass, tree_rows, water, stops = [], [], [], [], [], [], []
    for e in raw["elements"]:
        t = e.get("tags", {})
        if e["type"] == "node":
            if t.get("highway") == "bus_stop" and t.get("name"):
                x, z = xz(e)
                if math.hypot(x, z) < 520:
                    stops.append({"name": t["name"], "p": [x, z]})
            continue
        pts = [xz(p) for p in e.get("geometry", [])]
        if len(pts) < 2:
            continue
        near = min(math.hypot(*p) for p in pts)
        hw = t.get("highway")
        if hw in WIDTH and near < R_ROAD:
            # проезды внутри участка — заменяются собственным благоустройством
            if hw in ("service", "living_street") and all(inside_site(*p) for p in pts):
                continue
            r = {"c": hw, "w": WIDTH[hw], "pts": pts}
            if t.get("lanes"):
                r["w"] = max(r["w"], 3.5 * float(t["lanes"]) + 1)
            name = NAMES.get(t.get("name"))
            if name:
                r["name"] = name
            roads.append(r)
        elif hw in PATHS and near < 420:
            if not all(inside_site(*p) for p in pts):
                paths.append({"w": PATHS[hw], "pts": pts})
        elif "building" in t and len(pts) >= 4 and near < R_BLD:
            cx = sum(p[0] for p in pts) / len(pts)
            cz = sum(p[1] for p in pts) / len(pts)
            if inside_site(cx, cz):
                continue
            try:
                lv = float(str(t.get("building:levels", "1")).split(";")[0])
            except ValueError:
                lv = 1
            buildings.append({"lv": int(min(lv, 25)), "pts": pts[:-1]})
        elif (t.get("landuse") in ("grass", "meadow") or t.get("leisure") in ("park", "garden")) and near < R_GREEN and len(pts) >= 4:
            grass.append(pts[:-1])
        elif t.get("natural") == "tree_row" and near < R_GREEN:
            tree_rows.append(pts)
        elif t.get("waterway") and near < R_GREEN:
            water.append(pts)
    out = {"attribution": "© участники OpenStreetMap (ODbL)", "roads": roads, "paths": paths, "buildings": buildings,
           "grass": grass, "treeRows": tree_rows, "water": water, "stops": stops}
    dst = ROOT / "src" / "data" / "context.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"дорог: {len(roads)}, дорожек: {len(paths)}, зданий: {len(buildings)}, газонов: {len(grass)}, "
          f"рядов деревьев: {len(tree_rows)}, арыков: {len(water)}, остановок: {len(stops)} "
          f"→ {dst.relative_to(ROOT)} ({dst.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
