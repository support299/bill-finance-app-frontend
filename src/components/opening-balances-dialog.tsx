import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getOpeningBalancesFn, setOpeningBalanceFn, type OpeningBalance } from "@/api/accounting";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Editable } from "@/components/editable";
import { Input } from "@/components/ui/input";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * What each bank account held before its first transaction in the app. These amounts add up to "Opening balance equity".
 * The app works each one out from the bank's balance; a person who can edit may type in their own, which is then kept.
 */
export function OpeningBalancesDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const balances = useQuery({
    queryKey: ["opening-balances"],
    queryFn: () => getOpeningBalancesFn(),
    enabled: open,
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const save = useMutation({
    mutationFn: (d: { plaidAccountId: string; amount?: string; date?: string; reset?: boolean }) =>
      setOpeningBalanceFn({ data: d }),
    onSuccess: (_r, d) => {
      toast.success(
        d.reset ? "Opening balance worked out from the bank again" : "Opening balance saved",
      );
      setEditing(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = balances.data?.accounts ?? [];

  function startEdit(r: OpeningBalance) {
    setEditing(r.plaid_account_id);
    setAmount(Number(r.current ?? r.opening ?? 0).toFixed(2));
    setDate(r.current_date ?? r.date);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Opening balances</DialogTitle>
          <DialogDescription>
            What each account held before its first transaction in the app. For a card or loan it is
            the amount owed. No transactions sit behind these amounts.
          </DialogDescription>
        </DialogHeader>
        {balances.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!balances.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No bank accounts yet.</p>
        )}
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.plaid_account_id} className="space-y-2 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-medium">{r.account}</span>{" "}
                  {r.manual && <Badge variant="secondary">Entered by hand</Badge>}
                  <p className="text-xs text-muted-foreground">
                    {r.current === null
                      ? "No opening balance recorded."
                      : `Dated ${formatDate(r.current_date ?? r.date)}.`}{" "}
                    {r.bank_balance !== undefined &&
                      `Bank balance now ${formatCurrency(Number(r.bank_balance))}, transactions add up to ${formatCurrency(Number(r.from_transactions))}.`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(Number(r.current ?? 0))}
                  </span>
                  <Editable>
                    {editing !== r.plaid_account_id && (
                      <Button size="sm" variant="outline" onClick={() => startEdit(r)}>
                        Change
                      </Button>
                    )}
                  </Editable>
                </div>
              </div>
              {editing === r.plaid_account_id && (
                <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-accent/40 p-3">
                  <label className="space-y-1 text-xs font-medium">
                    Opening balance
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 w-40"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 text-xs font-medium">
                    As of
                    <Input
                      type="date"
                      className="h-8 w-40"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <Button
                    size="sm"
                    disabled={
                      save.isPending || amount.trim() === "" || Number.isNaN(Number(amount))
                    }
                    onClick={() =>
                      save.mutate({
                        plaidAccountId: r.plaid_account_id,
                        amount: Number(amount).toFixed(2),
                        ...(date ? { date } : {}),
                      })
                    }
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                    Cancel
                  </Button>
                  {r.manual && r.opening !== undefined && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={save.isPending}
                      onClick={() =>
                        save.mutate({ plaidAccountId: r.plaid_account_id, reset: true })
                      }
                    >
                      Use the bank's figure ({formatCurrency(Number(r.opening))})
                    </Button>
                  )}
                  <p className="w-full text-xs text-muted-foreground">
                    After you save, the app keeps your amount and stops recalculating it. The
                    account's balance in the books may then differ from the bank's balance.
                  </p>
                </div>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
