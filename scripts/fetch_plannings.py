# -*- coding: utf-8 -*-
"""Планировки + актуальные цены из Profitbase (по ТЗ Данияра 22.06):
- карточки проектов: цена = самая дешёвая из ДОСТУПНЫХ к продаже квартир (patch zhk-data.js priceFrom)
- планировки: каждая ОТДЕЛЬНО (не группируя по комнатности), только доступные;
  у каждой свои комнатность/площадь/цена/картинка (window.ATAMURA_PLANS в flats-data.js)
Ключ ТОЛЬКО из env: PROFITBASE_API_KEY (+ опц. PROFITBASE_BASE_URL).
Запуск: PROFITBASE_API_KEY=... python3 scripts/fetch_plannings.py
"""
import json, os, re, sys, urllib.request, hashlib
from collections import OrderedDict

PB = os.environ.get("PROFITBASE_BASE_URL", "https://pb12230.profitbase.ru").rstrip("/")
KEY = os.environ.get("PROFITBASE_API_KEY")
if not KEY:
    sys.exit("ERROR: переменная окружения PROFITBASE_API_KEY обязательна")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# projectName (Profitbase) -> slug каталога
PROJ_MAP = {
    "Атмосфера": "atmosfera", "AURA": "aura", "KERUEN": "keruen",
    "AQSAI RESORT": "aqsai", "Bravo": "bravo",
}

def hj(url, method="GET", body=None):
    req = urllib.request.Request(url, method=method, headers={"Content-Type": "application/json"},
                                 data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read())

def auth():
    d = hj(f"{PB}/api/v4/json/authentication", "POST",
           {"type": "api-app", "credentials": {"pb_api_key": KEY}})
    t = d.get("access_token")
    if not t:
        raise RuntimeError(f"auth failed: {d}")
    return t

def available_units(tok):
    """id квартиры -> {slug, price, area, rooms, studio}, только AVAILABLE жильё/таунхаусы."""
    out, off, LIMIT = {}, 0, 500
    while True:
        d = hj(f"{PB}/api/v4/json/property?access_token={tok}&fullness=1&limit={LIMIT}&offset={off}")
        arr = d.get("data") or []
        for it in arr:
            if (it.get("status") != "AVAILABLE" or it.get("typePurpose") != "residential"
                    or it.get("propertyType") not in ("property", "townhouse")):
                continue
            slug = PROJ_MAP.get(it.get("projectName"))
            if not slug:
                continue
            out[str(it.get("id"))] = {
                "slug": slug,
                "price": (it.get("price") or {}).get("value"),
                "area": (it.get("area") or {}).get("area_total"),
                "rooms": it.get("rooms_amount"),
                "studio": bool(it.get("studio")),
            }
        if len(arr) < LIMIT:
            break
        off += LIMIT
        if off > 50000:
            break
    return out

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

def rooms_key(slug, p):
    if slug == "aqsai":
        return "Таунхаус"
    if p.get("isStudio"):
        return "Студия"
    n = p.get("roomsAmount")
    return str(n) if n else None

def optimize(raw, out_jpg):
    from PIL import Image
    im = Image.open(raw)
    if im.mode in ("RGBA", "LA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255)); im = im.convert("RGBA")
        bg.paste(im, mask=im.split()[-1]); im = bg
    else:
        im = im.convert("RGB")
    w, h = im.size
    if w > 1000:
        im = im.resize((1000, round(h * 1000 / w)), Image.LANCZOS)
    im.save(out_jpg, "JPEG", quality=82, optimize=True)

def download(url, slug, cache):
    if url in cache:
        return cache[url]
    h = hashlib.md5(url.encode()).hexdigest()[:12]
    rel = f"assets/img/plans/{slug}/{h}.jpg"
    out = os.path.join(ROOT, rel)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    raw = out + ".raw"
    urllib.request.urlretrieve(url, raw)
    optimize(raw, out)
    os.remove(raw)
    cache[url] = rel
    return rel

def patch_zhk_prices(minprice):
    path = os.path.join(ROOT, "assets", "js", "zhk-data.js")
    src = open(path, encoding="utf-8").read()
    for slug, price in minprice.items():
        pat = re.compile(r'("slug":\s*"' + re.escape(slug) + r'"[\s\S]*?"priceFrom":\s*)(\d+|null)')
        src, n = pat.subn(lambda m: m.group(1) + str(price), src, count=1)
        print(f"  zhk-data {slug}.priceFrom = {price} (заменено: {n})")
    open(path, "w", encoding="utf-8").write(src)

def write_plans(plans_by_slug):
    """Удаляет старые plans[] из ATAMURA_FLATS и дописывает window.ATAMURA_PLANS."""
    path = os.path.join(ROOT, "assets", "js", "flats-data.js")
    src = open(path, encoding="utf-8").read()
    m = re.search(r"window\.ATAMURA_FLATS\s*=\s*(\[.*?\]);", src, re.S)
    arr = json.loads(m.group(1))
    for f in arr:
        f.pop("plans", None)
    new_flats = "window.ATAMURA_FLATS = " + json.dumps(arr, ensure_ascii=False, separators=(",", ":")) + ";"
    plans_js = "window.ATAMURA_PLANS = " + json.dumps(plans_by_slug, ensure_ascii=False, separators=(",", ":")) + ";"
    # вырезаем старый ATAMURA_PLANS если был, заменяем блок ATAMURA_FLATS, дописываем ATAMURA_PLANS
    head = src[:m.start()]
    tail = src[m.end():]
    tail = re.sub(r"\s*window\.ATAMURA_PLANS\s*=\s*\{.*?\};", "", tail, flags=re.S)
    open(path, "w", encoding="utf-8").write(head + new_flats + tail.rstrip() + "\n" + plans_js + "\n")

def main():
    tok = auth(); print("auth OK")
    units = available_units(tok); print(f"доступных квартир: {len(units)}")
    plans = fetch_plans(tok); print(f"пресетов всего: {len(plans)}")

    by_slug = {}      # slug -> OrderedDict(img_rel -> planning)
    img_cache = {}
    # чистим старые картинки
    import shutil
    pdir = os.path.join(ROOT, "assets", "img", "plans")
    if os.path.isdir(pdir):
        shutil.rmtree(pdir)

    for p in plans:
        slug = PROJ_MAP.get(p.get("projectName"))
        if not slug:
            continue
        ids = [str(x) for x in (p.get("properties") or [])]
        au = [units[i] for i in ids if i in units]
        if not au:
            continue
        rk = rooms_key(slug, p)
        if not rk:
            continue
        prices = [u["price"] for u in au if u["price"]]
        areas = [u["area"] for u in au if u["area"]]
        if not prices:
            continue
        url = img_url(p)
        if not url:
            continue
        try:
            rel = download(url, slug, img_cache)
        except Exception as e:
            print(f"  skip img {slug}: {e}")
            continue
        entry = {"r": rk, "aMin": round(min(areas), 1) if areas else None,
                 "aMax": round(max(areas), 1) if areas else None, "price": min(prices), "img": rel}
        d = by_slug.setdefault(slug, OrderedDict())
        if rel in d:  # дедуп по картинке: берём минимальную цену и общий диапазон площади
            e0 = d[rel]
            e0["price"] = min(e0["price"], entry["price"])
            if entry["aMin"] is not None:
                e0["aMin"] = min(e0["aMin"], entry["aMin"]) if e0["aMin"] is not None else entry["aMin"]
                e0["aMax"] = max(e0["aMax"], entry["aMax"]) if e0["aMax"] is not None else entry["aMax"]
        else:
            d[rel] = entry

    plans_by_slug, minprice = {}, {}
    for slug, d in by_slug.items():
        lst = sorted(d.values(), key=lambda x: x["price"])
        plans_by_slug[slug] = lst
        minprice[slug] = min(x["price"] for x in lst)
        kb = sum(os.path.getsize(os.path.join(ROOT, x["img"])) for x in lst) // 1024
        print(f"  {slug}: {len(lst)} планировок, min {minprice[slug]/1e6:.2f} млн ({kb} KB)")

    write_plans(plans_by_slug)
    patch_zhk_prices(minprice)
    print("flats-data.js (ATAMURA_PLANS) и zhk-data.js обновлены")

if __name__ == "__main__":
    main()
