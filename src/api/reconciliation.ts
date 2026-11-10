import { api, endpoint } from "./client";

/** Balances are in statement terms: money you have (bank) or money you owe (credit card / loan). */
export interface ReconciliationSummary {
  id: string;
  bank_account_id: string;
  account_name: string | null;
  mask: string | null;
  account_type: string | null;
  statement_date: string;
  beginning_balance: string;
  ending_balance: string;
  status: "in_progress" | "completed";
  completed_at: string | null;
  cleared_count: number;
  additions: string;
  subtractions: string;
  cleared_balance: string;
  difference: string;
  balanced: boolean;
}

export interface ReconciliationRow {
  id: string;
  date: string;
  description: string;
  /** Account view (negative = money out). */
  amount: string;
  /** Effect on the statement balance. */
  delta: string;
  cleared: boolean;
}

export interface ReconciliationDetail {
  reconciliation: ReconciliationSummary;
  transactions: ReconciliationRow[];
}

export const listReconciliationsFn = endpoint(async (d: { accountId?: string } | undefined) =>
  api.get<{ reconciliations: ReconciliationSummary[] }>(
    "/reconciliations/",
    d?.accountId ? { account_id: d.accountId } : {},
  ),
);

export const startReconciliationFn = endpoint(
  async (d: {
    accountId: string;
    statementDate: string;
    endingBalance: number;
    beginningBalance?: number;
  }) =>
    api.post<ReconciliationDetail>("/reconciliations/", {
      account_id: d.accountId,
      statement_date: d.statementDate,
      ending_balance: d.endingBalance,
      ...(d.beginningBalance !== undefined ? { beginning_balance: d.beginningBalance } : {}),
    }),
);

export const getReconciliationFn = endpoint(async (d: { id: string }) =>
  api.get<ReconciliationDetail>(`/reconciliations/${d.id}/`),
);

export const updateReconciliationFn = endpoint(
  async (d: {
    id: string;
    statementDate?: string;
    endingBalance?: number;
    beginningBalance?: number;
  }) =>
    api.patch<ReconciliationDetail>(`/reconciliations/${d.id}/`, {
      ...(d.statementDate ? { statement_date: d.statementDate } : {}),
      ...(d.endingBalance !== undefined ? { ending_balance: d.endingBalance } : {}),
      ...(d.beginningBalance !== undefined ? { beginning_balance: d.beginningBalance } : {}),
    }),
);

export const clearTransactionsFn = endpoint(
  async (d: { id: string; ids: string[]; cleared: boolean }) =>
    api.post<ReconciliationDetail>(`/reconciliations/${d.id}/clear/`, {
      ids: d.ids,
      cleared: d.cleared,
    }),
);

export const finishReconciliationFn = endpoint(async (d: { id: string }) =>
  api.post<ReconciliationDetail>(`/reconciliations/${d.id}/finish/`),
);

export const reopenReconciliationFn = endpoint(async (d: { id: string }) =>
  api.post<ReconciliationDetail>(`/reconciliations/${d.id}/reopen/`),
);

export const deleteReconciliationFn = endpoint(async (d: { id: string }) =>
  api.delete(`/reconciliations/${d.id}/`),
);

export interface UnreconciledRow {
  id: string;
  date: string;
  description: string;
  amount: string;
  delta: string;
  /** Ticked in a reconciliation that is still open. */
  in_progress: boolean;
}

export const unreconciledFn = endpoint(async (d: { accountId: string; to?: string | undefined }) =>
  api.get<{
    account_id: string;
    reconciled_through: string | null;
    count: number;
    net: string;
    transactions: UnreconciledRow[];
  }>("/reconciliations/unreconciled/", { account_id: d.accountId, to: d.to }),
);
