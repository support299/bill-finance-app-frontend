import { api, endpoint } from "./client";

export interface AgencyClient {
  location_id: string;
  name: string | null;
  email: string | null;
  last_access_at: string | null;
  can_open: boolean;
  transaction_count: number;
  bank_count: number;
  note: string | null;
}

export type ClientStatus = "all" | "opened" | "not_opened";

export interface AgencyClients {
  company_id: string;
  clients: AgencyClient[];
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  /** Tab badges: they follow the search, not the selected tab. */
  counts: Record<ClientStatus, number>;
  recent_activity: { at: string; action: string; location_id: string | null; who: string | null }[];
}

export interface AgencyClientsQuery {
  q?: string;
  status?: ClientStatus;
  page?: number;
  pageSize?: number;
}

/** Search, filter and pagination all run on the server, so they cover every client of the agency. */
export const listAgencyClientsFn = endpoint(async (d: AgencyClientsQuery | undefined) =>
  api.get<AgencyClients>("/agency/clients/", {
    q: d?.q || undefined,
    status: d?.status && d.status !== "all" ? d.status : undefined,
    page: d?.page,
    page_size: d?.pageSize,
  }),
);

export const openAgencyClientFn = endpoint(async (d: { locationId: string }) =>
  api.post<{ access: string; refresh: string; client_name: string }>(
    `/agency/clients/${d.locationId}/open/`,
  ),
);

/** Signs in from the link's company id and shared token (checked server-side against GHL_AGENCY_TOKEN). */
export async function openAgencySession(d: { companyId: string; token: string }) {
  return api.post<{ access: string; refresh: string; company_id: string }>(
    "/agency/session/",
    { company_id: d.companyId, token: d.token },
    { anonymous: true },
  );
}
