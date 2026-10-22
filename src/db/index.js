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
    listByUser: (userId) => db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId)
      .map((o) => ({ ...o, items: JSON.parse(o.items_json), items_json: undefined })),
  },
  payments: {
    create: ({ userId, amount, providerId }) =>
      db.prepare('INSERT INTO payments (user_id, amount, provider_id) VALUES (?, ?, ?)')
        .run(userId, amount, providerId).lastInsertRowid,
    listByUser: (userId) => db.prepare('SELECT id, amount, status, created_at FROM payments WHERE user_id = ? ORDER BY id DESC').all(userId),
  },
};
