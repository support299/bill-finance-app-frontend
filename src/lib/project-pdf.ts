import type { Project, ProjectReport } from "@/api/projects";
import { PROJECT_ROLE_LABELS } from "@/api/projects";
import { BRAND_NAME } from "@/lib/brand";
import { formatCurrency, formatDate } from "@/lib/format";

const NAVY: [number, number, number] = [34, 36, 78];
const ORANGE: [number, number, number] = [242, 140, 40];
const money = (v: string | number) => formatCurrency(Number(v));

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

/** Project profit & loss: revenue, costs by role and profit, followed by every transaction on the job. */
export async function downloadProjectPdf(
  project: Project,
  r: ProjectReport,
  customer: string | null,
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
  doc
    .setDrawColor(...ORANGE)
    .setLineWidth(2)
    .line(40, 78, w - 40, 78);
  doc.setFontSize(15).text("Project Profit & Loss", w / 2, 102, { align: "center" });
  doc.setFontSize(12).text(project.name, w / 2, 120, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(10).setTextColor(100);
  doc.text(
    [customer ? `Customer: ${customer}` : null, `Status: ${project.status}`]
      .filter(Boolean)
      .join("  ·  "),
    w / 2,
    135,
    { align: "center" },
  );

  const costRow = (role: "equipment" | "labor" | "other") => [
    PROJECT_ROLE_LABELS[role],
    `-${money(r.costs[role])}`,
  ];
  autoTable(doc, {
    startY: 152,
    theme: "plain",
    styles: { fontSize: 10, textColor: NAVY },
    columnStyles: { 1: { halign: "right", cellWidth: 130 } },
    margin: { left: 40, right: 40 },
    body: [
      ["Deposits / revenue", money(r.revenue)],
      costRow("equipment"),
      costRow("labor"),
      costRow("other"),
      ["Total costs", `-${money(r.total_costs)}`],
      [
        r.margin_pct === null ? "Profit" : `Profit (${r.margin_pct.toFixed(1)}% margin)`,
        money(r.profit),
      ],
      ...(r.budget
        ? [["Budget", `${money(r.budget)} (${(r.budget_used_pct ?? 0).toFixed(0)}% of it spent)`]]
        : []),
    ],
    didParseCell: (h) => {
      if (h.section !== "body") return;
      if (h.row.index === 4) h.cell.styles.fontStyle = "bold";
      if (h.row.index === 5) {
        h.cell.styles.fontStyle = "bold";
        h.cell.styles.fillColor = NAVY;
        h.cell.styles.textColor = [255, 255, 255];
      }
    },
  });

  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  doc
    .setFont("helvetica", "bold")
    .setFontSize(12)
    .setTextColor(...NAVY)
    .text("Transactions", 40, y);
  autoTable(doc, {
    startY: y + 8,
    head: [["Date", "Description", "Role", "Amount"]],
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255] },
    styles: { fontSize: 9, textColor: NAVY },
    columnStyles: { 3: { halign: "right", cellWidth: 90 } },
    margin: { left: 40, right: 40 },
    body: r.transactions.length
      ? r.transactions.map((t) => [
          formatDate(t.date),
          t.description,
          t.role ? PROJECT_ROLE_LABELS[t.role] : Number(t.amount) >= 0 ? "Revenue" : "Other cost",
          money(t.amount),
        ])
      : [
          [
            {
              content: "No transactions yet",
              colSpan: 4,
              styles: { fontStyle: "italic" as const },
            },
          ],
        ],
  });

  const pages = doc.getNumberOfPages();
  const h = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8).setTextColor(130);
    doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, h - 24);
    doc.text(`Page ${i} of ${pages}`, w - 40, h - 24, { align: "right" });
  }
  doc.save(`project-${project.name.replace(/[^A-Za-z0-9]+/g, "-")}.pdf`);
}
