// Тесты интеграции ЮKassa с ПОДМЕНЁННЫМ fetch (реальных запросов к api.yookassa.ru нет).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupEnv, startApp, client } = require('./helpers');

setupEnv({ YOOKASSA_SHOP_ID: '123456', YOOKASSA_SECRET_KEY: 'test_secret', YOOKASSA_API_URL: 'https://yk.test/v3' });

const realFetch = globalThis.fetch;
const calls = [];            // все запросы к «ЮKassa»
const remote = new Map();    // id -> «состояние платежа на стороне ЮKassa»
const byKey = new Map();     // Idempotence-Key -> id
let seq = 0;
globalThis.fetch = async (url, opts = {}) => {
  if (!String(url).startsWith('https://yk.test/v3')) return realFetch(url, opts);
  const path = String(url).slice('https://yk.test/v3'.length);
  calls.push({ method: opts.method, path, headers: opts.headers, body: opts.body ? JSON.parse(opts.body) : null });
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
  if (opts.method === 'POST' && path === '/payments') {
    const key = opts.headers['Idempotence-Key'];
    if (byKey.has(key)) return json(200, remote.get(byKey.get(key)));
    const b = JSON.parse(opts.body);
    const id = 'yk-' + (++seq) + '-aaaa';
    const p = { id, status: 'pending', paid: false, amount: b.amount, metadata: b.metadata,
      confirmation: { type: 'redirect', confirmation_url: 'https://yoomoney.ru/checkout/payments/v2/contract?orderId=' + id } };
    remote.set(id, p); byKey.set(key, id);
    return json(200, p);
  }
  const m = path.match(/^\/payments\/([\w-]+)$/);
  if (opts.method === 'GET' && m) return remote.has(m[1]) ? json(200, remote.get(m[1])) : json(404, { code: 'not_found' });
  return json(400, {});
};

let ctx, user, other, orderId;
const createdCalls = () => calls.filter((c) => c.method === 'POST');

before(async () => {
  ctx = await startApp();
  user = client(ctx.base); other = client(ctx.base);
  await user.register('buyer@example.com'); await other.register('other@example.com');
  const o = await user.post('/api/orders', { items: [{ serviceId: 'lvl-8', qty: 2 }, { serviceId: 'silver-10m', qty: 1 }], comment: '' });
  assert.equal(o.status, 201);
  orderId = o.data.id;
  assert.equal(o.data.total, (2490 * 2 + 1990) * 100);
});
after(() => { ctx.server.close(); globalThis.fetch = realFetch; });

test('создание платежа: сумма с сервера, заголовки, redirect, metadata', async () => {
  // клиент пытается подсунуть свою сумму — игнорируется
  const r = await user.post('/api/payments', { orderId, amount: 1, price: 1 });
  assert.equal(r.status, 200);
  assert.match(r.data.confirmationUrl, /^https:\/\/yoomoney\.ru\//);
  assert.equal(r.data.mock, false);
  const c = createdCalls()[0];
  assert.equal(c.headers.Authorization, 'Basic ' + Buffer.from('123456:test_secret').toString('base64'));
  assert.ok(c.headers['Idempotence-Key']);
  assert.deepEqual(c.body.amount, { value: '6970.00', currency: 'RUB' });
  assert.equal(c.body.capture, true);
  assert.equal(c.body.confirmation.type, 'redirect');
  assert.match(c.body.confirmation.return_url, /^https:\/\/shop\.example\.ru\/payment-return\.html\?payment=\d+$/);
  assert.equal(c.body.metadata.order_id, String(orderId));
  assert.equal(c.body.receipt, undefined); // чек выключен по умолчанию
  assert.equal(c.body.payment_method_data, undefined); // способ выбирается на странице ЮKassa (там есть «Мир»)
});

test('повторное «Оплатить» идемпотентно: тот же платёж, второго запроса create нет', async () => {
  const before = createdCalls().length;
  const a = await user.post('/api/payments', { orderId });
  const b = await user.post('/api/payments', { orderId });
  assert.equal(a.data.paymentId, b.data.paymentId);
  assert.equal(a.data.confirmationUrl, b.data.confirmationUrl);
  assert.equal(createdCalls().length, before);
});

test('чужой заказ / несуществующий / невалидный id / без входа', async () => {
  assert.equal((await other.post('/api/payments', { orderId })).status, 404);
  assert.equal((await user.post('/api/payments', { orderId: 99999 })).status, 404);
  assert.equal((await user.post('/api/payments', { orderId: '1; DROP' })).status, 400);
  const anon = client(ctx.base); await anon.get('/api/state');
  assert.equal((await anon.post('/api/payments', { orderId })).status, 401);
});

test('POST без CSRF-токена отклоняется', async () => {
  const res = await realFetch(ctx.base + '/api/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"orderId":1}' });
  assert.equal(res.status, 403);
});

test('вебхук: неизвестный id отклоняется, запросов к ЮKassa нет', async () => {
  const n = calls.length;
  const r = await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: 'forged-id-123', status: 'succeeded' } });
  assert.equal(r.status, 404);
  assert.equal(calls.length, n);
  assert.equal((await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: '../../x' } })).status, 400);
  assert.equal((await user.post('/api/payments/webhook', { foo: 1 })).status, 400);
});

test('вебхук: подделка «succeeded» при реальном статусе pending не оплачивает заказ', async () => {
  const p = [...remote.values()][0];
  const r = await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded',
    object: { id: p.id, status: 'succeeded', paid: true, amount: p.amount } });
  assert.equal(r.status, 200);
  const orders = (await user.get('/api/orders')).data;
  assert.equal(orders.find((o) => o.id === orderId).status, 'new');
});

test('вебхук: сумма на стороне ЮKassa не совпадает с нашей → отклонён, заказ не оплачен', async () => {
  const p = [...remote.values()][0];
  const saved = { ...p.amount, };
  p.status = 'succeeded'; p.paid = true; p.amount = { value: '1.00', currency: 'RUB' };
  const r = await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: p.id } });
  assert.equal(r.status, 400);
  assert.equal((await user.get('/api/orders')).data.find((o) => o.id === orderId).status, 'new');
  // другой order_id в metadata
  p.amount = saved; p.metadata = { order_id: '424242' };
  assert.equal((await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: p.id } })).status, 400);
  assert.equal((await user.get('/api/orders')).data.find((o) => o.id === orderId).status, 'new');
  // другая валюта
  p.metadata = { order_id: String(orderId) }; p.amount = { value: saved.value, currency: 'USD' };
  assert.equal((await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: p.id } })).status, 400);
  p.amount = saved; p.status = 'pending'; p.paid = false; // вернуть
});

test('вебхук: валидный payment.succeeded помечает заказ оплаченным; повтор идемпотентен', async () => {
  const p = [...remote.values()][0];
  p.status = 'succeeded'; p.paid = true;
  const hook = { type: 'notification', event: 'payment.succeeded', object: { id: p.id } };
  assert.equal((await user.post('/api/payments/webhook', hook)).status, 200);
  const o1 = (await user.get('/api/orders')).data.find((o) => o.id === orderId);
  assert.equal(o1.status, 'paid'); assert.equal(o1.payment_status, 'succeeded'); assert.ok(o1.paid_at);
  assert.equal((await user.post('/api/payments/webhook', hook)).status, 200);
  assert.equal((await user.post('/api/payments/webhook', hook)).status, 200);
  const o2 = (await user.get('/api/orders')).data.find((o) => o.id === orderId);
  assert.equal(o2.paid_at, o1.paid_at);
  // повторная оплата оплаченного заказа не создаёт новый платёж
  const n = createdCalls().length;
  assert.equal((await user.post('/api/payments', { orderId })).status, 409);
  assert.equal(createdCalls().length, n);
});

test('отменённый платёж: статус canceled, можно создать новый; succeeded не откатывается', async () => {
  const o = await user.post('/api/orders', { items: [{ serviceId: 'silver-10m', qty: 1 }] });
  const r1 = await user.post('/api/payments', { orderId: o.data.id });
  const p1 = remote.get(byKey.get([...byKey.keys()].at(-1)));
  p1.status = 'canceled';
  // страница возврата перепроверяет статус сама (без вебхука)
  const st = await user.get('/api/payments/' + r1.data.paymentId);
  assert.equal(st.data.status, 'canceled'); assert.equal(st.data.orderStatus, 'new');
  const list = (await user.get('/api/orders')).data.find((x) => x.id === o.data.id);
  assert.equal(list.payment_status, 'canceled');
  const r2 = await user.post('/api/payments', { orderId: o.data.id });
  assert.equal(r2.status, 200); assert.notEqual(r2.data.paymentId, r1.data.paymentId);
  // поздний «canceled» по оплаченному ранее платежу не откатывает оплату
  const paid = [...remote.values()][0]; paid.status = 'canceled';
  await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.canceled', object: { id: paid.id } });
  assert.equal((await user.get('/api/orders')).data.find((x) => x.id === orderId).status, 'paid');
});

test('чужой платёж недоступен через /api/payments/:id; mock-эндпоинты выключены при реальных ключах', async () => {
  const pid = (await user.get('/api/billing')).data.payments[0].id;
  assert.equal((await other.get('/api/payments/' + pid)).status, 404);
  assert.equal((await user.get('/api/payments/mock/abc')).status, 404);
  assert.equal((await user.post('/api/payments/mock/abc/result', { result: 'succeeded' })).status, 404);
});

test('сбой сети при создании: ключ идемпотентности переиспользуется', async () => {
  const o = await user.post('/api/orders', { items: [{ serviceId: 'silver-10m', qty: 1 }] });
  const saved = globalThis.fetch;
  let failedKey;
  globalThis.fetch = async (url, opts) => { if (String(url).startsWith('https://yk.test/') && opts.method === 'POST') { failedKey = opts.headers['Idempotence-Key']; throw new Error('network'); } return saved(url, opts); };
  assert.equal((await user.post('/api/payments', { orderId: o.data.id })).status, 502);
  globalThis.fetch = saved;
  const before = createdCalls().length;
  assert.equal((await user.post('/api/payments', { orderId: o.data.id })).status, 200);
  assert.equal(createdCalls().length, before + 1);
  assert.ok(failedKey);
  assert.equal(createdCalls().at(-1).headers['Idempotence-Key'], failedKey); // повтор — с тем же ключом
});

test('чек 54-ФЗ: билдер формирует items/vat_code/customer и сходится с суммой', () => {
  process.env.YOOKASSA_RECEIPT = 'true';
  delete require.cache[require.resolve('../src/config')];
  delete require.cache[require.resolve('../src/receipt')];
  const { buildReceipt } = require('../src/receipt');
  const rc = buildReceipt({ email: 'a@b.ru', order: { total: 700000, items: [{ title: 'Услуга', qty: 2, price: 350000 }] } });
  assert.deepEqual(rc.customer, { email: 'a@b.ru' });
  assert.equal(rc.items[0].quantity, '2.00'); assert.equal(rc.items[0].amount.value, '3500.00');
  assert.equal(rc.items[0].vat_code, 1);
  assert.throws(() => buildReceipt({ email: 'a@b.ru', order: { total: 1, items: [{ title: 'x', qty: 1, price: 350000 }] } }));
});
