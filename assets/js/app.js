/* ATAMURA GROUP — поведение сайта (общий для всех страниц).
   Все обработчики guarded: страница может не содержать элемент — блок просто пропускается.
   Дизайн-система — из утверждённого прототипа (styles.css).
   Данные: window.ATAMURA_ZHK (zhk-data.js), window.ATAMURA_FLATS (flats-data.js). */
(function () {
  "use strict";

  var IN_ZK = /\/zk\//.test(location.pathname);
  function rel(p) { return (IN_ZK ? "../" : "") + p; }
  function imgsrc(p) { return p && !/^(https?:)?\/\//.test(p) && p.charAt(0) !== "/" ? rel(p) : p; }
  // depth-aware resolver to site root (works on /, /kk/, /zk/, /kk/zk/) — fixes assets on language mirror
  function catAsset(p) {
    if (!p || /^(https?:)?\/\//.test(p) || p.charAt(0) === "/") return p;
    var segs = location.pathname.split("/").filter(Boolean);
    var depth = /\/$/.test(location.pathname) ? segs.length : Math.max(0, segs.length - 1);
    return new Array(depth + 1).join("../") + p;
  }
  function money(n) { return Math.round(n).toLocaleString("ru-RU").replace(/,/g, " "); }
  function byId(id) { return document.getElementById(id); }
  function priceLabel(z) {
    if (z.priceFrom) return "от " + money(z.priceFrom) + " ₸";
    if (z.priceText) return z.priceText;
    return "цена по запросу";
  }
  function plural(n, one, few, many) {
    var n10 = n % 10, n100 = n % 100;
    if (n10 === 1 && n100 !== 11) return one;
    if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
    return many;
  }
  var WA_PHONE = "77006410499";
  /* Аналитика: пушим в dataLayer (GTM-совместимо) и в gtag, если GA4 загружен. Без PII (номер не пишем). */
  function track(name, params) {
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(Object.assign({ event: name }, params || {}));
      if (typeof window.gtag === "function") window.gtag("event", name, params || {});
    } catch (e) {}
  }
  function annuity(principal, annualRate, years) {
    var r = annualRate / 12, n = years * 12;
    if (r === 0) return principal / n;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }
  /* 7-20-25: ставка 7%, первый взнос 20%, срок 25 лет. Ориентир — точную ставку подтверждает банк. */
  function payment72025(price) { return annuity(price * 0.8, 0.07, 25); }

  /* Отзывы жильцов по ЖК (verbatim, как на главной). Показываем на странице ЖК, если есть. */
  var ZK_REVIEWS = {
    atmosfera: { stars: "★★★★★", text: "Заехали в Атмосферу в марте. Двор не как в рекламе, а лучше: реально спокойно, дети играют, охрана работает. Поддержка отвечает в WhatsApp за 10 минут.", name: "Аида Н.", sub: "Атмосфера, 2 комн.", av: "АН" },
    aura: { stars: "★★★★★", text: "Сравнивал 4 застройщика. Atamura единственные, кто сразу показал точную стоимость с отделкой и ипотекой — без «от» и «примерно». Купили в Aura.", name: "Мирас К.", sub: "Aura, 3 комн.", av: "МК" },
    aqsai: { stars: "★★★★☆", text: "Брали таунхаус в Aqsai. Сдали с задержкой 2 месяца, но честно предупредили. После заселения мелкие косяки исправили без споров.", name: "Дамир Т.", sub: "Aqsai Resort, таунхаус", av: "ДТ" }
  };

  /* ---------- Burger / mobile drawer (+ a11y focus-trap, aria-modal) ---------- */
  (function () {
    var burger = byId("burger"), drawer = byId("drawer");
    if (!burger || !drawer) return;
    var lastFocus = null;
    function focusables() {
      return drawer.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
    }
    function open() {
      lastFocus = document.activeElement;
      drawer.classList.add("is-on"); burger.classList.add("is-on"); document.body.classList.add("drawer-open");
      drawer.setAttribute("aria-modal", "true");
      var first = focusables()[0]; if (first) setTimeout(function () { first.focus(); }, 50);
    }
    function close() {
      drawer.classList.remove("is-on"); burger.classList.remove("is-on"); document.body.classList.remove("drawer-open");
      drawer.removeAttribute("aria-modal");
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }
    burger.addEventListener("click", function () { drawer.classList.contains("is-on") ? close() : open(); });
    [].forEach.call(document.querySelectorAll("[data-open-drawer]"), function (el) { el.addEventListener("click", open); });
    drawer.addEventListener("click", function (e) { if (e.target === drawer) close(); });
    var x = drawer.querySelector(".drawer-close"); if (x) x.addEventListener("click", close);
    document.addEventListener("keydown", function (e) {
      if (!drawer.classList.contains("is-on")) return;
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Tab") {
        var f = focusables(); if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  })();

  /* ---------- Проекты/Квартиры toggle ---------- */
  (function () {
    var t = byId("projToggle"); if (!t) return;
    t.addEventListener("click", function () { this.classList.toggle("is-right"); });
  })();

  /* ---------- Фильтры на главной → ведут в рабочий каталог ---------- */
  document.querySelectorAll(".filter-btn").forEach(function (b) {
    b.addEventListener("click", function () { location.href = rel("flats.html"); });
  });

  /* Старый калькулятор 7-20-25/11,4% удалён — на главной единый калькулятор «Наурыз» (bindNauryzCalc). */

  /* ---------- Sticky bar ---------- */
  (function () {
    var sticky = byId("stickyBar"); if (!sticky) return;
    var closed = false;
    window.addEventListener("scroll", function () { if (!closed && scrollY > 600) sticky.classList.add("is-on"); }, { passive: true });
    var x = sticky.querySelector(".sticky-close"); if (x) x.addEventListener("click", function () { closed = true; sticky.classList.remove("is-on"); });
  })();

  /* ---------- Popups (scroll 50% + exit-intent) ---------- */
  function closePop(id) { var p = byId(id); if (p) p.classList.remove("is-on"); }
  window.closePop = closePop;
  (function () {
    var scrollPop = byId("scrollPopup");
    if (scrollPop) {
      var shown = sessionStorage.getItem("atamura_scrollPop") === "1";
      window.addEventListener("scroll", function () {
        if (shown) return;
        var pct = scrollY / (document.documentElement.scrollHeight - innerHeight);
        if (pct > 0.5) { scrollPop.classList.add("is-on"); shown = true; sessionStorage.setItem("atamura_scrollPop", "1"); track("popup_shown", { popup: "scroll" }); }
      }, { passive: true });
    }
    var exitPop = byId("exitPopup");
    if (exitPop) {
      var eshown = sessionStorage.getItem("atamura_exitPop") === "1";
      document.addEventListener("mouseleave", function (e) {
        if (eshown) return;
        if (e.clientY < 10 && performance.now() > 15000) { exitPop.classList.add("is-on"); eshown = true; sessionStorage.setItem("atamura_exitPop", "1"); track("popup_shown", { popup: "exit" }); }
      });
    }
    document.querySelectorAll(".popup-overlay").forEach(function (ov) {
      ov.addEventListener("click", function (e) { if (e.target === ov) ov.classList.remove("is-on"); });
    });
  })();

  /* ---------- Catalog popup (form → auto-download PDF → success-стадия) ----------
     Без бэкенда. Лид сохраняется в localStorage (atamura_leads) до момента подключения Bitrix24. */
  (function () {
    var pop = byId("catalogPopup");
    if (!pop) return;
    var form = pop.querySelector(".catalog-form");
    var stageForm = pop.querySelector('[data-catalog-stage="form"]');
    var stageOk = pop.querySelector('[data-catalog-stage="success"]');
    var srcField = form ? form.querySelector('input[name="catalog_source"]') : null;
    var nameInput = form ? form.querySelector('input[name="name"]') : null;
    var phoneInput = form ? form.querySelector('input[name="phone"]') : null;
    var honeyInput = form ? form.querySelector('input[name="company"]') : null;
    var redownload = stageOk ? stageOk.querySelector('[data-catalog-redownload]') : null;
    if (form) bindPhones(form);
    var catalogHref = rel("catalog/atamura-catalog.pdf");
    if (redownload) redownload.setAttribute("href", catalogHref);

    /* Open: делегируем клик по [data-open-catalog] (для динамической карточки на /zk/<slug>) */
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-open-catalog]");
      if (!btn) return;
      e.preventDefault();
      if (srcField) srcField.value = btn.getAttribute("data-catalog-source") || "unknown";
      if (stageForm) stageForm.hidden = false;
      if (stageOk) stageOk.hidden = true;
      pop.classList.add("is-on");
      track("catalog_open", { source: srcField ? srcField.value : "unknown" });
      setTimeout(function () { if (nameInput) nameInput.focus(); }, 80);
    });

    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      /* Honeypot — бот заполнит, человек не увидит. */
      if (honeyInput && honeyInput.value) return;
      var nm = (nameInput.value || "").trim();
      if (nm.length < 2) { showFieldError(nameInput, "Введите имя (минимум 2 буквы)"); nameInput.focus(); return; }
      if (!phoneValid(phoneInput.value)) { showFieldError(phoneInput, "Введите номер: +7 7XX XXX-XX-XX"); phoneInput.focus(); return; }

      var data = {};
      new FormData(form).forEach(function (v, k) { if (k !== "company") data[k] = v; });
      data.source = "catalog-" + (srcField ? srcField.value : "unknown");
      data.page = location.pathname;
      data.ref = document.referrer || "прямой заход";
      data.utm = location.search || "";
      data.ts = new Date().toISOString();
      try {
        var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]");
        q.push(data);
        localStorage.setItem("atamura_leads", JSON.stringify(q));
      } catch (e2) {}
      track("catalog_submit", { source: data.source, page: data.page });

      /* Переключаем стадию + автоскачивание PDF */
      stageForm.hidden = true;
      stageOk.hidden = false;
      var dl = document.createElement("a");
      dl.href = catalogHref;
      dl.download = "atamura-catalog.pdf";
      dl.rel = "noopener";
      document.body.appendChild(dl);
      dl.click();
      setTimeout(function () { if (dl.parentNode) dl.parentNode.removeChild(dl); }, 0);
    });
  })();

  /* ---------- Телефон: маска + валидация ---------- */
  function formatPhone(v) {
    var d = v.replace(/\D/g, "");
    if (d[0] === "8") d = "7" + d.slice(1);
    if (d[0] !== "7") d = "7" + d;
    d = d.slice(0, 11);
    var r = "+7";
    if (d.length > 1) r += " (" + d.slice(1, 4);
    if (d.length >= 4) r += ")";
    if (d.length >= 5) r += " " + d.slice(4, 7);
    if (d.length >= 8) r += "-" + d.slice(7, 9);
    if (d.length >= 10) r += "-" + d.slice(9, 11);
    return r;
  }
  function phoneValid(v) { return v.replace(/\D/g, "").length >= 11; }
  function bindPhones(scope) {
    (scope || document).querySelectorAll('input[type="tel"]').forEach(function (i) {
      if (i.dataset.tel) return; i.dataset.tel = "1";
      i.addEventListener("input", function () { i.value = formatPhone(i.value); });
    });
  }
  function showFieldError(input, msg) {
    input.setAttribute("aria-invalid", "true");
    var err = input.parentNode.querySelector(".field-err");
    if (!err) { err = document.createElement("p"); err.className = "field-err"; err.setAttribute("role", "alert"); input.insertAdjacentElement("afterend", err); }
    err.textContent = msg;
    var clr = function () { input.removeAttribute("aria-invalid"); if (err && err.parentNode) err.parentNode.removeChild(err); input.removeEventListener("input", clr); };
    input.addEventListener("input", clr);
  }

  /* ---------- Лид-формы (валидация → доставка → localStorage → /спасибо) ---------- */
  /* Endpoint доставки заявок: TM_Calculator Hono-сервер (VDS) → файл + Bitrix24 crm.lead.add.
     Пусто → fallback только в localStorage. */
  var LEAD_WEBHOOK = "https://calculator.atamuragroup.kz/api/site-lead";
  function bindForms(scope) {
    bindPhones(scope);
    (scope || document).querySelectorAll("form.lead-form").forEach(function (f) {
      if (f.dataset.bound) return; f.dataset.bound = "1";
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var tel = f.querySelector('input[type="tel"]');
        if (tel && !phoneValid(tel.value)) { showFieldError(tel, "Введите номер: +7 7XX XXX-XX-XX"); tel.focus(); return; }
        var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
        data.source = f.getAttribute("data-form") || "form"; data.page = location.pathname;
        data.ref = document.referrer || "прямой заход"; data.utm = location.search || ""; data.ts = new Date().toISOString();
        try { var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]"); q.push(data); localStorage.setItem("atamura_leads", JSON.stringify(q)); } catch (e2) {}
        track("form_submitted", { form_type: data.source, page: data.page, messenger: data.messenger || "" });
        var done = function(){ location.href = rel("spasibo.html"); };
        if (LEAD_WEBHOOK) {
          // Отправляем в Telegram через Cloudflare Worker. Не блокируем UX: при ошибке всё равно ведём на «Спасибо» — заявка в localStorage не потерялась.
          fetch(LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), keepalive: true }).then(done).catch(done);
        } else { done(); }
      });
    });
  }

  /* ---------- Попап «Скоро старт продаж» (#104) ----------
     Клик по карточке ЖК со статусом «Скоро» (.badge.is-status.is-light) открывает форму
     заявки в лист ожидания вместо перехода на страницу. Лид уходит в site-lead + localStorage. */
  (function () {
    var pop = byId("soonPopup");
    if (!pop) return;
    var form = pop.querySelector(".soon-form");
    var stageForm = pop.querySelector('[data-soon-stage="form"]');
    var stageOk = pop.querySelector('[data-soon-stage="success"]');
    var nameInput = form ? form.querySelector('input[name="name"]') : null;
    var phoneInput = form ? form.querySelector('input[name="phone"]') : null;
    var honeyInput = form ? form.querySelector('input[name="company"]') : null;
    var titleEl = pop.querySelector("[data-soon-title]");
    var src = "soon";
    if (form) bindPhones(form);

    document.addEventListener("click", function (e) {
      var card = e.target.closest && e.target.closest("a.pcard");
      // #157/#158/#159: футерные ссылки на «Скоро»-проекты (Discovery/AMAIA/DION) тоже открывают форму ожидания
      var footLink = e.target.closest && e.target.closest(".foot-col-projects a");
      var slug, nm;
      if (card && card.querySelector(".badge.is-status.is-light")) {
        var href = card.getAttribute("href") || "";
        slug = (href.match(/zk\/([a-z-]+)\.html/) || [])[1] || "unknown";
        var nmEl = card.querySelector(".pcard-name"); nm = nmEl ? nmEl.textContent : slug;
      } else if (footLink && /скоро/i.test(footLink.textContent || "")) {
        var fh = footLink.getAttribute("href") || "";
        slug = (fh.match(/([a-z-]+)\.html/) || [])[1] || "soon";
        nm = (footLink.textContent || "").replace(/скоро/i, "").trim();
      } else return;
      e.preventDefault();
      src = "soon-" + slug;
      if (titleEl && nm) { titleEl.textContent = " · " + nm; titleEl.hidden = false; }
      if (stageForm) stageForm.hidden = false;
      if (stageOk) stageOk.hidden = true;
      pop.classList.add("is-on");
      track("soon_open", { source: src });
      setTimeout(function () { if (nameInput) nameInput.focus(); }, 80);
    });

    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (honeyInput && honeyInput.value) return;
      if (phoneInput && !phoneValid(phoneInput.value)) { showFieldError(phoneInput, "Введите номер: +7 7XX XXX-XX-XX"); phoneInput.focus(); return; }
      var data = {};
      new FormData(form).forEach(function (v, k) { if (k !== "company") data[k] = v; });
      data.source = src;
      data.page = location.pathname;
      data.ref = document.referrer || "прямой заход";
      data.utm = location.search || "";
      data.ts = new Date().toISOString();
      try { var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]"); q.push(data); localStorage.setItem("atamura_leads", JSON.stringify(q)); } catch (e2) {}
      track("soon_submit", { source: src, page: data.page });
      if (stageForm) stageForm.hidden = true;
      if (stageOk) stageOk.hidden = false;
      if (LEAD_WEBHOOK) {
        fetch(LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), keepalive: true }).catch(function () {});
      }
    });
  })();

  /* ---------- Карточка ЖК (.pcard) ---------- */
  function pcard(z) {
    var photo = imgsrc(z.hero_image || (z.gallery && z.gallery[0]) || "");
    var badge2 = z.status === "Скоро" ? '<span class="badge is-status is-light">Скоро</span>'
      : z.status === "Сдан" ? '<span class="badge is-status">Сдан</span>'
      : '<span class="badge is-soft">Идут продажи</span>';
    var price = z.status === "Сдан" ? "<strong>Продажи завершены</strong>"
      : z.priceFrom ? 'от <strong>' + (z.priceFrom / 1000000).toFixed(z.priceFrom % 1000000 ? 1 : 0).replace(".", ",") + "</strong> млн ₸"
      : (z.priceText ? "<strong>" + z.priceText + "</strong>" : "<strong>цена по запросу</strong>");
    return '<a class="pcard" href="' + rel("zk/" + z.slug + ".html") + '">' +
      '<div class="pcard-photo">' + (photo ? '<img src="' + photo + '" alt="' + z.name + '" loading="lazy" />' : "") +
        '<div class="pcard-badges"><span class="badge">' + z.segment + "</span>" + badge2 + "</div></div>" +
      '<div class="pcard-body"><div class="pcard-info"><h3 class="pcard-name">' + z.name + "</h3>" +
        '<span class="pcard-loc"><span class="dot">' + z.district + "</span></span></div>" +
        '<span class="pcard-price">' + price + "</span></div></a>";
  }

  /* Координаты ЖК для карты — точки фирм из 2GIS (2026-06); Arlan = адресная (Бесагаш): 2GIS совпал на чужой «Арлан» */
  var ZK_COORDS = {
    atmosfera: [43.327372, 77.01886], aura: [43.358328, 77.131304], keruen: [43.35003, 77.065403],
    aqsai: [43.166429, 76.786037], bravo: [43.429754, 77.025929], discovery: [43.392434, 77.025802],
    monarch: [43.259488, 76.940266], arlan: [43.29903, 77.04075]
  };
  /* ТЗ 22.06 — грид планировок: КАЖДАЯ планировка отдельно (не группируя по комнатности),
     только доступные к продаже; у каждой свои комнатность/площадь/цена. Фильтр по комнатности — chips. */
  var PLAN_ROOM_ORDER = ["Студия", "1", "2", "3", "4", "5", "Таунхаус"];
  function plansGridHTML(plans, zname) {
    var rooms = [];
    plans.forEach(function (p) { if (rooms.indexOf(p.r) < 0) rooms.push(p.r); });
    rooms.sort(function (a, b) { var ia = PLAN_ROOM_ORDER.indexOf(a), ib = PLAN_ROOM_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    var chips = rooms.length > 1 ? '<div class="plans-filter"><button type="button" class="plans-chip is-on" data-prooms="*">Все</button>' +
      rooms.map(function (r) { return '<button type="button" class="plans-chip" data-prooms="' + r + '">' + roomLabel(r) + "</button>"; }).join("") + "</div>" : "";
    var cards = plans.map(function (p) {
      var area = (p.aMin && p.aMax && p.aMin !== p.aMax) ? p.aMin + "–" + p.aMax + " м²" : ((p.aMin || p.aMax || "") + " м²");
      return '<button type="button" class="plan-card" data-prooms-card="' + p.r + '" data-plans=\'' + JSON.stringify([catAsset(p.img)]) + '\' aria-label="Планировка ' + roomLabel(p.r) + '">' +
        '<span class="plan-card-img"><img src="' + catAsset(p.img) + '" alt="Планировка ' + roomLabel(p.r) + (zname ? " — " + zname : "") + '" loading="lazy"></span>' +
        '<span class="plan-card-body"><span class="plan-card-rooms">' + roomLabel(p.r) + '</span><span class="plan-card-area">' + area + '</span><span class="plan-card-price">от ' + money(p.price) + " ₸</span></span></button>";
    }).join("");
    return '<div class="plans-wrap">' + chips + '<div class="plans-grid">' + cards + "</div>" +
      '<div class="plans-more-wrap"><button type="button" class="btn btn-outline plans-more" hidden>Показать ещё</button></div></div>';
  }

  /* #61/#27 — на статических страницах ЖК заменяем таблицу цен на грид реальных планировок (Profitbase) */
  function enhanceZhkLayouts() {
    if (!/\/zk\//.test(location.pathname) || !window.ATAMURA_PLANS) return;
    var m = location.pathname.match(/\/zk\/([a-z0-9-]+)\.html/i);
    var slug = m ? m[1].toLowerCase() : null; if (!slug) return;
    var plans = window.ATAMURA_PLANS[slug];
    if (!plans || !plans.length) return;
    var tableWrap = document.querySelector(".zk-layouts-wrap"); if (!tableWrap) return;
    var grid = document.createElement("div"); grid.innerHTML = plansGridHTML(plans, "");
    var gridNode = grid.firstChild;
    tableWrap.parentNode.replaceChild(gridNode, tableWrap);
    // #177: форма заявки сразу после планировок на страницах ЖК (клон foot-cta)
    var footCta = document.querySelector(".foot-cta");
    if (footCta && !document.querySelector(".foot-cta--inline")) {
      var ctaClone = footCta.cloneNode(true);
      ctaClone.className = "foot-cta foot-cta--inline";
      gridNode.parentNode.insertBefore(ctaClone, gridNode.nextSibling);
    }
    // обновляем вводный абзац ("изображения пришлёт менеджер" -> рабочий текст)
    var ps = document.querySelectorAll("p.zk-lead");
    for (var i = 0; i < ps.length; i++) {
      if (/Изображения планировок|пришлёт менеджер/i.test(ps[i].textContent)) {
        ps[i].textContent = "Планировки квартир под вашу комнатность — площади и цены «от» из системы продаж ATAMURA. Нажмите на планировку, чтобы рассмотреть детально.";
        break;
      }
    }
  }

  /* ТЗ 22.06 — актуальная цена на статических карточках проектов = z.priceFrom (мин. доступная, из Profitbase) */
  function enhanceProjectPrices() {
    if (!window.ATAMURA_ZHK) return;
    var by = {}; window.ATAMURA_ZHK.forEach(function (z) { by[z.slug] = z; });
    var cards = document.querySelectorAll("a.pcard");
    for (var i = 0; i < cards.length; i++) {
      var hm = (cards[i].getAttribute("href") || "").match(/zk\/([a-z0-9-]+)\.html/);
      if (!hm) continue;
      var z = by[hm[1]]; if (!z || !z.priceFrom) continue;  // только продающиеся ЖК; «Скоро»/«Сдан» не трогаем
      var el = cards[i].querySelector(".pcard-price"); if (!el) continue;
      el.innerHTML = "от <strong>" + (z.priceFrom / 1000000).toFixed(z.priceFrom % 1000000 ? 1 : 0).replace(".", ",") + "</strong> млн ₸";
    }
  }

  /* #178/#179 — кнопки в мобильном drawer: «Заказать звонок» (форма) + «Написать на WhatsApp» */
  function enhanceDrawer() {
    var da = document.querySelector(".drawer-actions"); if (!da) return;
    var brand = da.querySelector(".btn-brand");
    if (brand) { brand.textContent = "Заказать звонок"; brand.setAttribute("data-open-lead", ""); brand.setAttribute("data-lead-source", "drawer"); brand.setAttribute("href", "#"); }
    var outline = da.querySelector(".btn-outline");
    if (outline) { outline.textContent = "Написать на WhatsApp"; }  // href уже wa.me
  }

  /* batch4 #160/#161/#162 — правки футера (на всех статических страницах) */
  function enhanceFooter() {
    var ul = document.querySelector(".foot-col-purchase ul"); if (!ul) return;
    var links = ul.querySelectorAll("li > a");
    for (var i = 0; i < links.length; i++) {
      var a = links[i], t = (a.textContent || "").trim();
      if (t === "Калькулятор ипотеки") a.textContent = "Ипотечный калькулятор";        // #161
      else if (t === "Ипотека") { var li = a.closest("li"); if (li) li.remove(); }       // #160 (дубль #mortgage)
      else if (t === "Запись на просмотр") { a.setAttribute("data-open-lead", ""); a.setAttribute("data-lead-source", "footer-zapis"); a.setAttribute("href", "#"); } // #162
    }
  }

  /* batch4 #149/#150-154 — на страницах ЖК: новое фото хиро AURA + кнопка скачивания презентации */
  function enhanceZhkExtras() {
    if (!/\/zk\//.test(location.pathname)) return;
    var m = location.pathname.match(/\/zk\/([a-z0-9-]+)\.html/i);
    var slug = m ? m[1].toLowerCase() : null; if (!slug) return;
    if (slug === "aura") {  // #149
      var hero = document.querySelector(".pagehero, .pagehero-zk");
      if (hero) hero.style.backgroundImage = "url(" + catAsset("assets/img/zhk/aura/hero149.jpg") + ")";
    }
    var PRES = { aura: 1, bravo: 1, atmosfera: 1, keruen: 1, aqsai: 1 };  // #150-154
    if (PRES[slug]) {
      var btn = document.querySelector(".catalog-card [data-open-catalog], .catalog-card .btn, .catalog-card button");
      if (btn) {
        var a = document.createElement("a");
        a.className = btn.className; a.textContent = "Скачать презентацию";
        a.setAttribute("href", catAsset("catalog/presentations/" + slug + ".pdf"));
        a.setAttribute("download", ""); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener");
        a.setAttribute("data-wa", "zk-presentation");
        btn.parentNode.replaceChild(a, btn);
      }
    }
  }

  /* ---------- Страница ЖК (детальная, рендер из window.ATAMURA_ZHK) ---------- */
  function renderZhkDetail() {
    var host = byId("zhk-detail"); if (!host || !window.ATAMURA_ZHK) return;
    var slug = host.getAttribute("data-slug");
    var z = window.ATAMURA_ZHK.filter(function (x) { return x.slug === slug; })[0];
    if (!z) { host.innerHTML = '<div class="wrap" style="padding:80px 0">Комплекс не найден. <a href="' + rel("index.html") + '#projects">Все ЖК</a></div>'; return; }
    document.title = "" + z.name + " — ATAMURA GROUP";

    var gal = []; if (z.hero_image) gal.push(z.hero_image); (z.gallery || []).forEach(function (g) { if (gal.indexOf(g) < 0) gal.push(g); });
    var heroImg = imgsrc(gal[0] || "");
    var galTiles = gal.slice(1, 6); while (galTiles.length < 4) galTiles.push(null);

    function featList(arr) { return (arr || []).map(function (h) {
      return '<div class="feat"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9l3.2 3.2L14 5.5"/></svg><span>' + h + "</span></div>";
    }).join(""); }
    function block(t, body) { return '<h2 class="zk-h2" style="margin-top:var(--s-7)">' + t + "</h2>" + body; }
    function featBlock(t, arr) { return arr.length ? block(t, '<div class="feat-grid">' + featList(arr) + "</div>") : ""; }
    function softBlock(t, text) { return block(t, '<div class="note">' + text + "</div>"); }
    /* Категоризация преимуществ ЖК по смысловым блокам (рекомендации маркетинга) */
    var H = z.highlights || [], arch = [], land = [], sec = [], other = [];
    H.forEach(function (h) {
      if (/монолит|газоблок|фиброцемент|фасад|каркас|архитектур|материал|потолк|панел|сейсм|кирпич|окна|этаж/i.test(h)) arch.push(h);
      else if (/видеонаблюд|охран|шлагбаум|закрыт|безопас|консьерж|периметр|ограждени|двер/i.test(h)) sec.push(h);
      else if (/двор|парк|площадк|озелен|благоустр|алле|прогул|сквер|зелён|зелен|forest|relax|воркаут|work|сезон|каток|\bсад/i.test(h)) land.push(h);
      else other.push(h);
    });
    var near = z.nearby || [];
    var mapQ = encodeURIComponent("" + z.name + " " + (z.address || z.district || "") + " Алматы");
    var _c = ZK_COORDS[slug]; var mapSrc = _c ? "https://www.openstreetmap.org/export/embed.html?bbox=" + (_c[1] - 0.019) + "," + (_c[0] - 0.009) + "," + (_c[1] + 0.019) + "," + (_c[0] + 0.009) + "&layer=mapnik&marker=" + _c[0] + "," + _c[1] : "";
    var locBlock = block("Локация",
      (z.address ? '<p class="zk-lead" style="margin-bottom:var(--s-4)"><strong>Адрес:</strong> ' + z.address + (z.district && z.address.indexOf(z.district) < 0 ? " · " + z.district : "") + "</p>" : "") +
      (mapSrc ? '<div class="zk-map"><iframe title="Карта — ' + z.name + '" src="' + mapSrc + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>' : "") +
      '<div class="zk-maplinks"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 1.6c2.9 0 5.3 2.4 5.3 5.3 0 4-5.3 9.5-5.3 9.5S3.7 10.9 3.7 6.9C3.7 4 6.1 1.6 9 1.6z"/><circle cx="9" cy="6.9" r="2"/></svg><span class="zk-maplinks-label">Открыть на карте:</span><a href="https://2gis.kz/almaty/search/' + mapQ + '" target="_blank" rel="noopener">2GIS</a><a href="https://www.google.com/maps/search/?api=1&query=' + mapQ + '" target="_blank" rel="noopener">Google&nbsp;Maps</a><a href="https://yandex.ru/maps/?text=' + mapQ + '" target="_blank" rel="noopener">Яндекс</a></div>' +
      (near.length ? '<h3 class="zk-h3">Инфраструктура и дорога</h3><div class="feat-grid">' + featList(near) + "</div>" : ""));
    // #61/#27 — «Планировочные решения»: планировки из Profitbase, фильтр по комнатности, цена + площадь
    var planBlock = (function () {
      var plans = (window.ATAMURA_PLANS || {})[slug];
      if (!plans || !plans.length) return softBlock("Генплан и планировки", "Генплан территории и планировки квартир под вашу комнатность пришлём по запросу — нажмите «Получить подборку», менеджер вышлет PDF.");
      return block("Планировочные решения", '<p class="zk-lead" style="margin-bottom:var(--s-4)">Доступные к продаже планировки — у каждой своя площадь и цена «от». Нажмите, чтобы рассмотреть детально.</p>' + plansGridHTML(plans, z.name));
    })();
    var catalogCard = '<div class="catalog-card">' +
      '<div class="catalog-card-text">' +
        '<h3>Каталог по ' + z.name + ' и соседним</h3>' +
        '<p>Цены, площади, ипотечные программы и рассрочка 0% — на одном PDF. Менеджер ATAMŪRA свяжется в WhatsApp в течение 7 минут.</p>' +
      '</div>' +
      '<button type="button" class="btn btn-accent" data-open-catalog data-catalog-source="zk-' + z.slug + '">Забрать каталог</button>' +
    '</div>';
    var progressBlock = softBlock("Ход строительства", "Фотоотчёт хода строительства обновляем регулярно — актуальные фото пришлёт менеджер, следите за обновлениями в Instagram @atamura.group.");
    var docsBlock = softBlock("Документы", "Разрешительные документы (проектная декларация, разрешение на строительство, договор) предоставляем по запросу в отделе продаж.");
    var blob = (H.join(" ") + " " + (z.description || "")).toLowerCase();
    var faqItems = [["Когда сдача комплекса?", z.status === "Сдан" ? "Дом сдан и заселён." : z.status === "Скоро" ? "Старт продаж — скоро. Оставьте заявку, сообщим о начале." : "Комплекс строится. Точные сроки сдачи (по очередям) подскажет менеджер."]];
    faqItems.push(["Какая форма оплаты и первый взнос?", "Ипотека (госпрограммы 7-20-25 и Отбасы «Наурыз»), рассрочка 0% от застройщика, ЕНПФ на первый взнос. Первый взнос — от 20% (по госпрограммам — от 10%)."]);
    if (/чернов/.test(blob)) faqItems.push(["Какая отделка?", "Квартиры сдаются с черновой отделкой."]);
    if (/паркинг|парков/.test(blob)) faqItems.push(["Есть ли паркинг?", "Да, на территории предусмотрены парковочные места."]);
    if (/сейсм/.test(blob)) faqItems.push(["Какая сейсмостойкость?", "Конструкция рассчитана на сейсмостойкость до 9 баллов."]);
    var schools = near.filter(function (n) { return /школ|садик|детский сад|детсад|гимназ|лице/i.test(n); });
    if (schools.length) faqItems.push(["Какие школы и садики рядом?", schools.join("; ") + "."]);
    faqItems.push(["Можно ли купить через ипотеку?", "Да — через банки-партнёры и госпрограммы. Калькулятор на сайте посчитает платёж, менеджер подберёт программу."]);
    faqItems.push(["Где находится отдел продаж?", "Алматы, ул. Толе би, 12 (и шоурумы у комплексов). Точный адрес для визита подскажет менеджер."]);
    var faqBlock = block("Вопросы и ответы", '<div class="faq-list">' + faqItems.map(function (q) { return '<details class="faq-item"><summary>' + q[0] + '</summary><div class="faq-a">' + q[1] + "</div></details>"; }).join("") + "</div>");
    /* H3 — отзыв жильца по этому ЖК, если есть */
    var rev = ZK_REVIEWS[slug];
    var revHTML = rev ? '<h2 class="zk-h2" style="margin-top:var(--s-7)">Отзыв жильца</h2>' +
      '<article class="review"><span class="review-stars">' + rev.stars + '</span><p>«' + rev.text + '»</p>' +
      '<div class="review-author"><div class="review-avatar">' + rev.av + '</div>' +
      '<div><div class="review-name">' + rev.name + '</div><div class="review-zk">' + rev.sub + '</div></div></div></article>' : "";
    /* H1 — оценка платежа по 7-20-25 от стартовой цены ЖК */
    var payHTML = z.priceFrom ? '<div style="background:var(--bg);border:1px solid var(--line);border-radius:var(--r-md);padding:12px 14px;margin-bottom:var(--s-3);font-size:14px">Ипотека по <strong>7-20-25</strong> — от <strong>' + money(payment72025(z.priceFrom)) + ' ₸/мес</strong><br><span style="font-size:12px;color:var(--ink-soft)">первый взнос 20%, срок 25 лет · ориентир, точную ставку подтверждает банк</span></div>' : "";
    var trustLine = '<div style="margin-top:12px;font-size:12px;color:var(--ink-soft);text-align:center">10 лет на рынке · 2000+ семей · гарант сделки КЖК</div>';
    var roomChips = (z.rooms || []).map(function (r) { return '<span class="chip" style="display:inline-flex;align-items:center;height:34px;padding:0 14px;border-radius:999px;background:var(--bg);border:1px solid var(--line);font-weight:600;font-size:13px;margin-right:6px">' + r + (/^\d+$/.test(r) ? "-комн." : "") + "</span>"; }).join("");
    var stats = [
      { v: priceLabel(z), l: "Стартовая цена" },
      { v: (z.rooms || []).join(" · "), l: "Планировки" },
      { v: z.status || "—", l: "Статус" },
      { v: z.segment || "—", l: "Класс" }
    ].map(function (s) { return '<div class="zk-stat"><strong>' + s.v + "</strong><span>" + s.l + "</span></div>"; }).join("");
    var others = window.ATAMURA_ZHK.filter(function (x) { return x.slug !== slug; }).slice(0, 3).map(pcard).join("");

    host.innerHTML =
      '<section class="pagehero" style="' + (heroImg ? "background-image:linear-gradient(180deg, oklch(0% 0 0 /.18) 0%, oklch(0% 0 0 /.62) 100%), url(" + heroImg + ")" : "background-color:var(--dark-cta)") + '">' +
        '<div class="wrap pagehero-inner">' +
          '<nav class="crumbs"><a href="' + rel("index.html") + '">Главная</a><span>›</span><a href="' + rel("index.html") + '#projects">Жилые комплексы</a><span>›</span>' + z.name + "</nav>" +
          '<div class="pagehero-badges">' + (z.segment ? '<span class="badge is-light">' + z.segment + "</span>" : "") + (z.status ? '<span class="badge is-accent">' + z.status + "</span>" : "") + "</div>" +
          '<h1 class="pagehero-title">' + z.name + "</h1>" +
          '<p class="pagehero-sub">' + (z.tagline || "") + " · " + z.district + "</p>" +
          '<div class="pagehero-cta"><a class="btn btn-accent" href="#zk-form">Узнать цены и планировки</a>' +
            (z.draft ? "" : '<a class="btn btn-light" href="' + z.site + '" target="_blank" rel="noopener">Текущий сайт ЖК</a>') + "</div>" +
        "</div></section>" +
      '<section class="zk-section"><div class="wrap">' +
        '<div class="zk-stats">' + stats + "</div>" +
        '<div class="zk-layout">' +
          '<div class="zk-main">' +
            '<div class="zk-gallery">' + galTiles.map(function (u) { return u ? '<div class="zk-gtile"><img src="' + imgsrc(u) + '" alt="' + z.name + '" loading="lazy"></div>' : '<div class="zk-gtile is-ph"></div>'; }).join("") + "</div>" +
            '<h2 class="zk-h2">О комплексе</h2><p class="zk-lead">' + (z.description || "") + "</p>" +
            '<div style="margin-top:var(--s-4)">' + roomChips + "</div>" +
            (z.draft ? '<div class="note">Фото комплекса — иллюстративные: финальные рендеры добавим позже. Описание и характеристики — по данным застройщика.</div>' : "") +
            locBlock +
            planBlock +
            catalogCard +
            featBlock("Архитектура и материалы", arch) +
            featBlock("Благоустройство", land) +
            featBlock("Безопасность", sec) +
            featBlock("Преимущества", other) +
            progressBlock +
            docsBlock +
            revHTML +
            faqBlock +
          "</div>" +
          '<aside class="zk-aside" id="zk-form"><div class="zk-card">' +
            '<div class="zk-card-price">' + priceLabel(z) + "</div>" +
            (z.address ? '<div class="zk-card-addr" style="font-size:13px;color:var(--ink-soft);margin-top:6px;display:flex;gap:6px"><svg width="15" height="15" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M9 1.6c2.9 0 5.3 2.4 5.3 5.3 0 4-5.3 9.5-5.3 9.5S3.7 10.9 3.7 6.9C3.7 4 6.1 1.6 9 1.6z"/><circle cx="9" cy="6.9" r="2"/></svg><span>' + z.address + "</span></div>" : "") +
            payHTML +
            '<div class="zk-card-note">Менеджер пришлёт подборку планировок и точный расчёт под ваш бюджет.</div>' +
            '<form class="lead-form" data-form="zk-' + z.slug + '">' +
              '<input class="input-pill" name="name" aria-label="Ваше имя" placeholder="Ваше имя" />' +
              '<input class="input-pill" name="phone" type="tel" required aria-label="Номер телефона" placeholder="+7 (___) ___-__-__" />' +
              '<button class="btn btn-brand" type="submit">Получить подборку →</button>' +
              '<p class="popup-fineprint">Нажимая кнопку, вы соглашаетесь с обработкой данных.</p>' +
            "</form>" + trustLine + "</div></aside>" +
        "</div>" +
        '<div class="zk-similar"><div class="reviews-head"><h2 class="zk-h2">Другие комплексы</h2>' +
          '<a class="btn btn-outline" href="' + rel("index.html") + '#projects">Все ЖК →</a></div><div class="grid-3">' + others + "</div></div>" +
      "</div></section>";
    bindForms(host);
  }

  /* ---------- Живой каталог квартир (/flats) ---------- */
  var FAV_KEY = "atamura_fav";
  function getFav() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); } catch (e) { return []; } }
  function setFav(a) { try { localStorage.setItem(FAV_KEY, JSON.stringify(a)); } catch (e) {} }
  function toggleFav(id) { var f = getFav(), i = f.indexOf(id); if (i < 0) f.push(id); else f.splice(i, 1); setFav(f); return i < 0; }
  function flatId(f) { return f.zk + "_" + f.rooms; }            // тип-уровень: ЖК × комнатность
  function isFav(f) { return getFav().indexOf(flatId(f)) >= 0; }
  function favCount() { return getFav().length; }
  /* Бейдж-счётчик в шапочной иконке «избранное» (на всех страницах) + счётчик в каталоге */
  function paintFavCount() {
    var n = favCount();
    document.querySelectorAll(".fav-count").forEach(function (b) { b.textContent = n ? String(n) : ""; });
    var cn = byId("cat-fav-n"); if (cn) cn.textContent = n ? " (" + n + ")" : "";
  }
  function bindFavCount() {
    document.querySelectorAll('a.icon-btn[href*="fav=1"]').forEach(function (a) {
      if (!a.querySelector(".fav-count")) { var s = document.createElement("span"); s.className = "fav-count"; a.appendChild(s); }
    });
    paintFavCount();
  }

  function roomLabel(r) {
    if (r === "Студия") return "Студии";
    if (r === "Таунхаус") return "Таунхаусы";
    if (r === "Дуплекс") return "Дуплексы";
    if (r === "Коттедж") return "Коттеджи";
    if (/^\d+$/.test(r)) return r + "-комнатные";
    return r;
  }
  var ROOM_ORDER = ["Студия", "1", "2", "3", "4", "Дуплекс", "Таунхаус", "Коттедж"];

  function flatCard(f) {
    var rl = roomLabel(f.rooms);
    var area = f.areaMin === f.areaMax ? f.areaMin + " м²" : f.areaMin + "–" + f.areaMax + " м²";
    var img = f.image ? '<img src="' + catAsset(f.image) + '" alt="' + rl + ' в ' + f.zkName + '" loading="lazy">' : "";
    var srok = f.srok ? '<span class="flat-status">' + f.srok + "</span>" : "";
    var fplans = ((window.ATAMURA_PLANS || {})[f.zk] || []).filter(function (p) { return p.r === f.rooms; }).map(function (p) { return catAsset(p.img); });
    var pN = fplans.length;
    var pW = pN % 10 === 1 && pN % 100 !== 11 ? "планировка" : (pN % 10 >= 2 && pN % 10 <= 4 && (pN % 100 < 10 || pN % 100 >= 20) ? "планировки" : "планировок");
    var plansBtn = pN ? '<button class="flat-plans" type="button" data-plans=\'' + JSON.stringify(fplans) + '\' aria-label="Смотреть планировки ' + rl + '">' +
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M9 9v12"/></svg>' +
      pN + " " + pW + "</button>" : "";
    var waText = "Здравствуйте! Меня заинтересовала квартира в «" + f.zkName + "». Планировка: " + rl + ". Площадь: " + area + ". Стоимость: от " + money(f.priceFrom) + " ₸. Подскажите, пожалуйста, актуальна ли эта квартира и какие есть условия покупки?";
    var fid = flatId(f), isf = isFav(f);
    var heart = '<button class="flat-fav' + (isf ? ' is-on' : '') + '" type="button" data-fav="' + fid + '" aria-pressed="' + (isf ? 'true' : 'false') + '" aria-label="' + (isf ? 'Убрать из избранного' : 'В избранное') + '"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></button>';
    return '<article class="flat" data-zk="' + f.zk + '">' + heart +
      '<a class="flat-photo" href="' + rel("zk/" + f.zk + ".html") + '">' + img + srok + plansBtn + "</a>" +
      '<div class="flat-body">' +
        '<div class="flat-head"><span class="flat-rooms">' + rl + '</span><span class="flat-area">' + area + "</span></div>" +
        '<div class="flat-price"><strong>от ' + money(f.priceFrom) + ' ₸</strong><span>взнос 20% → от ' + money(f.payFrom) + " ₸/мес · 7-20-25</span></div>" +
        '<div class="flat-meta"><span>' + f.zkName + '</span><span>·</span><span>' + f.segment + "</span></div>" +
        '<div class="flat-actions">' +
          '<a class="btn btn-brand btn-sm" href="https://wa.me/' + WA_PHONE + "?text=" + encodeURIComponent(waText) + '" target="_blank" rel="noopener" data-wa="catalog-plan">Получить консультацию</a>' +
          '<a class="btn btn-outline btn-sm" href="' + rel("zk/" + f.zk + ".html") + '">Подробнее о ЖК</a>' +
        "</div>" +
      "</div></article>";
  }

  function renderCatalog() {
    var root = byId("catalog"); if (!root || !window.ATAMURA_FLATS) return;
    var ALL = window.ATAMURA_FLATS.slice();
    /* Типы из строящихся ЖК без цены (Amaia/Dion → «Дуплекс»): показываем как опцию, но без выдуманных квартир.
       UPCOMING[room] = [{slug,name}] — нужные ЖК для честного экрана «скоро». */
    var UPCOMING = {};
    (window.ATAMURA_ZHK || []).forEach(function (z) {
      if (z.status === "Скоро" && !ALL.some(function (f) { return f.zk === z.slug; })) (z.rooms || []).forEach(function (r) {
        if (!ALL.some(function (f) { return f.rooms === r; })) { (UPCOMING[r] = UPCOMING[r] || []).push({ slug: z.slug, name: z.name }); }
      });
    });
    var prices = ALL.map(function (f) { return f.priceFrom; });
    var PMIN = Math.min.apply(null, prices), PMAX = Math.max.apply(null, prices);
    var FINISH_ZK = ["aura", "aqsai"]; // #13: ЖК с чистовой отделкой «под ключ» (по премиум-карточке «Опция в Aura и Aqsai Resort»)
    var state = { rooms: [], zk: "", pmax: PMAX, deal: "", srok: "", sort: "price-asc", fav: false, finish: false };

    var q = new URLSearchParams(location.search);
    if (q.get("rooms")) state.rooms = q.get("rooms").split(",").filter(Boolean);
    if (q.get("zk")) state.zk = q.get("zk");
    if (q.get("pmax")) state.pmax = +q.get("pmax") || PMAX;
    if (q.get("deal")) state.deal = q.get("deal");
    if (q.get("srok")) state.srok = q.get("srok");
    if (q.get("sort")) state.sort = q.get("sort");
    if (q.get("fav")) state.fav = true;
    if (q.get("finish")) state.finish = true;

    var ROOM_OPTS = ROOM_ORDER.filter(function (r) { return ALL.some(function (f) { return f.rooms === r; }) || UPCOMING[r]; });
    var ZK_OPTS = []; ALL.forEach(function (f) { if (!ZK_OPTS.some(function (z) { return z.slug === f.zk; })) ZK_OPTS.push({ slug: f.zk, name: f.zkName }); });
    var SROK_OPTS = []; ALL.forEach(function (f) { if (f.srok && SROK_OPTS.indexOf(f.srok) < 0) SROK_OPTS.push(f.srok); });

    root.innerHTML =
      '<div class="cat-bar">' +
        '<div class="cat-field cat-field-rooms"><label>Комнатность</label><div class="cat-chips" id="cat-rooms">' +
          ROOM_OPTS.map(function (r) { return '<button class="cat-chip" type="button" data-room="' + r + '">' + r + "</button>"; }).join("") +
        "</div></div>" +
        '<div class="cat-field"><label>Жилой комплекс</label><select id="cat-zk"><option value="">Все ЖК</option>' +
          ZK_OPTS.map(function (z) { return '<option value="' + z.slug + '">' + z.name + "</option>"; }).join("") + "</select></div>" +
        '<div class="cat-field"><label>Способ покупки</label><select id="cat-deal"><option value="">Любой</option><option value="Ипотека">Ипотека</option><option value="Рассрочка">Рассрочка</option><option value="7-20-25">7-20-25</option></select></div>' +
        '<div class="cat-field"><label>Срок сдачи</label><select id="cat-srok"><option value="">Любой</option>' +
          SROK_OPTS.map(function (s) { return '<option value="' + s + '">' + s + "</option>"; }).join("") + "</select></div>" +
        '<div class="cat-field cat-field-wide"><label>Бюджет до <output id="cat-pmax-v"></output></label><input type="range" id="cat-pmax" min="' + PMIN + '" max="' + PMAX + '" step="500000" value="' + state.pmax + '"></div>' +
        '<div class="cat-field cat-field-finish"><label>Отделка</label><button class="cat-chip" type="button" id="cat-finish" aria-pressed="false">Чистовая под ключ</button></div>' +
        '<div class="cat-field"><label>Сортировка</label><select id="cat-sort"><option value="price-asc">Сначала дешевле</option><option value="price-desc">Сначала дороже</option><option value="area-desc">Больше площадь</option></select></div>' +
        '<button class="cat-reset" type="button" id="cat-reset">Сбросить</button>' +
      "</div>" +
      '<div class="cat-head"><div class="cat-head-l"><h2 class="cat-count" id="cat-count" aria-live="polite"></h2>' +
        '<p class="cat-note">Цена — «от». Точную стоимость и подходящие квартиры подберёт менеджер.</p></div>' +
        '<button class="cat-fav-toggle" type="button" id="cat-fav" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>Избранное<span class="cat-fav-n" id="cat-fav-n"></span></button></div>' +
      '<div class="cat-grid" id="cat-grid"></div>' +
      '<div class="cat-empty" id="cat-empty" hidden><span id="cat-empty-msg">Под эти параметры вариантов нет.</span> <a class="btn btn-outline btn-sm" id="cat-empty-link" hidden></a></div>' +
      '<div class="cat-more-wrap"><button class="btn btn-outline cat-more" type="button" id="cat-more" hidden>Показать ещё</button></div>';

    var grid = byId("cat-grid"), count = byId("cat-count"), empty = byId("cat-empty"), moreBtn = byId("cat-more");
    /* #129: пагинация каталога — по 8 карточек, «Показать ещё» открывает следующие 8 */
    var SHOW_STEP = 8, shown = SHOW_STEP, lastList = [];
    function paintGrid() {
      grid.innerHTML = lastList.slice(0, shown).map(flatCard).join("");
      if (moreBtn) moreBtn.hidden = lastList.length <= shown;
    }
    if (moreBtn) moreBtn.addEventListener("click", function () { shown += SHOW_STEP; paintGrid(); });
    var pmaxR = byId("cat-pmax"), pmaxV = byId("cat-pmax-v"), zkS = byId("cat-zk"), dealS = byId("cat-deal"), srokS = byId("cat-srok"), sortS = byId("cat-sort");

    function syncControls() {
      zkS.value = state.zk; dealS.value = state.deal; srokS.value = state.srok; sortS.value = state.sort; pmaxR.value = state.pmax;
      pmaxV.textContent = money(state.pmax) + " ₸";
      byId("cat-rooms").querySelectorAll(".cat-chip").forEach(function (b) { b.classList.toggle("is-on", state.rooms.indexOf(b.getAttribute("data-room")) >= 0); });
      var cf = byId("cat-finish"); if (cf) { cf.classList.toggle("is-on", state.finish); cf.setAttribute("aria-pressed", state.finish ? "true" : "false"); }
      var ft = byId("cat-fav"); if (ft) { ft.classList.toggle("is-on", state.fav); ft.setAttribute("aria-pressed", state.fav ? "true" : "false"); }
    }
    function writeURL() {
      var p = new URLSearchParams();
      if (state.rooms.length) p.set("rooms", state.rooms.join(","));
      if (state.zk) p.set("zk", state.zk);
      if (state.deal) p.set("deal", state.deal);
      if (state.srok) p.set("srok", state.srok);
      if (state.pmax < PMAX) p.set("pmax", state.pmax);
      if (state.sort !== "price-asc") p.set("sort", state.sort);
      if (state.fav) p.set("fav", "1");
      if (state.finish) p.set("finish", "1");
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p.toString() : ""));
    }
    function apply() {
      var favs = getFav();
      var list = ALL.filter(function (f) {
        if (state.fav && favs.indexOf(flatId(f)) < 0) return false;
        if (state.rooms.length && state.rooms.indexOf(f.rooms) < 0) return false;
        if (state.zk && f.zk !== state.zk) return false;
        if (state.deal && (f.deal || []).indexOf(state.deal) < 0) return false;
        if (state.srok && f.srok !== state.srok) return false;
        if (f.priceFrom > state.pmax) return false;
        if (state.finish && FINISH_ZK.indexOf(f.zk) < 0) return false;
        return true;
      });
      list.sort(function (a, b) {
        if (state.sort === "price-desc") return b.priceFrom - a.priceFrom;
        if (state.sort === "area-desc") return b.areaMax - a.areaMax;
        return a.priceFrom - b.priceFrom;
      });
      count.textContent = list.length + " " + plural(list.length, "вариант", "варианта", "вариантов");
      shown = SHOW_STEP; lastList = list; paintGrid();
      empty.hidden = list.length > 0;
      grid.hidden = list.length === 0;
      var em = byId("cat-empty-msg"), elink = byId("cat-empty-link");
      var upRoom = state.rooms.filter(function (r) { return UPCOMING[r]; })[0];
      if (state.fav && favs.length === 0) {
        if (em) em.textContent = "В избранном пока пусто — нажимайте ♥ на карточках квартир, чтобы сохранить.";
        if (elink) elink.hidden = true;
      } else if (list.length === 0 && upRoom) {
        var zs = UPCOMING[upRoom];
        if (em) em.textContent = roomLabel(upRoom) + " — в новых " + zs.map(function (z) { return z.name; }).join(" и ") + ". Старт продаж скоро — оставьте заявку, сообщим первыми.";
        if (elink) { elink.hidden = false; elink.textContent = "Смотреть " + zs[0].name; elink.setAttribute("href", rel("zk/" + zs[0].slug + ".html")); }
      } else {
        if (em) em.textContent = "";
        if (elink) elink.hidden = true;
      }
      writeURL();
      paintFavCount();
    }

    byId("cat-rooms").addEventListener("click", function (e) {
      var b = e.target.closest(".cat-chip"); if (!b) return;
      var r = b.getAttribute("data-room"), i = state.rooms.indexOf(r);
      if (i < 0) state.rooms.push(r); else state.rooms.splice(i, 1);
      b.classList.toggle("is-on"); apply();
    });
    pmaxR.addEventListener("input", function () { state.pmax = +pmaxR.value; pmaxV.textContent = money(state.pmax) + " ₸"; apply(); });
    zkS.addEventListener("change", function () { state.zk = zkS.value; apply(); });
    dealS.addEventListener("change", function () { state.deal = dealS.value; apply(); });
    srokS.addEventListener("change", function () { state.srok = srokS.value; apply(); });
    sortS.addEventListener("change", function () { state.sort = sortS.value; apply(); });
    var finBtn = byId("cat-finish"); if (finBtn) finBtn.addEventListener("click", function () { state.finish = !state.finish; finBtn.classList.toggle("is-on", state.finish); finBtn.setAttribute("aria-pressed", state.finish ? "true" : "false"); apply(); });
    byId("cat-reset").addEventListener("click", function () { state = { rooms: [], zk: "", pmax: PMAX, deal: "", srok: "", sort: "price-asc", fav: false, finish: false }; syncControls(); apply(); });
    var catEmptyReset = byId("cat-empty-reset"); if (catEmptyReset) catEmptyReset.addEventListener("click", function () { byId("cat-reset").click(); });
    grid.addEventListener("click", function (e) {
      var favBtn = e.target.closest(".flat-fav");
      if (favBtn) {
        var on = toggleFav(favBtn.getAttribute("data-fav"));
        favBtn.classList.toggle("is-on", on);
        favBtn.setAttribute("aria-pressed", on ? "true" : "false");
        favBtn.setAttribute("aria-label", on ? "Убрать из избранного" : "В избранное");
        track("fav_toggle", { on: on ? 1 : 0 });
        paintFavCount();
        if (state.fav && !on) apply();   // в режиме «избранное» убрать снятую карточку из списка
        return;
      }
      if (e.target.closest("[data-wa]")) track("whatsapp_click", { source: "catalog" });
    });
    byId("cat-fav").addEventListener("click", function () {
      state.fav = !state.fav;
      this.classList.toggle("is-on", state.fav);
      this.setAttribute("aria-pressed", state.fav ? "true" : "false");
      apply();
    });

    syncControls(); apply();
  }

  /* ---------- ИИ-помощник → WhatsApp (заглушка: текст уходит менеджеру в WhatsApp) ---------- */
  function bindAiHelper() {
    var box = document.querySelector(".ai-helper");
    var floatAi = document.querySelector(".float-btn.is-ai");
    if (floatAi && !floatAi.dataset.bound) {
      floatAi.dataset.bound = "1";
      floatAi.addEventListener("click", function () {
        if (box) { box.scrollIntoView({ behavior: "smooth", block: "center" }); var i = box.querySelector(".ai-input"); if (i) setTimeout(function () { i.focus(); }, 450); }
        else { track("whatsapp_click", { source: "float_ai" }); window.open("https://wa.me/" + WA_PHONE + "?text=" + encodeURIComponent("Здравствуйте! Помогите подобрать квартиру под бюджет."), "_blank", "noopener"); }
      });
    }
    if (!box) return;
    var input = box.querySelector(".ai-input"), send = box.querySelector(".ai-send");
    function go() {
      var v = (input && input.value || "").trim();
      var text = v ? "Здравствуйте! Ищу квартиру: " + v : "Здравствуйте! Помогите подобрать квартиру под бюджет.";
      track("whatsapp_click", { source: "ai_helper", has_query: v ? 1 : 0 });
      window.open("https://wa.me/" + WA_PHONE + "?text=" + encodeURIComponent(text), "_blank", "noopener");
    }
    if (send) send.addEventListener("click", go);
    if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); go(); } });
    box.querySelectorAll(".ai-prompt").forEach(function (b) {
      b.addEventListener("click", function () { if (input) { input.value = b.textContent.trim(); input.focus(); } });
    });
  }

  /* ---------- Скролл-анимации (GSAP, прогрессивно; пропускаем при reduced-motion) ---------- */
  function bindScrollAnim() {
    if (!window.gsap || !window.ScrollTrigger) return;                 // нет GSAP → контент остаётся статичным и видимым
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var gsap = window.gsap, ST = window.ScrollTrigger;
    gsap.registerPlugin(ST);
    // Появление повторяющихся блоков. Только opacity/transform → без CLS. Hero-текст не трогаем → без вреда LCP.
    var reveal = ".trust-cell, .pcard, .buy-card, .review, .news-card, .premium-card, .feat, .zk-stat, .flat";
    if (document.querySelector(reveal)) {
      gsap.set(reveal, { opacity: 0, y: 22 });
      ST.batch(reveal, {
        start: "top 90%", once: true,
        onEnter: function (batch) { gsap.to(batch, { opacity: 1, y: 0, duration: 0.5, stagger: 0.06, ease: "power2.out", overwrite: true }); }
      });
    }
    // Лёгкий параллакс фоновых картинок героя (LCP-текст остаётся на месте)
    gsap.utils.toArray(".hero .teaser-bg").forEach(function (bg) {
      gsap.to(bg, { yPercent: 8, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
    });
    window.addEventListener("load", function () { ST.refresh(); });
  }

  /* ---------- Липкая шапка: прозрачная над фото → плотная при скролле ---------- */
  function bindStickyHeader() {
    var head = document.querySelector(".head.over"); if (!head) return;
    var hero = document.querySelector(".home-hero");
    function thr() { return hero ? Math.max(120, hero.offsetHeight - 90) : 200; }
    var t = thr(), stuck = false;
    function onScroll() { var s = window.scrollY > t; if (s !== stuck) { stuck = s; head.classList.toggle("is-stuck", s); } }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function () { t = thr(); onScroll(); });
    onScroll();
  }

  /* ---------- Слайдер фонов героя (фото ЖК, кроссфейд) ---------- */
  function bindHeroSlider() {
    var box = byId("heroSlider"); if (!box) return;
    var slides = [].slice.call(box.querySelectorAll(".hh-slide"));
    if (slides.length < 2) return;
    var nameEl = document.querySelector(".hh-name");
    var dots = [].slice.call(document.querySelectorAll(".hh-dots button"));
    var i = 0, timer = null;
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    function show(n) {
      slides[i].classList.remove("is-on"); if (dots[i]) dots[i].classList.remove("on");
      i = (n + slides.length) % slides.length;
      slides[i].classList.add("is-on"); if (dots[i]) dots[i].classList.add("on");
      if (nameEl) nameEl.textContent = slides[i].getAttribute("data-name") || "";
    }
    function start() { if (reduce) return; stop(); timer = setInterval(function () { show(i + 1); }, 5000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    dots.forEach(function (d) { d.addEventListener("click", function () { show(+d.getAttribute("data-i")); start(); }); });
    box.addEventListener("mouseenter", stop); box.addEventListener("mouseleave", start);
    start();
  }

  /* ---------- Активный пункт меню («вы здесь») ---------- */
  function bindActiveNav() {
    var f = (location.pathname.split("/").pop() || "index.html");
    var map = { "flats.html": "flats.html", "o-kompanii.html": "o-kompanii.html", "contacts.html": "contacts.html" };
    var key = map[f] || "index.html#projects";
    document.querySelectorAll(".nav-main a").forEach(function (a) {
      if ((a.getAttribute("href") || "").indexOf(key) >= 0) { a.setAttribute("aria-current", "page"); a.classList.add("is-active"); }
    });
  }

  /* ---------- Инлайн-поиск в герое ---------- */
  function bindHeroSearch() {
    var hs = document.querySelector(".herosearch"); if (!hs) return;
    var picked = [], go = byId("hs-go"), zk = hs.querySelector('select[name="zk"]'), pmax = hs.querySelector('select[name="pmax"]');
    function build() {
      var p = new URLSearchParams();
      if (picked.length) p.set("rooms", picked.join(","));
      if (zk && zk.value) p.set("zk", zk.value);
      if (pmax && pmax.value) p.set("pmax", pmax.value);
      go.setAttribute("href", "flats.html" + (p.toString() ? "?" + p.toString() : ""));
    }
    hs.querySelectorAll(".hs-chip").forEach(function (b) {
      b.addEventListener("click", function () {
        var r = b.getAttribute("data-r"), i = picked.indexOf(r);
        if (i < 0) picked.push(r); else picked.splice(i, 1);
        b.classList.toggle("is-on"); build();
      });
    });
    if (zk) zk.addEventListener("change", build);
    if (pmax) pmax.addEventListener("change", build);
    build();
  }

  /* ---------- Тост (короткое ненавязчивое уведомление) ---------- */
  var _toastTimer = null;
  function toast(msg) {
    var t = byId("app-toast");
    if (!t) { t = document.createElement("div"); t.id = "app-toast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(function () { t.classList.add("is-on"); });
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(function () { t.classList.remove("is-on"); }, 3200);
  }

  /* ---------- Переключатель языка Рус / Qaz ----------
     Перевод выполняется в рантайме по СОДЕРЖИМОМУ текстовых узлов и ряда атрибутов:
     словарь window.__I18N_KK__ = { ru_текст: kk_текст } (assets/js/i18n_kk.js, генерится gen_i18n.mjs).
     Подход покрывает статику, SSR и JS-рендер (renderZhkDetail/renderCatalog/flatCard) единым механизмом —
     без data-i18n в разметке. Динамический контент ловит MutationObserver. Выбор хранится в localStorage. */
  var LANG_KEY = "atamura_lang";
  function bindLang() {
    var DICT = window.__I18N_KK__ || {};
    var HAS_DICT = false; for (var _k in DICT) { if (DICT.hasOwnProperty(_k)) { HAS_DICT = true; break; } }
    var ATTRS = ["aria-label", "placeholder", "title", "alt"];
    var origText = new WeakMap();   // textNode -> исходный ru (с пробелами)
    var origAttr = new WeakMap();   // element  -> { attr: исходный ru }
    var lang = "ru";
    var NBSP = new RegExp(String.fromCharCode(160), "g");
    function norm(s) { return s.replace(NBSP, " "); }   // &nbsp; → обычный пробел для поиска по словарю
    // Шаблонные строки с интерполяцией (число/бренд внутри) — словарём не ловятся, переводим по паттерну.
    var PAT = [
      { re: /^([0-9 ]+)\s*вариант(?:а|ов)?$/, kk: function (m) { return m[1].replace(/\s+$/, "") + " нұсқа"; } },
      { re: /^взнос 20% → от (.+) ₸\/мес$/, kk: function (m) { return "20% жарна → " + m[1] + " ₸/айдан"; } },
      { re: /^от (.+) млн ₸$/, kk: function (m) { return m[1] + " млн ₸-ден"; } },
      { re: /^от (.+) ₸$/, kk: function (m) { return m[1] + " ₸-ден"; } },
      { re: /^(\d+)-комнатные в ЖК (.+)$/, kk: function (m) { return m[2] + " ТҮК-тегі " + m[1] + " бөлмелі"; } },
      { re: /^Студии в ЖК (.+)$/, kk: function (m) { return m[1] + " ТҮК-тегі студиялар"; } },
      { re: /^Таунхаусы в ЖК (.+)$/, kk: function (m) { return m[1] + " ТҮК-тегі таунхаустар"; } },
      { re: /^Дуплексы в ЖК (.+)$/, kk: function (m) { return m[1] + " ТҮК-тегі дуплекстер"; } },
      { re: /^Коттеджи в ЖК (.+)$/, kk: function (m) { return m[1] + " ТҮК-тегі коттедждер"; } },
      { re: /^Смотреть ЖК (.+)$/, kk: function (m) { return m[1] + " ТҮК-ті қарау"; } },
      { re: /^Заём (.+) ₸ выше лимита «Наурыз» для Алматы \(36 млн ₸\)\. Увеличьте первый взнос\.$/, kk: function (m) { return m[1] + " ₸ қарыз Алматы үшін «Наурыз» лимитінен (36 млн ₸) асады. Бастапқы жарнаны арттырыңыз."; } },
      { re: /^(.+) — в новых ЖК (.+)\. Старт продаж скоро — оставьте заявку, сообщим первыми\.$/, kk: function (m) { return (lookupKK(m[1]) || m[1]) + " — жаңа " + m[2].replace(/ и /g, " және ") + " ТҮК-терінде. Сатылым жақында басталады — өтінім қалдырыңыз, бірінші хабарлаймыз."; } }
    ];
    // Поиск перевода: словарь → паттерн → составная строка через « · » (переводим части).
    function lookupKK(t) {
      var d = DICT[t]; if (d != null) return d;
      for (var i = 0; i < PAT.length; i++) { var m = t.match(PAT[i].re); if (m) return PAT[i].kk(m); }
      if (t.indexOf(" · ") >= 0) {
        var changed = false;
        var tr = t.split(" · ").map(function (p) { var r = lookupKK(p); if (r != null && r !== p) { changed = true; return r; } return p; });
        if (changed) return tr.join(" · ");
      }
      return null;
    }

    function tnTranslate(node, toKK) {
      var raw = node.nodeValue; if (!raw) return;
      var t = raw.trim(); if (!t) return;
      if (toKK) {
        var look = norm(t);
        var kk = lookupKK(look);
        if (kk && kk !== look && !origText.has(node)) { origText.set(node, raw); node.nodeValue = raw.replace(t, kk); }
      } else if (origText.has(node)) {
        node.nodeValue = origText.get(node); origText["delete"](node);
      }
    }
    function elTranslate(el, toKK) {
      if (!el || el.nodeType !== 1 || !el.getAttribute) return;
      for (var i = 0; i < ATTRS.length; i++) {
        var a = ATTRS[i]; if (!el.hasAttribute(a)) continue;
        if (toKK) {
          var raw = el.getAttribute(a), t = (raw || "").trim(); if (!t) continue;
          var look = norm(t), kk = lookupKK(look);
          if (kk && kk !== look) { var s = origAttr.get(el) || {}; if (!(a in s)) { s[a] = raw; origAttr.set(el, s); el.setAttribute(a, raw.replace(t, kk)); } }
        } else { var st = origAttr.get(el); if (st && a in st) { el.setAttribute(a, st[a]); delete st[a]; } }
      }
    }
    function walk(root, toKK) {
      if (root.nodeType === 3) { tnTranslate(root, toKK); return; }
      if (root.nodeType !== 1) return;
      var tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName; if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return NodeFilter.FILTER_REJECT;
          return (n.nodeValue && n.nodeValue.trim()) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
        }
      });
      var n; while ((n = tw.nextNode())) tnTranslate(n, toKK);
      elTranslate(root, toKK);
      var els = root.querySelectorAll("*");
      for (var i = 0; i < els.length; i++) elTranslate(els[i], toKK);
    }
    function setLang(next) {
      lang = next;
      document.documentElement.lang = next;
      if (document.body) walk(document.body, next === "kk");
      [].forEach.call(document.querySelectorAll(".lang-opt"), function (b) {
        b.setAttribute("aria-pressed", b.getAttribute("data-lang") === next ? "true" : "false");
      });
      try { localStorage.setItem(LANG_KEY, next); } catch (e) {}
    }

    document.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest(".lang-opt"); if (!b) return;
      var L = b.getAttribute("data-lang");
      if (L === "kk" && !HAS_DICT) { toast("Қазақ нұсқасы — жақында. Словарь не загрузился."); return; }
      setLang(L);
      if (L === "kk") track("lang_kk_click", {});
    });

    // Восстанавливаем выбор пользователя
    var saved = null; try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
    if ((saved === "kk" || /(^|\/)kk\//.test(location.pathname)) && HAS_DICT) setLang("kk");
    else { document.documentElement.lang = "ru"; [].forEach.call(document.querySelectorAll(".lang-opt"), function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === "ru" ? "true" : "false"); }); }

    // Перевод динамически добавленного контента (каталог, карточки ЖК) — только когда активен kk
    if (window.MutationObserver && document.body) {
      new MutationObserver(function (muts) {
        if (lang !== "kk") return;
        for (var i = 0; i < muts.length; i++) {
          var add = muts[i].addedNodes;
          for (var j = 0; j < add.length; j++) {
            var nd = add[j];
            if (nd.nodeType === 1) walk(nd, true);
            else if (nd.nodeType === 3) tnTranslate(nd, true);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  /* ---------- Калькулятор господдержки «Наурыз» (Отбасы): двухэтапная модель ЖСС ----------
     Перенос выверенной модели из deliverables/nauryz_mortgage_calculator.html, упрощённо:
     база 7%, Алматы (лимит займа 36 млн), ОП=16 → 2-й этап 5%, сроки 8+11 лет, цель депозита 50%.
     1-й этап — только проценты + накопление на депозит ЖСС (2% + госпремия 20%, ≤200 МРП). */
  /* Мульти-шаг формы (.ms-form): чипы → hidden value, шаги вперёд/назад, прогресс-бар */
  function bindMultistep() {
    document.querySelectorAll(".ms-form").forEach(function (form) {
      if (form.dataset.msBound) return; form.dataset.msBound = "1";
      var steps = form.querySelectorAll(".ms-step");
      var total = steps.length;
      var bar = form.querySelector(".ms-progress-bar");
      var current = form.querySelector(".ms-current");
      var idx = 0;
      function show(i) {
        idx = Math.max(0, Math.min(total - 1, i));
        steps.forEach(function (s, n) { s.classList.toggle("is-active", n === idx); });
        if (bar) bar.style.width = ((idx + 1) / total * 100) + "%";
        if (current) current.textContent = String(idx + 1);
        track("form_step", { form_type: form.getAttribute("data-form") || "form", step: idx + 1 });
      }
      // Чипы: выбор → заполняем hidden + активируем "Далее"
      form.querySelectorAll(".ms-chips").forEach(function (group) {
        var hidden = group.parentElement.querySelector('input[type="hidden"]');
        group.querySelectorAll(".ms-chip").forEach(function (chip) {
          chip.addEventListener("click", function () {
            group.querySelectorAll(".ms-chip").forEach(function (c) { c.classList.remove("is-on"); });
            chip.classList.add("is-on");
            if (hidden) hidden.value = chip.getAttribute("data-value");
            var next = group.parentElement.querySelector(".ms-next");
            if (next) next.disabled = false;
          });
        });
      });
      form.querySelectorAll(".ms-next").forEach(function (b) { b.addEventListener("click", function () { show(idx + 1); }); });
      form.querySelectorAll(".ms-prev").forEach(function (b) { b.addEventListener("click", function () { show(idx - 1); }); });
      show(0);
    });
  }
  /* Sticky CTA при скролле: показываем когда уехали с героя (>500px) и не закрывали явно */
  function bindStickyPromo() {
    var bar = byId("stickyBar"); if (!bar) return;
    if (sessionStorage.getItem("atamura_sticky_closed") === "1") return;
    var visible = false;
    function onScroll() {
      var should = window.scrollY > 480;
      if (should !== visible) { visible = should; bar.classList.toggle("is-on", should); }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    var x = bar.querySelector(".sticky-close");
    if (x) x.addEventListener("click", function () { try { sessionStorage.setItem("atamura_sticky_closed", "1"); } catch (e) {} });
    onScroll();
  }
  function bindNauryzCalc() {
    var price = byId("nzPrice"), dp = byId("nzDp");
    if (!price || !dp) return;
    var RATE1 = 7, RATE2 = 5, PH1 = 8, TOTAL = 19, DEP = 0.5, DRATE = 0.02, MRPCAP = 865000, MAXLOAN = 36000000;
    function annuity(p, rPct, n) { if (n <= 0 || p <= 0) return 0; var i = rPct / 12 / 100; if (i === 0) return p / n; var f = Math.pow(1 + i, n); return p * i * f / (f - 1); }
    function solveDeposit(target, n) { if (n <= 0 || target <= 0) return 0; var rm = DRATE / 12; function fv(c) { var b = 0; for (var m = 1; m <= n; m++) { b = (b + c) * (1 + rm); if (m % 12 === 0) b += 0.2 * Math.min(c * 12, MRPCAP); } return b; } var lo = 0, hi = target / n * 1.2 + 1; while (fv(hi) < target && hi < target) hi *= 1.5; for (var it = 0; it < 60; it++) { var mid = (lo + hi) / 2; if (fv(mid) < target) lo = mid; else hi = mid; } return (lo + hi) / 2; }
    var s1 = byId("nzStage1"), s2 = byId("nzStage2"), ov = byId("nzOverpay"), warn = byId("nzWarn"), wa = byId("nzWa"), pL = byId("nzPriceLabel"), dL = byId("nzDpLabel");
    function calc() {
      var P = +price.value, dpPct = +dp.value;
      var down = Math.round(P * dpPct / 100), loan = P - down;
      if (pL) pL.textContent = money(P) + " ₸";
      if (dL) dL.textContent = money(down) + " ₸ (" + dpPct + "%)";
      var over = loan > MAXLOAN;
      var n1 = PH1 * 12, n2 = (TOTAL - PH1) * 12;
      var pay1 = loan * RATE1 / 12 / 100;
      var depM = solveDeposit(loan * DEP, n1);
      var pay2 = annuity(loan - loan * DEP, RATE2, n2);
      var overpay = pay1 * n1 + (pay2 * n2 - (loan - loan * DEP));
      if (s1) s1.innerHTML = money(pay1 + depM) + "<sub>₸/мес</sub>";
      if (s2) s2.innerHTML = money(pay2) + "<sub>₸/мес</sub>";
      if (ov) ov.innerHTML = money(overpay) + "<sub>₸</sub>";
      if (warn) { warn.hidden = !over; if (over) warn.textContent = "Заём " + money(loan) + " ₸ выше лимита «Наурыз» для Алматы (36 млн ₸). Увеличьте первый взнос."; }
      if (wa) wa.setAttribute("href", "https://wa.me/77006410499?text=" + encodeURIComponent("Здравствуйте! Интересует господдержка «Наурыз». Квартира " + money(P) + " ₸, первый взнос " + dpPct + "% (" + money(down) + " ₸). Подскажите по программе и точному расчёту."));
    }
    var nzTracked = false;
    function nzTrack() { if (!nzTracked) { nzTracked = true; track("mortgage_calc_used", { calc: "nauryz", page: location.pathname }); } }
    price.addEventListener("input", calc); price.addEventListener("input", nzTrack);
    dp.addEventListener("input", calc); dp.addEventListener("input", nzTrack);
    calc();
  }

  /* Ротация фото-слайдов в hero на /о-компании и /контакты */
  function bindPageheroSlider() {
    document.querySelectorAll(".pagehero-multi .pagehero-slides").forEach(function (box) {
      var slides = box.querySelectorAll(".pagehero-slide");
      if (slides.length < 2) return;
      var i = 0;
      setInterval(function () {
        slides[i].classList.remove("is-on");
        i = (i + 1) % slides.length;
        slides[i].classList.add("is-on");
      }, 5000);
    });
  }

  /* #126: фулскрин-лайтбокс для галерей ЖК (клик по фото → перемотка ‹ ›, Esc, клик вне) */
  function bindLightbox() {
    var galImgs = function (gal) { return Array.prototype.slice.call(gal.querySelectorAll("img")); };
    var box = null, imgs = [], idx = 0, imgEl = null;
    function build() {
      box = document.createElement("div");
      box.className = "lightbox";
      box.innerHTML =
        '<button class="lightbox-close" type="button" aria-label="Закрыть">&times;</button>' +
        '<button class="lightbox-nav lightbox-prev" type="button" aria-label="Назад">&#8249;</button>' +
        '<img class="lightbox-img" alt="" />' +
        '<button class="lightbox-nav lightbox-next" type="button" aria-label="Вперёд">&#8250;</button>' +
        '<div class="lightbox-count"></div>';
      document.body.appendChild(box);
      imgEl = box.querySelector(".lightbox-img");
      box.querySelector(".lightbox-close").addEventListener("click", close);
      box.querySelector(".lightbox-prev").addEventListener("click", function (e) { e.stopPropagation(); go(-1); });
      box.querySelector(".lightbox-next").addEventListener("click", function (e) { e.stopPropagation(); go(1); });
      box.addEventListener("click", function (e) { if (e.target === box) close(); });
    }
    function show() { imgEl.src = imgs[idx]; box.querySelector(".lightbox-count").textContent = (idx + 1) + " / " + imgs.length; }
    function go(d) { idx = (idx + d + imgs.length) % imgs.length; show(); }
    function open(list, i) { if (!box) build(); imgs = list; idx = i; show(); box.classList.add("is-on"); document.body.style.overflow = "hidden"; }
    function close() { if (box) box.classList.remove("is-on"); document.body.style.overflow = ""; }
    document.addEventListener("click", function (e) {
      var pb = e.target.closest && e.target.closest("[data-plans]");
      if (pb) {
        e.preventDefault(); e.stopPropagation();
        try { var list = JSON.parse(pb.getAttribute("data-plans")); if (list && list.length) open(list, 0); } catch (_) {}
        return;
      }
      var img = e.target.closest && e.target.closest(".zk-gallery img");
      if (!img) return;
      var gal = img.closest(".zk-gallery");
      var list = galImgs(gal).map(function (im) { return im.currentSrc || im.src; });
      open(list, galImgs(gal).indexOf(img));
    });
    document.addEventListener("keydown", function (e) {
      if (!box || !box.classList.contains("is-on")) return;
      if (e.key === "Escape") close(); else if (e.key === "ArrowLeft") go(-1); else if (e.key === "ArrowRight") go(1);
    });
  }

  /* Планировки ЖК: фильтр по комнатности + пагинация «Показать ещё» по 6 (длинное полотно) */
  var PLANS_STEP = 6;
  function bindPlans() {
    function apply(wrap) {
      var room = wrap.getAttribute("data-room") || "*";
      var shown = +(wrap.getAttribute("data-shown") || PLANS_STEP);
      var cards = wrap.querySelectorAll("[data-prooms-card]"), matched = 0;
      for (var i = 0; i < cards.length; i++) {
        var ok = room === "*" || cards[i].getAttribute("data-prooms-card") === room;
        if (ok) { matched++; cards[i].style.display = matched <= shown ? "" : "none"; }
        else cards[i].style.display = "none";
      }
      var more = wrap.querySelector(".plans-more");
      if (more) more.hidden = matched <= shown;
    }
    document.addEventListener("click", function (e) {
      var chip = e.target.closest && e.target.closest(".plans-chip");
      if (chip) {
        var w = chip.closest(".plans-wrap"); if (!w) return;
        w.setAttribute("data-room", chip.getAttribute("data-prooms"));
        w.setAttribute("data-shown", String(PLANS_STEP));
        var chips = w.querySelectorAll(".plans-chip");
        for (var i = 0; i < chips.length; i++) chips[i].classList.toggle("is-on", chips[i] === chip);
        apply(w); return;
      }
      var more = e.target.closest && e.target.closest(".plans-more");
      if (more) {
        var wm = more.closest(".plans-wrap"); if (!wm) return;
        wm.setAttribute("data-shown", String(+(wm.getAttribute("data-shown") || PLANS_STEP) + PLANS_STEP));
        apply(wm);
      }
    });
    var wraps = document.querySelectorAll(".plans-wrap");
    for (var k = 0; k < wraps.length; k++) {
      wraps[k].setAttribute("data-room", "*"); wraps[k].setAttribute("data-shown", String(PLANS_STEP));
      apply(wraps[k]);
    }
  }

  /* #144/#146: ЕДИНАЯ универсальная форма «Поможем с выбором» (динамический DOM).
     Любая кнопка [data-open-lead] открывает попап с выбором: WhatsApp или «Заказать звонок» (форма имя+тел → site-lead). */
  var LEAD_WA = "https://wa.me/77006410499?text=%D0%97%D0%B4%D1%80%D0%B0%D0%B2%D1%81%D1%82%D0%B2%D1%83%D0%B9%D1%82%D0%B5%21%20%D0%AF%20%D1%81%20%D1%81%D0%B0%D0%B9%D1%82%D0%B0%20Atamura.%20%D0%A5%D0%BE%D1%82%D0%B5%D0%BB%D0%BE%D1%81%D1%8C%20%D0%B1%D1%8B%20%D0%BF%D0%BE%D0%BB%D1%83%D1%87%D0%B8%D1%82%D1%8C%20%D0%BA%D0%BE%D0%BD%D1%81%D1%83%D0%BB%D1%8C%D1%82%D0%B0%D1%86%D0%B8%D1%8E.&utm_source=site&utm_medium=whatsapp&utm_campaign=atamura";
  function bindLeadPopup() {
    var box = null, nameI = null, phoneI = null, honey = null, stForm = null, stOk = null, src = "zaivka";
    function build() {
      var kk = document.documentElement.lang === "kk";
      var T = kk ? {
        eyebrow: "Көмек", title: "Таңдауға көмектесеміз",
        text: "ATAMURA менеджері бюджетіңізге сай нұсқаларды таңдап, сатылым кеңсесінде кеңеске жазады.",
        wa: "WhatsApp-қа жазу", call: "Қоңырау тапсырыс беру", name: "Атыңыз", send: "Жіберу",
        fine1: "Басу арқылы сіз ", finePdn: "ДК өңдеуге", fine2: " келісесіз.",
        okTitle: "Рақмет! Өтінім қабылданды", okText: "ATAMURA менеджері жұмыс уақытында сізбен хабарласады.", close: "Жабу",
      } : {
        eyebrow: "Помощь", title: "Поможем с выбором",
        text: "Менеджер ATAMURA подберёт варианты под ваш бюджет и запишет на консультацию в офис продаж.",
        wa: "Написать в WhatsApp", call: "Заказать звонок", name: "Ваше имя", send: "Отправить",
        fine1: "Нажимая, вы соглашаетесь с ", finePdn: "обработкой ПДн", fine2: ".",
        okTitle: "Спасибо! Заявка принята", okText: "Менеджер ATAMURA свяжется с вами в рабочее время.", close: "Закрыть",
      };
      box = document.createElement("div");
      box.className = "popup-overlay lead-popup";
      box.id = "leadPopup";
      box.innerHTML =
        '<div class="popup"><button class="popup-close" type="button" aria-label="' + T.close + '">' +
        '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l8 8M11 3L3 11"/></svg></button>' +
        '<div class="popup-stage" data-lead-stage="form"><span class="popup-eyebrow">' + T.eyebrow + '</span><h3 data-lead-formtitle>' + T.title + '</h3>' +
        '<p data-lead-formsub>' + T.text + '</p>' +
        '<form class="lead-pop-form" novalidate>' +
        '<input type="text" name="name" autocomplete="name" placeholder="' + T.name + '" />' +
        '<input type="tel" name="phone" required placeholder="+7 (7__) ___-__-__" />' +
        '<input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />' +
        '<button type="submit" class="btn btn-accent btn-block" data-lead-submit>' + T.send + '</button>' +
        '<a class="btn btn-light btn-block" href="' + LEAD_WA + '" target="_blank" rel="noopener" data-wa="lead-popup" style="margin-top:8px">' + T.wa + '</a>' +
        '<p class="popup-fineprint">' + T.fine1 + '<a href="' + rel("privacy.html") + '">' + T.finePdn + '</a>' + T.fine2 + '</p></form></div>' +
        '<div class="popup-stage" data-lead-stage="success" hidden><h3 data-lead-oktitle>' + T.okTitle + '</h3><p data-lead-oktext>' + T.okText + '</p>' +
        '<button type="button" class="btn btn-light btn-block" data-lead-close>' + T.close + '</button></div></div>';
      document.body.appendChild(box);
      var form = box.querySelector(".lead-pop-form");
      nameI = form.querySelector('input[name="name"]'); phoneI = form.querySelector('input[name="phone"]'); honey = form.querySelector('input[name="company"]');
      stForm = box.querySelector('[data-lead-stage="form"]'); stOk = box.querySelector('[data-lead-stage="success"]');
      bindPhones(form);
      box.querySelector(".popup-close").addEventListener("click", close);
      box.querySelector("[data-lead-close]").addEventListener("click", close);
      box.addEventListener("click", function (e) { if (e.target === box) close(); });
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (honey && honey.value) return;
        if (!phoneValid(phoneI.value)) { showFieldError(phoneI, "Введите номер: +7 7XX XXX-XX-XX"); phoneI.focus(); return; }
        var data = { name: (nameI.value || "").trim(), phone: phoneI.value, source: src, page: location.pathname, ref: document.referrer || "прямой заход", utm: location.search || "", ts: new Date().toISOString() };
        try { var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]"); q.push(data); localStorage.setItem("atamura_leads", JSON.stringify(q)); } catch (e2) {}
        track("lead_submit", { source: src, page: data.page });
        stForm.hidden = true; stOk.hidden = false;
        if (LEAD_WEBHOOK) fetch(LEAD_WEBHOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data), keepalive: true }).catch(function () {});
      });
    }
    function close() { if (box) box.classList.remove("is-on"); }
    document.addEventListener("click", function (e) {
      var btn = e.target.closest && e.target.closest("[data-open-lead]");
      if (!btn) return;
      e.preventDefault();
      if (!box) build();
      src = btn.getAttribute("data-lead-source") || "zaivka";
      var kk = document.documentElement.lang === "kk";
      // optional per-trigger overrides (#155/#156 etc.): custom title/text/submit/success + direct-form mode
      var cTitle = btn.getAttribute("data-lead-title"), cText = btn.getAttribute("data-lead-text");
      var cSubmit = btn.getAttribute("data-lead-submit"), cOk = btn.getAttribute("data-lead-success");
      var fTitle = box.querySelector("[data-lead-formtitle]"), fSub = box.querySelector("[data-lead-formsub]");
      var fSubmit = box.querySelector("[data-lead-submit]"), okText = box.querySelector("[data-lead-oktext]");
      fTitle.textContent = cTitle || (kk ? "Таңдауға көмектесеміз" : "Поможем с выбором");
      fSub.textContent = cText || (kk ? "ATAMURA менеджері бюджетіңізге сай нұсқаларды таңдап, сатылым кеңсесінде кеңеске жазады." : "Менеджер ATAMURA подберёт варианты под ваш бюджет и запишет на консультацию.");
      fSub.hidden = false;
      fSubmit.textContent = cSubmit || (kk ? "Жіберу" : "Отправить");
      okText.textContent = cOk || (kk ? "ATAMURA менеджері жұмыс уақытында сізбен хабарласады." : "Менеджер ATAMURA свяжется с вами в рабочее время.");
      stForm.hidden = false; stOk.hidden = true;   // сразу форма, без промежуточного экрана (видео-баг)
      setTimeout(function () { nameI.focus(); }, 60);
      box.classList.add("is-on");
      track("lead_open", { source: src });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    renderZhkDetail();
    enhanceZhkLayouts();
    enhanceZhkExtras();
    enhanceFooter();
    enhanceDrawer();
    enhanceProjectPrices();
    renderCatalog();
    bindLightbox();
    bindPlans();
    bindLeadPopup();
    bindHeroSearch();
    bindAiHelper();
    bindForms(document);
    bindScrollAnim();
    bindHeroSlider();
    bindPageheroSlider();
    bindStickyHeader();
    bindActiveNav();
    bindFavCount();
    bindLang();
    bindNauryzCalc();
    bindStickyPromo();
    bindMultistep();
    /* Делегированный трекинг исходящих контактов (без PII) */
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('a[href*="wa.me"]')) { track("whatsapp_click", { source: "link" }); return; }
      if (t.closest('a[href^="tel:"]')) { track("phone_click", {}); return; }
      if (t.closest('a[href*="t.me/"]')) { track("telegram_click", {}); }
    }, true);
  });

  /* #36 markup-review: footer columns accordion on mobile (like BI) */
  document.addEventListener("DOMContentLoaded", function () {
    if (!(window.matchMedia && matchMedia("(max-width: 760px)").matches)) return;
    var hs = document.querySelectorAll(".foot-col h4");
    for (var i = 0; i < hs.length; i++) {
      (function (h) { h.addEventListener("click", function () { h.parentNode.classList.toggle("is-open"); }); })(hs[i]);
    }
  });

  /* #39 markup-review: floating «Избранное» badge (bottom-left) when favorites exist */
  function favFloat(){
    var n=getFav().length, el=byId("favFloat");
    if(n>0 && !el){
      el=document.createElement("a"); el.id="favFloat"; el.href=rel("flats.html")+"?fav=1";
      el.setAttribute("aria-label","Избранные квартиры");
      el.innerHTML='<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><span class="fav-float-n"></span>';
      document.body.appendChild(el);
    }
    if(el){ el.style.display=n>0?"flex":"none"; var cc=el.querySelector(".fav-float-n"); if(cc) cc.textContent=n; }
  }
  try{ favFloat(); }catch(e){}
  document.addEventListener("click", function(e){ if(e.target.closest && e.target.closest(".flat-fav, .cat-fav-toggle")) setTimeout(favFloat,0); }, true);
})();
