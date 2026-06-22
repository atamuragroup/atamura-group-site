#!/usr/bin/env python3
"""Скачать live-цены и площади «от» из Profitbase для всех активных ЖК ATAMURA.
Перезаписывает data/pb_catalog_anchors.json и patch'ит priceFrom в site/assets/js/zhk-data.js.
Использование: python3 scripts/fetch_profitbase.py
Требует API ключ Profitbase (см. кабинет → API → Profitbase API settings).
"""
import json, os, re, sys, urllib.request, urllib.parse
from collections import defaultdict

PB_HOST = "https://pb12230.profitbase.ru"  # поддомен аккаунта pb12230 (ТОО ATAMURA GROUP)
API_KEY = os.environ.get("PROFITBASE_API_KEY")
if not API_KEY:
    raise SystemExit("PROFITBASE_API_KEY env var required")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PROJ_MAP = {
    'Атмосфера': 'atmosfera',
    'AURA': 'aura',
    'KERUEN': 'keruen',
    'AQSAI RESORT': 'aqsai',
    'Bravo': 'bravo',
    'Арлан': 'arlan',
    'Monarch': 'monarch',
}
NAME = {'atmosfera':'Атмосфера','aura':'AURA','keruen':'KERUEN','aqsai':'AQSAI RESORT','bravo':'Bravo','arlan':'Арлан','monarch':'Monarch'}
ORDER = ['студия','1-комн','2-комн','3-комн','4-комн+','Таунхаус']

def http_json(url, method='GET', body=None):
    req = urllib.request.Request(url, method=method, headers={'Content-Type':'application/json'},
                                 data=json.dumps(body).encode() if body else None)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())

def authenticate():
    d = http_json(f"{PB_HOST}/api/v4/json/authentication", 'POST',
                  {"type":"api-app","credentials":{"pb_api_key": API_KEY}})
    token = d.get('access_token')
    if not token: raise RuntimeError(f"auth failed: {d}")
    return token

def fetch_all_properties(token):
    items=[]; offset=0; LIMIT=500
    while True:
        d = http_json(f"{PB_HOST}/api/v4/json/property?access_token={token}&fullness=1&limit={LIMIT}&offset={offset}")
        arr = d.get('data') or []
        items.extend(arr)
        if len(arr) < LIMIT: break
        offset += LIMIT
        if offset > 50000: break
    return items

def rooms_key(it):
    if it.get('studio'): return 'студия'
    if it.get('propertyType') == 'townhouse': return 'Таунхаус'
    n = it.get('rooms_amount')
    if n is None: return None
    if n >= 4: return '4-комн+'
    return f"{n}-комн"

def aggregate(items):
    agg = defaultdict(lambda: defaultdict(list))
    for it in items:
        if it.get('status') != 'AVAILABLE': continue
        if it.get('propertyType') not in ('property', 'townhouse'): continue
        if it.get('typePurpose') != 'residential': continue
        slug = PROJ_MAP.get(it.get('projectName'));
        if not slug: continue
        rk = rooms_key(it);
        if not rk: continue
        p = (it.get('price') or {}).get('value')
        a = (it.get('area') or {}).get('area_total')
        if p and a: agg[slug][rk].append((p,a))

    out = {'_note': "Цены и площади «от» = минимум по AVAILABLE (квартиры + таунхаусы, residential) из Profitbase ATAMURA. Пересборка: python3 scripts/fetch_profitbase.py",
           'zk': {}}
    for slug in ['atmosfera','aura','keruen','aqsai','bravo','arlan','monarch']:
        rd = agg.get(slug, {})
        rooms_out = []
        overall_min = None
        for rk in ORDER:
            lst = rd.get(rk, [])
            if not lst: continue
            prices = [p for p,a in lst]; areas = [a for p,a in lst]
            pmin = min(prices)
            rooms_out.append({'k': rk, 'priceFrom': pmin,
                              'areaMin': round(min(areas),1), 'areaMax': round(max(areas),1), 'n': len(lst)})
            overall_min = pmin if overall_min is None or pmin < overall_min else overall_min
        if rooms_out:
            out['zk'][slug] = {'name': NAME[slug], 'priceFrom': overall_min, 'source':'profitbase-live', 'rooms': rooms_out}
    return out

def patch_zhk_data(anchors):
    path = os.path.join(ROOT, 'site/assets/js/zhk-data.js')
    src = open(path).read()
    for slug, d in anchors['zk'].items():
        pf = d['priceFrom']
        pat = re.compile(r'("slug":\s*"' + re.escape(slug) + r'"[\s\S]*?"priceFrom":\s*)(\d+|null)')
        src, n = pat.subn(lambda m: m.group(1) + str(pf), src, count=1)
    open(path,'w').write(src)

def main():
    print(f"PROFITBASE_API_KEY = {API_KEY[:18]}…")
    token = authenticate()
    print(f"access_token OK (len {len(token)})")
    items = fetch_all_properties(token)
    print(f"fetched {len(items)} properties")
    anchors = aggregate(items)
    out_path = os.path.join(ROOT, 'data/pb_catalog_anchors.json')
    json.dump(anchors, open(out_path,'w'), ensure_ascii=False, indent=2)
    print(f"saved {out_path}")
    patch_zhk_data(anchors)
    print("patched zhk-data.js")
    for slug, d in anchors['zk'].items():
        print(f"  {slug:10} priceFrom = от {d['priceFrom']/1_000_000:.1f} млн ₸")

if __name__ == '__main__':
    main()
