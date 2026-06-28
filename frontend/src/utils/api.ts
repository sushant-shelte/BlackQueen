const DEFAULT_LOCAL_API_BASE = 'http://localhost:8000/api';

const rawApiBase = import.meta.env.VITE_API_URL?.trim();
const isLocalDevelopment =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname));

export const API_BASE = rawApiBase || (isLocalDevelopment ? DEFAULT_LOCAL_API_BASE : '');

export const API_BASE_ERROR = !rawApiBase && !isLocalDevelopment
  ? 'VITE_API_URL is not set. Configure your Vercel environment variable to point at the Render backend, for example https://your-service.onrender.com/api.'
  : null;

export const getApiUrl = (path: string) => {
  if (!API_BASE) {
    throw new Error(API_BASE_ERROR || 'API base URL is not configured');
  }

  return `${API_BASE.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
};

export const apiFetch = (path: string, init?: RequestInit) => {
  const url = getApiUrl(path);
  return fetch(url, init);
};

export const getWebSocketUrl = (roomCode: string, playerId: string) => {
  if (!API_BASE) {
    throw new Error(API_BASE_ERROR || 'WebSocket base URL is not configured');
  }

  const apiUrl = new URL(API_BASE);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  apiUrl.pathname = apiUrl.pathname.replace(/\/api\/?$/, `/ws/${roomCode}/${playerId}`);
  apiUrl.search = '';
  apiUrl.hash = '';
  return apiUrl.toString();
};
