// Простая CSRF-защита (synchronizer token): токен хранится в сессии,
// клиент получает его через GET /api/state и шлёт в заголовке X-CSRF-Token.
const crypto = require('crypto');

function ensureToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  return req.session.csrf;
}

function verify(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // TODO: исключить сюда путь вебхука YooKassa (у него своя проверка)
  if (req.path === '/billing/webhook') return next();
  const sent = req.get('X-CSRF-Token') || '';
  const expected = req.session.csrf || '';
  const ok = sent.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).json({ error: 'Неверный CSRF-токен' });
  next();
}

module.exports = { ensureToken, verify };
