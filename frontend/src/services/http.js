import axios from 'axios';
import { getEditorToken } from './auth';

const baseURL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';

if (!import.meta.env.VITE_API_URL) {
  // eslint-disable-next-line no-console
  console.warn('[http] VITE_API_URL não definida. Usando padrão http://127.0.0.1:5000');
}

export const api = axios.create({
  baseURL,
  timeout: 45000,
  headers: { 'Content-Type': 'application/json' },
});

// Adiciona Authorization apenas para métodos de escrita quando houver token
api.interceptors.request.use((config) => {
  const method = (config.method || 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    const token = getEditorToken();
    if (token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Normaliza erros para os componentes
    const status = error?.response?.status;
    const message = error?.response?.data?.error || error.message || 'Erro na requisição';
    // eslint-disable-next-line no-console
    console.error(`[http] Erro ${status || ''}: ${message}`);
    return Promise.reject(error);
  }
);

export default api;
