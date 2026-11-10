/** Shapes returned by the Django REST API (snake_case, matching the database columns). */

export type GaapType =
  | "revenue"
  | "cogs"
  | "operating_expense"
  | "other_income"
  | "other_expense"
  | "asset"
  | "liability"
  | "equity"
  | "transfer";

export interface Category {
  id: string;
  user_id?: string | null;
  name: string;
  type: GaapType;
  color: string | null;
  icon: string | null;
  is_system: boolean;
  parent_category?: string | null;
  /** Position within its type on the P&L (lower first; 0 = after the seeded chart). */
  sort_order?: number;
}

export type CategoryLite = Pick<Category, "id" | "name" | "type" | "color" | "icon">;

export interface Transaction {
  id: string;
  project: string | null;
  project_role: "deposit" | "equipment" | "labor" | "other" | null;
  reconciled: boolean;
  /** Receipts/invoices attached (list endpoint only). */
  attachment_count?: number;
  user_category_id: string | null;
  ledger_id: string | null;
  plaid_item_id: string | null;
  plaid_account_id: string | null;
  plaid_transaction_id: string | null;
  merchant_name: string | null;
  original_description: string | null;
  description: string | null;
  amount: string | number;
  currency: string | null;
  transaction_date: string;
  authorized_date: string | null;
  due_date: string | null;
  pending: boolean;
  payment_channel: string | null;
  transaction_type: string | null;
  merchant_logo_url: string | null;
  website: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  plaid_personal_finance_primary_category: string | null;
  plaid_personal_finance_detailed_category: string | null;
  category_source: string | null;
  categorization_confidence: string | null;
  transaction_direction: string | null;
  gaap_type: GaapType | null;
  is_income: boolean;
  is_expense: boolean;
  is_transfer: boolean;
  is_recurring: boolean;
  is_hidden: boolean;
  source: "plaid" | "manual" | "ghl";
  status: "pending" | "posted" | "paid" | "void";
  accounting_status: "accounts_receivable" | "received" | "accounts_payable" | "paid" | null;
  categories: CategoryLite | null;
  created_at: string;
  updated_at: string;
}

export interface Tag {
  id: string;
  name: string;
}

export interface Ledger {
  id: string;
  label: string;
  account_class: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  ghl_contact_id?: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

export interface Rule {
  id: string;
  keyword: string;
  match_type: "contains" | "starts_with" | "exact" | "regex";
  category_id: string | null;
  ledger_id: string | null;
  priority: number;
  active: boolean;
  source: string;
  categories: CategoryLite | null;
  ledgers: { id: string; label: string } | null;
}

export interface PlaidItem {
  id: string;
  institution_name: string | null;
  institution_id: string | null;
  connection_status: string;
  error_message: string | null;
  last_sync_at: string | null;
  environment: string;
  created_at: string;
  /** Transactions dated before this are ignored by the sync (set when history up to a date was deleted). */
  history_from: string | null;
  transaction_count: number;
}

export interface BankAccount {
  id: string;
  plaid_item_id: string;
  plaid_account_id: string;
  account_name: string | null;
  official_name: string | null;
  mask: string | null;
  account_type: string | null;
  account_subtype: string | null;
  current_balance: string | number | null;
  available_balance: string | number | null;
  iso_currency_code: string | null;
  last_balance_update: string | null;
  institution_id: string | null;
}

export interface Notification {
  id: string;
  title: string;
  message: string | null;
  type: string;
  read: boolean;
  created_at: string;
}

export interface SyncLog {
  id: string;
  sync_started_at: string;
  sync_completed_at: string | null;
  transactions_added: number;
  transactions_modified: number;
  transactions_removed: number;
  status: string;
  trigger_source: string;
  error_message: string | null;
}

export interface SyncOutcome {
  added: number;
  modified: number;
  removed: number;
  status: "success" | "error";
  message?: string;
}

export interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
