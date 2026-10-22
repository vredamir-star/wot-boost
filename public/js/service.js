// Карточка услуги: /service.html?id=...
(async () => {
  const box = $('#service');
  const id = new URLSearchParams(location.search).get('id');
  try {
    const s = await Api.get('/api/services/' + encodeURIComponent(id || ''));
    document.title = s.title + ' — TankBoost';
    box.innerHTML = `
      <span class="muted">${esc(s.category)}</span>
      <h1>${esc(s.title)}</h1>
      <p>${esc(s.description)}</p>
      <p class="muted">Ориентировочный срок: ${esc(s.durationDays)} дн.</p>
      <form id="add" class="form" novalidate>
        ${s.options?.tankName ? '<label>Название техники <input name="tankName" required maxlength="50" placeholder="Например, Об. 140"></label>' : ''}
        <p class="price">${fmtRub(s.price)}</p>
        <p class="error"></p><p class="ok"></p>
        <button class="btn" type="submit">В корзину</button>
      </form>`;
    $('#add').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = e.target;
      if (!validateForm(f)) return showMsg(f, 'Заполните обязательные поля');
      Cart.add(s.id, f.tankName ? { tankName: f.tankName.value.trim() } : undefined);
      showMsg(f, 'Добавлено в корзину', 'ok');
    });
  } catch { box.innerHTML = '<p class="error">Услуга не найдена</p>'; }
})();
