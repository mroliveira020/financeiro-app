const ACCESS_TOKEN_KEY = 'financeiro:access-token';
const USER_KEY = 'financeiro:auth-user';

function getStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function migrateLegacySessionValue(key, storage) {
  if (!storage) return '';
  try {
    const current = storage.getItem(key);
    if (current) return current;
    const legacy = window.sessionStorage.getItem(key);
    if (legacy) {
      storage.setItem(key, legacy);
      window.sessionStorage.removeItem(key);
      return legacy;
    }
    return '';
  } catch {
    return '';
  }
}

function safeJSONParse(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getAccessToken() {
  const storage = getStorage();
  return migrateLegacySessionValue(ACCESS_TOKEN_KEY, storage);
}

export function storeSession(token, user) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (token) {
      storage.setItem(ACCESS_TOKEN_KEY, token);
    } else {
      storage.removeItem(ACCESS_TOKEN_KEY);
    }
    if (user) {
      storage.setItem(USER_KEY, JSON.stringify(user));
    } else {
      storage.removeItem(USER_KEY);
    }
    try {
      window.sessionStorage.removeItem(ACCESS_TOKEN_KEY);
      window.sessionStorage.removeItem(USER_KEY);
    } catch {
      // Mantém compatibilidade em ambientes restritos.
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
  const storage = getStorage();
  const raw = migrateLegacySessionValue(USER_KEY, storage);
  return safeJSONParse(raw);
}
