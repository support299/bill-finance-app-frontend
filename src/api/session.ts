/** Token storage + change notifications. The only module that touches localStorage for auth. */

export interface Tokens {
  access: string;
  refresh: string;
}

const KEY = "imax.auth.tokens";
type Listener = () => void;
const listeners = new Set<Listener>();
let memory: Tokens | null = null;

function read(): Tokens | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Tokens;
    return parsed?.access && parsed?.refresh ? parsed : null;
  } catch {
    return memory; // storage blocked (private mode / sandboxed iframe)
  }
}

export function getTokens(): Tokens | null {
  return typeof window === "undefined" ? null : read();
}

export function setTokens(tokens: Tokens) {
  memory = tokens;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tokens));
  } catch {
    /* fall back to in-memory */
  }
  listeners.forEach((l) => l());
}

export function clearTokens() {
  memory = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((l) => l());
}

export function onSessionChange(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** User id from the access token (`user_id` claim), without verifying it: the server does that. */
export function currentUserId(): string | null {
  const access = getTokens()?.access;
  if (!access) return null;
  try {
    const payload = JSON.parse(atob(access.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.user_id === "string" ? payload.user_id : null;
  } catch {
    return null;
  }
}
