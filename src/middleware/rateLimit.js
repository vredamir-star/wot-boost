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
