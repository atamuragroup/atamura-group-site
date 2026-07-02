# -*- coding: utf-8 -*-
"""Сводный PDF-каталог ЖК для лид-формы сайта (catalog/atamura-catalog.pdf).

Источник данных — assets/js/zhk-data.js (цены в нём ежедневно обновляет
scripts/fetch_plannings.py из ProfitBase), поэтому генератор запускается
в том же workflow ПОСЛЕ обновления цен — PDF не разъезжается с сайтом.

Состав: 9 ЖК = продажи (по возрастанию цены) → «Скоро» → «Сдан».
discovery и tengri-park исключены намеренно (решение PM 2026-07-02:
Discovery пока не показываем; Tengri Park не анонсирован).
"""
from __future__ import annotations

import json
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "assets/fonts"
LOGO = ROOT / "assets/img/logo-mark-navy.png"
OUT = ROOT / "catalog/atamura-catalog.pdf"

HIDDEN = {"discovery", "tengri-park"}
SEGMENT_FIX = {"aqsai": "Таунхаусы"}   # на сайте Aqsai подписан «Таунхаусы», не «Делюкс»

NAVY = colors.HexColor("#284157")
TEAL = colors.HexColor("#007484")
GOLD = colors.HexColor("#CFB372")
INK = colors.HexColor("#1E1E1E")
INK_SOFT = colors.HexColor("#525866")
CREAM = colors.HexColor("#F7F5EE")
LINE = colors.HexColor("#E5E5E0")


def load_zhk() -> list[dict]:
    data = (ROOT / "assets/js/zhk-data.js").read_text(encoding="utf-8")
    arr = json.loads(data[data.index("["): data.rindex("]") + 1])
    zhks = [z for z in arr if z["slug"] not in HIDDEN]
    order = {"Строится": 0, "Скоро": 1, "Сдан": 2}
    zhks.sort(key=lambda z: (order.get(z.get("status"), 3), z.get("priceFrom") or 10**12))
    return zhks


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Cormorant", str(FONTS / "Cormorant-SemiBold600.ttf")))
    pdfmetrics.registerFont(TTFont("Jost", str(FONTS / "Jost-VF.ttf")))


def price_text(z: dict) -> str:
    if z.get("status") == "Сдан":
        return "Продажи завершены"
    if z.get("status") == "Скоро":
        return "Открытие — скоро"
    p = z.get("priceFrom")
    if not p:
        return "Цена — уточняйте"
    return f"от {p/1_000_000:.1f} млн ₸".replace(".", ",")


def build() -> None:
    zhks = load_zhk()
    register_fonts()
    OUT.parent.mkdir(parents=True, exist_ok=True)

    # invariant=1 — детерминированный вывод (без CreationDate/random ID): иначе ежедневный
    # workflow коммитил бы «изменившийся» PDF даже при неизменных ценах
    c = canvas.Canvas(str(OUT), pagesize=A4, invariant=1)
    W, H = A4

    c.setFillColor(CREAM)
    c.rect(0, H - 32 * mm, W, 32 * mm, stroke=0, fill=1)
    if LOGO.exists():
        c.drawImage(str(LOGO), 20 * mm, H - 27 * mm, width=16 * mm, height=16 * mm,
                    mask="auto", preserveAspectRatio=True, anchor="w")
    c.setFillColor(NAVY)
    c.setFont("Cormorant", 22)
    c.drawString(42 * mm, H - 16 * mm, "ATAMŪRA GROUP")
    c.setFillColor(INK_SOFT)
    c.setFont("Jost", 9)
    c.drawString(42 * mm, H - 21 * mm, "Мы создаём наследие · 10 лет на рынке Алматы")

    c.setStrokeColor(GOLD)
    c.setLineWidth(1.5)
    c.line(20 * mm, H - 33 * mm, W - 20 * mm, H - 33 * mm)

    y = H - 50 * mm
    c.setFillColor(NAVY)
    c.setFont("Cormorant", 34)
    c.drawString(20 * mm, y, "Каталог жилых комплексов")
    c.setFillColor(INK_SOFT)
    c.setFont("Jost", 11)
    c.drawString(20 * mm, y - 6 * mm, "9 ЖК в Алматы и пригороде · от доступного сегмента до бизнес-класса")

    y -= 18 * mm
    col_x = [20, 62, 100, 148, 172]  # mm: name, segment, district, status, price
    headers = ["Жилой комплекс", "Сегмент", "Район", "Статус", "Цена"]
    c.setFillColor(NAVY)
    c.setFont("Jost", 8)
    for i, h in enumerate(headers):
        c.drawString(col_x[i] * mm, y, h.upper())
    c.setStrokeColor(LINE)
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 2 * mm, W - 20 * mm, y - 2 * mm)

    y -= 8 * mm
    for z in zhks:
        c.setFillColor(INK)
        c.setFont("Jost", 10)
        c.drawString(col_x[0] * mm, y, (z.get("name") or z["slug"])[:20])
        c.setFillColor(INK_SOFT)
        c.setFont("Jost", 9)
        c.drawString(col_x[1] * mm, y, (SEGMENT_FIX.get(z["slug"]) or z.get("segment") or "—")[:14])
        district = z.get("district") or "—"
        if len(district) > 30:
            district = district[:27] + "…"
        c.drawString(col_x[2] * mm, y, district)
        c.drawString(col_x[3] * mm, y, (z.get("status") or "—")[:12])
        c.setFillColor(TEAL)
        c.setFont("Jost", 10)
        pt = price_text(z)
        if pt.endswith(" ₸"):   # у Jost нет глифа ₸ — дорисовываем его Cormorant'ом
            base = pt[:-1]
            c.drawString(col_x[4] * mm, y, base)
            c.setFont("Cormorant", 10)
            c.drawString(col_x[4] * mm + pdfmetrics.stringWidth(base, "Jost", 10), y, "₸")
        else:
            c.drawString(col_x[4] * mm, y, pt)
        y -= 7 * mm

    y -= 10 * mm
    c.setFillColor(NAVY)
    c.setFont("Cormorant", 18)
    c.drawString(20 * mm, y, "Финансирование")
    y -= 6 * mm
    c.setFillColor(INK)
    c.setFont("Jost", 10)
    for ln in [
        "• Ипотека «7-20-25» — государственная программа от 7%",
        "• Ипотека «Наурыз» — госпрограмма Отбасы банка на первое жильё",
        "• Отбасы Банк — программы со взносом от 10%",
        "• Партнёрские программы банков второго уровня",
        "• Рассрочка 0% от застройщика · ЕНПФ на первый взнос",
    ]:
        c.drawString(22 * mm, y, ln)
        y -= 5.5 * mm

    y -= 4 * mm
    c.setFillColor(NAVY)
    c.rect(20 * mm, y - 24 * mm, W - 40 * mm, 24 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Cormorant", 16)
    c.drawString(28 * mm, y - 8 * mm, "Связаться с менеджером")
    c.setFont("Jost", 10)
    c.drawString(28 * mm, y - 14 * mm, "+7 700 700 11 11 · WhatsApp и ИИ-консультант — 24/7")
    c.setFillColor(GOLD)
    c.drawString(28 * mm, y - 20 * mm, "Офисы продаж: Толе би 12 · мкр. Нуршашкан, Алатау 44 · Кульджинский тракт, 2 к1")

    c.setFillColor(INK_SOFT)
    c.setFont("Jost", 7)
    c.drawString(20 * mm, 12 * mm, "© 2016–2026 ТОО «Atamura Group» · atamuragroup.kz")
    c.drawRightString(W - 20 * mm, 12 * mm, "Не является публичной офертой · цены ориентировочные, уточняйте у менеджера")

    c.showPage()
    c.save()
    print(f"OK: {OUT.relative_to(ROOT)} ({OUT.stat().st_size} bytes, {len(zhks)} ЖК)")


if __name__ == "__main__":
    build()
