// Общие утилиты тестов: временная БД, запуск приложения на случайном порту, мини-клиент с cookie/CSRF.
const os = require('os');
const path = require('path');
const fs = require('fs');

function setupEnv(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wotboost-'));
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_PATH: path.join(dir, 'test.db'), SESSION_SECRET: 'test-secret',
    PUBLIC_BASE_URL: 'https://shop.example.ru', YOOKASSA_SHOP_ID: '', YOOKASSA_SECRET_KEY: '', ...extra,
  });
  return dir;
}

async function startApp() {
  const app = require('../src/server');
  const server = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

// Клиент: хранит cookie и CSRF-токен
function client(base) {
  let cookie = '', csrf = '';
  async function req(method, url, body) {
    const res = await fetch(base + url, {
      method,
      headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}), ...(csrf ? { 'X-CSRF-Token': csrf } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const sc = res.headers.getSetCookie?.() || [];
    if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
    const data = await res.json().catch(() => ({}));
    if (data.csrfToken) csrf = data.csrfToken;
    return { status: res.status, data };
  }
  return {
    get: (u) => req('GET', u),
    post: (u, b = {}) => req('POST', u, b),
    async register(email) {
      await req('GET', '/api/state');
      const r = await req('POST', '/api/register', { email, password: 'password123', pdConsent: true });
      if (r.status !== 200) throw new Error('register failed ' + JSON.stringify(r));
    },
  };
}

module.exports = { setupEnv, startApp, client };
