// Главная: витрина услуг с фильтром по категориям
(async () => {
  const grid = $('#catalog'), filters = $('#filters');
  const services = await Api.get('/api/services');
  const cats = ['Все', ...new Set(services.map((s) => s.category))];

  function render(cat) {
    const list = cat === 'Все' ? services : services.filter((s) => s.category === cat);
    grid.innerHTML = list.map((s) => `
      <article class="card service-card">
        <span class="cat">${esc(s.category)}</span>
        <h3>${esc(s.title)}</h3>
        <p class="desc">${esc(s.description)}</p>
        <div class="row"><span class="price">${fmtRub(s.price)}</span>
          <a class="btn" href="/service.html?id=${encodeURIComponent(s.id)}">Подробнее</a></div>
      </article>`).join('');
    filters.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c.dataset.cat === cat));
  }

  filters.innerHTML = cats.map((c) => `<button class="chip" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  filters.addEventListener('click', (e) => e.target.dataset.cat && render(e.target.dataset.cat));
  render('Все');
})().catch(() => { $('#catalog').innerHTML = '<p class="error">Не удалось загрузить каталог</p>'; });
