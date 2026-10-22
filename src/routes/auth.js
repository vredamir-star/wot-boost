const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../db');
const v = require('../validate');
const { authLimiter } = require('../middleware/rateLimit');
const csrf = require('../middleware/csrf');

router.post('/register', authLimiter, async (req, res) => {
  const { email, password, pdConsent } = req.body || {};
  if (!v.email(email)) return res.status(400).json({ error: 'Некорректный email' });
  if (!v.password(password)) return res.status(400).json({ error: 'Пароль: от 8 до 128 символов' });
  if (pdConsent !== true) return res.status(400).json({ error: 'Необходимо согласие на обработку ПДн' });
  const norm = email.trim().toLowerCase();
  if (db.users.findByEmail(norm)) return res.status(409).json({ error: 'Email уже зарегистрирован' });
  const id = db.users.create({ email: norm, passwordHash: await bcrypt.hash(password, 12) });
  login(req, res, id);
});

router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const user = typeof email === 'string' ? db.users.findByEmail(email.trim().toLowerCase()) : null;
  // Сравниваем даже при отсутствии пользователя — одинаковое время ответа
  const ok = await bcrypt.compare(String(password || ''), user?.password_hash || '$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva');
  if (!user || !ok) return res.status(401).json({ error: 'Неверный email или пароль' });
  login(req, res, user.id);
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('sid');
    res.json({ ok: true });
  });
});

router.get('/state', (req, res) => {
  res.json({
    authenticated: !!req.session.userId,
    user: req.session.userId ? db.users.findPublic(req.session.userId) : null,
    csrfToken: csrf.ensureToken(req),
  });
});

// Регенерация сессии при входе — защита от session fixation
function login(req, res, userId) {
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Ошибка сессии' });
    req.session.userId = userId;
    res.json({ ok: true, user: db.users.findPublic(userId), csrfToken: csrf.ensureToken(req) });
  });
}

module.exports = router;
