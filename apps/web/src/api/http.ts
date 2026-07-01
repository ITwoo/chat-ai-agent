import { getAccessToken } from "../features/auth/utils/authStorage";

const API_BASE_URL = '/api';

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: HttpMethod;
  body?: unknown;
  token?: string | null;
}

export async function http<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  
  const token = options.token ?? getAccessToken();

  const { method = 'GET', body } = options;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || 'API 요청 실패');
  }
 
  if (response.status === 204) {
    return undefined as T;
  }
  
  const text = await response.text();

  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}