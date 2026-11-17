import { useQuery } from "@tanstack/react-query";

import { getChartOfAccountsFn, type ChartAccount } from "@/api/accounting";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format";

const GROUPS: { kind: ChartAccount["kind"]; title: string; help: string }[] = [
  { kind: "asset", title: "Assets", help: "What you own: bank accounts, money owed to you." },
  { kind: "liability", title: "Liabilities", help: "What you owe: cards, loans, tax payable." },
  {
    kind: "equity",
    title: "Equity",
    help: "What is left for the owners, including starting balances.",
  },
  { kind: "income", title: "Income", help: "Money earned." },
  { kind: "expense", title: "Expenses", help: "Money spent." },
];

/** Every account in the books with its balance today. Read-only: accounts are created automatically from bank accounts and categories. */
export function ChartOfAccounts() {
  const chart = useQuery({
    queryKey: ["chart-of-accounts"],
    queryFn: () => getChartOfAccountsFn(),
  });
  const accounts = chart.data?.accounts ?? [];
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        The list of accounts your transactions are recorded in. They are created automatically from
        your bank accounts and categories, so there is nothing to set up. Balances include all
        dates.
      </p>
      {chart.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!chart.isLoading && accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No accounts yet. They appear once transactions are recorded.
        </p>
      )}
      {GROUPS.map((g) => {
        const rows = accounts.filter((a) => a.kind === g.kind);
        if (!rows.length) return null;
        const total = rows.reduce((sum, a) => sum + Number(a.balance), 0);
        return (
          <div key={g.kind} className="surface overflow-x-auto">
            <div className="px-4 pt-3">
              <h3 className="text-sm font-bold uppercase tracking-wide">{g.title}</h3>
              <p className="text-xs text-muted-foreground">{g.help}</p>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Entries</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{a.code}</TableCell>
                    <TableCell className="font-medium">
                      {a.name}
                      {a.bank_account && (
                        <Badge variant="outline" className="ml-2">
                          Bank
                        </Badge>
                      )}
                      {a.built_in && (
                        <Badge variant="secondary" className="ml-2">
                          Built in
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {a.lines}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(Number(a.balance))}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2">
                  <TableCell colSpan={3} className="font-semibold">
                    Total {g.title.toLowerCase()}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {formatCurrency(total)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        );
      })}
    </div>
  );
}
