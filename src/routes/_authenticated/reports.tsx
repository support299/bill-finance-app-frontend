import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AccountingReports } from "@/components/accounting-reports";
import { KpiCard } from "@/components/kpi-card";
import { RangePicker } from "@/components/range-picker";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  downloadCsv,
  formatCompact,
  formatCurrency,
  formatDate,
  periodLabel,
  resolveRange,
  suggestedGranularity,
  type RangePreset,
} from "@/lib/format";
import { getReportDataFn } from "@/api/reports";

type ReportsSearch = { from?: string; to?: string; tab?: string };

export const Route = createFileRoute("/_authenticated/reports")({
  // "Back to report" from Transactions restores the period and the tab the user drilled down from.
  validateSearch: (raw: Record<string, unknown>): ReportsSearch => ({
    ...(typeof raw["from"] === "string" ? { from: raw["from"] } : {}),
    ...(typeof raw["to"] === "string" ? { to: raw["to"] } : {}),
    ...(typeof raw["tab"] === "string" ? { tab: raw["tab"] } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Financial reports — ImaxAccounting" },
      {
        name: "description",
        content:
          "Income vs expense, cash-flow trends, category breakdowns and top merchants for any period.",
      },
      { property: "og:title", content: "Financial reports — ImaxAccounting" },
      {
        property: "og:description",
        content: "Detailed cash-flow analytics built from your synced bank data.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsPage,
});

const PALETTE = [
  "#f28c28",
  "#22244e",
  "#4a63c9",
  "#f8c58b",
  "#9aa0c7",
  "#c46a0f",
  "#7b7fa6",
  "#2e9d5b",
];

function ReportsPage() {
  const search = Route.useSearch();
  const fromLink = Boolean(search.from && search.to);
  const [preset, setPreset] = useState<RangePreset>(fromLink ? "custom" : "last_6_months");
  const [custom, setCustom] = useState({ from: search.from ?? "", to: search.to ?? "" });
  const [includeTransfers, setIncludeTransfers] = useState(false);

  const range = useMemo(
    () => resolveRange(preset, custom.from && custom.to ? custom : undefined),
    [preset, custom],
  );
  const granularity = suggestedGranularity(range.from, range.to);

  const report = getReportDataFn;
  const query = useQuery({
    queryKey: ["report", range, granularity, includeTransfers],
    queryFn: () => report({ data: { ...range, granularity, includeTransfers } }),
  });

  const d = query.data;
  const series = (d?.series ?? []).map((s) => ({ ...s, label: periodLabel(s.period) }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">
            {formatDate(range.from)} – {formatDate(range.to)} · {d?.totals.transaction_count ?? 0}{" "}
            transactions
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RangePicker
            preset={preset}
            onPresetChange={setPreset}
            custom={custom}
            onCustomChange={setCustom}
          />
          <Button variant="outline" size="sm" onClick={() => setIncludeTransfers((v) => !v)}>
            {includeTransfers ? "Excluding" : "Including"} transfers
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadCsv(
                `imaxaccounting-report-${range.from}-to-${range.to}.csv`,
                series.map((s) => ({
                  period: s.period,
                  income: s.income.toFixed(2),
                  expenses: s.expenses.toFixed(2),
                  net: s.net.toFixed(2),
                })),
              )
            }
          >
            <Download className="size-4" /> Export
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total income"
          value={d?.totals.total_income ?? 0}
          icon={TrendingUp}
          tone="income"
        />
        <KpiCard
          label="Total expenses"
          value={d?.totals.total_expenses ?? 0}
          icon={TrendingDown}
          tone="expense"
        />
        <KpiCard
          label="Net cash flow"
          value={d?.totals.net_cash_flow ?? 0}
          icon={Wallet}
          tone={(d?.totals.net_cash_flow ?? 0) >= 0 ? "income" : "expense"}
        />
        <KpiCard
          label="Avg monthly spend"
          value={d?.totals.average_monthly_expenses ?? 0}
          icon={Wallet}
          hint={`across ${d?.totals.month_count ?? 0} months`}
        />
      </div>

      <Tabs defaultValue={search.tab ?? "cashflow"}>
        <TabsList>
          <TabsTrigger value="cashflow">Cash flow</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="merchants">Merchants</TabsTrigger>
          <TabsTrigger value="largest">Largest expenses</TabsTrigger>
          <TabsTrigger value="accounting">Accounting</TabsTrigger>
        </TabsList>

        <TabsContent value="cashflow" className="space-y-5">
          <div className="surface p-5">
            <h2 className="mb-4 text-sm font-semibold">Income vs expenses</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => formatCompact(v)}
                />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Legend />
                <Bar dataKey="income" name="Income" fill="#f28c28" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill="#22244e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Net cash flow trend</h2>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Area
                    dataKey="net"
                    name="Net"
                    stroke="#22244e"
                    fill="#22244e"
                    fillOpacity={0.18}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="surface p-5">
              <h2 className="mb-4 text-sm font-semibold">Cumulative savings</h2>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart
                  data={series.reduce((acc: { label: string; cumulative: number }[], s) => {
                    const prev = acc[acc.length - 1]?.cumulative ?? 0;
                    acc.push({ label: s.label, cumulative: prev + s.net });
                    return acc;
                  }, [])}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                  <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Line
                    dataKey="cumulative"
                    name="Cumulative"
                    stroke="#f28c28"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="accounting">
          <AccountingReports from={range.from} to={range.to} />
        </TabsContent>

        <TabsContent value="categories" className="grid gap-5 lg:grid-cols-2">
          <CategoryBreakdown title="Expenses by category" rows={d?.expense_by_category ?? []} />
          <CategoryBreakdown title="Income by category" rows={d?.income_by_category ?? []} />
        </TabsContent>

        <TabsContent value="merchants">
          <div className="surface p-5">
            <h2 className="mb-4 text-sm font-semibold">Top merchants by spend</h2>
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={d?.top_merchants ?? []} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                <XAxis type="number" fontSize={12} tickFormatter={(v) => formatCompact(v)} />
                <YAxis type="category" dataKey="name" width={140} fontSize={12} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} />
                <Bar dataKey="value" fill="#f28c28" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>

        <TabsContent value="largest">
          <div className="surface overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(d?.largest_transactions ?? []).map((t, i) => (
                  <TableRow key={`${t.transaction_date}-${i}`}>
                    <TableCell>{formatDate(t.transaction_date)}</TableCell>
                    <TableCell className="font-medium">
                      {t.merchant_name ?? t.description}
                    </TableCell>
                    <TableCell>{t.categories?.name ?? "Uncategorized"}</TableCell>
                    <TableCell className="text-right tabular-nums text-expense">
                      {formatCurrency(Math.abs(Number(t.amount)), t.currency ?? "USD")}
                    </TableCell>
                  </TableRow>
                ))}
                {(d?.largest_transactions ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                      No expenses in this period.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CategoryBreakdown({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; color: string | null; value: number }[];
}) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div className="surface p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No data for this period.</p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={rows.slice(0, 8)}
                dataKey="value"
                nameKey="name"
                innerRadius={60}
                outerRadius={95}
              >
                {rows.slice(0, 8).map((r, i) => (
                  <Cell key={r.name} fill={r.color ?? PALETTE[i % PALETTE.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <ul className="mt-4 space-y-2 text-sm">
            {rows.slice(0, 8).map((r, i) => (
              <li key={r.name} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: r.color ?? PALETTE[i % PALETTE.length] }}
                  />
                  {r.name}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {formatCurrency(r.value)} · {total ? Math.round((r.value / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
