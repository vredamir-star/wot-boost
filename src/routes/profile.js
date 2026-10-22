const router = require('express').Router();
const db = require('../db');
const v = require('../validate');
const requireAuth = require('../middleware/auth');

router.get('/', requireAuth, (req, res) => res.json(db.users.findPublic(req.session.userId)));

router.post('/', requireAuth, (req, res) => {
  const body = req.body || {};
  const update = {};
  // Берём ТОЛЬКО разрешённые поля; email/balance/id и т.п. игнорируются
  for (const field of db.PROFILE_FIELDS) {
    if (!(field in body)) continue;
    if (!v.profile[field](body[field])) return res.status(400).json({ error: `Некорректное поле: ${field}` });
    update[field] = body[field].trim();
  }
  db.users.updateProfile(req.session.userId, update);
  res.json(db.users.findPublic(req.session.userId));
});

module.exports = router;
