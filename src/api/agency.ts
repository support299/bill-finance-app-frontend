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

export interface AgencyClients {
  company_id: string;
  clients: AgencyClient[];
  recent_activity: { at: string; action: string; location_id: string | null; who: string | null }[];
}

export const listAgencyClientsFn = endpoint(async (_: void) =>
  api.get<AgencyClients>("/agency/clients/"),
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
