import { api, endpoint } from "./client";
import type { BankAccount, Transaction } from "./types";

export interface ReportRange {
  from: string;
  to: string;
  accountIds?: string[] | undefined;
  includeTransfers?: boolean | undefined;
  granularity?: "day" | "week" | "month" | undefined;
}

const query = (r: ReportRange) => ({
  from: r.from,
  to: r.to,
  account_ids: r.accountIds,
  include_transfers: r.includeTransfers,
  granularity: r.granularity,
});

export interface ReportData {
  totals: {
    total_income: number;
    total_expenses: number;
    net_cash_flow: number;
    average_monthly_income: number;
    average_monthly_expenses: number;
    transfer_volume: number;
    transaction_count: number;
    month_count: number;
  };
  series: { period: string; income: number; expenses: number; net: number }[];
  expense_by_category: { name: string; color: string | null; value: number }[];
  income_by_category: { name: string; color: string | null; value: number }[];
  top_expense_category: { name: string; color: string | null; value: number } | null;
  top_income_category: { name: string; color: string | null; value: number } | null;
  top_merchants: { name: string; value: number }[];
  largest_expense: Pick<
    Transaction,
    "amount" | "merchant_name" | "description" | "transaction_date"
  > | null;
  largest_income: Pick<
    Transaction,
    "amount" | "merchant_name" | "description" | "transaction_date"
  > | null;
  largest_transactions: (Pick<
    Transaction,
    "amount" | "merchant_name" | "description" | "transaction_date" | "currency"
  > & {
    categories: { name: string; color: string | null } | null;
  })[];
}

export interface DashboardData {
  accounts: BankAccount[];
  items: {
    id: string;
    institution_name: string | null;
    connection_status: string;
    error_message: string | null;
    last_sync_at: string | null;
  }[];
  current_balance: number;
}

export const getReportDataFn = endpoint(async (r: ReportRange) =>
  api.get<ReportData>("/reports/data/", query(r)),
);
export const getDashboardDataFn = endpoint(async (r: ReportRange) =>
  api.get<DashboardData>("/dashboard/", query(r)),
);
