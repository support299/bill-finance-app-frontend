/**
 * Who is using the embedded app and what they may do.
 *
 * Inside GoHighLevel the page asks its parent frame for the signed-in user (postMessage REQUEST_USER_DATA). GoHighLevel
 * answers with an encrypted payload that only the backend can read; the backend turns it into a session whose token names
 * the person, so every change is logged against them and their access level (none / viewer / editor / admin) is enforced.
 */
import { api, endpoint } from "./client";

export type AccessLevel = "none" | "viewer" | "editor" | "admin" | "owner";

export interface WorkspaceMe {
  actor: {
    id: string;
    name: string | null;
    email: string | null;
    type: "agency" | "location" | null;
    role: "admin" | "user" | null;
  } | null;
  access: AccessLevel;
  can_edit: boolean;
  can_manage_users: boolean;
  can_switch: boolean;
  location: { location_id: string; name: string | null } | null;
}

export interface SsoSession {
  access: string;
  refresh: string;
  user_id: string;
  me: WorkspaceMe;
}

const PAYLOAD_KEY = "ghl-sso-payload";

/** Asks the GoHighLevel parent frame for the encrypted user data. Resolves null when there is no answer (not embedded). */
export function requestGhlUserData(timeoutMs = 4000): Promise<string | null> {
  if (typeof window === "undefined" || window.parent === window) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      resolve(null);
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      const data = event.data as { message?: string; payload?: unknown } | undefined;
      if (data?.message !== "REQUEST_USER_DATA_RESPONSE") return;
      window.clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      resolve(typeof data.payload === "string" && data.payload ? data.payload : null);
    }
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ message: "REQUEST_USER_DATA" }, "*");
  });
}

/** Keeps the (encrypted) payload for the sub-account switcher, which signs in again as the same person. */
export function stashSsoPayload(payload: string) {
  try {
    sessionStorage.setItem(PAYLOAD_KEY, payload);
  } catch {
    /* storage blocked: switching will ask GoHighLevel again */
  }
}

export function stashedSsoPayload(): string | null {
  try {
    return sessionStorage.getItem(PAYLOAD_KEY);
  } catch {
    return null;
  }
}

/** Exchanges GoHighLevel's user data for a session. `locationId` opens another sub-account of the same agency. */
export function openGhlSso(payload: string, locationId?: string | null) {
  return api.post<SsoSession>(
    "/workspace/sso/",
    { payload, ...(locationId ? { id: locationId } : {}) },
    { anonymous: true },
  );
}

export const getWorkspaceMeFn = endpoint(async (_: void) => api.get<WorkspaceMe>("/workspace/me/"));

/* ------------------------------------------------------------------ members */
export interface Member {
  location_id: string;
  ghl_user_id: string;
  name: string | null;
  email: string | null;
  ghl_type: "agency" | "location" | null;
  ghl_role: "admin" | "user" | null;
  default_access: Exclude<AccessLevel, "owner">;
  /** null = automatic (follows the GoHighLevel role) */
  access: Exclude<AccessLevel, "owner"> | null;
  effective_access: Exclude<AccessLevel, "owner">;
  last_seen_at: string | null;
  access_set_by: string | null;
  access_set_at: string | null;
  is_you: boolean;
}

export const listMembersFn = endpoint(async (_: void) =>
  api.get<{ members: Member[]; warnings: string[]; levels: string[] }>("/workspace/members/"),
);

export const setMemberAccessFn = endpoint(
  async (d: { locationId: string; ghlUserId: string; access: Member["access"] }) =>
    api.put<Member>(
      `/workspace/members/${encodeURIComponent(d.locationId)}/${encodeURIComponent(d.ghlUserId)}/`,
      { access: d.access },
    ),
);

/* ------------------------------------------------------------------ switcher */
export interface SwitchLocation {
  location_id: string;
  name: string | null;
  current: boolean;
  can_open: boolean;
}

export const listSwitchLocationsFn = endpoint(async (_: void) =>
  api.get<{ locations: SwitchLocation[] }>("/workspace/locations/"),
);

/* ------------------------------------------------------------------ activity */
export interface ActivityRow {
  id: string;
  at: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown>;
  actor: { id: string; name: string | null; email: string | null } | null;
}

export interface ActivityQuery {
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  page?: number;
}

export const listActivityFn = endpoint(async (d: ActivityQuery | undefined) =>
  api.get<{
    rows: ActivityRow[];
    count: number;
    page: number;
    total_pages: number;
    actors: { id: string; name: string | null; email: string | null }[];
  }>("/workspace/activity/", {
    actor: d?.actor || undefined,
    from: d?.from || undefined,
    to: d?.to || undefined,
    q: d?.q || undefined,
    page: d?.page,
  }),
);
