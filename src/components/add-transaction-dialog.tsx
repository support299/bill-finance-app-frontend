import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { listCategoriesFn } from "@/api/app";
import { accountingStatusesForType, GAAP_TYPES, GAAP_TYPE_LABELS, type GaapType } from "@/api/gaap";
import { ACCOUNTING_STATUS_LABELS, createLedgerEntryFn, listLedgersFn } from "@/api/ledgers";
import type { AccountingStatus } from "@/api/ledgers";
import { uploadAttachmentFn } from "@/api/transactions";
import { CategoryCombobox } from "@/components/category-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  date: today(),
  dueDate: "",
  description: "",
  amount: "",
  type: "operating_expense" as GaapType,
  categoryId: "none",
  ledgerId: "none",
  accountingStatus: "" as AccountingStatus | "",
});

/** Records a manual transaction (cash purchase, check, owner payment…), optionally with its receipt. */
export function AddTransactionDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(blank);
  const file = useRef<HTMLInputElement>(null);
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategoriesFn({ data: undefined }),
    enabled: open,
  });
  const ledgers = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => listLedgersFn({ data: undefined }),
    enabled: open,
  });
  const statuses = accountingStatusesForType(form.type);

  const create = useMutation({
    mutationFn: async () => {
      const created = await createLedgerEntryFn({
        data: {
          ledgerId: form.ledgerId === "none" ? null : form.ledgerId,
          date: form.date,
          dueDate: form.dueDate || null,
          description: form.description,
          amount: Number(form.amount),
          type: form.type,
          categoryId: form.categoryId === "none" ? null : form.categoryId,
          accountingStatus: form.accountingStatus || null,
        },
      });
      const attach = file.current?.files?.[0];
      if (attach) {
        try {
          await uploadAttachmentFn({ data: { transactionId: created.id, file: attach } });
        } catch (e) {
          toast.error(`Transaction saved, but the file was not attached: ${(e as Error).message}`);
        }
      }
      return created;
    },
    onSuccess: () => {
      toast.success("Transaction recorded");
      setForm(blank());
      if (file.current) file.current.value = "";
      onOpenChange(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = form.description.trim() && Number(form.amount) !== 0 && form.date;
  const set = (patch: Partial<ReturnType<typeof blank>>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>
            Enter the amount as a positive number — expenses are recorded as money out
            automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">Date *</label>
            <Input type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Amount *</label>
            <Input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => set({ amount: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Payee / description *</label>
            <Input
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Type</label>
            <Select
              value={form.type}
              onValueChange={(v) => set({ type: v as GaapType, accountingStatus: "" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAAP_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {GAAP_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Category</label>
            <CategoryCombobox
              categories={categories.data?.categories ?? []}
              value={form.categoryId}
              preferType={form.type}
              onChange={(id, cat) =>
                set(
                  cat
                    ? { categoryId: id, type: cat.type, accountingStatus: "" }
                    : { categoryId: id },
                )
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ledger account (optional)</label>
            <Select value={form.ledgerId} onValueChange={(v) => set({ ledgerId: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {(ledgers.data?.ledgers ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Due date</label>
            <Input
              type="date"
              value={form.dueDate}
              onChange={(e) => set({ dueDate: e.target.value })}
            />
          </div>
          {statuses.length > 0 && (
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Accounting status</label>
              <Select
                value={form.accountingStatus || "none"}
                onValueChange={(v) =>
                  set({ accountingStatus: v === "none" ? "" : (v as AccountingStatus) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not set</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>
                      {ACCOUNTING_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="text-xs text-muted-foreground">Receipt or invoice (optional)</label>
            <Input
              ref={file}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.heic,.csv,.xlsx,.xls,.doc,.docx,.txt"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} disabled={!valid || create.isPending}>
            {create.isPending ? "Saving…" : "Save transaction"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
