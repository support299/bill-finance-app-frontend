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

/* ------------------------- agency support sessions ------------------------- */
const AGENCY_KEY = "imax.agency.tokens";
const CLIENT_KEY = "imax.support.client";
let agencyMemory: Tokens | null = null;
let clientMemory: string | null = null;

function claims(token: string | undefined): Record<string, unknown> | null {
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** Set while an agency admin is looking at a client's books: the session is read-only and expires. */
export function supportSession(): { clientName: string | null } | null {
  const c = claims(getTokens()?.access);
  if (!c?.["support_readonly"]) return null;
  let name = clientMemory;
  try {
    name = window.sessionStorage.getItem(CLIENT_KEY) ?? name;
  } catch {
    /* in-memory fallback */
  }
  return { clientName: name };
}

/** Keeps the agency's own tokens while a client is open, so "Back to clients" needs no new sign-in. */
export function startSupportSession(agency: Tokens | null, client: Tokens, clientName: string) {
  agencyMemory = agency;
  clientMemory = clientName;
  try {
    if (agency) window.sessionStorage.setItem(AGENCY_KEY, JSON.stringify(agency));
    window.sessionStorage.setItem(CLIENT_KEY, clientName);
  } catch {
    /* in-memory fallback */
  }
  setTokens(client);
}

/** Leaves the client's workspace and restores the agency session (returns false when it is gone). */
export function endSupportSession(): boolean {
  let agency = agencyMemory;
  try {
    const raw = window.sessionStorage.getItem(AGENCY_KEY);
    if (raw) agency = JSON.parse(raw) as Tokens;
    window.sessionStorage.removeItem(AGENCY_KEY);
    window.sessionStorage.removeItem(CLIENT_KEY);
  } catch {
    /* in-memory fallback */
  }
  agencyMemory = null;
  clientMemory = null;
  if (agency) {
    setTokens(agency);
    return true;
  }
  clearTokens();
  return false;
}
