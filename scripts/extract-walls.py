"""
Извлекает стены из иллюстраций планировок RADIAN (чёрные стены на светлом фоне)
и сохраняет их как полигоны для выдавливания в 3D (src/data/walls.json).

Запуск (из корня проекта):
    python -I scripts/extract-walls.py            # все планировки
    python -I scripts/extract-walls.py --debug    # + отладочные PNG в .debug/

Как это работает:
  1. Стены на иллюстрациях — почти чёрные (яркость ~30–40). Порог LUM_WALL
     отсекает плиту, мебель и линии дверей (они светлее).
  2. Морфологическое «открытие» убирает тонкие линии (дуги дверей, контуры).
  3. Контуры с дырами → полигоны (cv2.RETR_CCOMP), упрощённые approxPolyDP.
  4. Масштаб (метров на пиксель) калибруется по известной площади квартиры:
     площадь «не-фона» внутри стен ≈ площадь по проекту.
"""
import json
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PLANS = ROOT / "public" / "assets" / "plans"
OUT = ROOT / "src" / "data" / "walls.json"
DEBUG = "--debug" in sys.argv

# код картинки -> площадь по проекту, м² (из radian.kg)
AREAS = {
    "L1-3949": 39.49, "L1-4052": 40.52, "L1-4816": 48.16, "L1-4834": 48.34,
    "L2-5675": 56.75, "L2-7787": 77.87, "L2-8592": 85.92,
    "L3-7309": 73.09, "L3-10410": 104.10,
    "L4-12834": 128.34, "L4-13667": 136.67,
    "L3T-22806": 228.06,
}

# для калибровки масштаба нужна площадь «как нарисовано». У квартиры с террасой
# 228,06 м² включает террасу 114,3 м² с понижающим коэффициентом (~0,3), а на
# картинке терраса нарисована целиком: 228,06 − 0,3·114,3 + 114,3 ≈ 308 м².
CAL_AREA = {"L3T-22806": 308.0}

LUM_WALL = 50      # яркость «ядра» стены (0..255)
LUM_CLAD = 88      # яркость облицовки фасада
BG_TOL = 14        # допуск к цвету фона при поиске площади квартиры
MIN_AREA = 900     # мельче — мусор (px при ширине ~1800)
EPS = 1.6          # упрощение контура, px


def extract(code: str, area_m2: float):
    src = PLANS / f"{code}.webp"
    img = cv2.imread(str(src), cv2.IMREAD_COLOR)
    if img is None:
        raise SystemExit(f"не найдено: {src}")
    h, w = img.shape[:2]
    # цвет фона — медиана по краю; рамку в 4 px заливаем фоном (у части картинок есть кайма)
    border = np.concatenate([img[:8].reshape(-1, 3), img[-8:].reshape(-1, 3),
                             img[:, :8].reshape(-1, 3), img[:, -8:].reshape(-1, 3)])
    bg = np.median(border, axis=0)
    img[:4], img[-4:], img[:, :4], img[:, -4:] = bg, bg, bg, bg
    lum = img.mean(axis=2)

    # 1–2. маска стен: «ядро» (почти чёрное)
    mask = (lum < LUM_WALL).astype(np.uint8) * 255
    k = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, k)

    # + облицовка фасада (тёмно-серая, ~70): только вытянутые полосы, примыкающие к ядру,
    #   чтобы не поймать плиту и тёмную мебель
    clad = ((lum < LUM_CLAD) & (mask == 0)).astype(np.uint8) * 255
    clad = cv2.morphologyEx(clad, cv2.MORPH_OPEN, k)
    near = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(clad, 8)
    for i in range(1, n):
        x, y, cw, ch, a = stats[i]
        elong = max(cw, ch) / max(1, min(cw, ch))
        if a >= 1500 and elong >= 3.5 and (near[lab == i] > 0).any():
            mask[lab == i] = 255
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3)))

    # убираем мелкие компоненты
    n, lab, stats, _ = cv2.connectedComponentsWithStats(mask, 8)
    clean = np.zeros_like(mask)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= MIN_AREA:
            clean[lab == i] = 255
    mask = clean

    # 3. контуры с дырами
    contours, hier = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    polys = []
    if hier is not None:
        hier = hier[0]
        for i, c in enumerate(contours):
            if hier[i][3] != -1:
                continue  # дыры обрабатываются вместе с внешним контуром
            outer = cv2.approxPolyDP(c, EPS, True).reshape(-1, 2)
            if len(outer) < 3 or cv2.contourArea(outer) < MIN_AREA:
                continue
            holes = []
            j = hier[i][2]
            while j != -1:
                hc = cv2.approxPolyDP(contours[j], EPS, True).reshape(-1, 2)
                if len(hc) >= 3 and cv2.contourArea(hc) > 30:
                    holes.append(hc.tolist())
                j = hier[j][0]
            polys.append([outer.tolist()] + holes)

    # 4. масштаб по площади: всё, что не фон, с залитыми дырами, минус стены
    nonbg = (np.abs(img.astype(int) - bg).max(axis=2) > BG_TOL).astype(np.uint8) * 255
    nonbg = cv2.morphologyEx(nonbg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    ff = nonbg.copy()
    cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    filled = nonbg | cv2.bitwise_not(ff)
    floor_px = int(((filled > 0) & (mask == 0)).sum())
    m_per_px = float(np.sqrt(area_m2 / max(floor_px, 1)))

    ys, xs = np.nonzero(mask)
    bbox = [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())]

    if DEBUG:
        dbg = img.copy()
        ov = np.zeros_like(img)
        ov[mask > 0] = (40, 40, 230)
        dbg = cv2.addWeighted(dbg, 0.55, ov, 0.45, 0)
        for p in polys:
            cv2.polylines(dbg, [np.array(p[0], np.int32)], True, (0, 200, 0), 2)
            for hole in p[1:]:
                cv2.polylines(dbg, [np.array(hole, np.int32)], True, (200, 120, 0), 2)
        d = ROOT / ".debug"
        d.mkdir(exist_ok=True)
        cv2.imwrite(str(d / f"{code}-walls.png"), dbg)

    # 5. текстура пола для 3D: фон, связанный с краем картинки, — прозрачный.
    #    Делаем заранее, чтобы браузер не тратил на это время во время анимации.
    near_bg = (np.abs(img.astype(int) - bg).max(axis=2) < 16).astype(np.uint8)
    flood = near_bg.copy()
    cv2.floodFill(flood, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 2)
    alpha = np.where(flood == 2, 0, 255).astype(np.uint8)
    alpha = cv2.GaussianBlur(cv2.erode(alpha, np.ones((2, 2), np.uint8)), (3, 3), 0)
    rgba = np.dstack([img[:, :, ::-1], alpha])
    Image.fromarray(rgba, "RGBA").save(PLANS / f"{code}-floor.webp", "WEBP", quality=86, method=6, alpha_quality=90)

    return {
        "w": w, "h": h,
        "mPerPx": round(m_per_px, 6),
        "bbox": bbox,
        "polys": polys,
    }


def main():
    out = {}
    for code, area in AREAS.items():
        r = extract(code, CAL_AREA.get(code, area))
        out[code] = r
        bw = (r["bbox"][2] - r["bbox"][0]) * r["mPerPx"]
        bh = (r["bbox"][3] - r["bbox"][1]) * r["mPerPx"]
        pts = sum(len(ring) for p in r["polys"] for ring in p)
        print(f"{code:10s} {area:7.2f} м²  {1 / r['mPerPx']:6.1f} px/м  габарит {bw:5.1f}×{bh:5.1f} м  "
              f"полигонов {len(r['polys']):3d}  точек {pts}")
    OUT.write_text(json.dumps(out, separators=(",", ":")), encoding="utf-8")
    print(f"→ {OUT.relative_to(ROOT)}  ({OUT.stat().st_size // 1024} КБ)")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
