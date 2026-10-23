export function formatCurrency(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function formatCompact(value: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    notation: Math.abs(value) >= 10000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10000 ? 1 : 0,
  }).format(value ?? 0);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export type RangePreset =
  | "this_month"
  | "last_month"
  | "last_3_months"
  | "last_6_months"
  | "last_12_months"
  | "this_year"
  | "last_year"
  | "last_7_days"
  | "last_30_days"
  | "custom";

export const RANGE_LABELS: Record<Exclude<RangePreset, "custom">, string> = {
  last_7_days: "Last 7 days",
  last_30_days: "Last 30 days",
  this_month: "This month",
  last_month: "Last month",
  last_3_months: "Last 3 months",
  last_6_months: "Last 6 months",
  last_12_months: "Last 12 months",
  this_year: "This year",
  last_year: "Last year",
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function resolveRange(preset: RangePreset, custom?: { from: string; to: string }) {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  switch (preset) {
    case "last_7_days":
      return { from: iso(new Date(Date.UTC(y, m, now.getUTCDate() - 6))), to: iso(now) };
    case "last_30_days":
      return { from: iso(new Date(Date.UTC(y, m, now.getUTCDate() - 29))), to: iso(now) };
    case "this_month":
      return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(now) };
    case "last_month":
      return { from: iso(new Date(Date.UTC(y, m - 1, 1))), to: iso(new Date(Date.UTC(y, m, 0))) };
    case "last_3_months":
      return { from: iso(new Date(Date.UTC(y, m - 2, 1))), to: iso(now) };
    case "last_6_months":
      return { from: iso(new Date(Date.UTC(y, m - 5, 1))), to: iso(now) };
    case "last_12_months":
      return { from: iso(new Date(Date.UTC(y, m - 11, 1))), to: iso(now) };
    case "this_year":
      return { from: iso(new Date(Date.UTC(y, 0, 1))), to: iso(now) };
    case "last_year":
      return {
        from: iso(new Date(Date.UTC(y - 1, 0, 1))),
        to: iso(new Date(Date.UTC(y - 1, 11, 31))),
      };
    default:
      return { from: custom?.from ?? iso(new Date(Date.UTC(y, m, 1))), to: custom?.to ?? iso(now) };
  }
}

export function suggestedGranularity(from: string, to: string): "day" | "week" | "month" {
  const days = (new Date(to).getTime() - new Date(from).getTime()) / 86400000;
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

export function periodLabel(period: string) {
  if (period.length === 7) {
    const [yy, mm] = period.split("-");
    return new Date(Number(yy), Number(mm) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
    });
  }
  return new Date(`${period}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
