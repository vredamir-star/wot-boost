# TankBoost — стартовый каркас сайта бустинга «Мир танков»

Минимальный, но рабочий шаблон: Node.js + Express + SQLite (better-sqlite3) + ванильный фронтенд.
Предназначен для дальнейшей разработки — многие места помечены `TODO`.

## Структура

```
wot-boost/
├── src/
│   ├── server.js            # точка входа: сессии, CSRF, роутинг, статика
│   ├── config.js            # конфиг из переменных окружения
│   ├── validate.js          # валидаторы (email, пароль, поля профиля)
│   ├── services.js          # доступ к каталогу услуг
│   ├── db/index.js          # СЛОЙ ДАННЫХ (схема + все запросы) — меняется целиком при смене БД
│   ├── middleware/
│   │   ├── auth.js          # requireAuth
│   │   ├── csrf.js          # CSRF-токен в сессии, заголовок X-CSRF-Token
│   │   └── rateLimit.js     # лимит на /api/login и /api/register
│   └── routes/
│       ├── auth.js          # register / login / logout / state
│       ├── profile.js       # GET/POST /api/profile (whitelist полей)
│       ├── catalog.js       # GET /api/services[/:id]
│       ├── orders.js        # GET/POST /api/orders
│       └── billing.js       # баланс, пополнение (ЮKassa), вебхук (TODO)
├── data/services.json       # каталог услуг (цены в рублях)
├── public/                  # фронтенд: HTML + css/style.css + js/*
├── deploy/nginx.conf        # пример nginx с заголовками безопасности
├── .env.example
└── package.json
```

## Запуск

```bash
cp .env.example .env      # заполнить SESSION_SECRET и т.д.
npm install
npm start                 # http://127.0.0.1:3000
npm run dev               # с автоперезапуском (node --watch)
npm run check             # синтаксическая проверка JS
```

Требуется Node.js ≥ 18. Для `bcrypt` и `better-sqlite3` нужны prebuilt-бинарники или build-tools (python3, make, g++).

Локально по http выставьте `COOKIE_SECURE=false`, иначе браузер не сохранит cookie. В проде — `true` (за HTTPS через nginx).

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `PORT` | порт Node (по умолчанию 3000, слушает только 127.0.0.1) |
| `NODE_ENV` | `production` включает обязательность `SESSION_SECRET` и Secure-cookie |
| `SESSION_SECRET` | секрет подписи cookie сессии |
| `COOKIE_SECURE` | флаг Secure для cookie |
| `DB_PATH` | путь к файлу SQLite |
| `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY` | ключи ЮKassa. Пустые → режим заглушки |
| `YOOKASSA_RETURN_URL` | куда вернуть пользователя после оплаты |

Секреты храните только в `.env` (он в `.gitignore`).

## API

Все не-GET запросы требуют заголовок `X-CSRF-Token` (берётся из `GET /api/state`).
Суммы в ответах БД — в **копейках**, цены каталога — в рублях.

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/register` | `{email, password, pdConsent:true}` |
| POST | `/api/login` | `{email, password}` |
| POST | `/api/logout` | |
| GET | `/api/state` | `{authenticated, user, csrfToken}` |
| GET/POST | `/api/profile` | только `display_name, game_nickname, game_server, telegram` |
| GET | `/api/services`, `/api/services/:id` | каталог |
| GET/POST | `/api/orders` | `{items:[{serviceId, qty, options}], comment}`; цена считается на сервере |
| GET | `/api/billing` | баланс и платежи |
| POST | `/api/billing/topup` | `{amount}` в рублях → платёж ЮKassa (или заглушка) |
| POST | `/api/billing/webhook` | **TODO**, сейчас 501 |

## Что работает, а что — TODO

Работает: регистрация/вход/выход, сессии (HttpOnly, SameSite=Strict, Secure), CSRF, rate-limit, bcrypt,
профиль с whitelist, каталог, корзина (localStorage), создание и список заказов, просмотр баланса,
создание платежа ЮKassa (реальный запрос при наличии ключей, иначе заглушка).

**TODO для разработчика:**
- [ ] **Вебхук ЮKassa** (`src/routes/billing.js`): проверка подлинности (IP ЮKassa + повторный запрос платежа по API), идемпотентное зачисление на баланс в транзакции.
- [ ] Оплата заказа с баланса / напрямую, смена статусов заказа.
- [ ] Чеки по 54-ФЗ (`receipt` в платеже).
- [ ] **Реальное выполнение бустинга**: распределение заказов бустерам, уведомления, чат с клиентом.
- [ ] **Админ-панель**: заказы, пользователи, услуги (перенести каталог в БД), роли.
- [ ] Хранилище сессий для прода (MemoryStore не годится — Redis/SQLite store).
- [ ] Подтверждение email, сброс пароля.
- [ ] Логирование, мониторинг, бэкапы БД.
- [ ] Миграции схемы БД вместо `CREATE TABLE IF NOT EXISTS`.

## Юридическое (обязательно до запуска!)

Сайт собирает персональные данные и принимает платежи, поэтому нужно:
- **152-ФЗ**: политика обработки ПДн (`public/privacy.html`), согласие на обработку ПДн (`public/consent.html`, чекбокс при регистрации — время согласия сохраняется в `users.pd_consent_at`), уведомление Роскомнадзора об обработке ПДн, локализация БД с ПДн граждан РФ на серверах в РФ.
- **Публичная оферта** (`public/offer.html`): условия услуг, сроки, возвраты, реквизиты.
- **54-ФЗ**: онлайн-касса/чеки (можно через ЮKassa).
- Учитывайте правила игры: передача аккаунта третьим лицам и бустинг могут нарушать пользовательское соглашение издателя (Lesta Games) — риск блокировки аккаунта клиента нужно честно отразить в оферте.

Все три страницы сейчас — **заглушки**, текст должен подготовить юрист.

## Деплой

Пример — `deploy/nginx.conf` (HTTPS, HSTS, CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, reverse proxy на Node). Node запускать через systemd или pm2 с `NODE_ENV=production`.
