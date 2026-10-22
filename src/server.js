// Точка входа. Express за nginx (reverse proxy).
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const csrf = require('./middleware/csrf');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // доверяем X-Forwarded-* от nginx (нужно для Secure-cookie)

app.use(express.json({ limit: '20kb' }));
app.use(session({
  name: 'sid',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  // TODO: MemoryStore не для продакшена — подключить connect-sqlite3 / Redis
  cookie: { httpOnly: true, secure: config.cookieSecure, sameSite: 'strict', maxAge: 7 * 24 * 3600 * 1000 },
}));

// API
const api = express.Router();
api.use(csrf.verify);
api.use('/', require('./routes/auth'));          // /register /login /logout /state
api.use('/profile', require('./routes/profile'));
api.use('/services', require('./routes/catalog'));
api.use('/orders', require('./routes/orders'));
api.use('/billing', require('./routes/billing'));
api.use((req, res) => res.status(404).json({ error: 'Не найдено' }));
app.use('/api', api);

// Статика (в проде её лучше отдавать nginx'ом напрямую)
app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: 'Внутренняя ошибка' });
});

app.listen(config.port, '0.0.0.0', () => console.log(`WoT Boost listening on port ${config.port}`));
