import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildStatement,
  changeOf,
  downloadStatementCsv,
  downloadStatementPdf,
  priorRange,
  type CompareMode,
  type StatementKind,
  type StatementModel,
} from "@/lib/statement-export";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAccountingReportsFn, type AccountingReports as AccountingData } from "@/api/accounting";
import { getProfileFn } from "@/api/app";
import { listProjectsFn } from "@/api/projects";
import { ACCOUNT_CLASS_LABELS, ACCOUNTING_STATUS_LABELS } from "@/api/ledgers";
import { formatCurrency, formatDate } from "@/lib/format";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface overflow-x-auto p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mb-3 text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  strong = true,
}: {
  label: string;
  value: number;
  strong?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between border-t pt-2 text-sm ${strong ? "font-semibold" : ""}`}
    >
      <span>{label}</span>
      <span className="tabular-nums">{formatCurrency(value)}</span>
    </div>
  );
}

type LineRow = {
  name?: string;
  label?: string;
  value?: number;
  balance?: number;
  category_id?: string | null;
};

/** Where a P&L line leads: Transactions filtered to that category, period and statement bucket. */
export type Drill = { gaap: string; from: string; to: string; project?: string | undefined };

function DrillLink({
  drill,
  categoryId,
  label,
  children,
  className,
}: {
  drill: Drill;
  categoryId: string | null | undefined;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to="/transactions"
      search={{
        from: drill.from,
        to: drill.to,
        gaap: drill.gaap,
        label,
        ...(drill.project ? { project: drill.project } : {}),
        ...(categoryId ? { category: categoryId } : { uncategorized: true }),
      }}
      title="View these transactions"
      className={`underline-offset-4 hover:text-primary hover:underline ${className ?? ""}`}
    >
      {children}
    </Link>
  );
}

function LineList({ rows, drill }: { rows: LineRow[]; drill?: Drill | undefined }) {
  if (!rows.length)
    return <p className="text-sm text-muted-foreground">Nothing recorded in this period.</p>;
  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {drill && r.name ? (
              <DrillLink drill={drill} categoryId={r.category_id} label={r.name}>
                {r.name}
              </DrillLink>
            ) : (
              (r.name ?? r.label)
            )}
          </span>
          <span className="tabular-nums">{formatCurrency(Number(r.value ?? r.balance ?? 0))}</span>
        </div>
      ))}
    </div>
  );
}

type BsLine = { id: string; label: string; balance: number };

function BsRows({ rows, indent = "pl-8" }: { rows: BsLine[]; indent?: string }) {
  if (!rows.length)
    return (
      <tr>
        <td className={`${indent} py-1 text-sm italic text-muted-foreground`}>None</td>
        <td />
      </tr>
    );
  return (
    <>
      {rows.map((r) => (
        <tr key={r.id}>
          <td className={`${indent} py-1 text-sm`}>{r.label}</td>
          <td className="py-1 text-right text-sm tabular-nums">{formatCurrency(r.balance)}</td>
        </tr>
      ))}
    </>
  );
}

function BsHeading({ children, level = 1 }: { children: React.ReactNode; level?: 1 | 2 }) {
  return (
    <tr>
      <td
        colSpan={2}
        className={
          level === 1
            ? "border-b pt-6 pb-1 text-xs font-bold uppercase tracking-wider"
            : "pl-4 pt-3 pb-1 text-sm font-semibold"
        }
      >
        {children}
      </td>
    </tr>
  );
}

function BsTotal({ label, value, level = 2 }: { label: string; value: number; level?: 1 | 2 | 3 }) {
  const cls =
    level === 3
      ? "border-y-4 border-double border-foreground py-2 font-bold uppercase"
      : level === 1
        ? "border-t-2 border-foreground py-2 font-bold"
        : "border-t py-1.5 pl-4 font-semibold";
  return (
    <tr>
      <td className={`${cls} text-sm`}>{label}</td>
      <td className={`${cls} text-right text-sm tabular-nums`}>{formatCurrency(value)}</td>
    </tr>
  );
}

function BalanceSheet({ bs, to }: { bs: AccountingData["balance_sheet"]; to: string }) {
  return (
    <div className="surface mx-auto max-w-3xl p-8">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide">Balance Sheet</h2>
        <p className="text-sm text-muted-foreground">As of {formatDate(to)}</p>
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th />
            <th className="w-40 border-b pb-1 text-right text-xs font-semibold uppercase text-muted-foreground">
              Amount
            </th>
          </tr>
        </thead>
        <tbody>
          <BsHeading>Assets</BsHeading>
          <BsHeading level={2}>Current Assets</BsHeading>
          <BsRows rows={bs.current_assets} />
          <BsTotal label="Total Current Assets" value={bs.total_current_assets} />
          <BsHeading level={2}>Non-Current Assets</BsHeading>
          <BsRows rows={bs.noncurrent_assets} />
          <BsTotal label="Total Non-Current Assets" value={bs.total_noncurrent_assets} />
          <BsTotal label="Total Assets" value={bs.total_assets} level={1} />

          <BsHeading>Liabilities and Stockholders' Equity</BsHeading>
          <BsHeading level={2}>Current Liabilities</BsHeading>
          <BsRows rows={bs.current_liabilities} />
          <BsTotal label="Total Current Liabilities" value={bs.total_current_liabilities} />
          <BsHeading level={2}>Non-Current (Long-Term) Liabilities</BsHeading>
          <BsRows rows={bs.noncurrent_liabilities} />
          <BsTotal label="Total Non-Current Liabilities" value={bs.total_noncurrent_liabilities} />
          <BsTotal label="Total Liabilities" value={bs.total_liabilities} level={1} />

          <BsHeading level={2}>Stockholders' Equity</BsHeading>
          <BsRows rows={bs.equity} />
          <BsTotal label="Total Stockholders' Equity" value={bs.total_equity} level={1} />

          <tr>
            <td className="pt-4" colSpan={2} />
          </tr>
          <BsTotal
            label="Total Liabilities & Stockholders' Equity"
            value={bs.total_liabilities + bs.total_equity}
            level={3}
          />
        </tbody>
      </table>
      {Math.abs(bs.unbalanced) > 0.005 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Out of balance by {formatCurrency(bs.unbalanced)} — file more transactions to ledger
          accounts to reconcile.
        </p>
      )}
    </div>
  );
}

function Statement({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface mx-auto max-w-3xl p-5 sm:p-8">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide">{title}</h2>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function StatementSection({
  title,
  rows,
  totalLabel,
  total,
  drill,
}: {
  title: string;
  rows: LineRow[];
  totalLabel: string;
  total: number;
  drill?: Drill;
}) {
  return (
    <div className="mb-6">
      <h3 className="border-b pb-1 text-xs font-bold uppercase tracking-wider">{title}</h3>
      <div className="space-y-1 py-2">
        <LineList rows={rows} drill={drill} />
      </div>
      <TotalRow label={totalLabel} value={total} />
    </div>
  );
}

function AgingTable({
  data,
  title,
  subtitle,
}: {
  data: AccountingData["ar_aging"] | undefined;
  title: string;
  subtitle: string;
}) {
  const rows = data?.rows ?? [];
  const totals = data?.totals;
  return (
    <Section title={title} subtitle={subtitle}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead className="text-right">0–30</TableHead>
            <TableHead className="text-right">31–60</TableHead>
            <TableHead className="text-right">61–90</TableHead>
            <TableHead className="text-right">90+</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                Nothing outstanding.
              </TableCell>
            </TableRow>
          )}
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">{r.label}</TableCell>
              <TableCell className="text-muted-foreground">{r.contact ?? "—"}</TableCell>
              {["0-30", "31-60", "61-90", "90+"].map((b) => (
                <TableCell key={b} className="text-right tabular-nums">
                  {formatCurrency(r.buckets[b] ?? 0)}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCurrency(r.total)}
              </TableCell>
            </TableRow>
          ))}
          {rows.length > 0 && totals && (
            <TableRow>
              <TableCell colSpan={2} className="font-semibold">
                Total
              </TableCell>
              {["0-30", "31-60", "61-90", "90+"].map((b) => (
                <TableCell key={b} className="text-right font-semibold tabular-nums">
                  {formatCurrency(totals.buckets[b] ?? 0)}
                </TableCell>
              ))}
              <TableCell className="text-right font-semibold tabular-nums">
                {formatCurrency(totals.total)}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Section>
  );
}

function ChangeCells({ value, prior, strong }: { value: number; prior: number; strong: boolean }) {
  const c = changeOf(value, prior);
  const cls = `text-right tabular-nums ${strong ? "font-semibold" : ""}`;
  return (
    <>
      <TableCell className={cls}>{formatCurrency(prior)}</TableCell>
      <TableCell className={cls}>{formatCurrency(c.diff)}</TableCell>
      <TableCell className={cls}>
        {c.pct === null ? "—" : `${c.pct > 0 ? "+" : ""}${c.pct.toFixed(1)}%`}
      </TableCell>
    </>
  );
}

function ComparisonStatement({
  model,
  from,
  to,
  project,
}: {
  model: StatementModel;
  from: string;
  to: string;
  project?: string | undefined;
}) {
  return (
    <div className="surface mx-auto max-w-4xl overflow-x-auto p-5 sm:p-8">
      <div className="mb-6 text-center">
        <h2 className="text-lg font-bold uppercase tracking-wide">{model.title}</h2>
        <p className="text-sm text-muted-foreground">{model.subtitle}</p>
        <p className="text-xs text-muted-foreground">Compared with {model.compareLabel}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead />
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">{model.compareLabel}</TableHead>
            <TableHead className="text-right">Change</TableHead>
            <TableHead className="text-right">%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {model.rows.map((r, i) =>
            r.kind === "heading" ? (
              <TableRow key={i} className="bg-accent hover:bg-accent">
                <TableCell colSpan={5} className="text-xs font-bold uppercase tracking-wider">
                  {r.label}
                </TableCell>
              </TableRow>
            ) : (
              <TableRow
                key={i}
                className={r.kind === "grand" ? "border-y-4 border-double border-foreground" : ""}
              >
                <TableCell
                  className={r.kind === "line" ? "pl-6 text-muted-foreground" : "font-semibold"}
                >
                  {r.kind === "line" && r.gaap ? (
                    <DrillLink
                      drill={{ gaap: r.gaap, from, to, project }}
                      categoryId={r.categoryId}
                      label={r.label}
                    >
                      {r.label}
                    </DrillLink>
                  ) : (
                    r.label
                  )}
                </TableCell>
                <TableCell
                  className={`text-right tabular-nums ${r.kind === "line" ? "" : "font-semibold"}`}
                >
                  {formatCurrency(r.value)}
                </TableCell>
                <ChangeCells value={r.value} prior={r.prior ?? 0} strong={r.kind !== "line"} />
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export function AccountingReports({ from, to }: { from: string; to: string }) {
  const fn = getAccountingReportsFn;
  const [projectId, setProjectId] = useState("all");
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn({ data: undefined }),
  });
  const project = projectId === "all" ? undefined : projectId;
  const query = useQuery({
    queryKey: ["accounting", from, to, project],
    queryFn: () => fn({ data: { from, to, projectId: project } }),
  });
  const d = query.data;
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn({ data: undefined }),
  });
  const businessName = profile.data?.profile?.business_name ?? "";
  const [tab, setTab] = useState("pl");
  const [compare, setCompare] = useState<CompareMode>("none");
  const prior = compare === "none" ? null : priorRange(from, to, compare);
  const priorQuery = useQuery({
    queryKey: ["accounting", prior?.from, prior?.to, project],
    queryFn: () => fn({ data: { from: prior!.from, to: prior!.to, projectId: project } }),
    enabled: Boolean(prior),
  });
  const priorLabel = prior
    ? compare === "year"
      ? `Prior year (${formatDate(prior.from)} – ${formatDate(prior.to)})`
      : `Prior period (${formatDate(prior.from)} – ${formatDate(prior.to)})`
    : "";
  const plComparing = tab === "pl" && Boolean(priorQuery.data);
  const modelFor = (kind: StatementKind) =>
    buildStatement(
      kind,
      d!,
      from,
      to,
      kind === "pl" && priorQuery.data
        ? { data: priorQuery.data, label: priorLabel, from: prior!.from, to: prior!.to }
        : null,
    );
  const exportKind = (["pl", "bs", "cf"] as const).includes(tab as StatementKind)
    ? (tab as StatementKind)
    : null;

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Building reports…</p>;
  if (!d) return <p className="text-sm text-muted-foreground">No data for this period yet.</p>;

  return (
    <Tabs value={tab} onValueChange={setTab} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList className="flex-wrap">
          <TabsTrigger value="pl">Profit &amp; loss</TabsTrigger>
          <TabsTrigger value="bs">Balance sheet</TabsTrigger>
          <TabsTrigger value="cf">Cash flow</TabsTrigger>
          <TabsTrigger value="gl">General ledger</TabsTrigger>
          <TabsTrigger value="tb">Trial balance</TabsTrigger>
          <TabsTrigger value="ar">A/R aging</TabsTrigger>
          <TabsTrigger value="ap">A/P aging</TabsTrigger>
          <TabsTrigger value="detail">By account</TabsTrigger>
        </TabsList>
        {exportKind && (
          <div className="no-print flex flex-wrap items-center gap-2">
            {tab === "pl" && (projects.data?.projects.length ?? 0) > 0 && (
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger className="h-8 w-48">
                  <SelectValue placeholder="All projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Whole business</SelectItem>
                  {(projects.data?.projects ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {tab === "pl" && (
              <Select value={compare} onValueChange={(v) => setCompare(v as CompareMode)}>
                <SelectTrigger className="h-8 w-44">
                  <SelectValue placeholder="Compare" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No comparison</SelectItem>
                  <SelectItem value="year">Compare: last year</SelectItem>
                  <SelectItem value="period">Compare: previous period</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Button
              size="sm"
              onClick={() => downloadStatementPdf(modelFor(exportKind), from, to, businessName)}
            >
              <FileText className="size-4" /> Download PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadStatementCsv(modelFor(exportKind), from, to)}
            >
              <Download className="size-4" /> CSV
            </Button>
          </div>
        )}
      </div>

      <TabsContent value="pl">
        {compare !== "none" && priorQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading comparison…</p>
        )}
        {plComparing && (
          <ComparisonStatement model={modelFor("pl")} from={from} to={to} project={project} />
        )}
        {!plComparing && (
          <Statement
            title="Profit & Loss Statement"
            subtitle={`For the period ${formatDate(from)} – ${formatDate(to)}`}
          >
            <StatementSection
              title="Revenue"
              rows={d.profit_and_loss.revenue}
              drill={{ gaap: "revenue", from, to, project }}
              totalLabel="Total Revenue"
              total={d.profit_and_loss.total_revenue}
            />
            <StatementSection
              title="Cost of Goods Sold"
              rows={d.profit_and_loss.cogs}
              drill={{ gaap: "cogs", from, to, project }}
              totalLabel="Total Cost of Goods Sold"
              total={d.profit_and_loss.total_cogs}
            />
            <div className="mb-5 border-t border-foreground py-2">
              <TotalRow label="Gross Profit" value={d.profit_and_loss.gross_profit} />
            </div>
            <StatementSection
              title="Operating Expenses"
              rows={d.profit_and_loss.operating_expenses}
              drill={{ gaap: "operating_expense", from, to, project }}
              totalLabel="Total Operating Expenses"
              total={d.profit_and_loss.total_operating_expenses}
            />
            <div className="mb-5 border-t border-foreground py-2">
              <TotalRow label="Operating Income" value={d.profit_and_loss.operating_income} />
            </div>
            <StatementSection
              title="Other Income"
              rows={d.profit_and_loss.other_income}
              drill={{ gaap: "other_income", from, to, project }}
              totalLabel="Total Other Income"
              total={d.profit_and_loss.total_other_income}
            />
            <StatementSection
              title="Other Expenses"
              rows={d.profit_and_loss.other_expenses}
              drill={{ gaap: "other_expense", from, to, project }}
              totalLabel="Total Other Expenses"
              total={d.profit_and_loss.total_other_expenses}
            />
            <div className="border-y-4 border-double border-foreground py-2">
              <TotalRow label="Net Income" value={d.profit_and_loss.net_profit} />
            </div>
          </Statement>
        )}
      </TabsContent>

      <TabsContent value="bs">
        <BalanceSheet bs={d.balance_sheet} to={to} />
      </TabsContent>

      <TabsContent value="cf">
        <Statement
          title="Cash Flow Statement"
          subtitle={`For the period ${formatDate(from)} – ${formatDate(to)}`}
        >
          <StatementSection
            title="Cash Flows from Operating Activities"
            rows={d.cash_flow.operating_lines}
            totalLabel="Net Cash from Operating Activities"
            total={d.cash_flow.operating}
          />
          <StatementSection
            title="Cash Flows from Investing Activities"
            rows={d.cash_flow.investing_lines}
            totalLabel="Net Cash from Investing Activities"
            total={d.cash_flow.investing}
          />
          <StatementSection
            title="Cash Flows from Financing Activities"
            rows={d.cash_flow.financing_lines}
            totalLabel="Net Cash from Financing Activities"
            total={d.cash_flow.financing}
          />
          <div className="border-y-4 border-double border-foreground py-2">
            <TotalRow label="Net Change in Cash" value={d.cash_flow.net_change} />
          </div>
          <div className="mt-3">
            <TotalRow
              label="Cash and Cash Equivalents, Ending"
              value={d.cash_flow.closing_cash}
              strong={false}
            />
          </div>
        </Statement>
      </TabsContent>

      <TabsContent value="gl" className="space-y-5">
        {d.general_ledger.length === 0 && (
          <p className="text-sm text-muted-foreground">No ledger activity in this period.</p>
        )}
        {d.general_ledger.map((l) => (
          <Section
            key={l.id}
            title={l.label}
            subtitle={`${ACCOUNT_CLASS_LABELS[l.account_class] ?? l.account_class} · closing ${formatCurrency(l.closing)}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Posting status</TableHead>
                  <TableHead>Accounting status</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {l.entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(e.date)}</TableCell>
                    <TableCell className="max-w-72 truncate">{e.description}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {e.accounting_status
                        ? ACCOUNTING_STATUS_LABELS[
                            e.accounting_status as keyof typeof ACCOUNTING_STATUS_LABELS
                          ]
                        : "Not classified"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.debit ? formatCurrency(e.debit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {e.credit ? formatCurrency(e.credit) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(e.balance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        ))}
      </TabsContent>

      <TabsContent value="tb">
        <Statement title="Trial Balance" subtitle={`As of ${formatDate(to)}`}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead>Class</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.trial_balance.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                    Nothing to show yet.
                  </TableCell>
                </TableRow>
              )}
              {d.trial_balance.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.label}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {ACCOUNT_CLASS_LABELS[r.account_class] ?? "Other"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.debit)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(r.credit)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="border-y-4 border-double border-foreground">
                <TableCell colSpan={2} className="font-bold uppercase">
                  Total
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrency(d.trial_balance.total_debit)}
                </TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {formatCurrency(d.trial_balance.total_credit)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {Math.abs(d.trial_balance.total_debit - d.trial_balance.total_credit) > 0.005 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Difference:{" "}
              {formatCurrency(d.trial_balance.total_debit - d.trial_balance.total_credit)}.
            </p>
          )}
        </Statement>
      </TabsContent>

      <TabsContent value="ar">
        <AgingTable
          data={d.ar_aging}
          title="A/R aging"
          subtitle="Transactions explicitly marked Accounts Receivable."
        />
      </TabsContent>

      <TabsContent value="ap">
        <AgingTable
          data={d.ap_aging}
          title="A/P aging"
          subtitle="Transactions explicitly marked Accounts Payable."
        />
      </TabsContent>

      <TabsContent value="detail" className="space-y-5">
        {d.account_detail.map((a) => (
          <Section
            key={a.id}
            title={a.label}
            subtitle={`${a.rows.length} transactions · net ${formatCurrency(a.total)}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Ledger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Accounting status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.rows.slice(0, 200).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                    <TableCell className="max-w-72 truncate">{r.description}</TableCell>
                    <TableCell>{r.category}</TableCell>
                    <TableCell className="text-muted-foreground">{r.ledger}</TableCell>
                    <TableCell className="capitalize">{r.status}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {r.accounting_status
                        ? ACCOUNTING_STATUS_LABELS[
                            r.accounting_status as keyof typeof ACCOUNTING_STATUS_LABELS
                          ]
                        : "Not classified"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCurrency(r.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>
        ))}
      </TabsContent>
    </Tabs>
  );
}
