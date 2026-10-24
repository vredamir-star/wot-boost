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
  // Публичный адрес сайта — для return_url ЮKassa. На Render подставится RENDER_EXTERNAL_URL.
  publicBaseUrl: (env.PUBLIC_BASE_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${Number(env.PORT) || 3000}`).replace(/\/+$/, ''),
  yookassa: {
    shopId: env.YOOKASSA_SHOP_ID || '',
    secretKey: env.YOOKASSA_SECRET_KEY || '',
    apiUrl: env.YOOKASSA_API_URL || 'https://api.yookassa.ru/v3',
    // MOCK-режим: ключей нет → «ненастоящая» оплата на локальной тестовой странице, без денег.
    mock: !(env.YOOKASSA_SHOP_ID && env.YOOKASSA_SECRET_KEY),
  },
  // Чек по 54-ФЗ (необязательно). Включается YOOKASSA_RECEIPT=true, когда известна налоговая настройка.
  receipt: {
    enabled: env.YOOKASSA_RECEIPT === 'true',
    vatCode: Number(env.YOOKASSA_VAT_CODE) || 1,            // 1 = без НДС (см. справочник ЮKassa)
    taxSystemCode: env.YOOKASSA_TAX_SYSTEM_CODE ? Number(env.YOOKASSA_TAX_SYSTEM_CODE) : null, // 1..6, если не задана в кабинете
    paymentSubject: env.YOOKASSA_PAYMENT_SUBJECT || 'service',
    paymentMode: env.YOOKASSA_PAYMENT_MODE || 'full_payment',
  },
};
