// Чек по 54-ФЗ для ЮKassa (https://yookassa.ru/developers/payment-acceptance/receipts/54fz/basics).
// ОПЦИОНАЛЬНО: включается переменной YOOKASSA_RECEIPT=true.
// TODO(перед боевым запуском): когда известна система налогообложения продавца и ставка НДС,
// задать YOOKASSA_VAT_CODE (1 — без НДС, 2 — 0%, 3 — 10%, 4 — 20% и т.д.), при необходимости
// YOOKASSA_TAX_SYSTEM_CODE (1 ОСН, 2 УСН доходы, 3 УСН доходы-расходы, 4 ЕНВД, 5 ЕСХН, 6 Патент)
// и проверить предмет/признак расчёта (по умолчанию: услуга / полный расчёт).
// Для самозанятого (НПД) чек формируется через «Мой налог» — тогда receipt здесь НЕ нужен.
const config = require('./config');

const money = (kop) => `${Math.floor(kop / 100)}.${String(kop % 100).padStart(2, '0')}`;

// order.items[].price — в копейках (см. routes/orders.js), order.total — копейки
function buildReceipt({ order, email }) {
  const { vatCode, taxSystemCode, paymentSubject, paymentMode } = config.receipt;
  const items = order.items.map((it) => ({
    description: (it.title + (it.tankName ? ` (${it.tankName})` : '')).slice(0, 128),
    quantity: Number(it.qty).toFixed(2),
    amount: { value: money(it.price), currency: 'RUB' },
    vat_code: vatCode,
    payment_subject: paymentSubject,
    payment_mode: paymentMode,
  }));
  const sum = order.items.reduce((s, it) => s + it.price * it.qty, 0);
  if (sum !== order.total) throw new Error('Сумма позиций чека не совпадает с суммой заказа');
  return {
    customer: { email },
    items,
    ...(taxSystemCode ? { tax_system_code: taxSystemCode } : {}),
  };
}

module.exports = { buildReceipt, money };
