// Личный кабинет: профиль, баланс, заказы
const STATUS = { new: 'Ожидает оплаты', paid: 'Оплачен', in_progress: 'В работе', done: 'Выполнен', cancelled: 'Отменён' };

(async () => {
  const s = await Api.state();
  if (!s.authenticated) return (location.href = '/login.html?next=/account.html');

  // Профиль
  const pf = $('#profile');
  const fill = (u) => { $('#profile-email').textContent = u.email; for (const k of ['display_name', 'game_nickname', 'game_server', 'telegram']) pf[k].value = u[k] || ''; };
  fill(await Api.get('/api/profile'));
  pf.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(pf)) return showMsg(pf, 'Проверьте поля (ник — латиница/цифры/_)');
    try {
      fill(await Api.post('/api/profile', Object.fromEntries(['display_name', 'game_nickname', 'game_server', 'telegram'].map((k) => [k, pf[k].value]))));
      showMsg(pf, 'Сохранено', 'ok');
    } catch (err) { showMsg(pf, err.message); }
  });
  $('#logout').addEventListener('click', async () => { await Api.post('/api/logout'); location.href = '/'; });

  $('#mock-banner').classList.toggle('hidden', !s.paymentsMock);

  // Статус оплаты (по последнему платежу)
  const PAY_LABEL = {
    succeeded: ['Оплачено', 'pay-ok'],
    pending: ['Платёж ожидает подтверждения', 'pay-wait'],
    canceled: ['Оплата отменена — можно повторить', 'pay-fail'],
  };
  const paidMark = (o) => (o.status === 'new' ? PAY_LABEL[o.payment_status] || ['Ожидает оплаты', 'pay-wait'] : PAY_LABEL.succeeded);

  // Заказы
  const params = new URLSearchParams(location.search);
  const highlight = Number(params.get('order')) || null;
  const orders = await Api.get('/api/orders');
  $('#orders').innerHTML = orders.length ? orders.map((o) => {
    const [label, cls] = paidMark(o);
    const payable = o.status === 'new';
    return `
    <div class="card${o.id === highlight ? ' card--hl' : ''}">
      <div class="row"><strong>Заказ №${o.id}</strong><span class="status">${esc(STATUS[o.status] || o.status)}</span></div>
      <p class="muted">${esc(o.created_at)} · ${fmtKop(o.total)}</p>
      <p>${o.items.map((i) => esc(i.title) + (i.tankName ? ' (' + esc(i.tankName) + ')' : '')).join(', ')}</p>
      ${o.status === 'cancelled' ? '' : `<p class="paystatus ${cls}">${esc(label)}</p>`}
      ${payable ? `<button class="btn" data-pay="${o.id}">Оплатить ${fmtKop(o.total)}</button>
      <p class="muted small">Visa / Mastercard / МИР — оплата на странице ЮKassa</p>` : ''}
    </div>`;
  }).join('') : '<p class="muted">Заказов пока нет</p>';

  $('#orders').addEventListener('click', async (e) => {
    const id = Number(e.target.dataset.pay);
    if (!id) return;
    e.target.disabled = true;
    $('#orders-msg').textContent = '';
    try {
      const r = await Api.post('/api/payments', { orderId: id });
      // Переходим только на https (ЮKassa) или на наш тестовый mock-путь
      if (/^https:\/\//.test(r.confirmationUrl) || /^\/mock-checkout\.html\?/.test(r.confirmationUrl)) location.href = r.confirmationUrl;
      else throw new Error('Не удалось получить ссылку на оплату');
    } catch (err) {
      $('#orders-msg').textContent = err.message;
      e.target.disabled = false;
    }
  });
})();
