import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listCategoriesFn } from "@/api/app";
import { isExpenseType } from "@/api/gaap";
import {
  createLedgerEntryFn,
  createLedgerFn,
  listLedgersFn,
  updateLedgerTransactionFn,
} from "@/api/ledgers";
import { listTransactionsFn } from "@/api/transactions";
import type { Transaction } from "@/api/types";
import { formatCurrency, formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/bills")({
  head: () => ({
    meta: [
      { title: "Bills — ImaxAccounting" },
      {
        name: "description",
        content:
          "Bills that came into the company: what is owed, when it is due, and what has been paid.",
      },
    ],
  }),
  component: BillsPage,
});

const PAYABLES_LEDGER = "Accounts Payable";
const today = () => new Date().toISOString().slice(0, 10);

function daysUntil(due: string | null) {
  if (!due) return null;
  return Math.round((new Date(due).getTime() - new Date(today()).getTime()) / 86400000);
}

function DueBadge({ due }: { due: string | null }) {
  const d = daysUntil(due);
  if (d === null) return <span className="text-muted-foreground">No due date</span>;
  if (d < 0)
    return (
      <Badge variant="destructive">
        {Math.abs(d)} day{Math.abs(d) === 1 ? "" : "s"} overdue
      </Badge>
    );
  if (d === 0) return <Badge>Due today</Badge>;
  if (d <= 7)
    return (
      <Badge variant="secondary">
        Due in {d} day{d === 1 ? "" : "s"}
      </Badge>
    );
  return <span className="text-muted-foreground">Due in {d} days</span>;
}

function BillsPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"open" | "paid">("open");
  const [recording, setRecording] = useState(false);

  const bills = useQuery({
    queryKey: ["bills", tab],
    queryFn: () =>
      listTransactionsFn({
        data: {
          accountingStatus: [tab === "open" ? "accounts_payable" : "paid"],
          sortBy: tab === "open" ? "due_date" : "transaction_date",
          sortDir: tab === "open" ? "asc" : "desc",
          includeHidden: true,
          pageSize: 200,
        },
      }),
  });
  const ledgers = useQuery({
    queryKey: ["ledgers-list"],
    queryFn: () => listLedgersFn({ data: undefined }),
  });
  const ledgerLabel = (id: string | null) =>
    (ledgers.data?.ledgers ?? []).find((l) => l.id === id)?.label ?? "—";

  const markPaid = useMutation({
    mutationFn: (t: Transaction) =>
      updateLedgerTransactionFn({ data: { id: t.id, accountingStatus: "paid", status: "paid" } }),
    onSuccess: () => {
      toast.success("Marked as paid.");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = bills.data?.rows ?? [];
  const totalOpen = rows.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);
  const overdue = rows.filter((t) => (daysUntil(t.due_date) ?? 1) < 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bills</h1>
          <p className="text-sm text-muted-foreground">
            {tab === "open"
              ? `${rows.length} open · ${formatCurrency(totalOpen)} owed${overdue ? ` · ${overdue} overdue` : ""}`
              : `${rows.length} paid bills`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="open">Open</TabsTrigger>
              <TabsTrigger value="paid">Paid</TabsTrigger>
            </TabsList>
          </Tabs>
          <Editable>
            <Button onClick={() => setRecording(true)}>
              <Plus className="size-4" /> Record bill
            </Button>
          </Editable>
        </div>
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Due</TableHead>
              <TableHead>Bill date</TableHead>
              <TableHead>Vendor / description</TableHead>
              <TableHead className="hidden md:table-cell">Ledger</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bills.isLoading && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!bills.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {tab === "open"
                    ? "No open bills. Use “Record bill” when an invoice comes in."
                    : "No paid bills yet."}
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">
                  <DueBadge due={t.due_date} />
                  {t.due_date && (
                    <div className="text-xs text-muted-foreground">{formatDate(t.due_date)}</div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(t.transaction_date)}
                </TableCell>
                <TableCell className="font-medium">
                  {t.merchant_name ?? t.description ?? "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {t.ledger_id ? (
                    <Link
                      to="/ledgers/$ledgerId"
                      params={{ ledgerId: t.ledger_id }}
                      className="underline-offset-2 hover:underline"
                    >
                      {ledgerLabel(t.ledger_id)}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {t.categories?.name ?? "Uncategorized"}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatCurrency(Math.abs(Number(t.amount)), t.currency ?? "USD")}
                </TableCell>
                <TableCell className="text-right">
                  {tab === "open" && (
                    <Editable>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={markPaid.isPending}
                        onClick={() => markPaid.mutate(t)}
                      >
                        Mark paid
                      </Button>
                    </Editable>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <RecordBillDialog open={recording} onOpenChange={setRecording} />
    </div>
  );
}

function RecordBillDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const ledgers = useQuery({
    queryKey: ["ledgers-list"],
    queryFn: () => listLedgersFn({ data: undefined }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategoriesFn({ data: undefined }),
  });
  // Bills live on a liability ledger (what the company owes). Offer those; create "Accounts Payable" when there is none.
  const payableLedgers = (ledgers.data?.ledgers ?? []).filter(
    (l) => l.account_class === "current_liability",
  );
  const expenseCategories = (categories.data?.categories ?? []).filter((c) =>
    isExpenseType(c.type),
  );

  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today());
  const [dueDate, setDueDate] = useState("");
  const [ledgerId, setLedgerId] = useState("auto");
  const [categoryId, setCategoryId] = useState("none");

  const reset = () => {
    setVendor("");
    setAmount("");
    setDate(today());
    setDueDate("");
    setLedgerId("auto");
    setCategoryId("none");
  };

  const record = useMutation({
    mutationFn: async () => {
      let target = ledgerId === "auto" ? payableLedgers[0]?.id : ledgerId;
      if (!target) {
        const created = await createLedgerFn({
          data: { label: PAYABLES_LEDGER, accountClass: "current_liability" },
        });
        target = created.id;
      }
      const category = expenseCategories.find((c) => c.id === categoryId);
      await createLedgerEntryFn({
        data: {
          ledgerId: target,
          date,
          dueDate: dueDate || null,
          description: vendor.trim(),
          amount: Number(amount),
          type: category?.type ?? "operating_expense",
          status: "posted",
          accountingStatus: "accounts_payable",
          categoryId: category?.id ?? null,
        },
      });
    },
    onSuccess: () => {
      toast.success("Bill recorded.");
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["ledgers-list"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = vendor.trim().length > 0 && Number(amount) > 0 && Boolean(date);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record a bill</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Vendor / what it is for</Label>
            <Input
              value={vendor}
              placeholder="Acme Supplies – March invoice"
              onChange={(e) => setVendor(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Uncategorized</SelectItem>
                  {expenseCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bill date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Due date</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Payables ledger</Label>
            <Select value={ledgerId} onValueChange={setLedgerId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">
                  {payableLedgers[0]
                    ? `${payableLedgers[0].label} (default)`
                    : `Create “${PAYABLES_LEDGER}”`}
                </SelectItem>
                {payableLedgers.slice(1).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={!valid || record.isPending} onClick={() => record.mutate()}>
            Record bill
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
