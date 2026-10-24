// Бизнес-логика оплаты заказов через ЮKassa (или mock).
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const yk = require('./yookassa');
const { buildReceipt } = require('./receipt');

// URL подтверждения принимаем только https (реальный ЮKassa/ЮMoney) или наш относительный mock-путь
const safeUrl = (u) => typeof u === 'string' && (/^https:\/\/[^\s]+$/.test(u) || u.startsWith('/mock-checkout.html?'));

// Сверка данных платежа от ЮKassa с НАШЕЙ записью. Всё, что пришло в вебхуке, не используется.
function verify(local, remote) {
  if (!remote || remote.id !== local.provider_id) return 'id mismatch';
  if (remote.amount?.currency !== 'RUB') return 'currency mismatch';
  if (yk.parseAmount(remote.amount?.value) !== local.amount) return 'amount mismatch';
  if (String(remote.metadata?.order_id ?? '') !== String(local.order_id)) return 'order_id mismatch';
  return null;
}

// Перезапрашивает платёж у ЮKassa, проверяет и применяет статус. Идемпотентно.
// Возвращает { ok, status, reason? }; бросает ошибку, если провайдер недоступен.
async function reconcile(local) {
  const remote = await yk.getPayment(local.provider_id);
  const problem = verify(local, remote);
  if (problem) {
    console.error(`[payments] verification failed for payment #${local.id} (${local.provider_id}): ${problem}`);
    return { ok: false, status: local.status, reason: problem };
  }
  const status = remote.status === 'succeeded' && remote.paid !== false ? 'succeeded'
    : remote.status === 'canceled' ? 'canceled' : 'pending';
  if (status !== 'pending') {
    const r = db.payments.applyStatus(local.id, status);
    if (status === 'succeeded' && r.paymentChanged && !r.orderPaid)
      console.warn(`[payments] ДУБЛЬ: платёж ${local.provider_id} успешен, но заказ #${local.order_id} уже оплачен — нужен возврат`);
    if (r.orderPaid) console.log(`[payments] заказ #${local.order_id} оплачен (платёж ${local.provider_id})`);
  }
  return { ok: true, status: db.payments.get(local.id).status };
}

// Создаёт (или возвращает уже существующий) платёж для заказа. Сумма — ТОЛЬКО из заказа на сервере.
async function startForOrder(order) {
  let local = db.payments.findPendingForOrder(order.id);

  if (local?.provider_id) {
    const r = await reconcile(local);
    if (!r.ok) throw new Error('Не удалось проверить существующий платёж');
    local = db.payments.get(local.id);
    if (local.status === 'succeeded') return { alreadyPaid: true, payment: local };
    // всё ещё ждёт оплаты и сумма та же → отдаём ту же ссылку (повторный клик «Оплатить» безопасен)
    if (local.status === 'pending' && local.amount === order.total && safeUrl(local.confirmation_url))
      return { payment: local };
    local = null; // отменён/устарел — создадим новый
  }

  // Локальная запись создаётся ДО обращения к ЮKassa, ключ идемпотентности хранится в ней:
  // при сбое сети повторная попытка использует тот же ключ и не создаст дубль платежа.
  let id = local?.id;
  const key = local?.idempotence_key || crypto.randomUUID();
  if (!id) id = db.payments.create({ userId: order.user_id, orderId: order.id, amount: order.total, idempotenceKey: key });

  const user = db.users.findPublic(order.user_id);
  const items = JSON.parse(order.items_json);
  const returnUrl = (config.yookassa.mock ? '' : config.publicBaseUrl) + `/payment-return.html?payment=${id}`;
  const remote = await yk.createPayment({
    idempotenceKey: key,
    amount: order.total,
    description: `Заказ №${order.id} — TankBoost`,
    orderId: order.id,
    paymentId: id,
    returnUrl,
    receipt: config.receipt.enabled ? buildReceipt({ order: { ...order, items }, email: user.email }) : null,
  });
  const url = remote.confirmation?.confirmation_url;
  if (!yk.isValidId(remote.id) || !safeUrl(url)) throw new Error('Некорректный ответ платёжного провайдера');
  db.payments.setProvider(id, remote.id, url);
  return { payment: db.payments.get(id) };
}

module.exports = { startForOrder, reconcile, verify };
