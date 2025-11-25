import axios from 'axios';
import { getAccessToken } from './auth';

const fallbackURL = 'https://site-backend-hg4w.onrender.com';
const baseURL = import.meta.env.VITE_API_URL || fallbackURL;

if (!import.meta.env.VITE_API_URL) {
  console.warn(`[http] VITE_API_URL não definida. Usando fallback ${fallbackURL}`);
}

export const api = axios.create({
  baseURL,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

// Adiciona Authorization em todas as requisições quando houver token
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Normaliza erros para os componentes
    const status = error?.response?.status;
    const message = error?.response?.data?.error || error.message || 'Erro na requisição';
    console.error(`[http] Erro ${status || ''}: ${message}`);
    if (status === 401) {
      window.dispatchEvent(new CustomEvent('auth-session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
