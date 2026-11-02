import type { ReconciliationDetail } from "@/api/reconciliation";
import { BRAND_NAME } from "@/lib/brand";
import { formatCurrency, formatDate } from "@/lib/format";

const NAVY: [number, number, number] = [34, 36, 78];
const ORANGE: [number, number, number] = [242, 140, 40];

export const isCardAccount = (type: string | null) => type === "credit" || type === "loan";

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

/** Bank reconciliation report: summary, cleared items and items still outstanding at the statement date. */
export async function downloadReconciliationPdf(
  { reconciliation: r, transactions }: ReconciliationDetail,
  businessName?: string,
) {
  const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
    logoDataUrl(),
  ]);
  const card = isCardAccount(r.account_type);
  const acct = `${r.account_name ?? "Account"}${r.mask ? ` ••${r.mask}` : ""}`;
  const plus = card ? "Charges" : "Deposits & credits";
  const minus = card ? "Payments & credits" : "Payments & debits";
  const money = (v: string | number) => formatCurrency(Number(v));

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const w = doc.internal.pageSize.getWidth();
  if (logo) doc.addImage(logo, "PNG", 40, 28, 44, 44);
  doc.setTextColor(...NAVY);
  doc
    .setFont("helvetica", "bold")
    .setFontSize(18)
    .text(businessName || BRAND_NAME, logo ? 94 : 40, 54);
  doc
    .setDrawColor(...ORANGE)
    .setLineWidth(2)
    .line(40, 78, w - 40, 78);
  doc.setFontSize(15).text("Reconciliation Report", w / 2, 102, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(`${acct} · Statement date ${formatDate(r.statement_date)}`, w / 2, 119, {
    align: "center",
  });
  const done = r.status === "completed" && r.completed_at;
  doc.text(
    done ? `Completed ${formatDate(r.completed_at!)}` : "In progress — not yet reconciled",
    w / 2,
    133,
    { align: "center" },
  );

  autoTable(doc, {
    startY: 150,
    theme: "plain",
    styles: { fontSize: 10, textColor: NAVY },
    columnStyles: { 1: { halign: "right", cellWidth: 120 } },
    margin: { left: 40, right: 40 },
    body: [
      [card ? "Beginning balance owed" : "Beginning balance", money(r.beginning_balance)],
      [`${plus} (${r.cleared_count} cleared items total)`, money(r.additions)],
      [minus, `-${money(r.subtractions)}`],
      [card ? "Cleared balance owed" : "Cleared balance", money(r.cleared_balance)],
      [
        card ? "Statement ending balance owed" : "Statement ending balance",
        money(r.ending_balance),
      ],
      ["Difference", money(r.difference)],
    ],
    didParseCell: (h) => {
      if (h.row.index === 5) {
        h.cell.styles.fontStyle = "bold";
        h.cell.styles.fillColor = r.balanced ? [221, 242, 230] : [250, 224, 224];
      }
    },
  });

  const section = (title: string, rows: typeof transactions) => {
    const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    doc
      .setFont("helvetica", "bold")
      .setFontSize(12)
      .setTextColor(...NAVY)
      .text(title, 40, y);
    autoTable(doc, {
      startY: y + 8,
      head: [["Date", "Description", "Amount"]],
      headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
      body: rows.length
        ? rows.map((t) => [formatDate(t.date), t.description, money(t.amount)])
        : [[{ content: "None", colSpan: 3, styles: { fontStyle: "italic" as const } }]],
      styles: { fontSize: 9, textColor: NAVY },
      columnStyles: { 2: { halign: "right", cellWidth: 100 } },
      margin: { left: 40, right: 40 },
    });
  };
  section(
    "Cleared transactions",
    transactions.filter((t) => t.cleared),
  );
  section(
    `Outstanding at ${formatDate(r.statement_date)} (not on the statement)`,
    transactions.filter((t) => !t.cleared),
  );

  const pages = doc.getNumberOfPages();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(130);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, h - 24);
    doc.text(`Page ${i} of ${pages}`, w - 40, h - 24, { align: "right" });
  }
  doc.save(`reconciliation-${acct.replace(/[^A-Za-z0-9]+/g, "-")}-${r.statement_date}.pdf`);
}
