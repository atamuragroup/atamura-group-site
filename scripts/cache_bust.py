# -*- coding: utf-8 -*-
"""Обновляет ?v=<md5> у версионируемых ассетов во ВСЕХ *.html — чтобы браузеры
подхватывали свежие JS/CSS после изменения. Запуск: python3 scripts/cache_bust.py"""
import os, re, glob, hashlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = {
    "app.js": "assets/js/app.js",
    "styles.css": "assets/css/styles.css",
    "flats-data.js": "assets/js/flats-data.js",
    "zhk-data.js": "assets/js/zhk-data.js",
    "i18n_kk.js": "assets/js/i18n_kk.js",
}

def md5(path):
    return hashlib.md5(open(path, "rb").read()).hexdigest()[:8]

def main():
    vers = {}
    for name, rel in ASSETS.items():
        fp = os.path.join(ROOT, rel)
        if os.path.exists(fp):
            vers[name] = md5(fp)
    n = 0
    for f in glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True):
        if os.sep + "node_modules" + os.sep in f:
            continue
        s = open(f, encoding="utf-8").read()
        o = s
        for name, v in vers.items():
            s = re.sub(re.escape(name) + r"\?v=[a-f0-9]+", name + "?v=" + v, s)
        if s != o:
            open(f, "w", encoding="utf-8").write(s)
            n += 1
    print("cache-bust:", vers, "| HTML updated:", n)

if __name__ == "__main__":
    main()
