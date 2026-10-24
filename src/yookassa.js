// Клиент ЮKassa API v3 (https://yookassa.ru/developers/api).
// Реальные ключи заданы → запросы идут на api.yookassa.ru (Basic shopId:secretKey).
// Ключей нет (config.yookassa.mock) → тот же интерфейс, но «сервер ЮKassa» имитируется в нашей БД.
// Номера карт (PAN) НИКОГДА не проходят через наш сервер: ввод карты — только на странице ЮKassa.
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');
const { money } = require('./receipt');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const isValidId = (id) => typeof id === 'string' && ID_RE.test(id);

// "4990.00" -> 499000 (копейки); null, если формат неверный
function parseAmount(v) {
  if (typeof v !== 'string' || !/^\d{1,9}(\.\d{1,2})?$/.test(v)) return null;
  const [r, k = ''] = v.split('.');
  return Number(r) * 100 + Number(k.padEnd(2, '0'));
}

async function call(method, path, { body, idempotenceKey } = {}) {
  const { shopId, secretKey, apiUrl } = config.yookassa;
  const res = await fetch(apiUrl + path, {
    method,
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotenceKey ? { 'Idempotence-Key': idempotenceKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Тело ошибки может содержать описание; секреты в нём не бывает, но наружу не отдаём
    throw Object.assign(new Error(`YooKassa ${method} ${path} -> ${res.status} ${data.code || ''}`), { status: res.status });
  }
  return data;
}

// params: { idempotenceKey, amount (копейки), description, orderId, paymentId (локальный), returnUrl, receipt? }
async function createPayment({ idempotenceKey, amount, description, orderId, paymentId, returnUrl, receipt }) {
  if (config.yookassa.mock) {
    const id = 'mock-' + crypto.randomUUID();
    const row = db.mockProvider.create({ id, idemKey: idempotenceKey, amount, orderId: String(orderId) });
    return shape(row, `/mock-checkout.html?pid=${encodeURIComponent(row.id)}`);
  }
  // Способ оплаты НЕ указываем: пользователь выберет на странице ЮKassa (там есть «Мир», Visa, Mastercard, СБП…)
  return call('POST', '/payments', {
    idempotenceKey,
    body: {
      amount: { value: money(amount), currency: 'RUB' },
      capture: true,
      confirmation: { type: 'redirect', return_url: returnUrl, locale: 'ru_RU' },
      description,
      metadata: { order_id: String(orderId), payment_id: String(paymentId) },
      ...(receipt ? { receipt } : {}),
    },
  });
}

async function getPayment(providerId) {
  if (!isValidId(providerId)) throw new Error('Некорректный id платежа');
  if (config.yookassa.mock) {
    const row = db.mockProvider.get(providerId);
    if (!row) throw Object.assign(new Error('mock: payment not found'), { status: 404 });
    return shape(row);
  }
  return call('GET', `/payments/${providerId}`);
}

// Форма ответа mock = форма ответа настоящего API (только нужные поля)
function shape(row, confirmationUrl) {
  return {
    id: row.id,
    status: row.status,
    paid: row.status === 'succeeded',
    amount: { value: money(row.amount), currency: 'RUB' },
    metadata: { order_id: row.order_id },
    ...(confirmationUrl ? { confirmation: { type: 'redirect', confirmation_url: confirmationUrl } } : {}),
  };
}

module.exports = { createPayment, getPayment, parseAmount, isValidId };
