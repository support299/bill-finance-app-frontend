import { api, endpoint } from "./client";

export type PlSort = "chart" | "name" | "amount";

export interface AccountingRange {
  plSort?: PlSort | undefined;
  /** Narrows the profit & loss to one project. */
  projectId?: string | undefined;
  from: string;
  to: string;
}

export interface Line {
  name: string;
  value: number;
  /** Category behind a P&L line (null = uncategorized); absent on cash-flow lines. */
  category_id?: string | null;
  /** Every category the line covers (itself plus sub-categories) — what its transactions are filed under. */
  category_ids?: string[];
  /** Sub-categories rolled into this P&L line. */
  children?: Line[];
}
export interface BsLine {
  id: string;
  label: string;
  balance: number;
  /** What `id` refers to: a ledger account, a bank account (Plaid id) or the retained-earnings plug. */
  kind?: "ledger" | "bank" | "retained" | "sales_tax";
}
interface AgingRow {
  id: string;
  label: string;
  contact: string | null;
  buckets: Record<string, number>;
  total: number;
}
interface Aging {
  rows: AgingRow[];
  totals: { buckets: Record<string, number>; total: number };
}

export interface AccountingReports {
  profit_and_loss: {
    revenue: Line[];
    cogs: Line[];
    operating_expenses: Line[];
    other_income: Line[];
    other_expenses: Line[];
    total_revenue: number;
    total_cogs: number;
    gross_profit: number;
    total_operating_expenses: number;
    operating_income: number;
    total_other_income: number;
    total_other_expenses: number;
    net_other: number;
    total_income: number;
    total_expenses: number;
    net_profit: number;
  };
  balance_sheet: {
    current_assets: BsLine[];
    noncurrent_assets: BsLine[];
    current_liabilities: BsLine[];
    noncurrent_liabilities: BsLine[];
    equity: BsLine[];
    total_current_assets: number;
    total_noncurrent_assets: number;
    total_current_liabilities: number;
    total_noncurrent_liabilities: number;
    total_assets: number;
    total_liabilities: number;
    total_equity: number;
    unbalanced: number;
  };
  cash_flow: {
    operating_lines: Line[];
    investing_lines: Line[];
    financing_lines: Line[];
    operating: number;
    investing: number;
    financing: number;
    net_change: number;
    closing_cash: number;
  };
  general_ledger: {
    id: string;
    label: string;
    account_class: string;
    closing: number;
    entries: {
      id: string;
      date: string;
      description: string;
      debit: number;
      credit: number;
      balance: number;
      status: string;
      accounting_status: string | null;
    }[];
  }[];
  trial_balance: {
    rows: { id: string; label: string; account_class: string; debit: number; credit: number }[];
    total_debit: number;
    total_credit: number;
    difference: number;
    balanced: boolean;
  };
  internal_transfers: {
    rows: { id: string; date: string; description: string; account: string; amount: number }[];
    money_out: number;
    money_in: number;
    /** Money in less money out: zero when every transfer has both sides. */
    difference: number;
  };
  sales_tax: {
    /** Totals per tax name on the GoHighLevel invoice (e.g. a city). */
    by_name: { name: string; collected: number; remitted: number; balance: number }[];
    rows: {
      id: string;
      date: string;
      tax_name: string;
      description: string;
      collected: number;
      remitted: number;
    }[];
    collected: number;
    remitted: number;
    /** Collected less remitted, everything up to the report date. */
    balance_due: number;
  };
  ar_aging: Aging;
  ap_aging: Aging;
  account_detail: {
    id: string;
    label: string;
    total: number;
    rows: {
      id: string;
      date: string;
      description: string;
      category: string;
      ledger: string;
      status: string;
      accounting_status: string | null;
      amount: number;
    }[];
  }[];
}

export const getAccountingReportsFn = endpoint(async (r: AccountingRange) =>
  api.get<AccountingReports>("/reports/accounting/", {
    from: r.from,
    to: r.to,
    project_id: r.projectId,
    pl_sort: r.plSort,
  }),
);
