# Механизм формы заявки (lead form) — переносимая спецификация

Документ самодостаточный: его можно целиком отдать Claude Code в другом проекте и получить
такой же механизм заявок, ничего не подглядывая в исходный репозиторий.

Источник: боевой механизм сайта `atamura.group` (статический сайт `atamura-group-site`)
+ приёмник заявок `TM_Calculator/server` (Hono на VDS). Проверено в проде.

---

## 1. Что это и как устроено

```
┌─────────────────────────────────────────┐
│ Статический сайт (HTML + один app.js)   │
│                                          │
│  форма (имя + телефон + honeypot)        │
│    ├─ маска телефона на вводе            │
│    ├─ валидация на submit                │
│    ├─ обогащение: source/page/ref/utm/ts │
│    ├─ запись в localStorage (очередь)    │
│    ├─ analytics event (dataLayer/gtag)   │
│    └─ POST JSON → LEAD_WEBHOOK           │
└──────────────────┬───────────────────────┘
                   │  fetch(keepalive), fire-and-forget
                   ▼
┌─────────────────────────────────────────┐
│ POST /api/site-lead (Hono, Node)        │
│   1. rate limit (per-IP + глобальный)    │
│   2. honeypot → 200 ok, но ничего не пишем│
│   3. валидация/санитизация (только тел. │
│      может отклонить заявку)             │
│   4. append в JSONL + fsync   ← источник │
│      правды, независимо от CRM           │
│   5. ответ 200                           │
│   6. ВНЕ ответа: Telegram + Bitrix24     │
└──────────────────┬───────────────────────┘
                   ▼
        Telegram-чат ОП   +   Bitrix24 crm.lead.add
```

**Три принципа, ради которых всё это так сделано:**

1. **Заявка не теряется никогда.** Она пишется в `localStorage` браузера ещё до отправки,
   на сервере — в JSONL с `fsync` до ответа, и только потом (уже после ответа) уходит
   в Telegram и CRM. Упавший Bitrix не стоит нам ни одного контакта.
2. **UX не блокируется сторонними сервисами.** Клиент не ждёт CRM; сервер не ждёт
   Telegram/Bitrix перед ответом.
3. **Клиенту нельзя верить.** Сервер обрезает, чистит и перепроверяет всё, что пришло.

---

## 2. Контракт запроса

`POST {LEAD_WEBHOOK}` · `Content-Type: application/json`

```jsonc
{
  "name":  "Айдана",                        // строка, ≥2 символа (клиент), на сервере — не обязательна
  "phone": "+7 (707) 123-45-67",            // ЕДИНСТВЕННОЕ обязательное поле на сервере
  "company": "",                            // honeypot: заполнено → бот (клиент не шлёт, сервер молча дропает)

  "source": "foot-cta",                     // какая именно форма/кнопка: см. §3.4
  "page":   "/zk/aura.html",                // location.pathname
  "ref":    "https://google.com/",          // document.referrer или "прямой заход"
  "utm":    "?utm_source=google&...",       // сырая строка location.search
  "ts":     "2026-07-30T09:12:44.512Z",     // new Date().toISOString()

  "utm_source":   "google",                 // отдельные метки (last-touch, из localStorage)
  "utm_medium":   "cpc",
  "utm_campaign": "almaty-brand",
  "utm_content":  "",
  "utm_term":     "",

  "resend": true                            // опционально: досыл ранее недоставленной заявки
}
```

Плюс любые дополнительные поля формы (`messenger`, `budget`, `rooms` и т. п.) —
они попадают в payload автоматически из `FormData` и должны так же
пробрасываться в комментарий лида.

Ответы: `{"ok":true}` · `400 {"ok":false,"error":"validation","fields":["phone"]}` ·
`429 {"ok":false,"error":"rate_limited"}` · `413 too_large` · `500 store_failed`.

**Клиент ответ игнорирует** (кроме отметки `_sent` в очереди) — пользователь всегда
видит успех. Причина: отклонённая заявка восстанавливается только из лога сервера,
поэтому сервер обязан логировать каждый дроп с маскированным телефоном.

---

## 3. Клиентская часть

Всё живёт в одном `app.js` (IIFE, ES5-совместимо, без сборщика и без зависимостей).

### 3.1. Аналитика

```js
/* Пушим в dataLayer (GTM-совместимо) и в gtag, если GA4 загружен. Без PII (номер не пишем). */
function track(name, params) {
  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Object.assign({ event: name }, params || {}));
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  } catch (e) {}
}
```

События: `form_submitted`, `lead_open` / `lead_submit`, `catalog_open` / `catalog_submit`,
`soon_open` / `soon_submit`, `form_step` (многошаговая), `popup_shown`,
`whatsapp_click` / `phone_click` / `telegram_click`.
**В параметры никогда не кладём имя и телефон.**

### 3.2. UTM: last-touch на 30 дней

Метки теряются при переходах по сайту, поэтому один раз сохраняем и подмешиваем в каждую заявку.

```js
var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

(function () {                       // на загрузке любой страницы
  try {
    var p = new URLSearchParams(location.search), got = {};
    UTM_KEYS.forEach(function (k) { var v = p.get(k); if (v) got[k] = v; });
    if (got.utm_source) { got._ts = Date.now(); localStorage.setItem("atamura_utm", JSON.stringify(got)); }
  } catch (e) {}
})();

function mergeUTM(data) {
  try {
    var s = JSON.parse(localStorage.getItem("atamura_utm") || "null");
    if (s && Date.now() - (s._ts || 0) < 30 * 864e5) UTM_KEYS.forEach(function (k) { if (s[k]) data[k] = s[k]; });
    var p = new URLSearchParams(location.search);       // текущий URL важнее сохранённого
    UTM_KEYS.forEach(function (k) { var v = p.get(k); if (v) data[k] = v; });
  } catch (e) {}
  return data;
}
```

### 3.3. Телефон: маска, валидация, ошибки полей

```js
/* Маска KZ: 8XXX / 7XXX / без кода → +7 (7XX) XXX-XX-XX */
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
function nameValid(v)  { return (v || "").trim().length >= 2; }

function bindPhones(scope) {
  (scope || document).querySelectorAll('input[type="tel"]').forEach(function (i) {
    if (i.dataset.tel) return; i.dataset.tel = "1";
    i.addEventListener("input", function () { i.value = formatPhone(i.value); });
  });
}

/* Ошибка под полем: role="alert" + aria-invalid, снимается при первом же вводе */
function showFieldError(input, msg) {
  input.setAttribute("aria-invalid", "true");
  var err = input.parentNode.querySelector(".field-err");
  if (!err) {
    err = document.createElement("p");
    err.className = "field-err"; err.setAttribute("role", "alert");
    input.insertAdjacentElement("afterend", err);
  }
  err.textContent = msg;
  var clr = function () {
    input.removeAttribute("aria-invalid");
    if (err && err.parentNode) err.parentNode.removeChild(err);
    input.removeEventListener("input", clr);
  };
  input.addEventListener("input", clr);
}
```

Тексты ошибок: `«Введите имя (минимум 2 буквы)»`, `«Введите номер: +7 7XX XXX-XX-XX»`.
После ошибки — `input.focus()`.

### 3.4. Доставка + очередь в localStorage

```js
/* Пусто → работаем только в localStorage (сайт не ломается без бэкенда). */
var LEAD_WEBHOOK = "https://calculator.example.kz/api/site-lead";

function sendLead(data) {
  if (!LEAD_WEBHOOK) return Promise.resolve();
  return fetch(LEAD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    keepalive: true                    // переживает уход на /спасибо
  }).then(function (r) {
    if (r && r.ok) {                   // помечаем доставленную заявку в очереди по ts
      try {
        var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]");
        q.forEach(function (L) { if (L.ts === data.ts) L._sent = 1; });
        localStorage.setItem("atamura_leads", JSON.stringify(q));
      } catch (e) {}
    }
    return r;
  });
}
```

**Досыл недоставленных** (на этом сайте спас заявки, осевшие в браузерах за месяц
сломанного CORS). Выполняется один раз при загрузке страницы:

```js
(function () {
  if (!LEAD_WEBHOOK) return;
  var CORS_FIXED = "2026-07-08T09:32:00.000Z";   // граница инцидента; для нового сайта — см. ниже
  try {
    var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]"), dirty = false;
    q.forEach(function (L) {
      if (L._sent || !L.ts || !L.phone) return;
      if (L.ts >= CORS_FIXED) return;            // после фикса доставлялись штатно — не дублируем
      if ((L._tries || 0) >= 3) return;          // максимум 3 попытки
      L._tries = (L._tries || 0) + 1; dirty = true;
      var payload = {}; for (var k in L) if (k !== "_sent" && k !== "_tries") payload[k] = L[k];
      payload.resend = true;
      sendLead(payload).catch(function () {});
    });
    if (dirty) localStorage.setItem("atamura_leads", JSON.stringify(q));
  } catch (e) {}
})();
```

> На новом сайте окна инцидента нет — уберите проверку `L.ts >= CORS_FIXED` и досылайте
> любую заявку с `_sent != 1` (лимит попыток `_tries < 3` оставить обязательно, иначе
> вечно недоставляемая заявка будет долбить сервер при каждом визите). Сервер обязан
> уметь дедуплицировать по `phone + ts` — см. §4.7.

### 3.5. Сценарий А — inline-форма на странице → страница «Спасибо»

Разметка (любое место страницы; `data-form` = метка источника):

```html
<form class="lead-form" data-form="zk-aura" novalidate>
  <input type="text" name="name" autocomplete="name" required placeholder="Ваше имя" />
  <input type="tel"  name="phone" required placeholder="+7 (7__) ___-__-__" />
  <input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true"
         style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
  <button class="btn btn-brand" type="submit">Получить подборку →</button>
  <p class="popup-fineprint">Нажимая, вы соглашаетесь с <a href="/privacy.html">обработкой ПДн</a>.</p>
</form>
```

Обработчик — навешивается на **все** `form.lead-form`, включая динамически отрисованные
(вызывайте `bindForms(container)` после каждого рендера):

```js
function bindForms(scope) {
  bindPhones(scope);
  (scope || document).querySelectorAll("form.lead-form").forEach(function (f) {
    if (f.dataset.bound) return; f.dataset.bound = "1";
    f.addEventListener("submit", function (e) {
      e.preventDefault();

      var nm = f.querySelector('[name="name"]');
      if (nm && !nameValid(nm.value)) { showFieldError(nm, "Введите имя (минимум 2 буквы)"); nm.focus(); return; }
      var tel = f.querySelector('input[type="tel"]') || f.querySelector('[name="phone"]');
      if (tel && !phoneValid(tel.value)) { showFieldError(tel, "Введите номер: +7 7XX XXX-XX-XX"); tel.focus(); return; }

      var data = {}; new FormData(f).forEach(function (v, k) { data[k] = v; });
      data.source = f.getAttribute("data-form") || "form";
      data.page   = location.pathname;
      data.ref    = document.referrer || "прямой заход";
      data.utm    = location.search || "";
      data.ts     = new Date().toISOString();
      mergeUTM(data);

      try {
        var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]");
        q.push(data); localStorage.setItem("atamura_leads", JSON.stringify(q));
      } catch (e2) {}

      track("form_submitted", { form_type: data.source, page: data.page, messenger: data.messenger || "" });

      var done = function () { location.href = "/spasibo.html"; };
      // Не блокируем UX: при ошибке всё равно ведём на «Спасибо» —
      // заявка в localStorage не потеряна и будет дослана.
      if (LEAD_WEBHOOK) sendLead(data).then(done, done); else done();
    });
  });
}
```

> В этой ветке `company` из honeypot **не вырезается** из payload — его дропает сервер.
> В попапах (ниже) он вырезается на клиенте (`if (k !== "company")`) и проверяется
> до отправки. Обе схемы рабочие; для нового сайта проще сделать одинаково —
> проверять honeypot на клиенте **и** на сервере, а поле в payload не класть.

### 3.6. Сценарий Б — универсальный попап «Заказать звонок»

Одна форма на весь сайт, создаётся в DOM лениво при первом клике. Любая кнопка
с атрибутом `data-open-lead` открывает её; тексты настраиваются на самой кнопке:

```html
<button type="button" class="btn btn-accent" data-open-lead data-lead-source="foot-cta">
  Заказать звонок
</button>

<!-- с переопределением копирайта под конкретный оффер -->
<a href="#" data-open-lead
   data-lead-source="promo-discount"
   data-lead-title="Подберём программу покупки"
   data-lead-text="Оставьте контакты — менеджер подберёт программу и рассчитает платёж."
   data-lead-submit="Получить расчёт"
   data-lead-success="Спасибо! Менеджер свяжется с вами и предложит расчёт.">…</a>
```

Логика:

```js
function bindLeadPopup() {
  var box = null, nameI, phoneI, honey, stForm, stOk, src = "zaivka";

  function build() {
    box = document.createElement("div");
    box.className = "popup-overlay lead-popup";
    box.id = "leadPopup";
    box.innerHTML =
      '<div class="popup">' +
        '<button class="popup-close" type="button" aria-label="Закрыть">×</button>' +
        '<div class="popup-stage" data-lead-stage="form">' +
          '<span class="popup-eyebrow">Помощь</span>' +
          '<h3 data-lead-formtitle>Поможем с выбором</h3>' +
          '<p data-lead-formsub>Менеджер подберёт варианты под ваш бюджет.</p>' +
          '<form class="lead-pop-form" novalidate>' +
            '<input type="text" name="name" autocomplete="name" required placeholder="Ваше имя" />' +
            '<input type="tel" name="phone" required placeholder="+7 (7__) ___-__-__" />' +
            '<input type="text" name="company" tabindex="-1" autocomplete="off" aria-hidden="true" ' +
              'style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />' +
            '<button type="submit" class="btn btn-accent btn-block" data-lead-submit>Отправить</button>' +
            '<a class="btn btn-light btn-block" href="' + LEAD_WA + '" target="_blank" rel="noopener" ' +
              'style="margin-top:8px">Написать в WhatsApp</a>' +
            '<p class="popup-fineprint">Нажимая, вы соглашаетесь с <a href="/privacy.html">обработкой ПДн</a>.</p>' +
          '</form>' +
        '</div>' +
        '<div class="popup-stage" data-lead-stage="success" hidden>' +
          '<h3>Спасибо! Заявка принята</h3>' +
          '<p data-lead-oktext>Менеджер свяжется с вами в рабочее время.</p>' +
          '<button type="button" class="btn btn-light btn-block" data-lead-close>Закрыть</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(box);

    var form = box.querySelector(".lead-pop-form");
    nameI = form.querySelector('[name="name"]'); phoneI = form.querySelector('[name="phone"]');
    honey = form.querySelector('[name="company"]');
    stForm = box.querySelector('[data-lead-stage="form"]');
    stOk   = box.querySelector('[data-lead-stage="success"]');
    bindPhones(form);

    box.querySelector(".popup-close").addEventListener("click", close);
    box.querySelector("[data-lead-close]").addEventListener("click", close);
    box.addEventListener("click", function (e) { if (e.target === box) close(); });  // клик по подложке

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (honey && honey.value) return;                                  // бот — тихо выходим
      if (!nameValid(nameI.value))  { showFieldError(nameI, "Введите имя (минимум 2 буквы)"); nameI.focus(); return; }
      if (!phoneValid(phoneI.value)){ showFieldError(phoneI, "Введите номер: +7 7XX XXX-XX-XX"); phoneI.focus(); return; }

      var data = mergeUTM({
        name: (nameI.value || "").trim(), phone: phoneI.value, source: src,
        page: location.pathname, ref: document.referrer || "прямой заход",
        utm: location.search || "", ts: new Date().toISOString()
      });
      try {
        var q = JSON.parse(localStorage.getItem("atamura_leads") || "[]");
        q.push(data); localStorage.setItem("atamura_leads", JSON.stringify(q));
      } catch (e2) {}
      track("lead_submit", { source: src, page: data.page });

      stForm.hidden = true; stOk.hidden = false;      // успех показываем сразу, не дожидаясь сети
      if (LEAD_WEBHOOK) sendLead(data).catch(function () {});
    });
  }
  function close() { if (box) box.classList.remove("is-on"); }

  document.addEventListener("click", function (e) {              // делегирование: работает и на динамике
    var btn = e.target.closest && e.target.closest("[data-open-lead]");
    if (!btn) return;
    e.preventDefault();
    if (!box) build();
    src = btn.getAttribute("data-lead-source") || "zaivka";

    // необязательные переопределения текстов с кнопки
    var t = function (attr, def) { return btn.getAttribute(attr) || def; };
    box.querySelector("[data-lead-formtitle]").textContent = t("data-lead-title",  "Поможем с выбором");
    box.querySelector("[data-lead-formsub]").textContent   = t("data-lead-text",   "Менеджер подберёт варианты под ваш бюджет.");
    box.querySelector("[data-lead-submit]").textContent    = t("data-lead-submit", "Отправить");
    box.querySelector("[data-lead-oktext]").textContent    = t("data-lead-success","Менеджер свяжется с вами в рабочее время.");

    stForm.hidden = false; stOk.hidden = true;       // всегда открываем на стадии формы
    box.classList.add("is-on");
    setTimeout(function () { nameI.focus(); }, 60);
    track("lead_open", { source: src });
  });
}
```

Две стадии (`form` / `success`) внутри одного попапа — ключевая деталь UX: пользователь
не уходит со страницы, успех показывается мгновенно, отправка идёт фоном.

### 3.7. Сценарий В — форма как gate перед скачиванием PDF

Отличия от Б: после валидации переключаем стадию **и** программно кликаем по скрытой
ссылке на файл. `sendLead` — fire-and-forget, скачивание не ждёт сеть.

```js
stageForm.hidden = true; stageOk.hidden = false;
var dl = document.createElement("a");
dl.href = catalogHref; dl.download = "catalog-2026.pdf"; dl.rel = "noopener";
document.body.appendChild(dl); dl.click();
setTimeout(function () { if (dl.parentNode) dl.parentNode.removeChild(dl); }, 0);
```

На стадии успеха оставьте кнопку «Скачать ещё раз» (тот же href) — часть браузеров
блокирует программное скачивание.

### 3.8. Сценарий Г — многошаговая форма

Шаги-чипы → скрытые инпуты → на последнем шаге обычная `form.lead-form`:

```js
function bindMultistep() {
  document.querySelectorAll(".ms-form").forEach(function (form) {
    if (form.dataset.msBound) return; form.dataset.msBound = "1";
    var steps = form.querySelectorAll(".ms-step"), total = steps.length;
    var bar = form.querySelector(".ms-progress-bar"), current = form.querySelector(".ms-current");
    var idx = 0;
    function show(i) {
      idx = Math.max(0, Math.min(total - 1, i));
      steps.forEach(function (s, n) { s.classList.toggle("is-active", n === idx); });
      if (bar) bar.style.width = ((idx + 1) / total * 100) + "%";
      if (current) current.textContent = String(idx + 1);
      track("form_step", { form_type: form.getAttribute("data-form") || "form", step: idx + 1 });
    }
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
```

`form_step` в аналитике даёт воронку по шагам — видно, где отваливаются.

### 3.9. Инициализация

```js
document.addEventListener("DOMContentLoaded", function () {
  bindLeadPopup();
  bindForms(document);
  bindMultistep();
  /* Делегированный трекинг исходящих контактов (без PII) */
  document.addEventListener("click", function (e) {
    var t = e.target; if (!t || !t.closest) return;
    if (t.closest('a[href*="wa.me"]'))  { track("whatsapp_click", { source: "link" }); return; }
    if (t.closest('a[href^="tel:"]'))   { track("phone_click", {}); return; }
    if (t.closest('a[href*="t.me/"]'))  { track("telegram_click", {}); }
  }, true);
});
```

### 3.10. Минимальный CSS

```css
.popup-overlay { position: fixed; inset: 0; z-index: 100; display: none;
  background: rgb(20 25 35 / .6); backdrop-filter: blur(8px);
  align-items: center; justify-content: center; padding: 24px; }
.popup-overlay.is-on { display: flex; }
.popup { position: relative; width: 100%; max-width: 460px; padding: 32px;
  background: #fff; border-radius: 16px; box-shadow: 0 24px 64px rgb(0 0 0 / .24); }
.popup-close { position: absolute; top: 12px; right: 12px; }
.popup-stage[hidden] { display: none; }
.popup form { display: grid; gap: 12px; }
.popup-fineprint { font-size: 12px; color: #6b7280; }
.field-err { margin: 4px 4px 0; font-size: 12px; line-height: 1.3; color: #c0392b; }
input[aria-invalid="true"] { border-color: #c0392b; }
.btn-block { display: block; width: 100%; }
```

### 3.11. Обязательные детали доступности

- honeypot: `tabindex="-1"`, `aria-hidden="true"`, уведён за экран (`left:-9999px`),
  **не** `display:none` — часть ботов такие поля пропускает;
- `role="alert"` на сообщении об ошибке, `aria-invalid` на поле;
- фокус на первое поле при открытии попапа (`setTimeout(..., 60)` — до этого элемент ещё не отрисован);
- закрытие по клику на подложку (`e.target === overlay`) и по кнопке с `aria-label="Закрыть"`;
- `novalidate` на форме — валидируем сами, чтобы показать русские тексты ошибок.

---

## 4. Серверная часть

Hono + Node (`@hono/node-server`). Живёт на VDS за реверс-прокси (Caddy/nginx).
Тот же код без изменений работает как отдельный микросервис.

### 4.1. CORS — читать из env, лениво

```ts
api.use("*", cors({
  // ALLOWED_ORIGIN — список через запятую. Читаем лениво на каждый запрос,
  // чтобы смена env требовала только рестарта, а тесты могли её варьировать.
  origin: (origin) => {
    const allowed = (process.env.ALLOWED_ORIGIN ?? "*").split(",").map(s => s.trim()).filter(Boolean);
    if (allowed.includes("*")) return "*";
    return allowed.includes(origin) ? origin : undefined;
  },
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Ограничиваем тело, чтобы гигантский POST не съел память до валидации.
api.use("*", bodyLimit({ maxSize: 256 * 1024, onError: (c) => c.json({ ok: false, error: "too_large" }, 413) }));
```

> **Здесь мы уже обожглись.** Домен сайта забыли в `ALLOWED_ORIGIN` — месяц заявки
> молча оседали в браузерах посетителей. **Первым делом после деплоя** проверьте
> реальный `Origin` боевого домена (и `www`, и без; и http, и https, если оба живут).

### 4.2. Определение IP за прокси

```ts
function clientIp(c: Context): string {
  // Правый элемент X-Forwarded-For — это IP, дописанный нашим прокси;
  // всё левее клиент мог подделать сам.
  const xff = c.req.header("x-forwarded-for");
  if (xff) { const parts = xff.split(","); return parts[parts.length - 1]?.trim() || "unknown"; }
  return "unknown";
}
```

### 4.3. Rate limit (in-memory, fixed window)

```ts
const buckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit = 5, windowMs = 60_000, now = Date.now()): boolean {
  if (buckets.size > 1000) for (const [k, w] of buckets) if (now > w.reset) buckets.delete(k);
  const w = buckets.get(key);
  if (!w || now > w.reset) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (w.count >= limit) return false;
  w.count += 1; return true;
}
```

Лимиты для формы: **20/мин на IP** (щедро — казахстанские операторы держат много
абонентов за одним CGNAT-адресом) и **120/мин глобально** (потолок против
распределённого ботнета, чтобы не залить CRM и Telegram).

### 4.4. Хендлер

```ts
/** Маскированный след отклонённой заявки: клиент ответы игнорирует,
 *  поэтому лог сервера — единственное место, откуда потерянный контакт можно достать. */
function siteLeadTrace(body: Record<string, unknown> | null, c: Context): string {
  const digits = typeof body?.phone === "string" ? body.phone.replace(/\D/g, "") : "";
  return JSON.stringify({
    phone: digits ? `***${digits.slice(-4)}` : "none",
    source: typeof body?.source === "string" ? body.source.slice(0, 64) : "",
    page: typeof body?.page === "string" ? body.page.slice(0, 128) : "",
    ip: clientIp(c),
  });
}

api.post("/site-lead", async (c) => {
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;

  if (!rateLimit(`site-lead:${clientIp(c)}`, 20, 60_000) || !rateLimit("site-lead:global", 120, 60_000)) {
    console.warn("[site-lead] rate-limited submission dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "rate_limited" }, 429);
  }
  if (!body || typeof body !== "object") {
    console.warn("[site-lead] invalid body dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "invalid_body" }, 400);
  }

  // Honeypot: у видимых форм поля "company" нет — заполняют только боты.
  // Отвечаем ok, чтобы бот ушёл довольным, но не сохраняем ничего.
  if (typeof body.company === "string" && body.company.trim()) {
    console.warn("[site-lead] honeypot tripped, dropping submission", siteLeadTrace(body, c));
    return c.json({ ok: true });
  }

  const lead = parseSiteLead(body);
  if (!lead) {
    console.warn("[site-lead] validation-rejected submission dropped", siteLeadTrace(body, c));
    return c.json({ ok: false, error: "validation", fields: ["phone"] }, 400);
  }

  try {
    await appendSiteLead(lead, new Date().toISOString());   // 1) сохранили — заявка уже наша
  } catch (err) {
    console.error("[site-lead] file append failed", err);
    return c.json({ ok: false, error: "store_failed" }, 500);
  }

  void mirrorSiteLead(lead);                                 // 2) зеркалим ВНЕ пути ответа
  return c.json({ ok: true });
});
```

### 4.5. Валидация и санитизация

Философия: **отклонить заявку может только телефон.** Всё остальное — обрезать
и почистить. Мусорный реферер не должен стоить нам живого контакта.

```ts
export const SITE_LEAD_LIMITS = {
  name: 120, phone: 32, source: 64, page: 256, ref: 512, utm: 512,
  utmSource: 256, utmMedium: 256, utmCampaign: 256, utmContent: 256, utmTerm: 256, ts: 40,
} as const;

// Эти поля станут строками «Метка: значение» в COMMENTS Bitrix и в Telegram.
// Переводы строк / control-символы позволили бы боту подделать лишние строки,
// которым менеджер поверит; bidi и zero-width — визуально их замаскировать.
const CONTROL_RUNS = /[\u0000-\u001F\u007F]+/g;
const INVISIBLE    = /[\u200B\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;

const capped = (v: unknown, max: number): string =>
  typeof v === "string" ? v.slice(0, max).replace(CONTROL_RUNS, " ").replace(INVISIBLE, "") : "";

export function parseSiteLead(raw: unknown): SiteLeadPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.phone !== "string" || p.phone.length > SITE_LEAD_LIMITS.phone || !isValidKzPhone(p.phone)) return null;
  return {
    name:   capped(p.name, SITE_LEAD_LIMITS.name).trim(),
    phone:  p.phone,
    source: capped(p.source, SITE_LEAD_LIMITS.source) || "site",
    page:   capped(p.page, SITE_LEAD_LIMITS.page),
    ref:    capped(p.ref,  SITE_LEAD_LIMITS.ref),
    utm:    capped(p.utm,  SITE_LEAD_LIMITS.utm),
    utmSource:   capped(p.utm_source,   SITE_LEAD_LIMITS.utmSource),
    utmMedium:   capped(p.utm_medium,   SITE_LEAD_LIMITS.utmMedium),
    utmCampaign: capped(p.utm_campaign, SITE_LEAD_LIMITS.utmCampaign),
    utmContent:  capped(p.utm_content,  SITE_LEAD_LIMITS.utmContent),
    utmTerm:     capped(p.utm_term,     SITE_LEAD_LIMITS.utmTerm),
    ts: ISO_TS.test(capped(p.ts, SITE_LEAD_LIMITS.ts)) ? (p.ts as string) : "",
  };
}
```

Нормализация номера (Казахстан; для другой страны — заменить):

```ts
/** Приводит KZ-номер к 11 цифрам с кодом 7: 8707…→7707…, +7…, голые 10 цифр. null — не номер. */
export function normalizeKzPhone(raw: string): string | null {
  let d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = "7" + d.slice(1);
  if (d.length === 10 && d.startsWith("7")) d = "7" + d;
  if (d.length === 11 && d.startsWith("7")) return d;
  return null;
}
export const isValidKzPhone = (raw: string) => normalizeKzPhone(raw) !== null;
```

### 4.6. Хранилище — JSONL с fsync

Файл, а не БД: заявок десятки в день, а требование одно — не потерять.

```ts
// Открыть + дописать + fsync: подтверждённая заявка переживает потерю питания,
// а не только штатное завершение процесса.
async function appendRecord(file: string, record: unknown): Promise<void> {
  await fs.mkdir(dirname(file), { recursive: true });
  const fh = await fs.open(file, "a");
  try {
    await fh.appendFile(JSON.stringify(record) + "\n", "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
}

export async function appendSiteLead(lead: SiteLeadPayload, at: string): Promise<void> {
  await appendRecord(process.env.SITE_LEADS_FILE ?? "./data/site-leads.jsonl", {
    at,
    name: lead.name,
    phone: normalizeKzPhone(lead.phone) ?? lead.phone,   // храним нормализованным
    source: lead.source, page: lead.page, ref: lead.ref, utm: lead.utm,
    utmSource: lead.utmSource, utmMedium: lead.utmMedium, utmCampaign: lead.utmCampaign,
    utmContent: lead.utmContent, utmTerm: lead.utmTerm,
    ts: lead.ts,
  });
}
```

Файл монтируется томом (`./data`), иначе передеплой контейнера сотрёт заявки.

### 4.7. Зеркалирование в Telegram и Bitrix24 — вне пути ответа

```ts
async function mirrorSiteLead(lead: SiteLeadPayload): Promise<void> {
  const tasks: Promise<unknown>[] = [notifySiteLead(lead)];
  const webhook = process.env.BITRIX_WEBHOOK_URL;
  if (webhook && !webhook.includes("<")) {            // защита от незаменённого плейсхолдера
    tasks.push(bitrixCall<number>("crm.lead.add", {
      fields: buildSiteLeadFields(lead, process.env.BITRIX_SOURCE_ID ?? "WEB"),
      params: { REGISTER_SONET_EVENT: "Y" },
    }, { webhookUrl: webhook }));
  }
  for (const r of await Promise.allSettled(tasks)) {
    if (r.status === "rejected") console.error("[site-lead] mirror failed (lead is still saved)", r.reason);
  }
}
```

`Promise.allSettled` — упавший Telegram не должен отменять создание лида в CRM и наоборот.

**Telegram:**

```ts
async function sendTelegram(text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN, chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;                              // не настроено — тихий no-op
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage failed: ${res.status}`);
}

export async function notifySiteLead(lead: SiteLeadPayload): Promise<void> {
  const phone = normalizeKzPhone(lead.phone) ?? lead.phone;
  await sendTelegram([
    "🌐 Новая заявка с сайта",
    lead.name && `Имя: ${lead.name}`,
    `Телефон: +${phone}`,
    `Форма: ${lead.source}`,
    lead.page && `Страница: ${lead.page}`,
    lead.ref  && `Реферер: ${lead.ref}`,
    formatUtm(lead) && `UTM: ${formatUtm(lead)}`,
  ].filter(Boolean).join("\n"));
}
```

**Bitrix24 — маппинг полей лида** (`crm.lead.add`):

```ts
export function buildSiteLeadFields(p: SiteLeadPayload, sourceId: string): Record<string, unknown> {
  const phone = normalizeKzPhone(p.phone) ?? p.phone;
  const project = findProject(p.source.replace(/^zk-/, ""));   // формы страниц ЖК помечены "zk-<slug>"
  const utm = formatUtm(p);
  const comments = [
    "Заявка с формы сайта",
    p.page && `Страница: ${p.page}`,
    p.ref  && `Реферер: ${p.ref}`,
    utm    && `UTM: ${utm}`,
    p.ts   && `Отправлено: ${p.ts}`,
  ].filter(Boolean).join("\n");

  const fields: Record<string, unknown> = {
    TITLE:     `Сайт: ${p.source}`,
    NAME:      p.name,
    PHONE:     [{ VALUE: phone, VALUE_TYPE: "WORK" }],
    SOURCE_ID: sourceId,
    COMMENTS:  comments,
  };
  // Родные UTM-поля лида — чтобы работала аналитика самого Bitrix, а не только текст комментария.
  if (p.utmSource)   fields.UTM_SOURCE   = p.utmSource;
  if (p.utmMedium)   fields.UTM_MEDIUM   = p.utmMedium;
  if (p.utmCampaign) fields.UTM_CAMPAIGN = p.utmCampaign;
  if (p.utmContent)  fields.UTM_CONTENT  = p.utmContent;
  if (p.utmTerm)     fields.UTM_TERM     = p.utmTerm;
  if (project) fields["UF_CRM_COMPLEX"] = project.name;        // своё UF-поле (объект/проект)
  return fields;
}
```

**Вызов Bitrix с ретраями:**

```ts
const RETRYABLE_CODES = new Set(["QUERY_LIMIT_EXCEEDED", "OPERATION_TIME_LIMIT", "INTERNAL_SERVER_ERROR"]);
// POST на `${webhookUrl}/${method}.json`, per-attempt timeout 8с (AbortSignal.timeout),
// до 3 ретраев, backoff min(2000, 250 * 2**attempt) — на сетевую ошибку и на коды из списка.
```

**Дедупликация досланных заявок** (`resend: true` из §3.4): перед `crm.lead.add`
проверяйте, нет ли в JSONL записи с той же парой `phone + ts`; если есть — сохраните
запись, но не создавайте второй лид в CRM. Иначе досыл создаст дубли у менеджеров.

### 4.8. Переменные окружения

| Переменная | Назначение | Без неё |
|---|---|---|
| `ALLOWED_ORIGIN` | список Origin через запятую | `*` (для прода — задать явно!) |
| `SITE_LEADS_FILE` | путь к JSONL | `./data/site-leads.jsonl` |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | уведомления в чат ОП | тихий no-op |
| `BITRIX_WEBHOOK_URL` | входящий вебхук Bitrix24 (`https://portal/rest/<user>/<token>`) | лид только в файл |
| `BITRIX_SOURCE_ID` | `SOURCE_ID` лида | `WEB` |
| `PORT` / `HOST` | `3000` / `127.0.0.1` (за прокси на том же хосте; в контейнере — `0.0.0.0`) | |

---

## 5. Чек-лист переноса на новый сайт

**Клиент**

- [ ] `LEAD_WEBHOOK` = боевой URL приёмника (для локальной разработки — пустая строка,
      сайт продолжит работать «в localStorage»)
- [ ] ключи localStorage переименовать под новый бренд (`<brand>_leads`, `<brand>_utm`)
- [ ] заменить страну в маске/валидации телефона, если не Казахстан
- [ ] уникальный `data-form` / `data-lead-source` у **каждой** формы и кнопки —
      это единственное, по чему потом понятно, что именно продаёт
- [ ] honeypot `company` во всех формах
- [ ] ссылка на политику обработки ПДн под каждой кнопкой отправки
- [ ] страница `/spasibo.html` (для inline-форм) — она же цель конверсии в аналитике
- [ ] `bindForms(container)` вызывается после каждого динамического рендера
- [ ] в `track()` не попадают имя и телефон

**Сервер**

- [ ] `ALLOWED_ORIGIN` содержит боевой домен (и `www`) — **проверить curl'ом после деплоя**
- [ ] `./data` смонтирована томом
- [ ] `BITRIX_WEBHOOK_URL` без угловых скобок-плейсхолдеров
- [ ] `UF_CRM_COMPLEX` (или аналог) существует в портале, иначе `crm.lead.add` упадёт
- [ ] лимиты 20/мин на IP и 120/мин глобально пересмотрены под ожидаемый трафик
- [ ] логи сервера собираются: только там видны отклонённые заявки

**Приёмка**

```bash
# 1. Успешная заявка
curl -sS -X POST https://<host>/api/site-lead \
  -H 'Content-Type: application/json' -H 'Origin: https://<site>' \
  -d '{"name":"Тест","phone":"+7 (707) 111-22-33","source":"smoke","page":"/","ref":"","utm":"","ts":"2026-07-30T09:00:00.000Z"}'
# → {"ok":true} + строка в JSONL + сообщение в Telegram + лид в Bitrix

# 2. CORS: в ответе должен быть Access-Control-Allow-Origin с вашим доменом
curl -sSI -X OPTIONS https://<host>/api/site-lead -H 'Origin: https://<site>' \
  -H 'Access-Control-Request-Method: POST' | grep -i access-control

# 3. Honeypot → ok, но записи быть не должно
curl -sS -X POST … -d '{"phone":"+77071112233","company":"bot"}'   # → {"ok":true}, JSONL не растёт

# 4. Плохой телефон → 400 validation
curl -sS -X POST … -d '{"phone":"123"}'
```

И обязательно — **живая отправка из браузера с боевого домена** с открытой консолью:
CORS-ошибка видна только там, ни в каком curl она не воспроизводится.

---

## 6. Грабли, на которые уже наступили

1. **CORS.** Домен сайта не был в `ALLOWED_ORIGIN` — заявки месяц копились в `localStorage`
   посетителей и не доходили. Спас только досыл (§3.4). Проверяйте из браузера, не curl'ом.
2. **Клиент, ждущий ответа.** Если вести на «Спасибо» только по `res.ok`, при любом сбое
   сети пользователь застревает на форме и уходит. Ведём всегда: `sendLead(data).then(done, done)`.
3. **`keepalive: true`** обязателен, если после отправки идёт переход на другую страницу —
   иначе браузер оборвёт запрос.
4. **Синхронное зеркалирование.** Пока Bitrix отвечал 8 секунд, форма «висела».
   Отсюда `void mirrorSiteLead(lead)` после ответа.
5. **Инъекция в COMMENTS.** Бот с `\n` в `ref` дорисовывал в карточке лида строки,
   которым менеджер верил. Отсюда чистка control/bidi/zero-width символов.
6. **Доверие к клиентским расчётам.** В соседнем эндпоинте калькулятора платёж
   пересчитывается на сервере: подделанный POST не должен записать в CRM красивую ложь.
7. **Honeypot через `display:none`** — часть ботов такие поля игнорирует. Только увод за экран.
8. **Досыл без счётчика попыток** превращается в самоDDoS при каждом визите. `_tries < 3`.
