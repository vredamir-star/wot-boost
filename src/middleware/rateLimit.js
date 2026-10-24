// Ограничение частоты для входа/регистрации (защита от перебора).
// В памяти процесса; при нескольких инстансах — подключить Redis-store.
const rateLimit = require('express-rate-limit');
module.exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток, попробуйте позже' },
});

const mk = (windowMs, limit, error) => rateLimit({
  windowMs, limit, standardHeaders: 'draft-7', legacyHeaders: false, message: { error },
});
// Создание платежей / mock-действия
module.exports.paymentCreateLimiter = mk(15 * 60 * 1000, 30, 'Слишком много попыток оплаты, попробуйте позже');
// Опрос статуса (страница возврата опрашивает несколько раз)
module.exports.paymentStatusLimiter = mk(60 * 1000, 60, 'Слишком много запросов, подождите минуту');
// Вебхук ЮKassa: щедрый лимит (легитимный поток невелик), защита от флуда подделками
module.exports.webhookLimiter = mk(60 * 1000, 120, 'Too many requests');
