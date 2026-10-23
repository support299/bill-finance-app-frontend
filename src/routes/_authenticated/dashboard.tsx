import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  Landmark,
  Lightbulb,
  Scale,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ConnectBankButton } from "@/components/connect-bank-button";
import { KpiCard } from "@/components/kpi-card";
import { AccountFilter, RangePicker } from "@/components/range-picker";
import {
  formatCompact,
  formatCurrency,
  periodLabel,
  resolveRange,
  suggestedGranularity,
  type RangePreset,
} from "@/lib/format";
import { getDashboardDataFn, getReportDataFn } from "@/api/reports";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — ImaxAccounting" },
      {
        name: "description",
        content:
          "Income, expenses, net cash flow and spending breakdowns across your connected accounts.",
      },
      { property: "og:title", content: "Dashboard — ImaxAccounting" },
      { property: "og:description", content: "Your live income, expense and cash-flow overview." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

const CHART_COLORS = [
  "#1a1a1a",
  "#333333",
  "#4d4d4d",
  "#666666",
  "#808080",
  "#999999",
  "#b3b3b3",
  "#cccccc",
];

function Dashboard() {
  const [preset, setPreset] = useState<RangePreset>("last_6_months");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [accountIds, setAccountIds] = useState<string[]>([]);

  const range = useMemo(() => resolveRange(preset, custom), [preset, custom]);
  const granularity = suggestedGranularity(range.from, range.to);

  const getReport = getReportDataFn;
  const getDash = getDashboardDataFn;

  const dash = useQuery({
    queryKey: ["dashboard-meta", range, accountIds],
    queryFn: () => getDash({ data: { ...range, accountIds, granularity } }),
  });
  const report = useQuery({
    queryKey: ["dashboard-report", range, accountIds, granularity],
    queryFn: () => getReport({ data: { ...range, accountIds, granularity } }),
  });

  const totals = report.data?.totals;
  const series = (report.data?.series ?? []).map((s) => ({ ...s, label: periodLabel(s.period) }));
  const hasBank = (dash.data?.items ?? []).length > 0;
  const hasData = (totals?.transaction_count ?? 0) > 0;

  const insights = useMemo(() => {
    if (!totals || !hasData) return [];
    const out: string[] = [];
    if (report.data?.top_expense_category) {
      out.push(
        `${report.data.top_expense_category.name} is your largest expense category at ${formatCurrency(report.data.top_expense_category.value)}.`,
      );
    }
    if (totals.total_income > 0 && report.data?.top_income_category) {
      const pct = Math.round((report.data.top_income_category.value / totals.total_income) * 100);
      out.push(`${report.data.top_income_category.name} represents ${pct}% of your total income.`);
    }
    out.push(`Your net cash flow for this period is ${formatCurrency(totals.net_cash_flow)}.`);
    if (totals.month_count > 1) {
      out.push(
        `Average monthly income is ${formatCurrency(totals.average_monthly_income)} against ${formatCurrency(totals.average_monthly_expenses)} of expenses.`,
      );
    }
    if (series.length >= 2) {
      const prev = series[series.length - 2]!;
      const curr = series[series.length - 1]!;
      if (prev.expenses > 0) {
        const change = Math.round(((curr.expenses - prev.expenses) / prev.expenses) * 100);
        if (Math.abs(change) >= 5) {
          out.push(
            `Your expenses ${change > 0 ? "increased" : "decreased"} ${Math.abs(change)}% versus the previous period.`,
          );
        }
      }
    }
    return out.slice(0, 4);
  }, [totals, report.data, series, hasData]);

  if (!hasBank && !dash.isLoading) {
    return (
      <div className="mx-auto max-w-xl py-20 text-center">
        <Landmark className="mx-auto size-10 text-primary" />
        <h1 className="mt-4 text-2xl font-bold">
          Connect your bank account to start analyzing your finances.
        </h1>
        <p className="mt-2 text-muted-foreground">
          We import up to 24 months of history, categorize every transaction and keep everything in
          sync automatically.
        </p>
        <div className="mt-6 flex justify-center">
          <ConnectBankButton size="lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            How much came in, how much went out and what it means.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <AccountFilter
            accounts={dash.data?.accounts ?? []}
            value={accountIds}
            onChange={setAccountIds}
          />
          <RangePicker
            preset={preset}
            custom={custom}
            onPresetChange={setPreset}
            onCustomChange={setCustom}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total income"
          value={totals?.total_income ?? 0}
          icon={ArrowUpRight}
          tone="income"
        />
        <KpiCard
          label="Total expenses"
          value={totals?.total_expenses ?? 0}
          icon={ArrowDownRight}
          tone="expense"
        />
        <KpiCard label="Net cash flow" value={totals?.net_cash_flow ?? 0} icon={Scale} />
        <KpiCard
          label="Current balance"
          value={dash.data?.current_balance ?? 0}
          icon={Wallet}
          hint="Across selected accounts"
        />
        <KpiCard
          label="Avg monthly income"
          value={totals?.average_monthly_income ?? 0}
          icon={TrendingUp}
          tone="income"
        />
        <KpiCard
          label="Avg monthly expenses"
          value={totals?.average_monthly_expenses ?? 0}
          icon={TrendingDown}
          tone="expense"
        />
        <KpiCard
          label="Transfers excluded"
          value={totals?.transfer_volume ?? 0}
          icon={Scale}
          tone="transfer"
          hint="Not counted as income or expense"
        />
        <div className="surface p-5">
          <p className="text-sm font-medium text-muted-foreground">Transactions</p>
          <p className="mt-3 font-display text-2xl font-bold tabular-nums">
            {totals?.transaction_count ?? 0}
          </p>
          <Link to="/transactions" className="mt-1 inline-block text-xs text-primary underline">
            View all transactions
          </Link>
        </div>
      </div>

      {!hasData ? (
        <div className="surface p-10 text-center text-muted-foreground">
          Transactions will appear here after your bank data is synchronized.
        </div>
      ) : (
        <>
          {insights.length > 0 && (
            <div className="surface p-5">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Lightbulb className="size-4 text-primary" /> Insights
              </p>
              <ul className="mt-3 grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
                {insights.map((i) => (
                  <li key={i}>• {i}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <div className="surface p-5">
              <h2 className="mb-4 text-base font-semibold">Income vs expenses</h2>
              <ResponsiveContainer width="100%" height={280}>
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
                  <Bar dataKey="income" name="Income" fill="#1a1a1a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expenses" name="Expenses" fill="#595959" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="surface p-5">
              <h2 className="mb-4 text-base font-semibold">Net cash flow</h2>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={series}>
                  <defs>
                    <linearGradient id="netGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#404040" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#404040" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                    type="monotone"
                    dataKey="net"
                    name="Net"
                    stroke="#404040"
                    fill="url(#netGradient)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="surface p-5">
              <h2 className="mb-4 text-base font-semibold">Expenses by category</h2>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={(report.data?.expense_by_category ?? []).slice(0, 8)}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                  >
                    {(report.data?.expense_by_category ?? []).slice(0, 8).map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={entry.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="surface p-5">
              <h2 className="mb-4 text-base font-semibold">Income by category</h2>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={(report.data?.income_by_category ?? []).slice(0, 8)}
                  layout="vertical"
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.3} />
                  <XAxis type="number" fontSize={12} tickFormatter={(v) => formatCompact(v)} />
                  <YAxis type="category" dataKey="name" fontSize={12} width={120} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} />
                  <Bar dataKey="value" name="Income" fill="#1a1a1a" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="surface p-5">
            <h2 className="mb-4 text-base font-semibold">Account balances</h2>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(dash.data?.accounts ?? []).map((a) => (
                <div key={a.id} className="rounded-lg border border-border p-4">
                  <p className="text-sm font-semibold">{a.account_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.official_name ?? a.account_type} {a.mask ? `•• ${a.mask}` : ""}
                  </p>
                  <p className="mt-2 font-display text-lg font-bold tabular-nums">
                    {formatCurrency(Number(a.current_balance ?? 0), a.iso_currency_code ?? "USD")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Available{" "}
                    {formatCurrency(Number(a.available_balance ?? 0), a.iso_currency_code ?? "USD")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
