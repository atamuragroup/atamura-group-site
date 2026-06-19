# -*- coding: utf-8 -*-
"""#127 — планировки квартир из Profitbase на карточки каталога.
Тянет пресеты планировок (/api/v4/json/plan), группирует по ЖК x комнатность,
качает по N распознанных картинок на тип, оптимизирует (Pillow), кладёт в
assets/img/plans/<slug>/<roomKey>/NN.jpg и вписывает "plans":[...] в flats-data.js.
Запуск: python3 scripts/fetch_plannings.py
"""
import json, os, re, sys, urllib.request, hashlib
from collections import defaultdict, OrderedDict

PB = "https://pb12230.profitbase.ru"
KEY = os.environ.get("PROFITBASE_API_KEY", "app-67a9fc9aa2b23")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
N_PER_TYPE = 6

# projectName (Profitbase, UTF-8) -> slug каталога (только ЖК, что есть в flats-data.js)
PROJ_MAP = {
    "Атмосфера": "atmosfera",  # Атмосфера
    "AURA": "aura",
    "KERUEN": "keruen",
    "AQSAI RESORT": "aqsai",
    "Bravo": "bravo",
}

def hj(url, method="GET", body=None):
    req = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def auth():
    d = hj(f"{PB}/api/v4/json/authentication", "POST",
           {"type": "api-app", "credentials": {"pb_api_key": KEY}})
    t = d.get("access_token")
    if not t:
        raise RuntimeError(f"auth failed: {d}")
    return t

def fetch_plans(tok):
    out, off = [], 0
    while True:
        r = hj(f"{PB}/api/v4/json/plan?access_token={tok}&limit=100&offset={off}")
        arr = r.get("data") or []
        out.extend(arr)
        if len(arr) < 100:
            break
        off += 100
        if off > 5000:
            break
    return out

def room_key(slug, p):
    if slug == "aqsai":
        return "Таунхаус"  # Таунхаус
    if p.get("isStudio"):
        return "Студия"  # Студия
    ra = p.get("roomsAmount")
    if ra in (1, 2, 3):
        return str(ra)
    return None  # 4+/0 -> в каталоге нет

def img_url(p):
    im = p.get("image")
    if isinstance(im, dict):
        return im.get("source") or im.get("big") or im.get("preview")
    if isinstance(im, str):
        return im
    pi = p.get("planImages")
    if isinstance(pi, list) and pi:
        f = pi[0]
        return (f.get("source") or f.get("big")) if isinstance(f, dict) else f
    return None

def optimize(raw_path, out_jpg):
    from PIL import Image
    im = Image.open(raw_path)
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1])
        im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if w > 1000:
        im = im.resize((1000, round(h * 1000 / w)), Image.LANCZOS)
    im.save(out_jpg, "JPEG", quality=85, optimize=True)

def main():
    tok = auth()
    print("auth OK")
    plans = fetch_plans(tok)
    print(f"presets: {len(plans)}")

    # slug -> roomKey -> ordered-unique urls
    grouped = defaultdict(lambda: defaultdict(OrderedDict))
    for p in plans:
        slug = PROJ_MAP.get(p.get("projectName"))
        if not slug:
            continue
        rk = room_key(slug, p)
        if not rk:
            continue
        u = img_url(p)
        if u:
            grouped[slug][rk].setdefault(u, None)

    mapping = {}  # fid -> [paths]
    for slug in grouped:
        for rk, urls in grouped[slug].items():
            picked = list(urls.keys())[:N_PER_TYPE]
            outdir = os.path.join(ROOT, "assets", "img", "plans", slug, _safe(rk))
            os.makedirs(outdir, exist_ok=True)
            paths = []
            for i, u in enumerate(picked, 1):
                raw = os.path.join(outdir, f"_raw{i}")
                jpg = os.path.join(outdir, f"{i:02d}.jpg")
                rel = f"assets/img/plans/{slug}/{_safe(rk)}/{i:02d}.jpg"
                try:
                    urllib.request.urlretrieve(u, raw)
                    optimize(raw, jpg)
                    os.remove(raw)
                    paths.append(rel)
                except Exception as e:
                    print(f"  skip {slug}/{rk} #{i}: {e}")
            if paths:
                mapping[f"{slug}_{rk}"] = paths
                kb = sum(os.path.getsize(os.path.join(ROOT, p)) for p in paths) // 1024
                print(f"  {slug}/{rk}: {len(paths)} планировок ({kb} KB)")

    json.dump(mapping, open(os.path.join(ROOT, "data", "plannings_map.json"), "w"),
              ensure_ascii=False, indent=2)
    patch_flats(mapping)

def _safe(rk):
    # roomKey -> safe dir segment (translit для кириллицы)
    m = {"Студия": "studio", "Таунхаус": "th"}
    return m.get(rk, rk)

def patch_flats(mapping):
    path = os.path.join(ROOT, "assets", "js", "flats-data.js")
    src = open(path, encoding="utf-8").read()
    m = re.search(r"window\.ATAMURA_FLATS\s*=\s*(\[.*\]);", src, re.S)
    arr = json.loads(m.group(1))
    hit = 0
    for f in arr:
        fid = f"{f['zk']}_{f['rooms']}"
        if fid in mapping:
            f["plans"] = mapping[fid]
            hit += 1
        else:
            f.pop("plans", None)
    new_arr = json.dumps(arr, ensure_ascii=False, separators=(",", ":"))
    src2 = src[:m.start(1)] + new_arr + src[m.end(1):]
    open(path, "w", encoding="utf-8").write(src2)
    print(f"patched flats-data.js: {hit}/{len(arr)} карточек с планировками")

if __name__ == "__main__":
    main()
