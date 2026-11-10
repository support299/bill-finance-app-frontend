import { Vendor1099Panel } from "@/components/vendor-1099-panel";
import { accountingStatusesForType, GAAP_TYPES, GAAP_TYPE_LABELS, rowGaapType } from "@/api/gaap";
import { CategoryCombobox } from "@/components/category-combobox";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCategoriesFn, deleteRuleFn } from "@/api/app";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_CLASS_LABELS,
  ACCOUNTING_STATUS_LABELS,
  createLedgerEntryFn,
  deleteLedgerEntryFn,
  getLedgerFn,
  updateLedgerEntryFn,
  updateLedgerFn,
  updateLedgerTransactionFn,
} from "@/api/ledgers";
import type { AccountClass, AccountingStatus } from "@/api/ledgers";
import type { Transaction } from "@/api/types";
import { createRuleFn } from "@/api/transactions";
import { LedgerTags } from "@/components/ledger-tags";

export const Route = createFileRoute("/_authenticated/ledgers/$ledgerId")({
  head: () => ({
    meta: [
      { title: "Ledger account — ImaxAccounting" },
      {
        name: "description",
        content: "Ledger account details, recorded entries and every linked bank transaction.",
      },
      { property: "og:title", content: "Ledger account — ImaxAccounting" },
      {
        property: "og:description",
        content: "Contact details, manual entries and transaction history for a ledger account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgerDetailPage,
});

const STATUSES = ["pending", "posted", "paid", "void"] as const;
const TYPES = GAAP_TYPES;

function accountingStatusOptions(accountClass: string) {
  if (accountClass === "current_asset") return ["accounts_receivable", "received"] as const;
  if (accountClass === "current_liability") return ["accounts_payable", "paid"] as const;
  return [] as const;
}

function txType(t: Transaction): (typeof TYPES)[number] {
  return rowGaapType(t);
}

/** Changing the type keeps the accounting status aligned (receivable/received vs payable/paid). */
function withType<T extends { type: string; accountingStatus: string; dueDate?: string }>(
  e: T,
  type: (typeof TYPES)[number],
): T {
  const allowed = accountingStatusesForType(type) as string[];
  let status = e.accountingStatus;
  if (status && !allowed.includes(status)) {
    const map: Record<string, string> = {
      accounts_receivable: "accounts_payable",
      accounts_payable: "accounts_receivable",
      received: "paid",
      paid: "received",
    };
    status = allowed.includes(map[status] ?? "") ? (map[status] ?? "") : "";
  }
  // No status yet: default to open (A/R or A/P) when a due date exists, otherwise settled (Received/Paid).
  if (!status && allowed.length) {
    status = (e.dueDate ? allowed[0] : allowed[1]) ?? "";
  }
  if (!allowed.length) status = "";
  return { ...e, type, accountingStatus: status } as T;
}

const emptyEntry = {
  id: "",
  date: new Date().toISOString().slice(0, 10),
  dueDate: "",
  description: "",
  amount: "",
  type: "operating_expense" as (typeof TYPES)[number],
  status: "posted" as (typeof STATUSES)[number],
  accountingStatus: "" as AccountingStatus | "",
  categoryId: "none",
  manual: true,
};

function LedgerDetailPage() {
  const { ledgerId } = Route.useParams();
  const queryClient = useQueryClient();
  const get = getLedgerFn;
  const update = updateLedgerFn;
  const cats = listCategoriesFn;
  const createEntry = createLedgerEntryFn;
  const updateEntry = updateLedgerEntryFn;
  const deleteEntry = deleteLedgerEntryFn;
  const updateTx = updateLedgerTransactionFn;
  const createRule = createRuleFn;
  const deleteRule = deleteRuleFn;

  const detail = useQuery({
    queryKey: ["ledger", ledgerId],
    queryFn: () => get({ data: { id: ledgerId } }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => cats({ data: undefined }),
  });
  const categoryList = categories.data?.categories ?? [];

  const [form, setForm] = useState({
    label: "",
    accountClass: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });
  useEffect(() => {
    const l = detail.data?.ledger;
    if (l) {
      setForm({
        label: l.label ?? "",
        accountClass: l.account_class ?? "",
        contactName: l.contact_name ?? "",
        contactEmail: l.contact_email ?? "",
        contactPhone: l.contact_phone ?? "",
      });
    }
  }, [detail.data]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ledger", ledgerId] });
    queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    queryClient.invalidateQueries({ queryKey: ["ledger-summaries"] });
    queryClient.invalidateQueries({ queryKey: ["accounting"] });
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      update({ data: { id: ledgerId, ...form, accountClass: form.accountClass as AccountClass } }),
    onSuccess: () => {
      toast.success("Ledger account saved");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------------- entry dialog ---------------- */
  const [entryOpen, setEntryOpen] = useState(false);
  const [entry, setEntry] = useState(emptyEntry);

  const openNewEntry = () => {
    setEntry(emptyEntry);
    setEntryOpen(true);
  };
  const openEditEntry = (t: Transaction) => {
    setEntry({
      id: t.id,
      date: (t.transaction_date ?? "").slice(0, 10),
      dueDate: (t.due_date ?? "") as string,
      description: t.merchant_name ?? t.description ?? "",
      amount: String(txType(t) === "equity" ? Number(t.amount) : Math.abs(Number(t.amount))),
      type: txType(t),
      status: (t.status ?? (t.pending ? "pending" : "posted")) as (typeof STATUSES)[number],
      accountingStatus: (t.accounting_status ?? "") as AccountingStatus | "",
      categoryId: t.user_category_id ?? "none",
      manual: t.source === "manual",
    });
    setEntryOpen(true);
  };

  const currentIsManual = entry.manual;

  const entryMutation = useMutation({
    mutationFn: () => {
      const payload = {
        ledgerId,
        date: entry.date,
        dueDate: entry.dueDate || null,
        description: entry.description,
        amount: Number(entry.amount || 0),
        type: entry.type,
        status: entry.status,
        accountingStatus: entry.accountingStatus || null,
        categoryId: entry.categoryId === "none" ? null : entry.categoryId,
      };
      if (!entry.id) return createEntry({ data: payload });
      if (currentIsManual) return updateEntry({ data: { id: entry.id, ...payload } });
      return updateTx({
        data: {
          id: entry.id,
          status: entry.status,
          type: entry.type,
          categoryId: entry.categoryId === "none" ? null : entry.categoryId,
          dueDate: entry.dueDate || null,
          accountingStatus: entry.accountingStatus || null,
        },
      });
    },
    onSuccess: () => {
      toast.success(entry.id ? "Transaction updated" : "Transaction recorded");
      setEntryOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteEntryMutation = useMutation({
    mutationFn: (id: string) => deleteEntry({ data: { id } }),
    onSuccess: () => {
      toast.success("Transaction deleted");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ---------------- rules ---------------- */
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "starts_with" | "exact" | "regex">(
    "contains",
  );
  const [ruleCategory, setRuleCategory] = useState("none");

  const ruleMutation = useMutation({
    mutationFn: () =>
      createRule({
        data: {
          keyword,
          matchType,
          categoryId: ruleCategory === "none" ? null : ruleCategory,
          ledgerId,
          applyToExisting: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Rule created · filed ${r.applied} existing transactions here`);
      setKeyword("");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => deleteRule({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule deleted");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const accountClass = form.accountClass;
  const entryStatuses = accountingStatusesForType(entry.type);
  const transactions = detail.data?.transactions ?? [];
  const rules = detail.data?.rules ?? [];

  return (
    <div className="space-y-6">
      <Link
        to="/ledgers"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All ledgers
      </Link>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{detail.data?.ledger?.label ?? "Ledger account"}</h1>
          <p className="text-sm text-muted-foreground">
            Account details, recorded entries and every transaction filed against this ledger.
          </p>
        </div>
        <Editable>
          <Button onClick={openNewEntry}>
            <Plus className="size-4" /> Record transaction
          </Button>
        </Editable>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface space-y-4 p-5">
          <h2 className="text-sm font-semibold">Account details</h2>
          <div>
            <label className="text-xs text-muted-foreground">Label *</label>
            <Input
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Account class *</label>
            <Select
              value={form.accountClass}
              onValueChange={(v) => setForm({ ...form, accountClass: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_CLASSES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ACCOUNT_CLASS_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Contact name</label>
            <Input
              value={form.contactName}
              onChange={(e) => setForm({ ...form, contactName: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              value={form.contactEmail}
              onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Phone</label>
            <Input
              value={form.contactPhone}
              onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
            />
          </div>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!form.label.trim() || !form.accountClass || saveMutation.isPending}
          >
            Save changes
          </Button>
          <LedgerTags ledgerId={ledgerId} tags={detail.data?.tags ?? []} />
        </div>

        <div className="surface space-y-4 p-5">
          <div>
            <h2 className="text-sm font-semibold">Rules for this ledger</h2>
            <p className="text-xs text-muted-foreground">
              Transactions matching the keyword are filed here automatically, now and on future
              syncs.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Keyword</label>
              <Input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="e.g. Acme"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Match</label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as typeof matchType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contains">Contains</SelectItem>
                  <SelectItem value="starts_with">Starts with</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                  <SelectItem value="regex">Regex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Category (optional)</label>
              <Select value={ruleCategory} onValueChange={setRuleCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No category</SelectItem>
                  {categoryList.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={() => ruleMutation.mutate()}
            disabled={keyword.trim().length < 2 || ruleMutation.isPending}
          >
            <Plus className="size-4" /> Create rule
          </Button>

          <div className="space-y-2">
            {rules.length === 0 && (
              <p className="text-xs text-muted-foreground">No rules yet for this ledger.</p>
            )}
            {rules.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{r.keyword}</span>{" "}
                  <span className="text-muted-foreground">· {r.match_type.replace("_", " ")}</span>
                  {r.categories?.name && (
                    <span className="text-muted-foreground"> → {r.categories.name}</span>
                  )}
                </span>
                <Editable>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteRuleMutation.mutate(r.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Editable>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Vendor1099Panel ledgerId={ledgerId} />

      <div className="surface overflow-x-auto">
        <h2 className="p-5 pb-0 text-sm font-semibold">
          Transactions ({detail.data?.transactionCount ?? 0})
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Accounting status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  No transactions yet. Record one above, or add a rule so bank transactions are
                  filed here automatically.
                </TableCell>
              </TableRow>
            )}
            {transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(t.transaction_date)}
                </TableCell>
                <TableCell className="max-w-72 truncate">
                  {t.merchant_name ?? t.description}
                </TableCell>
                <TableCell>{t.categories?.name ?? "Uncategorized"}</TableCell>
                <TableCell>{GAAP_TYPE_LABELS[txType(t)]}</TableCell>
                <TableCell>
                  <Badge
                    variant={(t.status ?? "posted") === "posted" ? "secondary" : "outline"}
                    className="capitalize"
                  >
                    {t.status ?? (t.pending ? "pending" : "posted")}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t.accounting_status
                    ? ACCOUNTING_STATUS_LABELS[
                        t.accounting_status as keyof typeof ACCOUNTING_STATUS_LABELS
                      ]
                    : "Not classified"}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {t.source ?? "plaid"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatCurrency(Number(t.amount))}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right">
                  <Editable>
                    <Button variant="ghost" size="icon" onClick={() => openEditEntry(t)}>
                      <Pencil className="size-4" />
                    </Button>
                    {t.source === "manual" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteEntryMutation.mutate(t.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </Editable>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={entryOpen} onOpenChange={setEntryOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{entry.id ? "Edit transaction" : "Record transaction"}</DialogTitle>
            <DialogDescription>
              {entry.id && !currentIsManual
                ? "This came from your bank, so only category, type, status and due date can be changed."
                : "Date, description and amount are required."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-muted-foreground">Date *</label>
              <Input
                type="date"
                value={entry.date}
                disabled={Boolean(entry.id) && !currentIsManual}
                onChange={(e) => setEntry({ ...entry, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Due date</label>
              <Input
                type="date"
                value={entry.dueDate}
                onChange={(e) => setEntry({ ...entry, dueDate: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-muted-foreground">Description *</label>
              <Input
                value={entry.description}
                disabled={Boolean(entry.id) && !currentIsManual}
                onChange={(e) => setEntry({ ...entry, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Amount *</label>
              <Input
                type="number"
                step="0.01"
                value={entry.amount}
                disabled={Boolean(entry.id) && !currentIsManual}
                onChange={(e) => setEntry({ ...entry, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Type</label>
              <Select
                value={entry.type}
                onValueChange={(v) => setEntry(withType(entry, v as (typeof TYPES)[number]))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => (
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
                categories={categoryList}
                value={entry.categoryId}
                preferType={entry.type}
                onChange={(id, cat) =>
                  setEntry(
                    cat
                      ? { ...withType(entry, cat.type), categoryId: id }
                      : { ...entry, categoryId: id },
                  )
                }
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Status</label>
              <Select
                value={entry.status}
                onValueChange={(v) =>
                  setEntry({ ...entry, status: v as (typeof STATUSES)[number] })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s} className="capitalize">
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Accounting status</label>
              {entryStatuses.length > 0 ? (
                <Select
                  value={entry.accountingStatus}
                  onValueChange={(v) =>
                    setEntry({ ...entry, accountingStatus: v as AccountingStatus })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select accounting status" />
                  </SelectTrigger>
                  <SelectContent>
                    {entryStatuses.map((s) => (
                      <SelectItem key={s} value={s}>
                        {ACCOUNTING_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={`Not applicable for ${GAAP_TYPE_LABELS[entry.type]}`} disabled />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => entryMutation.mutate()}
              disabled={
                entryMutation.isPending ||
                (currentIsManual && (!entry.description.trim() || !entry.date || !entry.amount))
              }
            >
              {entry.id ? "Save changes" : "Record transaction"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
