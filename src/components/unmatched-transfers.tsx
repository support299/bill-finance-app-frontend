import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { linkTransferFn, listUnmatchedTransfersFn } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/format";

/**
 * Transfers whose other side is missing, per bank account. Where the app finds a row of the same size going the other way on
 * another account, it offers to link the two as one transfer; otherwise the other side is usually in an account that is not connected.
 */
export function UnmatchedTransfers({ from, to }: { from: string; to: string }) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ["unmatched-transfers"],
    queryFn: () => listUnmatchedTransfersFn(),
  });
  const link = useMutation({
    mutationFn: (ids: [string, string]) => linkTransferFn({ data: { ids } }),
    onSuccess: () => {
      toast.success("Linked as one transfer");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const groups = list.data?.accounts ?? [];
  if (list.isLoading || groups.length === 0) return null;

  return (
    <div className="no-print mt-8 space-y-5">
      <div>
        <h3 className="text-sm font-bold uppercase tracking-wide">Transfers with a missing side</h3>
        <p className="text-xs text-muted-foreground">
          All dates. Each of these has no matching transfer going the other way, so it stays in
          “Transfers in transit”. If it is not a transfer (a check, a card processor payout), open
          it and pick the right category.
        </p>
      </div>
      {groups.map((g) => (
        <div key={g.account_id ?? "manual"}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold">{g.account}</span>
            <span className="tabular-nums text-muted-foreground">
              {g.rows.length} unmatched · {formatCurrency(Number(g.total))}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Likely other side</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {g.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                  <TableCell className="max-w-56 truncate">
                    <Link
                      to="/transactions"
                      search={{
                        from: r.date,
                        to: r.date,
                        ...(g.account_id ? { account: g.account_id } : {}),
                        tx: r.id,
                        label: "Transfer with a missing side",
                        rfrom: from,
                        rto: to,
                        rsub: "transfers",
                      }}
                      title="Open this transaction"
                      className="font-medium text-primary underline decoration-primary/40 decoration-dotted underline-offset-4 hover:decoration-solid"
                    >
                      {r.description}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(Number(r.amount))}
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.suggestion ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span>
                          <span className="font-medium">{r.suggestion.account}</span> ·{" "}
                          {formatDate(r.suggestion.date)} · {r.suggestion.description}
                          {r.suggestion.category && (
                            <span className="text-muted-foreground">
                              {" "}
                              (now filed as {r.suggestion.category})
                            </span>
                          )}
                        </span>
                        <Editable>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7"
                            disabled={link.isPending}
                            onClick={() => link.mutate([r.id, r.suggestion!.id])}
                          >
                            Link as transfer
                          </Button>
                        </Editable>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        None found. The other account may not be connected.
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
