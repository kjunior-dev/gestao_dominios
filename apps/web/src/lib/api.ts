import type {
  PublicUser,
  PublicUserSummary,
  Organization,
  Member,
  Session,
  Page,
  AuditEntry,
} from '@devtrust/contracts';
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const csrf =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((c) => c.startsWith('dt_csrf='))
          ?.split('=')[1]
      : undefined;
  const cartCsrf =
    typeof document !== 'undefined'
      ? document.cookie
          .split('; ')
          .find((c) => c.startsWith('dt_cart_csrf='))
          ?.split('=')[1]
      : undefined;
  const response = await fetch('/api/v1' + path, {
    ...options,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(cartCsrf
        ? { 'X-Cart-CSRF-Token': decodeURIComponent(cartCsrf) }
        : {}),
      ...(csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {}),
      ...options.headers,
    },
  }).catch(() => {
    throw new ApiError(
      'Não foi possível ligar ao serviço. Tente novamente.',
      503,
    );
  });
  const body = await response.json().catch(() => {
    throw new ApiError(
      'Resposta indisponível do serviço. Tente novamente.',
      502,
    );
  });
  if (
    response.status === 401 &&
    !path.startsWith('/auth/') &&
    typeof window !== 'undefined'
  )
    window.dispatchEvent(new Event('devtrust:unauthorized'));
  if (!response.ok)
    throw new ApiError(
      body.error?.message || 'Não foi possível concluir o pedido',
      response.status,
    );
  return body as T;
}
export const mutate = <T>(path: string, data: unknown = {}, method = 'POST') =>
  request<T>(path, { method, body: JSON.stringify(data) });
export const api = {
  me: () => request<PublicUser>('/auth/me'),
  organizations: () => request<Organization[]>('/organizations'),
  members: (id: string) =>
    request<Member[]>('/organizations/' + id + '/members'),
  sessions: () => request<Session[]>('/sessions'),
  adminUsers: (q: string) =>
    request<Page<PublicUserSummary>>('/admin/users?' + q),
  adminOrganizations: (q: string) =>
    request<Page<Organization>>('/admin/organizations?' + q),
  audit: (q: string) => request<Page<AuditEntry>>('/admin/audit-logs?' + q),
  stats: () =>
    request<{ users: number; organizations: number }>('/admin/stats'),
};
