import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Landmark, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConnectBankButton } from "@/components/connect-bank-button";
import { CsvImportDialog } from "@/components/csv-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, relativeTime } from "@/lib/format";
import {
  getAccountsFn,
  refreshTransactionsFn,
  removeItemFn,
  syncTransactionsFn,
} from "@/api/plaid";
import type { PlaidItem } from "@/api/types";
import { listTransactionsFn } from "@/api/transactions";

export const Route = createFileRoute("/_authenticated/accounts")({
  head: () => ({
    meta: [
      { title: "Bank Accounts — ImaxAccounting" },
      {
        name: "description",
        content: "Manage connected institutions, balances, sync status and reconnections.",
      },
      { property: "og:title", content: "Bank Accounts — ImaxAccounting" },
      {
        property: "og:description",
        content: "All your connected banks and account balances in one place.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountsPage,
});

function AccountsPage() {
  const queryClient = useQueryClient();
  const getAccounts = getAccountsFn;
  const sync = syncTransactionsFn;
  const refresh = refreshTransactionsFn;
  const remove = removeItemFn;

  const [disconnecting, setDisconnecting] = useState<PlaidItem | null>(null);
  const [deleteData, setDeleteData] = useState(false);

  const query = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => getAccounts({ data: undefined }),
  });

  const syncMutation = useMutation({
    mutationFn: (itemId: string) => sync({ data: { itemId } }),
    onSuccess: (r) => {
      toast.success(
        r.synced
          ? `Synced · ${r.added} added, ${r.modified} updated`
          : "Recently synced — try again shortly.",
      );
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refreshMutation = useMutation({
    mutationFn: (itemId: string) => refresh({ data: { itemId } }),
    onSuccess: () => {
      toast.success("Refresh requested — new transactions will appear shortly.");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: () => {
      if (!disconnecting) throw new Error("No connection selected.");
      return remove({ data: { itemId: disconnecting.id, deleteData } });
    },
    onSuccess: () => {
      toast.success("Bank disconnected.");
      setDisconnecting(null);
      setDeleteData(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Imported transactions whose bank connection was removed without deleting the data.
  const leftovers = useQuery({
    queryKey: ["transactions", "unlinked-count"],
    queryFn: () => listTransactionsFn({ data: { unlinked: true, pageSize: 1 } }),
  });
  const leftoverCount = leftovers.data?.total ?? 0;

  const items = query.data?.items ?? [];
  const accounts = query.data?.accounts ?? [];
  const csvItemIds = new Set(items.filter((i) => i.connection_status === "csv").map((i) => i.id));
  const csvAccounts = accounts.filter((a) => csvItemIds.has(a.plaid_item_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-sm text-muted-foreground">
            Connected institutions, balances and sync health.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CsvImportDialog key={csvAccounts.map((a) => a.id).join()} csvAccounts={csvAccounts} />
          <ConnectBankButton />
        </div>
      </div>

      {leftoverCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-accent px-4 py-3 text-sm">
          <span>
            <strong>{leftoverCount}</strong> imported transactions belong to a bank that is no
            longer connected.
          </span>
          <Button asChild size="sm">
            <Link to="/transactions" search={{ unlinked: true, label: "Disconnected banks" }}>
              Review &amp; delete
            </Link>
          </Button>
        </div>
      )}

      {items.length === 0 && !query.isLoading && (
        <div className="surface p-10 text-center">
          <Landmark className="mx-auto size-8 text-primary" />
          <p className="mt-3 font-medium">
            Connect your bank account to start analyzing your finances.
          </p>
        </div>
      )}

      {items.map((item) => {
        const itemAccounts = accounts.filter((a) => a.plaid_item_id === item.id);
        const isCsv = item.connection_status === "csv";
        const needsAttention = !isCsv && item.connection_status !== "good";
        return (
          <div key={item.id} className="surface p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  {item.institution_name ?? "Bank"}
                  {needsAttention ? (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" /> Needs attention
                    </Badge>
                  ) : isCsv ? (
                    <Badge variant="secondary">CSV upload</Badge>
                  ) : (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle2 className="size-3" /> Connected
                    </Badge>
                  )}
                  {!isCsv && <Badge variant="outline">{item.environment}</Badge>}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {isCsv ? "Last upload" : "Last synced"} {relativeTime(item.last_sync_at)} ·{" "}
                  {item.transaction_count} transactions
                </p>
                {item.error_message && (
                  <p className="mt-1 text-sm text-destructive">{item.error_message}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {isCsv ? (
                  <CsvImportDialog
                    key={csvAccounts.map((a) => a.id).join()}
                    csvAccounts={csvAccounts.filter((a) => a.plaid_item_id === item.id)}
                    variant="secondary"
                    label="Upload more"
                  />
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => syncMutation.mutate(item.id)}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw className="size-4" /> Sync now
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refreshMutation.mutate(item.id)}
                      disabled={refreshMutation.isPending}
                    >
                      Request refresh
                    </Button>
                    <ConnectBankButton
                      itemId={item.id}
                      variant="secondary"
                      size="sm"
                      label="Reconnect"
                    />
                  </>
                )}
                <Button variant="ghost" size="sm" onClick={() => setDisconnecting(item)}>
                  <Trash2 className="size-4" /> {isCsv ? "Remove" : "Disconnect"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {itemAccounts.map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-4">
                  <p className="text-sm font-semibold">{a.account_name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {a.account_subtype ?? a.account_type} {a.mask ? `•• ${a.mask}` : ""}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold tabular-nums">
                    {formatCurrency(Number(a.current_balance ?? 0), a.iso_currency_code ?? "USD")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Available{" "}
                    {formatCurrency(Number(a.available_balance ?? 0), a.iso_currency_code ?? "USD")}{" "}
                    · {a.iso_currency_code ?? "USD"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <Dialog open={Boolean(disconnecting)} onOpenChange={(o) => !o && setDisconnecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect {disconnecting?.institution_name}?</DialogTitle>
            <DialogDescription>
              We'll stop syncing this bank and remove the stored credentials. Your imported
              transaction history is kept by default so your past reports stay accurate.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-start gap-3 rounded-lg border border-destructive/40 p-3 text-sm">
            <Checkbox checked={deleteData} onCheckedChange={(v) => setDeleteData(Boolean(v))} />
            <span>
              Also permanently delete all imported transactions and accounts from this bank. This
              cannot be undone.
            </span>
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDisconnecting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => removeMutation.mutate()}
              disabled={removeMutation.isPending}
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
