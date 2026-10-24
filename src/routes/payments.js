// Оплата заказов через ЮKassa (карты «Мир», Visa, Mastercard и др. — выбор на странице ЮKassa).
// Без ключей работает MOCK-режим (см. config.yookassa.mock): тестовая страница, деньги не списываются.
const router = require('express').Router();
const db = require('../db');
const config = require('../config');
const yk = require('../yookassa');
const payments = require('../payments');
const requireAuth = require('../middleware/auth');
const { paymentCreateLimiter, paymentStatusLimiter, webhookLimiter } = require('../middleware/rateLimit');

const publicPayment = (p, order) => ({
  id: p.id, orderId: p.order_id, status: p.status, amount: p.amount,
  orderStatus: order?.status, mock: config.yookassa.mock,
});

// POST /api/payments  { orderId } → { paymentId, status, confirmationUrl, mock }
// Сумма берётся из заказа на сервере (он собран по data/services.json); из запроса — только id заказа.
router.post('/', requireAuth, paymentCreateLimiter, async (req, res) => {
  const orderId = req.body?.orderId;
  if (!Number.isInteger(orderId) || orderId < 1) return res.status(400).json({ error: 'Некорректный заказ' });
  const order = db.orders.getForUser(orderId, req.session.userId); // чужие заказы → 404
  if (!order) return res.status(404).json({ error: 'Заказ не найден' });
  if (order.status !== 'new') return res.status(409).json({ error: 'Заказ уже оплачен или закрыт' });
  try {
    const r = await payments.startForOrder(order);
    if (r.alreadyPaid) return res.status(409).json({ error: 'Заказ уже оплачен' });
    res.json({ paymentId: r.payment.id, status: r.payment.status, confirmationUrl: r.payment.confirmation_url, mock: config.yookassa.mock });
  } catch (e) {
    console.error('[payments] create failed:', e.message);
    res.status(502).json({ error: 'Платёжный провайдер недоступен, попробуйте позже' });
  }
});

// POST /api/payments/webhook — уведомления ЮKassa (payment.succeeded / payment.canceled).
// Телу запроса НЕ доверяем: берём только id, сам платёж заново запрашиваем по API ЮKassa и сверяем
// статус, сумму, валюту и metadata.order_id с нашей записью. CSRF/сессия не применяются (см. middleware/csrf.js).
router.post('/webhook', webhookLimiter, async (req, res) => {
  const body = req.body || {};
  if (body.type !== 'notification' || typeof body.event !== 'string') return res.status(400).json({ error: 'Bad request' });
  if (!['payment.succeeded', 'payment.canceled', 'payment.waiting_for_capture'].includes(body.event))
    return res.json({ ok: true, ignored: true }); // другие события (refund.*) пока не обрабатываем
  const id = body.object?.id;
  if (!yk.isValidId(id)) return res.status(400).json({ error: 'Bad request' });
  const local = db.payments.getByProviderId(id);
  if (!local) return res.status(404).json({ error: 'Unknown payment' }); // к ЮKassa за чужими id не ходим
  try {
    const r = await payments.reconcile(local);
    if (!r.ok) return res.status(400).json({ error: 'Payment verification failed' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[payments] webhook re-fetch failed:', e.message);
    res.status(502).json({ error: 'Provider unavailable' }); // ЮKassa повторит уведомление
  }
});

// ---- MOCK-режим: имитация страницы оплаты ЮKassa (404, если заданы настоящие ключи) ----
function mockOnly(req, res, next) {
  if (!config.yookassa.mock) return res.status(404).json({ error: 'Не найдено' });
  next();
}
function mockPayment(req, res) {
  const pid = req.params.pid;
  const local = yk.isValidId(pid) && db.payments.getByProviderId(pid);
  if (!local || local.user_id !== req.session.userId) { res.status(404).json({ error: 'Платёж не найден' }); return null; }
  return local;
}

router.get('/mock/:pid', mockOnly, requireAuth, paymentStatusLimiter, (req, res) => {
  const local = mockPayment(req, res); if (!local) return;
  const m = db.mockProvider.get(local.provider_id);
  res.json({ paymentId: local.id, orderId: local.order_id, amount: local.amount, status: m?.status || local.status, mock: true });
});

// body: { result: 'succeeded' | 'canceled' } — имитация действия пользователя на странице оплаты
router.post('/mock/:pid/result', mockOnly, requireAuth, paymentCreateLimiter, async (req, res) => {
  const local = mockPayment(req, res); if (!local) return;
  const result = req.body?.result;
  if (!['succeeded', 'canceled'].includes(result)) return res.status(400).json({ error: 'Некорректный результат' });
  db.mockProvider.setStatus(local.provider_id, result);
  try {
    // Как и в бою: дальше статус подтверждается повторным запросом платежа у «провайдера»
    const r = await payments.reconcile(local);
    res.json({ paymentId: local.id, status: r.status });
  } catch (e) { res.status(502).json({ error: 'Ошибка проверки платежа' }); }
});

// GET /api/payments/:id — статус платежа (страница возврата). Если ещё pending — перепроверяем у ЮKassa.
router.get('/:id(\\d+)', requireAuth, paymentStatusLimiter, async (req, res) => {
  let p = db.payments.getForUser(Number(req.params.id), req.session.userId);
  if (!p) return res.status(404).json({ error: 'Платёж не найден' });
  let checked = true;
  if (p.status === 'pending' && p.provider_id) {
    try { await payments.reconcile(p); p = db.payments.get(p.id); } catch (e) { checked = false; }
  }
  const order = p.order_id ? db.orders.getForUser(p.order_id, req.session.userId) : null;
  res.json({ ...publicPayment(p, order), checked });
});

module.exports = router;
