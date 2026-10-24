const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

// Баланс и история платежей пользователя.
// Оплата заказов — в routes/payments.js (ЮKassa + вебхук). Пополнение баланса пока не реализовано.
router.get('/', requireAuth, (req, res) => {
  res.json({
    balance: db.users.getBalance(req.session.userId), // копейки
    payments: db.payments.listByUser(req.session.userId),
  });
});

module.exports = router;
