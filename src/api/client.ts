/**
 * Centralized REST client for the Django backend.
 * - Base URL comes from VITE_API_BASE_URL.
 * - Attaches the JWT, refreshes it once on 401 (single-flight), and normalizes errors to ApiError.
 */
import { clearTokens, getTokens, setTokens } from "./session";

export const API_BASE_URL = (
  import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:8000/api/v1"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string = "error",
    public readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Query = Record<string, string | number | boolean | null | undefined | (string | number)[]>;

export interface RequestOptions {
  query?: Query;
  body?: unknown;
  /** Skip the Authorization header and 401 refresh handling (login, register, ...). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => url.searchParams.append(key, String(v)));
    else url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** First readable message out of a DRF field-error payload. */
function firstFieldMessage(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  for (const value of Object.values(details as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const nested = firstFieldMessage(value);
      if (nested) return nested;
    }
  }
  return null;
}

async function toApiError(res: Response): Promise<ApiError> {
  let payload: { error?: { code?: string; message?: string; details?: unknown } } | null = null;
  try {
    payload = await res.json();
  } catch {
    /* non-JSON body */
  }
  const err = payload?.error;
  const message =
    firstFieldMessage(err?.details) ??
    err?.message ??
    (res.status >= 500 ? "Something went wrong. Please try again." : "Request failed.");
  return new ApiError(message, res.status, err?.code ?? "error", err?.details ?? null);
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the refresh token for a new access token. Resolves false when the session is gone. */
export function refreshAccessToken(): Promise<boolean> {
  if (refreshing) return refreshing;
  const tokens = getTokens();
  if (!tokens?.refresh) return Promise.resolve(false);
  refreshing = (async () => {
    try {
      const res = await fetch(buildUrl("/auth/refresh/"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: tokens.refresh }),
      });
      if (!res.ok) {
        if (res.status === 401 || res.status === 400) clearTokens();
        return false;
      }
      const data = (await res.json()) as { access: string; refresh?: string };
      setTokens({ access: data.access, refresh: data.refresh ?? tokens.refresh });
      return true;
    } catch {
      return false; // network trouble: keep the session, let the caller surface the failure
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function send(
  method: string,
  path: string,
  opts: RequestOptions,
  retry: boolean,
): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const isForm = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (opts.body !== undefined && !isForm) headers["Content-Type"] = "application/json"; // a FormData body sets its own boundary
  const access = opts.anonymous ? null : getTokens()?.access;
  if (access) headers["Authorization"] = `Bearer ${access}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      headers,
      ...(opts.body !== undefined
        ? { body: isForm ? (opts.body as FormData) : JSON.stringify(opts.body) }
        : {}),
    });
  } catch {
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      0,
      "network_error",
    );
  }
  if (res.status === 401 && !opts.anonymous && retry && (await refreshAccessToken())) {
    return send(method, path, opts, false);
  }
  return res;
}

export async function request<T>(
  method: string,
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const res = await send(method, path, opts, true);
  if (!res.ok) {
    const err = await toApiError(res);
    if (err.status === 401 && !opts.anonymous) clearTokens();
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Authenticated download (files are streamed through the API, so a plain link cannot carry the login). */
export async function requestBlob(path: string): Promise<Blob> {
  const res = await send("GET", path, {}, true);
  if (!res.ok) throw await toApiError(res);
  return res.blob();
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, query ? { query } : {}),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, "body"> = {}) =>
    request<T>("POST", path, { ...opts, ...(body !== undefined ? { body } : {}) }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, { body }),
  delete: <T = void>(path: string, query?: Query) =>
    request<T>("DELETE", path, query ? { query } : {}),
};

/** Input type of an endpoint created with `endpoint()`. */
export type EndpointInput<F> = F extends (opts?: { data?: infer I }) => unknown ? I : never;

/** Adapts an endpoint implementation to the `fn({ data })` call shape used by the pages. */
export function endpoint<I, O>(impl: (input: I) => Promise<O>) {
  return (opts?: { data?: I }): Promise<O> => impl(opts?.data as I);
}
