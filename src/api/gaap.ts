/** US GAAP transaction / category types (display helpers; the server owns the classification logic). */
import type { GaapType } from "./types";

export type { GaapType };

export const GAAP_TYPES = [
  "revenue",
  "cogs",
  "operating_expense",
  "other_income",
  "other_expense",
  "asset",
  "liability",
  "equity",
  "transfer",
] as const satisfies readonly GaapType[];

export const GAAP_TYPE_LABELS: Record<GaapType, string> = {
  revenue: "Revenue",
  cogs: "Cost of Goods Sold",
  operating_expense: "Operating Expense",
  other_income: "Other Income",
  other_expense: "Other Expense",
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  transfer: "Transfer",
};

export const isIncomeType = (t: string | null | undefined) =>
  t === "revenue" || t === "other_income";
export const isExpenseType = (t: string | null | undefined) =>
  t === "cogs" || t === "operating_expense" || t === "other_expense";

export function gaapLabel(t: string | null | undefined) {
  return (t && GAAP_TYPE_LABELS[t as GaapType]) || "—";
}

/** Fallback type for legacy rows that lack gaap_type. */
export function rowGaapType(t: {
  gaap_type?: string | null;
  is_income?: boolean;
  is_expense?: boolean;
  is_transfer?: boolean;
}): GaapType {
  if (t.gaap_type) return t.gaap_type as GaapType;
  if (t.is_income) return "revenue";
  if (t.is_expense) return "operating_expense";
  if (t.is_transfer) return "transfer";
  return "other_expense";
}

/** Receivable/payable statuses that fit a transaction type (mirrors the server-side validation). */
export function accountingStatusesForType(
  t: string | null | undefined,
): ("accounts_receivable" | "received" | "accounts_payable" | "paid")[] {
  if (t === "revenue" || t === "other_income" || t === "asset")
    return ["accounts_receivable", "received"];
  if (t === "cogs" || t === "operating_expense" || t === "other_expense" || t === "liability")
    return ["accounts_payable", "paid"];
  return [];
}

/** Normalizes a merchant/description into a reusable rule keyword. */
export function cleanMerchantKeyword(
  merchant?: string | null,
  description?: string | null,
): string {
  const base = (merchant || description || "").toLowerCase();
  return (
    base
      .replace(/[^a-z0-9 &.]/g, " ")
      .replace(/\b(purchase|pos|debit|credit|payment|card|xxxx?\d*|\d{2,})\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .slice(0, 2)
      .join(" ") || base.trim()
  );
}
