// Слой данных. Остальной код обращается к БД ТОЛЬКО через эти функции,
// поэтому SQLite можно заменить (Postgres и т.п.), переписав один этот файл.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const config = require('../config');

fs.mkdirSync(path.dirname(path.resolve(config.dbPath)), { recursive: true });
const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  game_nickname TEXT DEFAULT '',
  game_server TEXT DEFAULT '',
  telegram TEXT DEFAULT '',
  balance INTEGER NOT NULL DEFAULT 0,          -- в копейках
  pd_consent_at TEXT NOT NULL,                  -- 152-ФЗ: когда дано согласие
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  items_json TEXT NOT NULL,
  total INTEGER NOT NULL,                       -- в копейках
  status TEXT NOT NULL DEFAULT 'new',           -- new | paid | in_progress | done | cancelled
  comment TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider_id TEXT,                             -- id платежа в YooKassa
  amount INTEGER NOT NULL,                      -- в копейках
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | succeeded | canceled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- MOCK-«провайдер»: имитация ЮKassa для демо без ключей. Используется только если ключи не заданы.
CREATE TABLE IF NOT EXISTS mock_provider_payments (
  id TEXT PRIMARY KEY,
  idem_key TEXT UNIQUE NOT NULL,
  amount INTEGER NOT NULL,                      -- в копейках
  order_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',       -- pending | succeeded | canceled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// Безопасные миграции для уже существующей БД (ALTER ... ADD COLUMN, если колонки ещё нет)
function addColumn(table, column, ddl) {
  if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column))
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}
addColumn('orders', 'paid_at', 'TEXT');
addColumn('payments', 'order_id', 'INTEGER REFERENCES orders(id)');
addColumn('payments', 'confirmation_url', 'TEXT');
addColumn('payments', 'idempotence_key', 'TEXT');
addColumn('payments', 'updated_at', 'TEXT');
db.exec(`
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_id ON payments(provider_id) WHERE provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
`);

// Поля профиля, которые пользователь МОЖЕТ менять (whitelist против mass-assignment)
const PROFILE_FIELDS = ['display_name', 'game_nickname', 'game_server', 'telegram'];
const PUBLIC_USER_COLS = 'id, email, display_name, game_nickname, game_server, telegram, balance, created_at';

module.exports = {
  PROFILE_FIELDS,
  users: {
    create({ email, passwordHash }) {
      const r = db.prepare(
        'INSERT INTO users (email, password_hash, pd_consent_at) VALUES (?, ?, datetime(\'now\'))'
      ).run(email, passwordHash);
      return r.lastInsertRowid;
    },
    findByEmail: (email) => db.prepare('SELECT * FROM users WHERE email = ?').get(email),
    findPublic: (id) => db.prepare(`SELECT ${PUBLIC_USER_COLS} FROM users WHERE id = ?`).get(id),
    updateProfile(id, fields) {
      const keys = Object.keys(fields).filter((k) => PROFILE_FIELDS.includes(k));
      if (!keys.length) return;
      const sql = `UPDATE users SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`;
      db.prepare(sql).run({ ...Object.fromEntries(keys.map((k) => [k, fields[k]])), id });
    },
    getBalance: (id) => db.prepare('SELECT balance FROM users WHERE id = ?').get(id)?.balance ?? 0,
  },
  orders: {
    create({ userId, items, total, comment }) {
      return db.prepare('INSERT INTO orders (user_id, items_json, total, comment) VALUES (?, ?, ?, ?)')
        .run(userId, JSON.stringify(items), total, comment).lastInsertRowid;
    },
    // payment_status — статус последнего платежа по заказу (null, если оплату не начинали)
    listByUser: (userId) => db.prepare(`SELECT o.*, (SELECT p.status FROM payments p WHERE p.order_id = o.id ORDER BY p.id DESC LIMIT 1) AS payment_status
      FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC`).all(userId)
      .map((o) => ({ ...o, items: JSON.parse(o.items_json), items_json: undefined })),
    getForUser: (id, userId) => db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId),
  },
  payments: {
    // Старый вариант (пополнение баланса) оставлен для совместимости
    create: ({ userId, amount, providerId = null, orderId = null, idempotenceKey = null }) =>
      db.prepare('INSERT INTO payments (user_id, amount, provider_id, order_id, idempotence_key) VALUES (?, ?, ?, ?, ?)')
        .run(userId, amount, providerId, orderId, idempotenceKey).lastInsertRowid,
    get: (id) => db.prepare('SELECT * FROM payments WHERE id = ?').get(id),
    getForUser: (id, userId) => db.prepare('SELECT * FROM payments WHERE id = ? AND user_id = ?').get(id, userId),
    getByProviderId: (providerId) => db.prepare('SELECT * FROM payments WHERE provider_id = ?').get(providerId),
    // Последний незавершённый платёж по заказу (pending) — для идемпотентного повторного нажатия «Оплатить»
    findPendingForOrder: (orderId) => db.prepare("SELECT * FROM payments WHERE order_id = ? AND status = 'pending' ORDER BY id DESC LIMIT 1").get(orderId),
    setProvider: (id, providerId, confirmationUrl) =>
      db.prepare("UPDATE payments SET provider_id = ?, confirmation_url = ?, updated_at = datetime('now') WHERE id = ? AND provider_id IS NULL")
        .run(providerId, confirmationUrl, id),
    // Применяет ПРОВЕРЕННЫЙ статус платежа атомарно и идемпотентно.
    // succeeded: платёж → succeeded, заказ new → paid (только один раз).  canceled: только pending → canceled.
    // Никогда не «откатывает» succeeded.
    applyStatus: db.transaction((id, status) => {
      const p = db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
      if (!p) return { changed: false };
      if (status === 'succeeded') {
        const r = db.prepare("UPDATE payments SET status = 'succeeded', updated_at = datetime('now') WHERE id = ? AND status != 'succeeded'").run(id);
        let orderPaid = false;
        if (p.order_id) orderPaid = db.prepare("UPDATE orders SET status = 'paid', paid_at = datetime('now') WHERE id = ? AND status = 'new'").run(p.order_id).changes > 0;
        // paymentChanged && !orderPaid => второй успешный платёж по уже оплаченному заказу (нужен возврат)
        return { changed: r.changes > 0 || orderPaid, paymentChanged: r.changes > 0, orderPaid };
      }
      if (status === 'canceled') {
        const r = db.prepare("UPDATE payments SET status = 'canceled', updated_at = datetime('now') WHERE id = ? AND status = 'pending'").run(id);
        return { changed: r.changes > 0, paymentChanged: r.changes > 0, orderPaid: false };
      }
      return { changed: false };
    }),
    listByUser: (userId) => db.prepare('SELECT id, order_id, amount, status, created_at FROM payments WHERE user_id = ? ORDER BY id DESC').all(userId),
  },
  // Имитация сервера ЮKassa (MOCK-режим)
  mockProvider: {
    create({ id, idemKey, amount, orderId }) {
      const ex = db.prepare('SELECT * FROM mock_provider_payments WHERE idem_key = ?').get(idemKey);
      if (ex) return ex; // идемпотентность по Idempotence-Key, как у настоящего API
      db.prepare('INSERT INTO mock_provider_payments (id, idem_key, amount, order_id) VALUES (?, ?, ?, ?)').run(id, idemKey, amount, orderId);
      return db.prepare('SELECT * FROM mock_provider_payments WHERE id = ?').get(id);
    },
    get: (id) => db.prepare('SELECT * FROM mock_provider_payments WHERE id = ?').get(id),
    setStatus: (id, status) => db.prepare("UPDATE mock_provider_payments SET status = ? WHERE id = ? AND status = 'pending'").run(status, id).changes > 0,
  },
};
