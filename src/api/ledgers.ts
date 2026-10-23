import { api, endpoint } from "./client";
import type { GaapType, Ledger, Rule, Tag, Transaction } from "./types";

export const ACCOUNT_CLASSES = [
  "current_asset",
  "noncurrent_asset",
  "current_liability",
  "noncurrent_liability",
  "equity",
] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const ACCOUNT_CLASS_LABELS: Record<string, string> = {
  current_asset: "Current Assets",
  noncurrent_asset: "Non-Current Assets",
  current_liability: "Current Liabilities",
  noncurrent_liability: "Non-Current (Long-Term) Liabilities",
  equity: "Stockholders' Equity",
};

export const ACCOUNTING_STATUSES = [
  "accounts_receivable",
  "received",
  "accounts_payable",
  "paid",
] as const;
export type AccountingStatus = (typeof ACCOUNTING_STATUSES)[number];

export const ACCOUNTING_STATUS_LABELS: Record<AccountingStatus, string> = {
  accounts_receivable: "Accounts Receivable",
  received: "Received",
  accounts_payable: "Accounts Payable",
  paid: "Paid",
};

export type TxStatus = "pending" | "posted" | "paid" | "void";

export interface LedgerInput {
  label: string;
  accountClass: AccountClass;
  contactName?: string | null | undefined;
  contactEmail?: string | null | undefined;
  contactPhone?: string | null | undefined;
  notes?: string | null | undefined;
}

const ledgerBody = (d: LedgerInput) => ({
  label: d.label.trim(),
  account_class: d.accountClass,
  contact_name: d.contactName || null,
  contact_email: d.contactEmail || null,
  contact_phone: d.contactPhone || null,
  notes: d.notes || null,
});

export const listLedgersFn = endpoint(async (_: void) => ({
  ledgers: await api.get<Ledger[]>("/ledgers/"),
}));

export const createLedgerFn = endpoint(async (d: LedgerInput) => {
  const row = await api.post<Ledger>("/ledgers/", ledgerBody(d));
  return { id: row.id };
});

export const updateLedgerFn = endpoint(async (d: LedgerInput & { id: string }) => {
  await api.patch(`/ledgers/${d.id}/`, ledgerBody(d));
  return { ok: true };
});

export const deleteLedgerFn = endpoint(async (d: { id: string }) => {
  await api.delete(`/ledgers/${d.id}/`);
  return { ok: true };
});

export const getLedgerFn = endpoint(async (d: { id: string }) => {
  const r = await api.get<{
    ledger: Ledger;
    tags: Tag[];
    transactions: Transaction[];
    rules: Rule[];
    transaction_count: number;
  }>(`/ledgers/${d.id}/`);
  return {
    ledger: r.ledger,
    tags: r.tags,
    transactions: r.transactions,
    rules: r.rules,
    transactionCount: r.transaction_count,
  };
});

export const ledgerSummariesFn = endpoint(async (_: void) =>
  api.get<{ summaries: Record<string, { count: number; net: number }> }>("/ledgers/summaries/"),
);

/* --------------------------------- tags --------------------------------- */
export const listTagsFn = endpoint(async (_: void) => ({ tags: await api.get<Tag[]>("/tags/") }));

export const addLedgerTagFn = endpoint(async (d: { ledgerId: string; name: string }) => {
  await api.post(`/ledgers/${d.ledgerId}/tags/`, { name: d.name });
  return { ok: true };
});

export const removeLedgerTagFn = endpoint(async (d: { ledgerId: string; tagId: string }) => {
  await api.delete(`/ledgers/${d.ledgerId}/tags/${d.tagId}/`);
  return { ok: true };
});

/* ------------------------- assignment & manual entries ------------------------- */
export const assignLedgerFn = endpoint(async (d: { ids: string[]; ledgerId: string | null }) =>
  api.post<{ updated: number }>("/transactions/assign-ledger/", {
    ids: d.ids,
    ledger_id: d.ledgerId,
  }),
);

export interface LedgerEntryInput {
  ledgerId: string;
  date: string;
  dueDate?: string | null | undefined;
  description: string;
  amount: number;
  type: GaapType;
  status?: TxStatus | undefined;
  accountingStatus?: AccountingStatus | null | undefined;
  categoryId?: string | null | undefined;
}

const entryBody = (d: LedgerEntryInput) => ({
  ledger_id: d.ledgerId,
  date: d.date,
  due_date: d.dueDate || null,
  description: d.description,
  amount: d.amount,
  type: d.type,
  status: d.status ?? "posted",
  accounting_status: d.accountingStatus ?? null,
  category_id: d.categoryId ?? null,
});

export const createLedgerEntryFn = endpoint(async (d: LedgerEntryInput) => {
  await api.post("/entries/", entryBody(d));
  return { ok: true };
});

export const updateLedgerEntryFn = endpoint(async (d: LedgerEntryInput & { id: string }) => {
  await api.patch(`/entries/${d.id}/`, entryBody(d));
  return { ok: true };
});

/** Change status / type / category / ledger of any transaction inside a ledger. */
export const updateLedgerTransactionFn = endpoint(
  async (d: {
    id: string;
    status?: TxStatus;
    type?: GaapType;
    categoryId?: string | null;
    ledgerId?: string | null;
    dueDate?: string | null;
    accountingStatus?: AccountingStatus | null;
  }) => {
    await api.patch(`/transactions/${d.id}/`, {
      ...(d.status ? { status: d.status } : {}),
      ...(d.type ? { type: d.type } : {}),
      ...(d.categoryId !== undefined ? { category_id: d.categoryId } : {}),
      ...(d.ledgerId !== undefined ? { ledger_id: d.ledgerId } : {}),
      ...(d.dueDate !== undefined ? { due_date: d.dueDate || null } : {}),
      ...(d.accountingStatus !== undefined ? { accounting_status: d.accountingStatus } : {}),
    });
    return { ok: true };
  },
);

export const deleteLedgerEntryFn = endpoint(async (d: { id: string }) => {
  await api.delete(`/entries/${d.id}/`);
  return { ok: true };
});
