// Каталог услуг. Сейчас — из data/services.json (цены в рублях).
// TODO: перенести в БД и управлять через админку.
const catalog = require('../data/services.json');
module.exports = {
  list: () => catalog,
  get: (id) => catalog.find((s) => s.id === id),
};
