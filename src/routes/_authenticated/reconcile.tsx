import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileText, Lock, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  clearTransactionsFn,
  deleteReconciliationFn,
  finishReconciliationFn,
  getReconciliationFn,
  listReconciliationsFn,
  reopenReconciliationFn,
  startReconciliationFn,
  unreconciledFn,
  updateReconciliationFn,
  type ReconciliationDetail,
  type ReconciliationSummary,
} from "@/api/reconciliation";
import { getProfileFn } from "@/api/app";
import { getAccountsFn } from "@/api/plaid";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadReconciliationPdf, isCardAccount } from "@/lib/reconciliation-pdf";

export const Route = createFileRoute("/_authenticated/reconcile")({
  validateSearch: (raw: Record<string, unknown>): { id?: string } =>
    typeof raw["id"] === "string" ? { id: raw["id"] } : {},
  head: () => ({
    meta: [
      { title: "Reconcile — iMax Profit Tracker" },
      {
        name: "description",
        content: "Check your books against a bank or credit-card statement.",
      },
    ],
  }),
  component: ReconcilePage,
});

const money = (v: string | number) => formatCurrency(Number(v));
const acctLabel = (r: Pick<ReconciliationSummary, "account_name" | "mask">) =>
  `${r.account_name ?? "Account"}${r.mask ? ` ••${r.mask}` : ""}`;

function ReconcilePage() {
  const { id } = Route.useSearch();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reconcile</h1>
        <p className="text-sm text-muted-foreground">
          Match your transactions to a bank or credit-card statement until the difference is zero.
        </p>
      </div>
      {id ? <Workspace id={id} /> : <Start />}
    </div>
  );
}

// ------------------------------------------------------------------ start + history
function Start() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ["bank-accounts"], queryFn: () => getAccountsFn({}) });
  const history = useQuery({
    queryKey: ["reconciliations"],
    queryFn: () => listReconciliationsFn({}),
  });
  const [accountId, setAccountId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [ending, setEnding] = useState("");
  const [beginning, setBeginning] = useState("0");

  const recs = history.data?.reconciliations ?? [];
  const list = accounts.data?.accounts ?? [];
  const selected = list.find((a) => a.id === accountId);
  const open = recs.find((r) => r.bank_account_id === accountId && r.status === "in_progress");
  const hasCompleted = recs.some(
    (r) => r.bank_account_id === accountId && r.status === "completed",
  );
  const card = isCardAccount(selected?.account_type ?? null);

  const start = useMutation({
    mutationFn: () =>
      startReconciliationFn({
        data: {
          accountId,
          statementDate: date,
          endingBalance: Number(ending),
          ...(hasCompleted ? {} : { beginningBalance: Number(beginning || 0) }),
        },
      }),
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      navigate({ to: "/reconcile", search: { id: d.reconciliation.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="surface space-y-4 p-5">
        <h2 className="text-sm font-semibold">Start a reconciliation</h2>
        {list.length === 0 && !accounts.isLoading && (
          <p className="text-sm text-muted-foreground">
            Connect a bank account first (Bank Accounts page).
          </p>
        )}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label>Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a bank or credit card" />
              </SelectTrigger>
              <SelectContent>
                {list.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.account_name ?? "Account"}
                    {a.mask ? ` ••${a.mask}` : ""} · {a.account_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Statement date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{card ? "Statement ending balance (owed)" : "Statement ending balance"}</Label>
            <Input
              type="number"
              step="0.01"
              value={ending}
              onChange={(e) => setEnding(e.target.value)}
            />
          </div>
          {accountId && !hasCompleted && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>
                {card ? "Balance owed at the start" : "Beginning balance"} (first reconciliation)
              </Label>
              <Input
                type="number"
                step="0.01"
                value={beginning}
                onChange={(e) => setBeginning(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The previous statement&apos;s ending balance. Later reconciliations continue from
                the last verified balance automatically.
              </p>
            </div>
          )}
        </div>
        {open ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>A reconciliation is already in progress for this account.</span>
            <Button asChild size="sm">
              <Link to="/reconcile" search={{ id: open.id }}>
                Resume it
              </Link>
            </Button>
          </div>
        ) : (
          <Editable>
            <Button
              disabled={!accountId || ending === "" || start.isPending}
              onClick={() => start.mutate()}
            >
              Start reconciling
            </Button>
          </Editable>
        )}
      </div>

      {accountId && <Unreconciled accountId={accountId} />}

      <div className="surface overflow-x-auto p-5">
        <h2 className="mb-3 text-sm font-semibold">History</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Statement date</TableHead>
              <TableHead className="text-right">Ending balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Nothing reconciled yet.
                </TableCell>
              </TableRow>
            )}
            {recs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{acctLabel(r)}</TableCell>
                <TableCell>{formatDate(r.statement_date)}</TableCell>
                <TableCell className="text-right tabular-nums">{money(r.ending_balance)}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "completed" ? "default" : "outline"}>
                    {r.status === "completed" ? "Reconciled" : "In progress"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/reconcile" search={{ id: r.id }}>
                      {r.status === "completed" ? "View" : "Resume"}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ unreconciled items
/** Everything on the account that no completed reconciliation has verified yet. */
function Unreconciled({ accountId }: { accountId: string }) {
  const query = useQuery({
    queryKey: ["unreconciled", accountId],
    queryFn: () => unreconciledFn({ data: { accountId } }),
  });
  const d = query.data;
  return (
    <div className="surface overflow-x-auto p-5">
      <h2 className="text-sm font-semibold">Unreconciled transactions</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {d?.reconciled_through
          ? `Reconciled through ${formatDate(d.reconciled_through)}. `
          : "This account has not been reconciled yet. "}
        {d ? `${d.count} transaction${d.count === 1 ? "" : "s"} still to verify` : ""}
        {d && d.count > 0 ? ` · net effect on the statement balance ${money(d.net)}` : ""}
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {query.isLoading && (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                Loading…
              </TableCell>
            </TableRow>
          )}
          {d && d.count === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                Everything on this account is reconciled.
              </TableCell>
            </TableRow>
          )}
          {(d?.transactions ?? []).map((t) => (
            <TableRow key={t.id}>
              <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
              <TableCell className="max-w-72 truncate">{t.description}</TableCell>
              <TableCell className="text-right tabular-nums">{money(t.amount)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {t.in_progress ? "Ticked, reconciliation in progress" : "Not yet ticked"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ------------------------------------------------------------------ one reconciliation
function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function Workspace({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["reconciliation", id],
    queryFn: () => getReconciliationFn({ data: { id } }),
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn({ data: undefined }),
  });
  const businessName = profile.data?.profile?.business_name ?? "";
  const [endingEdit, setEndingEdit] = useState("");
  const [dateEdit, setDateEdit] = useState("");
  const d = query.data;
  const r = d?.reconciliation;
  useEffect(() => {
    if (r) {
      setEndingEdit(String(Number(r.ending_balance)));
      setDateEdit(r.statement_date);
    }
  }, [r?.ending_balance, r?.statement_date]); // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (next: ReconciliationDetail) => {
    queryClient.setQueryData(["reconciliation", id], next);
    queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
  };
  const fail = (e: Error) => toast.error(e.message);

  const clear = useMutation({
    mutationFn: (v: { ids: string[]; cleared: boolean }) =>
      clearTransactionsFn({ data: { id, ...v } }),
    onSuccess: apply,
    onError: fail,
  });
  const update = useMutation({
    mutationFn: () =>
      updateReconciliationFn({
        data: { id, statementDate: dateEdit, endingBalance: Number(endingEdit) },
      }),
    onSuccess: (n) => {
      apply(n);
      toast.success("Statement details updated.");
    },
    onError: fail,
  });
  const finish = useMutation({
    mutationFn: () => finishReconciliationFn({ data: { id } }),
    onSuccess: (n) => {
      apply(n);
      toast.success("Reconciled. These transactions are now locked.");
    },
    onError: fail,
  });
  const reopen = useMutation({
    mutationFn: () => reopenReconciliationFn({ data: { id } }),
    onSuccess: apply,
    onError: fail,
  });
  const remove = useMutation({
    mutationFn: () => deleteReconciliationFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reconciliations"] });
      navigate({ to: "/reconcile", search: {} });
    },
    onError: fail,
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!d || !r) return <p className="text-sm text-muted-foreground">Reconciliation not found.</p>;

  const card = isCardAccount(r.account_type);
  const done = r.status === "completed";
  const rows = d.transactions;
  const allCleared = rows.length > 0 && rows.every((t) => t.cleared);
  const dirty = dateEdit !== r.statement_date || Number(endingEdit) !== Number(r.ending_balance);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/reconcile" search={{}}>
              ← All reconciliations
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">
            {acctLabel(r)} · {formatDate(r.statement_date)}
          </h2>
          <Badge variant={done ? "default" : "outline"}>
            {done ? "Reconciled" : "In progress"}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadReconciliationPdf(d, businessName)}
          >
            <FileText className="size-4" /> Download PDF report
          </Button>
          <Editable>
            {done ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => reopen.mutate()}
                disabled={reopen.isPending}
              >
                <Undo2 className="size-4" /> Reopen
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() =>
                    window.confirm(
                      "Delete this reconciliation? Ticked transactions are released.",
                    ) && remove.mutate()
                  }
                >
                  Delete
                </Button>
                <Button
                  size="sm"
                  disabled={!r.balanced || finish.isPending}
                  onClick={() => finish.mutate()}
                >
                  <CheckCircle2 className="size-4" /> Finish reconciliation
                </Button>
              </>
            )}
          </Editable>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat
          label={card ? "Beginning balance owed" : "Beginning balance"}
          value={money(r.beginning_balance)}
        />
        <Stat
          label={card ? "Charges (cleared)" : "Deposits & credits (cleared)"}
          value={`+${money(r.additions)}`}
        />
        <Stat
          label={card ? "Payments & credits (cleared)" : "Payments & debits (cleared)"}
          value={`-${money(r.subtractions)}`}
        />
        <Stat label="Cleared balance" value={money(r.cleared_balance)} />
        <Stat label="Statement ending balance" value={money(r.ending_balance)} />
        <Stat label="Difference" value={money(r.difference)} tone={r.balanced ? "good" : "bad"} />
      </div>

      {!done && (
        <div className="surface flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label>Statement date</Label>
            <Input type="date" value={dateEdit} onChange={(e) => setDateEdit(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Statement ending balance</Label>
            <Input
              type="number"
              step="0.01"
              value={endingEdit}
              onChange={(e) => setEndingEdit(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            disabled={!dirty || update.isPending}
            onClick={() => update.mutate()}
          >
            Update
          </Button>
          <p className="text-xs text-muted-foreground">
            Tick every transaction that appears on your statement. When the difference is $0.00 you
            can finish.
          </p>
        </div>
      )}
      {done && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Lock className="size-4" /> These transactions are locked: they can&apos;t be hidden,
          voided or deleted, and bank syncs won&apos;t change them. Reopen to make changes.
        </p>
      )}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                {!done && (
                  <Checkbox
                    checked={allCleared}
                    onCheckedChange={(v) =>
                      clear.mutate({ ids: rows.map((t) => t.id), cleared: Boolean(v) })
                    }
                  />
                )}
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  No transactions on this account up to the statement date.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id} className={t.cleared ? "bg-accent/50" : ""}>
                <TableCell>
                  {!done && (
                    <Checkbox
                      checked={t.cleared}
                      onCheckedChange={(v) => clear.mutate({ ids: [t.id], cleared: Boolean(v) })}
                    />
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell>{t.description}</TableCell>
                <TableCell className="text-right tabular-nums">{money(t.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
