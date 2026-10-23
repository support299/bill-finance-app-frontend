import { api, endpoint } from "./client";
import type { GaapType, Paginated, Transaction } from "./types";

export interface TransactionFilters {
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  accountIds?: string[] | undefined;
  categoryIds?: string[] | undefined;
  direction?: "all" | "income" | "expense" | "transfer" | undefined;
  status?: "all" | "pending" | "posted" | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  includeHidden?: boolean | undefined;
  sortBy?: "transaction_date" | "amount" | "merchant_name" | undefined;
  sortDir?: "asc" | "desc" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
}

function filterQuery(f: TransactionFilters = {}) {
  return {
    search: f.search,
    from: f.from,
    to: f.to,
    account_ids: f.accountIds,
    category_ids: f.categoryIds,
    direction: f.direction,
    status: f.status,
    min_amount: f.minAmount,
    max_amount: f.maxAmount,
    include_hidden: f.includeHidden,
    sort_by: f.sortBy,
    sort_dir: f.sortDir,
  };
}

export const listTransactionsFn = endpoint(async (f: TransactionFilters | undefined) => {
  const r = await api.get<Paginated<Transaction>>("/transactions/", {
    ...filterQuery(f),
    page: f?.page,
    page_size: f?.pageSize,
  });
  return { rows: r.results, total: r.count, page: f?.page ?? 1, pageSize: f?.pageSize ?? 50 };
});

export const exportTransactionsFn = endpoint(async (f: TransactionFilters | undefined) =>
  api.get<{ rows: Transaction[] }>("/transactions/export/", filterQuery(f)),
);

export const updateTransactionFn = endpoint(
  async (d: {
    id: string;
    categoryId?: string | null;
    isHidden?: boolean;
    classification?: GaapType;
  }) => {
    await api.patch(`/transactions/${d.id}/`, {
      ...(d.categoryId !== undefined ? { category_id: d.categoryId } : {}),
      ...(d.isHidden !== undefined ? { is_hidden: d.isHidden } : {}),
      ...(d.classification ? { classification: d.classification } : {}),
    });
    return { ok: true };
  },
);

export const bulkCategorizeFn = endpoint(async (d: { ids: string[]; categoryId: string }) =>
  api.post<{ updated: number }>("/transactions/bulk-categorize/", {
    ids: d.ids,
    category_id: d.categoryId,
  }),
);

export const createRuleFn = endpoint(
  async (d: {
    keyword: string;
    matchType?: "contains" | "starts_with" | "exact" | "regex";
    categoryId?: string | null;
    ledgerId?: string | null;
    priority?: number;
    applyToExisting?: boolean;
    source?: "user" | "learned";
  }) => {
    const r = await api.post<{ rule_id: string; applied: number }>("/rules/", {
      keyword: d.keyword,
      match_type: d.matchType ?? "contains",
      category_id: d.categoryId ?? null,
      ledger_id: d.ledgerId ?? null,
      priority: d.priority ?? 100,
      apply_to_existing: d.applyToExisting ?? true,
      source: d.source ?? "user",
    });
    return { ruleId: r.rule_id, applied: r.applied };
  },
);

export const recategorizeAllFn = endpoint(async (_: void) =>
  api.post<{ updated: number }>("/transactions/recategorize/", {}),
);
