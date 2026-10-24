// Страница возврата после оплаты: статус перепроверяется сервером у ЮKassa (GET /api/payments/:id)
(async () => {
  const box = $('#result');
  const id = Number(new URLSearchParams(location.search).get('payment'));
  const s = await Api.state();
  if (!s.authenticated) return (location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search));
  if (!Number.isInteger(id) || id < 1) { box.innerHTML = '<p class="error">Платёж не найден.</p><a class="btn" href="/account.html">В кабинет</a>'; return; }

  const view = (p) => {
    const T = {
      succeeded: ['pay-ok', 'Оплачено', `Заказ №${p.orderId} оплачен на сумму ${fmtKop(p.amount)}. Спасибо!`],
      canceled: ['pay-fail', 'Оплата отменена', 'Платёж не прошёл или был отменён. Деньги не списаны — вы можете повторить оплату в кабинете.'],
      pending: ['pay-wait', 'Ожидает оплаты', 'Платёж ещё обрабатывается. Статус обновится автоматически.'],
    }[p.status] || ['pay-wait', p.status, ''];
    box.innerHTML = `${p.mock ? '<p class="notice">Тестовый режим: деньги не списывались.</p>' : ''}
      <h2 class="paystatus ${T[0]}">${esc(T[1])}</h2><p>${esc(T[2])}</p>
      <a class="btn" href="/account.html?order=${p.orderId}">Перейти к заказам</a>`;
  };

  // Пока pending — опрашиваем несколько раз (вебхук/банк могут подтверждать с задержкой)
  for (let i = 0; i < 8; i++) {
    try {
      const p = await Api.get('/api/payments/' + id);
      view(p);
      if (p.status !== 'pending') return;
    } catch (err) { box.innerHTML = `<p class="error">${esc(err.message)}</p><a class="btn" href="/account.html">В кабинет</a>`; return; }
    await new Promise((r) => setTimeout(r, 3000));
  }
})();
