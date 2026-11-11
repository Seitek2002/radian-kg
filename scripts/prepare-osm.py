"""
OSM (Overpass) → компактное окружение для 3D-сцены: дороги и соседние здания.
Данные © участники OpenStreetMap, лицензия ODbL — атрибуция выводится на сайте.

Запуск:  python -I scripts/prepare-osm.py
Вход:    data-src/osm-raw.json  (запрос Overpass: highway в 600 м, building в 350 м
         от точки объекта 42.8290618, 74.5687409)
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

# пятно застройки комплекса (см. src/client/scene/building.js) — дома внутри удаляем
SITE = (-52, -30, 40, 26)  # xmin, zmin, xmax, zmax с запасом
WIDTH = {"trunk": 14, "primary": 11, "primary_link": 7, "secondary": 13, "tertiary": 10,
         "residential": 6.5, "unclassified": 6, "service": 4}
NAMES = {"Аалы Токомбаев проспекти": "Южная магистраль",
         "Карыбек Тыналиев көчөсү": "ул. К. Тыналиева",
         "Дооронбек Садырбаев көчөсү": "ул. Д. Садырбаева"}


def xz(p):
    return [round((p["lon"] - LON0) * KX, 1), round(-(p["lat"] - LAT0) * KZ, 1)]


def main():
    raw = json.loads((ROOT / "data-src" / "osm-raw.json").read_text(encoding="utf-8"))
    roads, buildings = [], []
    for e in raw["elements"]:
        t = e.get("tags", {})
        pts = [xz(p) for p in e.get("geometry", [])]
        if len(pts) < 2:
            continue
        if "highway" in t and t["highway"] in WIDTH:
            r = {"c": t["highway"], "w": WIDTH[t["highway"]], "pts": pts}
            name = NAMES.get(t.get("name"))
            if name:
                r["name"] = name
            roads.append(r)
        elif "building" in t and len(pts) >= 4:
            cx = sum(p[0] for p in pts) / len(pts)
            cz = sum(p[1] for p in pts) / len(pts)
            if SITE[0] < cx < SITE[2] and SITE[1] < cz < SITE[3]:
                continue
            try:
                lv = float(t.get("building:levels", "1"))
            except ValueError:
                lv = 1
            buildings.append({"h": round(min(lv, 20) * 3.1 + 0.6, 1), "pts": pts[:-1]})
    out = {"attribution": "© участники OpenStreetMap (ODbL)", "roads": roads, "buildings": buildings}
    dst = ROOT / "src" / "data" / "context.json"
    dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"дорог: {len(roads)}, зданий: {len(buildings)} → {dst.relative_to(ROOT)} ({dst.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
