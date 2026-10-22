// Централизованная конфигурация. Все секреты — только из переменных окружения.
require('dotenv').config();

const env = process.env;
const isProd = env.NODE_ENV === 'production';

if (isProd && (!env.SESSION_SECRET || env.SESSION_SECRET === 'change-me')) {
  throw new Error('SESSION_SECRET обязателен в production');
}

module.exports = {
  isProd,
  port: Number(env.PORT) || 3000,
  sessionSecret: env.SESSION_SECRET || 'dev-only-insecure-secret',
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : isProd,
  dbPath: env.DB_PATH || './data/app.db',
  yookassa: {
    shopId: env.YOOKASSA_SHOP_ID || '',
    secretKey: env.YOOKASSA_SECRET_KEY || '',
    returnUrl: env.YOOKASSA_RETURN_URL || 'http://localhost:3000/account.html',
  },
};
