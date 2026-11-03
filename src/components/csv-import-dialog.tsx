import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileUp, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { importCsvFn, type CsvImportResult } from "@/api/plaid";
import type { BankAccount } from "@/api/types";

const NEW = "__new__";
const MAX_BYTES = 1_500_000;

/**
 * Fallback for banks Plaid can't reach: download the CSV from the bank's site and upload it here.
 * Previews first (nothing saved), then imports. Re-uploading a period never creates duplicates.
 */
export function CsvImportDialog({
  csvAccounts,
  variant = "outline",
  label = "Upload CSV",
}: {
  csvAccounts: BankAccount[];
  variant?: "default" | "outline" | "secondary" | "ghost";
  label?: string;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState("");
  const [accountId, setAccountId] = useState(csvAccounts[0]?.id ?? NEW);
  const [institution, setInstitution] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState("depository");
  const [invertSign, setInvertSign] = useState(false);
  const [preview, setPreview] = useState<CsvImportResult | null>(null);

  const isNew = accountId === NEW;
  const ready = csvText && (!isNew || (institution.trim() && accountName.trim()));

  const input = (dryRun: boolean) => ({
    csvText,
    invertSign,
    dryRun,
    accountType,
    ...(isNew ? { institutionName: institution, accountName } : { accountId }),
  });

  const previewMutation = useMutation({
    mutationFn: () => importCsvFn({ data: input(true) }),
    onSuccess: setPreview,
    onError: (e: Error) => {
      setPreview(null);
      toast.error(e.message);
    },
  });

  const importMutation = useMutation({
    mutationFn: () => importCsvFn({ data: input(false) }),
    onSuccess: (r) => {
      toast.success(
        `${r.added} imported${r.duplicates ? ` · ${r.duplicates} already there` : ""}${
          r.skipped ? ` · ${r.skipped} skipped` : ""
        }`,
      );
      queryClient.invalidateQueries();
      setOpen(false);
      setCsvText("");
      setFileName("");
      setPreview(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function onFile(file: File | undefined) {
    setPreview(null);
    if (!file) return;
    if (file.size > MAX_BYTES) {
      toast.error("File is too large. Split it into smaller date ranges.");
      return;
    }
    setFileName(file.name);
    setCsvText(await file.text());
  }

  const busy = previewMutation.isPending || importMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={variant}>
          <FileUp className="size-4" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload a bank CSV</DialogTitle>
          <DialogDescription>
            Download the transactions CSV from your bank&apos;s website and upload it here.
            Uploading the same period twice won&apos;t create duplicates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="csv-account">Account</Label>
            <select
              id="csv-account"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                setPreview(null);
              }}
            >
              {csvAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
              <option value={NEW}>New account…</option>
            </select>
          </div>

          {isNew && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="csv-bank">Bank name</Label>
                <Input
                  id="csv-bank"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="csv-name">Account name</Label>
                <Input
                  id="csv-name"
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label htmlFor="csv-type">Type</Label>
                <select
                  id="csv-type"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={accountType}
                  onChange={(e) => setAccountType(e.target.value)}
                >
                  <option value="depository">Checking / savings</option>
                  <option value="credit">Credit card</option>
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="csv-file">CSV file</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => void onFile(e.target.files?.[0])}
            />
          </div>

          <label className="flex items-start gap-3 text-sm">
            <Checkbox
              checked={invertSign}
              onCheckedChange={(v) => {
                setInvertSign(Boolean(v));
                setPreview(null);
              }}
            />
            <span>
              Purchases show as positive numbers in this file (common for credit cards). Flip the
              signs.
            </span>
          </label>

          {preview && (
            <div className="rounded-lg border border-border bg-accent p-3 text-sm">
              <p>
                <strong>{preview.added}</strong> new · <strong>{preview.duplicates}</strong> already
                imported · {preview.skipped} skipped
              </p>
              <p className="text-xs text-muted-foreground">
                {preview.date_from} to {preview.date_to} · {fileName}
              </p>
              {preview.skipped_rows.slice(0, 3).map((s) => (
                <p key={s.line} className="text-xs text-destructive">
                  Line {s.line}: {s.reason}
                </p>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button onClick={() => importMutation.mutate()} disabled={busy || preview.added === 0}>
              {importMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Import {preview.added} transactions
            </Button>
          ) : (
            <Button onClick={() => previewMutation.mutate()} disabled={busy || !ready}>
              {previewMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Preview
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
