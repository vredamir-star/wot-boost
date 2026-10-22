// Корзина и оформление заказа
(async () => {
  const list = $('#cart-list'), form = $('#checkout');
  const services = await Api.get('/api/services');
  const byId = Object.fromEntries(services.map((s) => [s.id, s]));

  function render() {
    const items = Cart.items().filter((i) => byId[i.serviceId]);
    list.innerHTML = items.length ? items.map((i, idx) => `
      <div class="card row">
        <span>${esc(byId[i.serviceId].title)}${i.options?.tankName ? ' — ' + esc(i.options.tankName) : ''}</span>
        <span class="row"><strong>${fmtRub(byId[i.serviceId].price)}</strong>
        <button class="btn btn--ghost" data-remove="${idx}">Удалить</button></span>
      </div>`).join('') : '<p class="muted">Корзина пуста. <a href="/">Перейти к услугам</a></p>';
    $('#cart-total').textContent = fmtRub(items.reduce((s, i) => s + byId[i.serviceId].price * i.qty, 0));
    form.classList.toggle('hidden', !items.length);
  }

  list.addEventListener('click', (e) => { if (e.target.dataset.remove) { Cart.remove(+e.target.dataset.remove); render(); } });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateForm(form)) return;
    const s = await Api.state();
    if (!s.authenticated) return (location.href = '/login.html?next=/cart.html');
    try {
      const order = await Api.post('/api/orders', { items: Cart.items(), comment: form.comment.value.trim() });
      Cart.clear();
      location.href = '/account.html?order=' + order.id;
    } catch (err) { showMsg(form, err.message); }
  });

  render();
})();
