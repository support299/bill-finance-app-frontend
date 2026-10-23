import { api, endpoint } from "./client";

export interface AccountingRange {
  from: string;
  to: string;
}

interface Line {
  name: string;
  value: number;
}
interface BsLine {
  id: string;
  label: string;
  balance: number;
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
  api.get<AccountingReports>("/reports/accounting/", { from: r.from, to: r.to }),
);
