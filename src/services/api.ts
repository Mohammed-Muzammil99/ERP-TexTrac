import { toast } from 'sonner';

const API_BASE = '/api';

export class ApiHttpError extends Error {
  status: number;
  isHttpError: boolean = true;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('erp_token');
  const isInitialStockMode = localStorage.getItem('initial_stock_mode');
  
  const tzoffset = (new Date()).getTimezoneOffset() * 60000;
  const localISOTime = (new Date(Date.now() - tzoffset)).toISOString().slice(0, -1);
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';

  const headers = {
    'Content-Type': 'application/json',
    'x-local-time': localISOTime,
    'x-app-url': appOrigin,
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(isInitialStockMode === 'true' ? { 'x-initial-stock-mode': 'true' } : {}),
    ...options.headers,
  };

  const maxRetries = 3;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let response: Response;
      try {
        response = await fetch(`${API_BASE}${path}`, { ...options, headers });
      } catch (fetchErr: any) {
        // True network drop / transport failure
        if (attempt < maxRetries) {
          const backoffDelay = attempt === 1 ? delayMs : Math.min(3000, delayMs + (attempt - 1) * 600);
          console.warn(`Network attempt ${attempt} failed for ${path}. Retrying in ${backoffDelay}ms...`, fetchErr);
          await new Promise((resolve) => setTimeout(resolve, backoffDelay));
          continue;
        }
        const msg = 'Network connection failed. Please check your connection.';
        toast.error(msg);
        throw fetchErr;
      }
      
      if (response.status === 401) {
        localStorage.removeItem('erp_token');
        const isMeRequest = path === '/auth/me';
        const isLoginPath = window.location.pathname === '/login';
        
        if (!isMeRequest && !isLoginPath) {
          window.location.href = '/login';
          const msg = 'Session expired. Please login again.';
          toast.error(msg);
          throw new ApiHttpError(msg, 401);
        }
        
        throw new ApiHttpError('Unauthorized', 401);
      }

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const message = errorBody?.error || errorBody?.message || `HTTP Error ${response.status}`;
        toast.error(message, {
          description: `Endpoint: ${path}`
        });
        throw new ApiHttpError(message, response.status);
      }

      // Read response text/json safely
      const text = await response.text();
      try {
        return JSON.parse(text) as T;
      } catch (e) {
        // Fallback for empty or non-JSON success responses
        return {} as T;
      }
    } catch (err: any) {
      if (err?.isHttpError) {
        throw err;
      }
      if (attempt >= maxRetries) {
        throw err;
      }
    }
  }
  throw new Error('API request failed after retries');
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: any) => request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: any) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: <T>(path: string, body: any) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};
