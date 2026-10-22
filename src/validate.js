// Мини-валидаторы. При росте проекта можно заменить на zod/joi.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const str = (v, max = 100) => typeof v === 'string' && v.trim().length <= max;

module.exports = {
  email: (v) => typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v),
  password: (v) => typeof v === 'string' && v.length >= 8 && v.length <= 128,
  // Правила для whitelisted полей профиля
  profile: {
    display_name: (v) => str(v, 50),
    game_nickname: (v) => typeof v === 'string' && /^[A-Za-z0-9_]{0,24}$/.test(v),
    game_server: (v) => ['', 'RU', 'EU', 'NA', 'ASIA'].includes(v),
    telegram: (v) => typeof v === 'string' && /^@?[A-Za-z0-9_]{0,32}$/.test(v),
  },
};
