/* ============================================================
   Лендинг «Старт продаж AMAIA» — логика.
   Один комплекс (AMAIA). DION отложён — переключателя тем нет.
   ============================================================ */
(function () {
  "use strict";
  var COMPLEX = "amaia";

  /* ---------- UTM / fbclid: захватываем при заходе ---------- */
  var TRACK = {};
  (function captureTracking() {
    try {
      var qs = new URLSearchParams(location.search);
      ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","fbclid","gclid"].forEach(function (k) {
        var v = qs.get(k); if (v) TRACK[k] = v;
      });
      if (TRACK.fbclid) TRACK.fbc = "fb.1." + Date.now() + "." + TRACK.fbclid;
      sessionStorage.setItem("atamura_track", JSON.stringify(TRACK));
    } catch (e) {
      try { TRACK = JSON.parse(sessionStorage.getItem("atamura_track") || "{}"); } catch (e2) {}
    }
  })();

  function pixelTrack(event, data) {
    if (window.fbq && window.__PIXEL_ID__) { try { window.fbq("track", event, data || {}); } catch (e) {} }
  }

  /* ---------- Таймер обратного отсчёта ---------- */
  (function timer() {
    var box = document.getElementById("timer"); if (!box) return;
    var deadline = new Date(box.getAttribute("data-deadline")).getTime();
    var d = box.querySelector("[data-d]"), h = box.querySelector("[data-h]"),
        m = box.querySelector("[data-m]"), s = box.querySelector("[data-s]");
    function pad(n) { return (n < 10 ? "0" : "") + n; }
    function tick() {
      var diff = deadline - Date.now();
      if (diff <= 0) {
        d.textContent = h.textContent = m.textContent = s.textContent = "0";
        var lbl = document.querySelector(".t-label"); if (lbl) lbl.textContent = "Старт продаж идёт!";
        return;
      }
      var sec = Math.floor(diff / 1000);
      d.textContent = Math.floor(sec / 86400);
      h.textContent = pad(Math.floor(sec % 86400 / 3600));
      m.textContent = pad(Math.floor(sec % 3600 / 60));
      s.textContent = pad(sec % 60);
    }
    tick(); setInterval(tick, 1000);
  })();

  /* ---------- FAQ ---------- */
  var faq = document.getElementById("faq");
  if (faq) faq.addEventListener("click", function (e) {
    var q = e.target.closest(".faq-q"); if (!q) return;
    var item = q.parentElement, a = item.querySelector(".faq-a");
    var open = item.classList.toggle("open");
    a.style.maxHeight = open ? a.scrollHeight + "px" : "0";
  });

  /* ---------- Модальное окно формы ---------- */
  var body = document.body;
  var modal = document.getElementById("formModal");
  var formStep = document.getElementById("formStep");
  var thanksStep = document.getElementById("thanksStep");
  function openForm() {
    formStep.style.display = ""; thanksStep.style.display = "none";
    modal.classList.add("open"); modal.setAttribute("aria-hidden", "false");
    body.style.overflow = "hidden";
    setTimeout(function () { var n = document.getElementById("f-name"); n && n.focus(); }, 60);
  }
  function closeForm() {
    modal.classList.remove("open"); modal.setAttribute("aria-hidden", "true");
    body.style.overflow = "";
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("[data-open-form]")) { e.preventDefault(); openForm(); }
    else if (e.target.closest("[data-close-form]") || e.target === modal) closeForm();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && modal.classList.contains("open")) closeForm(); });

  /* ---------- Маска телефона (KZ, +7) ---------- */
  var phone = document.getElementById("f-phone");
  if (phone) phone.addEventListener("input", function () {
    var v = phone.value.replace(/\D/g, "");
    if (v[0] === "8") v = "7" + v.slice(1);
    if (v[0] !== "7") v = "7" + v;
    v = v.slice(0, 11);
    var out = "+7";
    if (v.length > 1) out += " (" + v.slice(1, 4);
    if (v.length >= 4) out += ") " + v.slice(4, 7);
    if (v.length >= 7) out += "-" + v.slice(7, 9);
    if (v.length >= 9) out += "-" + v.slice(9, 11);
    phone.value = out;
  });

  /* ---------- Валидация + отправка ---------- */
  var form = document.getElementById("leadForm");
  function setErr(name, on) {
    var f = form.querySelector('[data-field="' + name + '"]'); if (f) f.classList.toggle("err", on);
  }
  if (form) form.addEventListener("submit", function (e) {
    e.preventDefault();
    var name = form.name.value.trim();
    var digits = form.phone.value.replace(/\D/g, "");
    var consent = form.consent.checked;
    var ok = true;
    if (!name) { setErr("name", true); ok = false; } else setErr("name", false);
    if (digits.length !== 11) { setErr("phone", true); ok = false; } else setErr("phone", false);
    if (!consent) { setErr("consent", true); ok = false; } else setErr("consent", false);
    if (!ok) return;

    var payload = {
      name: name,
      phone: "+" + digits,
      visit: form.visit.value || "не указано",
      complex: COMPLEX,
      page: location.pathname,
      submitted_at: new Date().toISOString(),
      track: TRACK
    };

    /* TODO[form-endpoint]: подключить приём заявок (email / CRM / Google Sheets / Bitrix).
       Пока — заглушка: логируем и показываем экран благодарности. */
    console.log("[lead]", payload);
    // fetch(ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});

    pixelTrack("Lead", { content_name: "start_amaia", complex: COMPLEX });

    formStep.style.display = "none"; thanksStep.style.display = "";
  });

  /* ---------- «Добавить в календарь» (по платформе) ----------
     Android → Google Календарь (template-URL, открывается приложением).
     iOS → статичный .ics: Safari показывает событие с кнопкой «Добавить».
     Десктоп → скачивание .ics (Outlook / Apple Calendar).
     Время в Google-URL — UTC: 10:00/19:00 Алматы (+05) = 05:00Z/14:00Z. */
  var GCAL_URL = "https://calendar.google.com/calendar/render?action=TEMPLATE" +
    "&text=" + encodeURIComponent("Старт продаж AMAIA — ATAMURA Group") +
    "&dates=20260718T050000Z/20260718T140000Z" +
    "&ctz=Asia/Almaty" +
    "&location=" + encodeURIComponent("Алматы, ул. Толе би, 12, 1 этаж") +
    "&details=" + encodeURIComponent("Центральный офис продаж ATAMURA Group. Программа с ведущими 12:00–15:00. https://atamuragroup.kz/start/");
  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-add-calendar]"); if (!btn) return;
    pixelTrack("AddToWishlist", { content_name: "start_amaia_calendar" });
    if (/android/i.test(navigator.userAgent)) {
      e.preventDefault();
      window.open(GCAL_URL, "_blank", "noopener");
    }
    /* iOS/десктоп: пропускаем штатный переход по href на .ics */
  });

  /* ---------- Meta ViewContent при заходе ---------- */
  pixelTrack("ViewContent", { content_name: "start_amaia", complex: COMPLEX });
})();
