import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck } from "lucide-react";

import { getBooksEntryFn } from "@/api/accounting";
import { formatCurrency } from "@/lib/format";

/** The accounting behind a transaction: which accounts it moved money out of and into (debits and credits). Read-only. */
export function BooksEntryPanel({ transactionId }: { transactionId: string }) {
  const entry = useQuery({
    queryKey: ["books-entry", transactionId],
    queryFn: () => getBooksEntryFn({ data: { transactionId } }),
  });
  const e = entry.data;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <BookOpenCheck className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">In the books</p>
      </div>
      {entry.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {e && !e.posted && <p className="text-xs text-muted-foreground">{e.reason}</p>}
      {e?.posted && (
        <>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-1 font-medium">Account</th>
                <th className="pb-1 text-right font-medium">Debit</th>
                <th className="pb-1 text-right font-medium">Credit</th>
              </tr>
            </thead>
            <tbody>
              {e.lines.map((l, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1">
                    {l.account}
                    {(l.project || l.ledger) && (
                      <span className="block text-xs text-muted-foreground">
                        {[l.project, l.ledger].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {Number(l.debit) ? formatCurrency(Number(l.debit)) : ""}
                  </td>
                  <td className="py-1 text-right tabular-nums">
                    {Number(l.credit) ? formatCurrency(Number(l.credit)) : ""}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 font-medium">
                <td className="py-1">Total</td>
                <td className="py-1 text-right tabular-nums">
                  {formatCurrency(Number(e.total_debit ?? 0))}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {formatCurrency(Number(e.total_credit ?? 0))}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Every transaction is recorded on two sides, so the debits always equal the credits.
          </p>
        </>
      )}
    </div>
  );
}
