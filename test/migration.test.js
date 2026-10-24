// Безопасная миграция: старая БД (без новых колонок) открывается, данные сохраняются.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupEnv } = require('./helpers');
const Database = require('better-sqlite3');

test('миграция старой схемы payments/orders', () => {
  const dir = setupEnv();
  const old = new Database(process.env.DB_PATH);
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, display_name TEXT DEFAULT '', game_nickname TEXT DEFAULT '', game_server TEXT DEFAULT '', telegram TEXT DEFAULT '', balance INTEGER NOT NULL DEFAULT 0, pd_consent_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, items_json TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'new', comment TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    CREATE TABLE payments (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, provider_id TEXT, amount INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO users (email, password_hash, pd_consent_at) VALUES ('a@b.ru','x',datetime('now'));
    INSERT INTO orders (user_id, items_json, total) VALUES (1,'[]',100);
    INSERT INTO payments (user_id, provider_id, amount) VALUES (1,'stub-1',100);`);
  old.close();
  const db = require('../src/db'); // применяет миграции
  assert.equal(db.payments.get(1).provider_id, 'stub-1');
  assert.equal(db.payments.get(1).order_id, null);
  assert.equal(db.orders.listByUser(1)[0].paid_at, null);
  const id = db.payments.create({ userId: 1, orderId: 1, amount: 100, idempotenceKey: 'k' });
  assert.equal(db.payments.get(id).order_id, 1);
});
