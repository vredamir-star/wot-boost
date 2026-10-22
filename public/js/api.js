// Обёртка над fetch: JSON, cookie сессии, CSRF-токен в заголовке.
const Api = (() => {
  let csrfToken = null;
  let statePromise = null;

  async function request(method, url, body) {
    if (method !== 'GET' && !csrfToken) await state();
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (data.csrfToken) csrfToken = data.csrfToken;
    if (!res.ok) throw Object.assign(new Error(data.error || 'Ошибка запроса'), { status: res.status });
    return data;
  }

  // Состояние сессии кэшируется на время жизни страницы
  function state(force) {
    if (!statePromise || force) statePromise = request('GET', '/api/state');
    return statePromise;
  }

  return {
    state,
    get: (u) => request('GET', u),
    post: (u, b) => request('POST', u, b || {}),
  };
})();
