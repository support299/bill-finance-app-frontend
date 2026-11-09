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
export const createLinkTokenFn = endpoint(
  async (d: { itemId?: string; historyDays?: number } | undefined) =>
    api.post<{ link_token: string }>("/plaid/link-token/", {
      ...(d?.itemId ? { item_id: d.itemId } : {}),
      ...(d?.historyDays ? { history_days: d.historyDays } : {}),
    }),
);

export const exchangePublicTokenFn = endpoint(
  async (d: {
    publicToken: string;
    institutionId?: string | undefined;
    institutionName?: string | undefined;
    historyDays?: number | undefined;
  }) => {
    const r = await api.post<SyncOutcome & { item_id: string }>("/plaid/exchange/", {
      public_token: d.publicToken,
      ...(d.institutionId ? { institution_id: d.institutionId } : {}),
      ...(d.institutionName ? { institution_name: d.institutionName } : {}),
      ...(d.historyDays ? { history_days: d.historyDays } : {}),
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

/** Where a bank's history starts: transactions dated before it are ignored by the sync. `null` keeps everything. */
export const setItemHistoryFromFn = endpoint(
  async (d: { itemId: string; historyFrom: string | null }) =>
    api.patch<PlaidItem>(`/plaid/items/${d.itemId}/`, { history_from: d.historyFrom }),
);

export const updateItemStatusFn = endpoint(async (d: { itemId: string }) => {
  await api.post(`/plaid/items/${d.itemId}/status/`, {});
  return { ok: true };
});

export interface CsvImportInput {
  csvText: string;
  accountId?: string | undefined;
  institutionName?: string | undefined;
  accountName?: string | undefined;
  accountType?: string | undefined;
  invertSign: boolean;
  dryRun: boolean;
}

export interface CsvImportResult {
  account_id?: string;
  total: number;
  added: number;
  duplicates: number;
  skipped: number;
  skipped_rows: { line: number; reason: string }[];
  date_from: string;
  date_to: string;
}

export const importCsvFn = endpoint(async (d: CsvImportInput) =>
  api.post<CsvImportResult>("/accounts/csv-import/", {
    csv_text: d.csvText,
    invert_sign: d.invertSign,
    dry_run: d.dryRun,
    ...(d.accountId ? { account_id: d.accountId } : {}),
    ...(d.institutionName ? { institution_name: d.institutionName } : {}),
    ...(d.accountName ? { account_name: d.accountName } : {}),
    ...(d.accountType ? { account_type: d.accountType } : {}),
  }),
);
