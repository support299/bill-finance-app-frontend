import { api, endpoint } from "./client";
import type { GaapType, Paginated, Transaction } from "./types";

export interface TransactionFilters {
  search?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
  accountIds?: string[] | undefined;
  categoryIds?: string[] | undefined;
  uncategorized?: boolean | undefined;
  projectIds?: string[] | undefined;
  noProject?: boolean | undefined;
  /** Imported from a bank connection that has since been removed. */
  unlinked?: boolean | undefined;
  gaapType?: GaapType | undefined;
  /** Only rows the financial statements count (posted, not void). */
  reportable?: boolean | undefined;
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

export function filterQuery(f: TransactionFilters = {}) {
  return {
    search: f.search,
    from: f.from,
    to: f.to,
    account_ids: f.accountIds,
    category_ids: f.categoryIds,
    uncategorized: f.uncategorized,
    project_ids: f.projectIds,
    no_project: f.noProject,
    unlinked: f.unlinked,
    gaap_type: f.gaapType,
    reportable: f.reportable,
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
    projectId?: string | null;
    projectRole?: "deposit" | "equipment" | "labor" | "other" | null;
  }) => {
    await api.patch(`/transactions/${d.id}/`, {
      ...(d.categoryId !== undefined ? { category_id: d.categoryId } : {}),
      ...(d.isHidden !== undefined ? { is_hidden: d.isHidden } : {}),
      ...(d.classification ? { classification: d.classification } : {}),
      ...(d.projectId !== undefined ? { project_id: d.projectId } : {}),
      ...(d.projectRole !== undefined ? { project_role: d.projectRole } : {}),
    });
    return { ok: true };
  },
);

/** Either explicit ids, or `selectAll` with the list filters to apply to every matching transaction. */
export const bulkCategorizeFn = endpoint(
  async (d: {
    categoryId: string;
    ids?: string[];
    selectAll?: { filters: TransactionFilters; expectedCount: number };
  }) =>
    api.post<{ updated: number }>("/transactions/bulk-categorize/", {
      category_id: d.categoryId,
      ...(d.selectAll
        ? {
            select_all: true,
            filters: filterQuery(d.selectAll.filters),
            expected_count: d.selectAll.expectedCount,
          }
        : { ids: d.ids ?? [] }),
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

/** Permanently deletes transactions no longer tied to a bank (connected-bank and GHL rows are skipped). */
export const bulkDeleteTransactionsFn = endpoint(
  async (d: {
    ids?: string[];
    selectAll?: { filters: TransactionFilters; expectedCount: number };
  }) =>
    api.post<{ deleted: number; skipped: number }>(
      "/transactions/bulk-delete/",
      d.selectAll
        ? {
            select_all: true,
            filters: filterQuery(d.selectAll.filters),
            expected_count: d.selectAll.expectedCount,
          }
        : { ids: d.ids ?? [] },
    ),
);
