// Вход / регистрация
const next = (() => { const n = new URLSearchParams(location.search).get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/account.html'; })();

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
  $('#login').classList.toggle('hidden', t.dataset.tab !== 'login');
  $('#register').classList.toggle('hidden', t.dataset.tab !== 'register');
}));

$('#login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validateForm(f)) return showMsg(f, 'Проверьте email и пароль');
  try { await Api.post('/api/login', { email: f.email.value, password: f.password.value }); location.href = next; }
  catch (err) { showMsg(f, err.message); }
});

$('#register').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (!validateForm(f)) return showMsg(f, 'Заполните все поля и дайте согласие на обработку ПДн');
  if (f.password.value !== f.password2.value) return showMsg(f, 'Пароли не совпадают');
  try {
    await Api.post('/api/register', { email: f.email.value, password: f.password.value, pdConsent: f.pdConsent.checked });
    location.href = next;
  } catch (err) { showMsg(f, err.message); }
});
