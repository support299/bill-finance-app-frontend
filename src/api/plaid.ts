import { api, endpoint } from "./client";
import type { BankAccount, PlaidItem, SyncOutcome } from "./types";

export const plaidConfigStatusFn = endpoint(async (_: void) => {
  const r = await api.get<{
    configured: boolean;
    environment: string;
    webhook_configured: boolean;
  }>("/plaid/config/");
  return {
    configured: r.configured,
    environment: r.environment,
    webhookConfigured: r.webhook_configured,
  };
});

/** Only the short-lived link_token reaches the browser. */
export const createLinkTokenFn = endpoint(async (d: { itemId?: string } | undefined) =>
  api.post<{ link_token: string }>("/plaid/link-token/", d?.itemId ? { item_id: d.itemId } : {}),
);

export const exchangePublicTokenFn = endpoint(
  async (d: {
    publicToken: string;
    institutionId?: string | undefined;
    institutionName?: string | undefined;
  }) => {
    const r = await api.post<SyncOutcome & { item_id: string }>("/plaid/exchange/", {
      public_token: d.publicToken,
      ...(d.institutionId ? { institution_id: d.institutionId } : {}),
      ...(d.institutionName ? { institution_name: d.institutionName } : {}),
    });
    const { item_id, ...outcome } = r;
    return { itemId: item_id, ...outcome };
  },
);

export const syncTransactionsFn = endpoint(async (d: { itemId?: string } | undefined) =>
  api.post<{ synced: number; added: number; modified: number; removed: number; skipped: number }>(
    "/plaid/sync/",
    d?.itemId ? { item_id: d.itemId } : {},
  ),
);

export const refreshTransactionsFn = endpoint(async (d: { itemId: string }) =>
  api.post<SyncOutcome>(`/plaid/items/${d.itemId}/refresh/`, {}),
);

export const getAccountsFn = endpoint(async (_: void) =>
  api.get<{ items: PlaidItem[]; accounts: BankAccount[] }>("/accounts/"),
);

export const removeItemFn = endpoint(async (d: { itemId: string; deleteData: boolean }) => {
  await api.delete(`/plaid/items/${d.itemId}/`, { delete_data: d.deleteData });
  return { ok: true };
});

export const updateItemStatusFn = endpoint(async (d: { itemId: string }) => {
  await api.post(`/plaid/items/${d.itemId}/status/`, {});
  return { ok: true };
});
