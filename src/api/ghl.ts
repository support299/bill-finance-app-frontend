import { API_BASE_URL, api, endpoint } from "./client";

/** Imports / reconciles every GoHighLevel invoice for the signed-in workspace. */
export const syncGhlInvoicesFn = endpoint(async (_: void) =>
  api.post<{ synced: number; failed: number }>("/workspace/invoices/sync/", {}),
);

export interface LedgerInvoice {
  id: string;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  total: string;
  tax: string;
  amount_paid: string;
  balance: string;
  status: string;
  needs_review: boolean;
  review_reason: string | null;
}

export const listLedgerInvoicesFn = endpoint(async (d: { ledgerId: string }) =>
  api.get<{ invoices: LedgerInvoice[] }>(`/workspace/ledgers/${d.ledgerId}/invoices/`),
);

/** Exchanges a GoHighLevel location link for a workspace session. `sig` is only needed when the backend enforces signed links. */
export async function openGhlWorkspace(locationId: string, sig?: string | null) {
  return api.post<{ access: string; refresh: string; user_id: string }>(
    "/workspace/session/",
    { id: locationId, ...(sig ? { sig } : {}) },
    { anonymous: true },
  );
}

/* ----------------------- linking a location to this workspace ----------------------- */
export interface GhlLocationSummary {
  location_id: string;
  name: string | null;
  company_id: string | null;
  email: string | null;
  active: boolean;
  has_token: boolean;
  invoices_synced_at: string | null;
  /** only on link options: free = can be linked, here = already this workspace, elsewhere = taken */
  link_state?: "free" | "here" | "elsewhere";
}

const STASH_KEY = "ghl-link-code";

/** Full-page navigation, behind an object so tests can intercept it. */
export const navigation = { go: (url: string) => window.location.assign(url) };

/** Public install URL: redirects to the GoHighLevel consent screen (built server-side from the environment). */
export const ghlInstallUrl = () => `${API_BASE_URL}/workspace/install/`;

export function startGhlConnect() {
  navigation.go(ghlInstallUrl());
}

/** Hidden per-location accounts created by the embedded sign-in; they must never receive a link dialog. */
export const isTenantEmail = (email: string) => email.endsWith("@tenants.invalid");

/** Keeps a link code across the sign-in page when the user came back from GoHighLevel while signed out. */
export function stashGhlLink(code: string) {
  try {
    sessionStorage.setItem(STASH_KEY, code);
  } catch {
    /* storage blocked: the user can simply start the connection again */
  }
}

export function takeStashedGhlLink(): string | null {
  try {
    const code = sessionStorage.getItem(STASH_KEY);
    sessionStorage.removeItem(STASH_KEY);
    return code;
  } catch {
    return null;
  }
}

export const listGhlLinksFn = endpoint(async (_: void) =>
  api.get<{ locations: GhlLocationSummary[] }>("/workspace/links/"),
);

export const getGhlLinkOptionsFn = endpoint(async (d: { code: string }) =>
  api.get<{ choose: boolean; locations: GhlLocationSummary[] }>("/workspace/link/options/", {
    code: d.code,
  }),
);

export const confirmGhlLinkFn = endpoint(
  async (d: { code: string; locationId?: string | undefined }) =>
    api.post<GhlLocationSummary>("/workspace/link/confirm/", {
      code: d.code,
      ...(d.locationId ? { location_id: d.locationId } : {}),
    }),
);

export const unlinkGhlLocationFn = endpoint(async (d: { locationId: string }) => {
  await api.delete(`/workspace/links/${encodeURIComponent(d.locationId)}/`);
  return { ok: true };
});
