// MOCK-режим (ключей ЮKassa нет): полный цикл оплаты через тестовую страницу, без внешней сети.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { setupEnv, startApp, client } = require('./helpers');

setupEnv();
let ctx, user, other;
before(async () => { ctx = await startApp(); user = client(ctx.base); other = client(ctx.base); await user.register('m@example.com'); await other.register('m2@example.com'); });
after(() => ctx.server.close());

test('mock: создание → тестовая страница → успех → заказ оплачен', async () => {
  assert.equal((await user.get('/api/state')).data.paymentsMock, true);
  const o = (await user.post('/api/orders', { items: [{ serviceId: 'wn8-plus-200', qty: 1 }] })).data;
  const p = await user.post('/api/payments', { orderId: o.id });
  assert.equal(p.status, 200); assert.equal(p.data.mock, true);
  assert.match(p.data.confirmationUrl, /^\/mock-checkout\.html\?pid=mock-/);
  const pid = new URL(p.data.confirmationUrl, 'http://x').searchParams.get('pid');
  // повтор — тот же платёж
  assert.equal((await user.post('/api/payments', { orderId: o.id })).data.paymentId, p.data.paymentId);
  // чужой пользователь не может управлять платежом
  assert.equal((await other.get('/api/payments/mock/' + pid)).status, 404);
  assert.equal((await other.post(`/api/payments/mock/${pid}/result`, { result: 'succeeded' })).status, 404);
  // статус до оплаты
  assert.equal((await user.get('/api/payments/' + p.data.paymentId)).data.status, 'pending');
  assert.equal((await user.post(`/api/payments/mock/${pid}/result`, { result: 'bogus' })).status, 400);
  const r = await user.post(`/api/payments/mock/${pid}/result`, { result: 'succeeded' });
  assert.equal(r.data.status, 'succeeded');
  const st = (await user.get('/api/payments/' + p.data.paymentId)).data;
  assert.equal(st.status, 'succeeded'); assert.equal(st.orderStatus, 'paid');
  assert.equal((await user.get('/api/orders')).data.find((x) => x.id === o.id).status, 'paid');
  // после успеха «отказ» ничего не меняет
  await user.post(`/api/payments/mock/${pid}/result`, { result: 'canceled' });
  assert.equal((await user.get('/api/orders')).data.find((x) => x.id === o.id).status, 'paid');
});

test('mock: отказ → canceled, повторная оплата создаёт новый платёж', async () => {
  const o = (await user.post('/api/orders', { items: [{ serviceId: 'silver-10m', qty: 1 }] })).data;
  const p = await user.post('/api/payments', { orderId: o.id });
  const pid = new URL(p.data.confirmationUrl, 'http://x').searchParams.get('pid');
  assert.equal((await user.post(`/api/payments/mock/${pid}/result`, { result: 'canceled' })).data.status, 'canceled');
  assert.equal((await user.get('/api/orders')).data.find((x) => x.id === o.id).status, 'new');
  const p2 = await user.post('/api/payments', { orderId: o.id });
  assert.equal(p2.status, 200); assert.notEqual(p2.data.paymentId, p.data.paymentId);
});

test('mock: подделанный вебхук ничего не меняет (статус берётся у «провайдера»)', async () => {
  const o = (await user.post('/api/orders', { items: [{ serviceId: 'silver-10m', qty: 1 }] })).data;
  const p = await user.post('/api/payments', { orderId: o.id });
  const pid = new URL(p.data.confirmationUrl, 'http://x').searchParams.get('pid');
  const r = await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: pid, status: 'succeeded' } });
  assert.equal(r.status, 200);
  assert.equal((await user.get('/api/orders')).data.find((x) => x.id === o.id).status, 'new');
  assert.equal((await user.post('/api/payments/webhook', { type: 'notification', event: 'payment.succeeded', object: { id: 'mock-nonexistent' } })).status, 404);
});
