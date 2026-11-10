import type { AccountingReports } from "@/api/accounting";
import { BRAND_NAME } from "@/lib/brand";
import { downloadCsv, formatCurrency, formatDate } from "@/lib/format";

export type StatementKind = "pl" | "bs" | "cf";

type Row =
  | { kind: "heading"; label: string }
  | {
      kind: "line";
      label: string;
      value: number;
      prior?: number;
      /** P&L lines only: what to open in Transactions. */
      categoryId?: string | null;
      /** Every category the line covers (itself and its sub-categories). */
      categoryIds?: string[];
      gaap?: string;
    }
  | { kind: "total"; label: string; value: number; prior?: number }
  | { kind: "grand"; label: string; value: number; prior?: number };

export interface StatementModel {
  title: string;
  subtitle: string;
  slug: string;
  rows: Row[];
  /** Set when a prior-period column is present. */
  compareLabel?: string;
  priorFrom?: string;
  priorTo?: string;
}

export type CompareMode = "none" | "year" | "period";

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(`${s}T00:00:00Z`);

/** The earlier range to compare against: same dates a year ago, or the equally long range just before. */
export function priorRange(from: string, to: string, mode: Exclude<CompareMode, "none">) {
  const f = utc(from);
  const t = utc(to);
  if (mode === "year") {
    f.setUTCFullYear(f.getUTCFullYear() - 1);
    t.setUTCFullYear(t.getUTCFullYear() - 1);
    return { from: iso(f), to: iso(t) };
  }
  const days = Math.round((t.getTime() - f.getTime()) / DAY) + 1;
  const pt = new Date(f.getTime() - DAY);
  return { from: iso(new Date(pt.getTime() - (days - 1) * DAY)), to: iso(pt) };
}

export function changeOf(value: number, prior: number) {
  const diff = value - prior;
  return { diff, pct: prior === 0 ? null : (diff / Math.abs(prior)) * 100 };
}

const NAVY: [number, number, number] = [34, 36, 78];
const ORANGE: [number, number, number] = [242, 140, 40];

type Lines = {
  name: string;
  value: number;
  category_id?: string | null;
  category_ids?: string[];
}[];

function section(
  rows: Row[],
  heading: string,
  lines: Lines,
  totalLabel: string,
  total: number,
  prior?: { lines: Lines; total: number },
  gaap?: string,
) {
  rows.push({ kind: "heading", label: heading });
  const names = lines.map((l) => l.name);
  for (const l of prior?.lines ?? []) if (!names.includes(l.name)) names.push(l.name);
  if (!names.length)
    rows.push({ kind: "line", label: "Nothing recorded in this period", value: 0 });
  for (const n of names) {
    rows.push({
      kind: "line",
      label: n,
      value: lines.find((l) => l.name === n)?.value ?? 0,
      ...(prior ? { prior: prior.lines.find((l) => l.name === n)?.value ?? 0 } : {}),
      ...(gaap
        ? {
            gaap,
            categoryId:
              (lines.find((l) => l.name === n) ?? prior?.lines.find((l) => l.name === n))
                ?.category_id ?? null,
            categoryIds:
              (lines.find((l) => l.name === n) ?? prior?.lines.find((l) => l.name === n))
                ?.category_ids ?? [],
          }
        : {}),
    });
  }
  rows.push({
    kind: "total",
    label: totalLabel,
    value: total,
    ...(prior ? { prior: prior.total } : {}),
  });
}

export function buildStatement(
  kind: StatementKind,
  d: AccountingReports,
  from: string,
  to: string,
  prior?: { data: AccountingReports; label: string; from: string; to: string } | null,
): StatementModel {
  const rows: Row[] = [];
  const pp = prior?.data.profit_and_loss;
  const period = `For the period ${formatDate(from)} – ${formatDate(to)}`;
  if (kind === "pl") {
    const p = d.profit_and_loss;
    const pr = (lines: Lines | undefined, total: number | undefined) =>
      pp && lines ? { lines, total: total ?? 0 } : undefined;
    const tot = (label: string, value: number, priorValue?: number): Row => ({
      kind: "total",
      label,
      value,
      ...(pp ? { prior: priorValue ?? 0 } : {}),
    });
    section(
      rows,
      "Revenue",
      p.revenue,
      "Total Revenue",
      p.total_revenue,
      pr(pp?.revenue, pp?.total_revenue),
      "revenue",
    );
    section(
      rows,
      "Cost of Goods Sold",
      p.cogs,
      "Total Cost of Goods Sold",
      p.total_cogs,
      pr(pp?.cogs, pp?.total_cogs),
      "cogs",
    );
    rows.push(tot("Gross Profit", p.gross_profit, pp?.gross_profit));
    section(
      rows,
      "Operating Expenses",
      p.operating_expenses,
      "Total Operating Expenses",
      p.total_operating_expenses,
      pr(pp?.operating_expenses, pp?.total_operating_expenses),
      "operating_expense",
    );
    rows.push(tot("Operating Income", p.operating_income, pp?.operating_income));
    section(
      rows,
      "Other Income",
      p.other_income,
      "Total Other Income",
      p.total_other_income,
      pr(pp?.other_income, pp?.total_other_income),
      "other_income",
    );
    section(
      rows,
      "Other Expenses",
      p.other_expenses,
      "Total Other Expenses",
      p.total_other_expenses,
      pr(pp?.other_expenses, pp?.total_other_expenses),
      "other_expense",
    );
    rows.push({
      kind: "grand",
      label: "Net Income",
      value: p.net_profit,
      ...(pp ? { prior: pp.net_profit } : {}),
    });
    return {
      title: "Profit & Loss Statement",
      subtitle: period,
      slug: "profit-and-loss",
      rows,
      ...(prior ? { compareLabel: prior.label, priorFrom: prior.from, priorTo: prior.to } : {}),
    };
  }
  if (kind === "cf") {
    const c = d.cash_flow;
    section(
      rows,
      "Cash Flows from Operating Activities",
      c.operating_lines,
      "Net Cash from Operating Activities",
      c.operating,
    );
    section(
      rows,
      "Cash Flows from Investing Activities",
      c.investing_lines,
      "Net Cash from Investing Activities",
      c.investing,
    );
    section(
      rows,
      "Cash Flows from Financing Activities",
      c.financing_lines,
      "Net Cash from Financing Activities",
      c.financing,
    );
    rows.push({ kind: "grand", label: "Net Change in Cash", value: c.net_change });
    rows.push({ kind: "line", label: "Cash and Cash Equivalents, Ending", value: c.closing_cash });
    return { title: "Cash Flow Statement", subtitle: period, slug: "cash-flow", rows };
  }
  const b = d.balance_sheet;
  const lines = (r: { label: string; balance: number }[]) =>
    r.map((x) => ({ name: x.label, value: x.balance }));
  section(
    rows,
    "Current Assets",
    lines(b.current_assets),
    "Total Current Assets",
    b.total_current_assets,
  );
  section(
    rows,
    "Non-Current Assets",
    lines(b.noncurrent_assets),
    "Total Non-Current Assets",
    b.total_noncurrent_assets,
  );
  rows.push({ kind: "total", label: "Total Assets", value: b.total_assets });
  section(
    rows,
    "Current Liabilities",
    lines(b.current_liabilities),
    "Total Current Liabilities",
    b.total_current_liabilities,
  );
  section(
    rows,
    "Non-Current Liabilities",
    lines(b.noncurrent_liabilities),
    "Total Non-Current Liabilities",
    b.total_noncurrent_liabilities,
  );
  rows.push({ kind: "total", label: "Total Liabilities", value: b.total_liabilities });
  section(
    rows,
    "Stockholders' Equity",
    lines(b.equity),
    "Total Stockholders' Equity",
    b.total_equity,
  );
  rows.push({
    kind: "grand",
    label: "Total Liabilities & Stockholders' Equity",
    value: b.total_liabilities + b.total_equity,
  });
  return {
    title: "Balance Sheet",
    subtitle: `As of ${formatDate(to)}`,
    slug: "balance-sheet",
    rows,
  };
}

export function downloadStatementCsv(m: StatementModel, from: string, to: string) {
  const out: Record<string, unknown>[] = m.rows.map((r) => {
    if (r.kind === "heading")
      return {
        Section: r.label,
        Line: "",
        Amount: "",
        ...(m.compareLabel ? { [m.compareLabel]: "", Change: "", "Change %": "" } : {}),
      };
    const row: Record<string, unknown> = { Section: "", Line: r.label, Amount: r.value.toFixed(2) };
    if (m.compareLabel) {
      const c = changeOf(r.value, r.prior ?? 0);
      row[m.compareLabel] = (r.prior ?? 0).toFixed(2);
      row["Change"] = c.diff.toFixed(2);
      row["Change %"] = c.pct === null ? "" : c.pct.toFixed(1);
    }
    return row;
  });
  downloadCsv(`${m.slug}-${from}-to-${to}${m.compareLabel ? "-compare" : ""}.csv`, out);
}

async function logoDataUrl(): Promise<string | null> {
  try {
    const blob = await (await fetch("/logo.png")).blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function downloadStatementPdf(
  m: StatementModel,
  from: string,
  to: string,
  businessName?: string,
) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    logoDataUrl(),
  ]);
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, "PNG", 40, 28, 44, 44);
  doc.setTextColor(...NAVY);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(18)
    .text(businessName || BRAND_NAME, logo ? 94 : 40, 54);
  doc.setFontSize(15).text(m.title, w / 2, 100, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(m.subtitle, w / 2, 117, { align: "center" });
  doc
    .setDrawColor(...ORANGE)
    .setLineWidth(2)
    .line(40, 78, w - 40, 78);

  const cmp = Boolean(m.compareLabel);
  const money = { halign: "right" as const };
  const pct = (v: number | null) => (v === null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
  autoTable(doc, {
    startY: 135,
    ...(cmp ? { head: [["", "Current", m.compareLabel!, "Change", "%"]] } : {}),
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], halign: "right" },
    body: m.rows.map((r) => {
      if (r.kind === "heading")
        return [
          {
            content: r.label,
            colSpan: cmp ? 5 : 2,
            styles: {
              fontStyle: "bold" as const,
              textColor: NAVY,
              fillColor: [253, 238, 221] as [number, number, number],
            },
          },
        ];
      const bold = r.kind !== "line";
      const base = { ...money, fontStyle: bold ? ("bold" as const) : ("normal" as const) };
      const cells = [
        {
          content: r.label,
          styles: {
            fontStyle: base.fontStyle,
            cellPadding: { left: bold ? 8 : 20, top: 4, bottom: 4, right: 4 },
          },
        },
        { content: formatCurrency(r.value), styles: base },
      ];
      if (cmp) {
        const c = changeOf(r.value, r.prior ?? 0);
        cells.push(
          { content: formatCurrency(r.prior ?? 0), styles: base },
          { content: formatCurrency(c.diff), styles: base },
          { content: pct(c.pct), styles: base },
        );
      }
      return cells;
    }),
    theme: "plain",
    styles: { fontSize: cmp ? 9 : 10, textColor: NAVY },
    columnStyles: cmp
      ? { 1: { cellWidth: 80 }, 2: { cellWidth: 80 }, 3: { cellWidth: 80 }, 4: { cellWidth: 50 } }
      : { 1: { cellWidth: 120 } },
    margin: { left: 40, right: 40 },
    didParseCell: (h) => {
      if (h.section !== "body") return;
      const r = m.rows[h.row.index];
      if (r?.kind === "grand") {
        h.cell.styles.fillColor = NAVY;
        h.cell.styles.textColor = [255, 255, 255];
      }
    },
    didDrawPage: () => {
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(8).setTextColor(130);
      doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, h - 24);
      doc.text(`Page ${doc.getNumberOfPages()}`, w - 40, h - 24, { align: "right" });
    },
  });
  doc.save(`${m.slug}-${from}-to-${to}${cmp ? "-compare" : ""}.pdf`);
}
