'use client';

/** Calls the app's API from the browser and turns errors into readable messages. */
export async function api<T>(url: string, method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth')) {
    window.location.href = '/login';
    throw new Error('Your session has ended. Sign in again.');
  }
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Something went wrong. Try again.');
  return data as T;
}
