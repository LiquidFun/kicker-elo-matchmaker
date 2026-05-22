export class ApiError extends Error {
  constructor(public status: number, public detail: string) {
    super(detail);
  }
}

let orgOverride: number | null = null;
const orgOverrideListeners = new Set<() => void>();

export function getOrgOverride(): number | null {
  return orgOverride;
}

export function setOrgOverride(orgId: number | null) {
  orgOverride = orgId;
  orgOverrideListeners.forEach((cb) => cb());
}

export function onOrgOverrideChange(cb: () => void): () => void {
  orgOverrideListeners.add(cb);
  return () => orgOverrideListeners.delete(cb);
}

function applyOrgOverride(path: string): string {
  if (orgOverride === null) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}org_id=${orgOverride}`;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(applyOrgOverride(path), {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return handle<T>(res);
}

async function requestForm<T>(method: string, path: string, form: FormData): Promise<T> {
  const res = await fetch(applyOrgOverride(path), {
    method,
    credentials: 'include',
    body: form,
  });
  return handle<T>(res);
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = (await res.json()) as { detail?: string };
      if (data.detail) detail = data.detail;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  postForm: <T>(path: string, form: FormData) => requestForm<T>('POST', path, form),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};
