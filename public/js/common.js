// Общие утилиты: корзина (localStorage), форматирование, экранирование, навигация.
const fmtRub = (rub) => new Intl.NumberFormat('ru-RU').format(rub) + ' ₽';
const fmtKop = (kop) => fmtRub(kop / 100);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);

const Cart = {
  KEY: 'wot-cart',
  items() { try { return JSON.parse(localStorage.getItem(this.KEY)) || []; } catch { return []; } },
  save(items) { localStorage.setItem(this.KEY, JSON.stringify(items)); updateCartBadge(); },
  add(serviceId, options) { const it = this.items(); it.push({ serviceId, qty: 1, options }); this.save(it); },
  remove(i) { const it = this.items(); it.splice(i, 1); this.save(it); },
  clear() { this.save([]); },
};

function updateCartBadge() { const b = $('#cart-count'); if (b) b.textContent = Cart.items().length; }

// Простая клиентская валидация по HTML5-атрибутам; сервер всё равно проверяет сам
function validateForm(form) {
  let ok = true;
  for (const el of form.elements) {
    if (!el.willValidate) continue;
    const valid = el.checkValidity();
    el.classList.toggle('invalid', !valid);
    ok = ok && valid;
  }
  return ok;
}

function showMsg(form, text, type = 'error') {
  form.querySelectorAll('.error, .ok').forEach((e) => (e.textContent = ''));
  const el = form.querySelector('.' + type);
  if (el) el.textContent = text;
}

updateCartBadge();
Api.state().then((s) => {
  $('#nav-login')?.classList.toggle('hidden', s.authenticated);
  $('#nav-account')?.classList.toggle('hidden', !s.authenticated);
}).catch(() => {});
