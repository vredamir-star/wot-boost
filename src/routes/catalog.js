const router = require('express').Router();
const services = require('../services');
router.get('/', (req, res) => res.json(services.list()));
router.get('/:id', (req, res) => {
  const s = services.get(req.params.id);
  s ? res.json(s) : res.status(404).json({ error: 'Услуга не найдена' });
});
module.exports = router;
