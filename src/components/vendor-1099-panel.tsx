import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { formatCurrency } from "@/lib/format";
import {
  export1099CsvFn,
  getVendorProfileFn,
  MISC_BOX_LABELS,
  MISC_BOXES,
  saveVendorProfileFn,
  TAX_CLASSIFICATION_LABELS,
  TAX_CLASSIFICATIONS,
} from "@/api/vendor1099";

const thisYear = new Date().getFullYear();
const YEARS = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3];

const empty = {
  is1099Vendor: false,
  formType: "nec" as "nec" | "misc",
  miscBox: "other_income" as (typeof MISC_BOXES)[number],
  legalName: "",
  businessName: "",
  taxClassification: "" as string,
  isAttorney: false,
  tinType: "" as string,
  tin: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  w9ReceivedAt: "",
  backupWithholding: false,
};

function download(csv: string, name: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Vendor1099Panel({ ledgerId }: { ledgerId: string }) {
  const qc = useQueryClient();
  const get = getVendorProfileFn;
  const save = saveVendorProfileFn;
  const exportCsv = export1099CsvFn;
  const [year, setYear] = useState(thisYear);
  const [f, setF] = useState(empty);

  const q = useQuery({
    queryKey: ["vendor1099", ledgerId, year],
    queryFn: () => get({ data: { ledgerId, year } }),
  });
  const p = q.data?.profile;
  const s = q.data?.summary;

  useEffect(() => {
    if (!p) return;
    setF({
      is1099Vendor: p.is_1099_vendor,
      formType: p.form_type,
      miscBox: p.misc_box ?? "other_income",
      legalName: p.legal_name ?? "",
      businessName: p.business_name ?? "",
      taxClassification: p.tax_classification ?? "",
      isAttorney: p.is_attorney,
      tinType: p.tin_type ?? "",
      tin: "",
      addressLine1: p.address_line1 ?? "",
      addressLine2: p.address_line2 ?? "",
      city: p.city ?? "",
      state: p.state ?? "",
      postalCode: p.postal_code ?? "",
      w9ReceivedAt: p.w9_received_at ?? "",
      backupWithholding: p.backup_withholding,
    });
  }, [p]);

  const saveM = useMutation({
    mutationFn: () =>
      save({
        data: {
          ledgerId,
          is1099Vendor: f.is1099Vendor,
          formType: f.formType,
          miscBox: f.formType === "misc" ? f.miscBox : null,
          legalName: f.legalName,
          businessName: f.businessName,
          taxClassification: (f.taxClassification || null) as
            (typeof TAX_CLASSIFICATIONS)[number] | null,
          isAttorney: f.isAttorney,
          tinType: (f.tinType || null) as "ssn" | "ein" | "itin" | null,
          tin: f.tin.trim() ? f.tin : undefined,
          addressLine1: f.addressLine1,
          addressLine2: f.addressLine2,
          city: f.city,
          state: f.state,
          postalCode: f.postalCode,
          w9ReceivedAt: f.w9ReceivedAt || null,
          backupWithholding: f.backupWithholding,
        },
      }),
    onSuccess: () => {
      toast.success("1099 vendor details saved");
      setF((x) => ({ ...x, tin: "" }));
      qc.invalidateQueries({ queryKey: ["vendor1099"] });
    },
    onError: (e: Error) =>
      toast.error(e.message.includes("TIN") ? "TIN must be 9 digits" : e.message),
  });

  const exportM = useMutation({
    mutationFn: (scope: "one" | "all") =>
      exportCsv({ data: scope === "one" ? { year, ledgerId } : { year } }),
    onSuccess: (r, scope) => {
      if (!r.count) {
        toast.info("No 1099 vendors to export yet.");
        return;
      }
      download(r.csv, scope === "one" ? `1099-${year}-vendor.csv` : `1099-${year}-all-vendors.csv`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="surface space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="size-4" /> 1099 vendor tracking
          </h2>
          <p className="text-xs text-muted-foreground">
            Track IRS Form 1099-NEC / 1099-MISC payments to this vendor.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          Track as 1099 vendor
          <Switch
            checked={f.is1099Vendor}
            onCheckedChange={(v) => setF({ ...f, is1099Vendor: v })}
          />
        </label>
      </div>

      {f.is1099Vendor && (
        <>
          {s && (
            <div className="rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YEARS.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        Tax year {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Badge variant={s.reportable ? "default" : "outline"}>
                  {s.exempt
                    ? "Exempt (corporation)"
                    : s.reportable
                      ? `${s.form} required`
                      : "Below threshold"}
                </Badge>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Reportable payments</p>
                  <p className="text-lg font-semibold">{formatCurrency(s.total)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Filing threshold</p>
                  <p className="text-lg font-semibold">{formatCurrency(s.threshold)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Excluded (card / 1099-K)</p>
                  <p className="text-lg font-semibold">{formatCurrency(s.excluded_card)}</p>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.form} · {s.box}
                {s.tin_masked ? ` · TIN ${s.tin_masked}` : ""}
              </p>
              {s.issues.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs">
                  {s.issues.map((i: string) => (
                    <li key={i}>{i}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Form</label>
              <Select
                value={f.formType}
                onValueChange={(v) => setF({ ...f, formType: v as "nec" | "misc" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nec">1099-NEC (nonemployee compensation)</SelectItem>
                  <SelectItem value="misc">1099-MISC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {f.formType === "misc" && (
              <div>
                <label className="text-xs text-muted-foreground">1099-MISC box</label>
                <Select
                  value={f.miscBox}
                  onValueChange={(v) => setF({ ...f, miscBox: v as (typeof MISC_BOXES)[number] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MISC_BOXES.map((b) => (
                      <SelectItem key={b} value={b}>
                        {MISC_BOX_LABELS[b]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Legal name (W-9 line 1)</label>
              <Input value={f.legalName} onChange={set("legalName")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Business / DBA name</label>
              <Input value={f.businessName} onChange={set("businessName")} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Federal tax classification</label>
              <Select
                value={f.taxClassification}
                onValueChange={(v) => setF({ ...f, taxClassification: v })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select from W-9" />
                </SelectTrigger>
                <SelectContent>
                  {TAX_CLASSIFICATIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {TAX_CLASSIFICATION_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch
                checked={f.isAttorney}
                onCheckedChange={(v) => setF({ ...f, isAttorney: v })}
              />{" "}
              Attorney / law firm
            </label>
            <div>
              <label className="text-xs text-muted-foreground">TIN type</label>
              <Select value={f.tinType} onValueChange={(v) => setF({ ...f, tinType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="SSN / EIN / ITIN" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ssn">SSN</SelectItem>
                  <SelectItem value="ein">EIN</SelectItem>
                  <SelectItem value="itin">ITIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">
                TIN {p?.tin_last4 ? `(on file ••${p.tin_last4})` : ""}
              </label>
              <Input
                value={f.tin}
                onChange={set("tin")}
                placeholder={p?.tin_last4 ? "Enter to replace" : "9 digits"}
                autoComplete="off"
                type="password"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Address</label>
              <Input value={f.addressLine1} onChange={set("addressLine1")} />
            </div>
            <div className="sm:col-span-2">
              <Input
                value={f.addressLine2}
                onChange={set("addressLine2")}
                placeholder="Suite / apt (optional)"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">City</label>
              <Input value={f.city} onChange={set("city")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">State</label>
                <Input value={f.state} maxLength={2} onChange={set("state")} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">ZIP</label>
                <Input value={f.postalCode} onChange={set("postalCode")} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">W-9 received on</label>
              <Input type="date" value={f.w9ReceivedAt} onChange={set("w9ReceivedAt")} />
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Switch
                checked={f.backupWithholding}
                onCheckedChange={(v) => setF({ ...f, backupWithholding: v })}
              />{" "}
              Subject to backup withholding
            </label>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          Save 1099 details
        </Button>
        {f.is1099Vendor && (
          <Button
            variant="outline"
            onClick={() => exportM.mutate("one")}
            disabled={exportM.isPending}
          >
            <Download className="size-4" /> This vendor ({year})
          </Button>
        )}
        <Button
          variant="outline"
          onClick={() => exportM.mutate("all")}
          disabled={exportM.isPending}
        >
          <Download className="size-4" /> All 1099 vendors ({year})
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Counts paid payments in the calendar year (cash basis). Unpaid bills, transfers, voided
        entries and card payments (reported by the card processor on Form 1099-K) are excluded.
        Threshold is $2,000 for payments made in 2026 and later, $600 for earlier years ($10 for
        royalties). Corporations are exempt except attorneys and medical payments. Collect a W-9
        before paying; without a TIN, 24% backup withholding applies. 1099-NEC is due to the IRS and
        the vendor by January 31. Files with full tax IDs — store downloads securely.
      </p>
    </div>
  );
}
