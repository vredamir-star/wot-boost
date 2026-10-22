const router = require('express').Router();
const db = require('../db');
const services = require('../services');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => res.json(db.orders.listByUser(req.session.userId)));

// body: { items: [{ serviceId, qty, options? }], comment? }
router.post('/', requireAuth, (req, res) => {
  const { items, comment = '' } = req.body || {};
  if (!Array.isArray(items) || !items.length || items.length > 20)
    return res.status(400).json({ error: 'Корзина пуста' });
  if (typeof comment !== 'string' || comment.length > 500)
    return res.status(400).json({ error: 'Комментарий слишком длинный' });

  const normalized = [];
  for (const it of items) {
    const svc = services.get(it?.serviceId);
    const qty = Number(it?.qty) || 1;
    if (!svc || !Number.isInteger(qty) || qty < 1 || qty > 10)
      return res.status(400).json({ error: 'Некорректная позиция заказа' });
    // Цена берётся ТОЛЬКО с сервера, не из запроса клиента
    normalized.push({ serviceId: svc.id, title: svc.title, qty, price: svc.price * 100,
      tankName: typeof it.options?.tankName === 'string' ? it.options.tankName.slice(0, 50) : undefined });
  }
  const total = normalized.reduce((s, i) => s + i.price * i.qty, 0);
  // TODO: списание с баланса / привязка к оплате; сейчас заказ создаётся со статусом 'new'
  // TODO: уведомление бустеру/админу, реальное выполнение услуги
  const id = db.orders.create({ userId: req.session.userId, items: normalized, total, comment });
  res.status(201).json({ id, total, status: 'new' });
});

module.exports = router;
