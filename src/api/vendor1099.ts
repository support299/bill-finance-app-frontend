import { api, endpoint } from "./client";

export const TAX_CLASSIFICATIONS = [
  "individual",
  "llc_single",
  "llc_partnership",
  "llc_c_corp",
  "llc_s_corp",
  "partnership",
  "c_corp",
  "s_corp",
  "trust_estate",
  "other",
] as const;

export const TAX_CLASSIFICATION_LABELS: Record<(typeof TAX_CLASSIFICATIONS)[number], string> = {
  individual: "Individual / sole proprietor",
  llc_single: "Single-member LLC (disregarded)",
  llc_partnership: "LLC taxed as partnership",
  llc_c_corp: "LLC taxed as C corporation",
  llc_s_corp: "LLC taxed as S corporation",
  partnership: "Partnership",
  c_corp: "C corporation",
  s_corp: "S corporation",
  trust_estate: "Trust / estate",
  other: "Other",
};

export const MISC_BOXES = [
  "rents",
  "royalties",
  "other_income",
  "medical",
  "attorney_proceeds",
] as const;
export const MISC_BOX_LABELS: Record<(typeof MISC_BOXES)[number], string> = {
  rents: "Box 1 – Rents",
  royalties: "Box 2 – Royalties",
  other_income: "Box 3 – Other income",
  medical: "Box 6 – Medical & health care payments",
  attorney_proceeds: "Box 10 – Gross proceeds paid to an attorney",
};

export interface VendorProfile {
  ledger_id: string;
  is_1099_vendor: boolean;
  form_type: "nec" | "misc";
  misc_box: (typeof MISC_BOXES)[number] | null;
  legal_name: string | null;
  business_name: string | null;
  tax_classification: (typeof TAX_CLASSIFICATIONS)[number] | null;
  is_attorney: boolean;
  tin_type: "ssn" | "ein" | "itin" | null;
  tin_last4: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  w9_received_at: string | null;
  backup_withholding: boolean;
}

export interface VendorSummary {
  ledger_id: string;
  label: string;
  legal_name: string | null;
  form: string;
  box: string;
  tin_masked: string | null;
  total: number;
  excluded_card: number;
  payment_count: number;
  threshold: number;
  exempt: boolean;
  reportable: boolean;
  issues: string[];
}

export interface VendorProfileInput {
  ledgerId: string;
  is1099Vendor: boolean;
  formType: "nec" | "misc";
  miscBox?: (typeof MISC_BOXES)[number] | null | undefined;
  legalName?: string | null | undefined;
  businessName?: string | null | undefined;
  taxClassification?: (typeof TAX_CLASSIFICATIONS)[number] | null | undefined;
  isAttorney?: boolean | undefined;
  tinType?: "ssn" | "ein" | "itin" | null | undefined;
  /** Full TIN only when changing it; omitted keeps the stored value. */
  tin?: string | undefined;
  addressLine1?: string | null | undefined;
  addressLine2?: string | null | undefined;
  city?: string | null | undefined;
  state?: string | null | undefined;
  postalCode?: string | null | undefined;
  w9ReceivedAt?: string | null | undefined;
  backupWithholding?: boolean | undefined;
}

export const getVendorProfileFn = endpoint(async (d: { ledgerId: string; year: number }) =>
  api.get<{ profile: VendorProfile | null; summary: VendorSummary | null }>(
    `/ledgers/${d.ledgerId}/vendor-profile/`,
    { year: d.year },
  ),
);

export const saveVendorProfileFn = endpoint(async (d: VendorProfileInput) => {
  await api.put(`/ledgers/${d.ledgerId}/vendor-profile/`, {
    is_1099_vendor: d.is1099Vendor,
    form_type: d.formType,
    misc_box: d.miscBox ?? null,
    legal_name: d.legalName || null,
    business_name: d.businessName || null,
    tax_classification: d.taxClassification ?? null,
    is_attorney: d.isAttorney ?? false,
    tin_type: d.tinType ?? null,
    ...(d.tin ? { tin: d.tin } : {}),
    address_line1: d.addressLine1 || null,
    address_line2: d.addressLine2 || null,
    city: d.city || null,
    state: d.state || null,
    postal_code: d.postalCode || null,
    w9_received_at: d.w9ReceivedAt || null,
    backup_withholding: d.backupWithholding ?? false,
  });
  return { ok: true };
});

/** CSV of every 1099 vendor for a calendar year. Full TINs included for filing. */
export const export1099CsvFn = endpoint(async (d: { year: number; ledgerId?: string }) =>
  api.get<{ csv: string; count: number }>("/1099/export/", { year: d.year, ledger_id: d.ledgerId }),
);
