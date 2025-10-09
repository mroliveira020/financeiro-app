const ACCESS_TOKEN_KEY = 'financeiro:access-token';
const USER_KEY = 'financeiro:auth-user';

function safeJSONParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getAccessToken() {
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function storeSession(token, user) {
  try {
    if (token) {
      sessionStorage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ACCESS_TOKEN_KEY);
    }
    if (user) {
      sessionStorage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      sessionStorage.removeItem(USER_KEY);
    }
    window.dispatchEvent(new CustomEvent('auth-session-changed'));
  } catch {
    // Ignora erros de armazenamento (ex.: navegação privada)
  }
}

export function clearSession() {
  storeSession('', null);
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem(USER_KEY);
    return safeJSONParse(raw);
  } catch {
    return null;
  }
}
