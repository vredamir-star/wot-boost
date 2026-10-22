const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => {
  res.json({
    balance: db.users.getBalance(req.session.userId), // копейки
    payments: db.payments.listByUser(req.session.userId),
  });
});

// Создание платежа YooKassa. СЕЙЧАС ЭТО ЗАГЛУШКА.
router.post('/topup', requireAuth, async (req, res) => {
  const rub = Number(req.body?.amount);
  if (!Number.isInteger(rub) || rub < 100 || rub > 100000)
    return res.status(400).json({ error: 'Сумма от 100 до 100 000 ₽' });

  const { shopId, secretKey, returnUrl } = config.yookassa;
  if (!shopId || !secretKey) {
    // Режим заглушки: ключи не заданы — платёж не создаётся у провайдера
    const id = db.payments.create({ userId: req.session.userId, amount: rub * 100, providerId: 'stub-' + crypto.randomUUID() });
    return res.json({ stub: true, paymentId: id, confirmationUrl: null,
      message: 'YooKassa не настроена (нет YOOKASSA_SHOP_ID/SECRET_KEY). Платёж записан как pending.' });
  }

  // TODO: проверить и доработать реальный вызов API (https://yookassa.ru/developers/api#create_payment)
  try {
    const r = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': crypto.randomUUID(),
        Authorization: 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: { value: rub.toFixed(2), currency: 'RUB' },
        capture: true,
        confirmation: { type: 'redirect', return_url: returnUrl },
        description: `Пополнение баланса, пользователь #${req.session.userId}`,
        metadata: { userId: req.session.userId },
        // TODO: receipt (чек по 54-ФЗ), если требуется
      }),
    });
    const p = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Ошибка платёжного провайдера' });
    db.payments.create({ userId: req.session.userId, amount: rub * 100, providerId: p.id });
    res.json({ paymentId: p.id, confirmationUrl: p.confirmation?.confirmation_url });
  } catch (e) {
    res.status(502).json({ error: 'Платёжный провайдер недоступен' });
  }
});

// Вебхук YooKassa. TODO: РЕАЛИЗОВАТЬ.
// 1) Проверить подлинность: IP-адрес из списка YooKassa и/или повторно запросить
//    GET /v3/payments/{id} и сверить статус/сумму.
// 2) При payment.succeeded — в транзакции пометить платёж succeeded и увеличить balance (идемпотентно!).
router.post('/webhook', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;
