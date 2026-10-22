// Личный кабинет: профиль, баланс, заказы
const STATUS = { new: 'Новый', paid: 'Оплачен', in_progress: 'В работе', done: 'Выполнен', cancelled: 'Отменён' };

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

  // Баланс и пополнение
  const loadBalance = async () => { $('#balance').textContent = fmtKop((await Api.get('/api/billing')).balance); };
  await loadBalance();
  const tf = $('#topup');
  tf.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(tf)) return showMsg(tf, 'Сумма от 100 до 100 000 ₽');
    try {
      const r = await Api.post('/api/billing/topup', { amount: Number(tf.amount.value) });
      if (r.confirmationUrl) location.href = r.confirmationUrl; // редирект на страницу оплаты ЮKassa
      else showMsg(tf, r.message || 'Платёж создан', 'ok');
    } catch (err) { showMsg(tf, err.message); }
  });

  // Заказы
  const orders = await Api.get('/api/orders');
  $('#orders').innerHTML = orders.length ? orders.map((o) => `
    <div class="card">
      <div class="row"><strong>Заказ №${o.id}</strong><span class="status">${esc(STATUS[o.status] || o.status)}</span></div>
      <p class="muted">${esc(o.created_at)} · ${fmtKop(o.total)}</p>
      <p>${o.items.map((i) => esc(i.title) + (i.tankName ? ' (' + esc(i.tankName) + ')' : '')).join(', ')}</p>
    </div>`).join('') : '<p class="muted">Заказов пока нет</p>';
})();
