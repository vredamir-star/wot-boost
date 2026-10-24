// ТЕСТОВАЯ страница оплаты (только когда ключи ЮKassa не заданы). Карту здесь вводить нельзя — полей нет.
(async () => {
  const box = $('#checkout-box');
  const pid = new URLSearchParams(location.search).get('pid') || '';
  const s = await Api.state();
  if (!s.authenticated) return (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search));
  let info;
  try { info = await Api.get('/api/payments/mock/' + encodeURIComponent(pid)); }
  catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p><a class="btn" href="/account.html">В кабинет</a>`; return; }

  box.innerHTML = `<p>Заказ №${info.orderId} · сумма <strong>${fmtKop(info.amount)}</strong></p>
    <p class="muted">Имитация оплаты картой МИР / Visa / Mastercard. Выберите результат:</p>
    <p class="error" id="mock-err"></p>
    <div class="btn-row">
      <button class="btn" data-result="succeeded">Симулировать успешную оплату</button>
      <button class="btn btn--danger" data-result="canceled">Симулировать отказ / отмену</button>
    </div>`;
  box.addEventListener('click', async (e) => {
    const result = e.target.dataset.result;
    if (!result) return;
    box.querySelectorAll('button').forEach((b) => (b.disabled = true));
    try {
      const r = await Api.post(`/api/payments/mock/${encodeURIComponent(pid)}/result`, { result });
      location.href = '/payment-return.html?payment=' + r.paymentId;
    } catch (err) { $('#mock-err').textContent = err.message; box.querySelectorAll('button').forEach((b) => (b.disabled = false)); }
  });
})();
