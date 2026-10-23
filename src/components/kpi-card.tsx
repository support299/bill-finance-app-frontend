import type { LucideIcon } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone?: "income" | "expense" | "neutral" | "transfer";
  hint?: string;
}) {
  const toneClass =
    tone === "income"
      ? "text-income"
      : tone === "expense"
        ? "text-expense"
        : tone === "transfer"
          ? "text-transfer"
          : value < 0
            ? "text-expense"
            : "text-foreground";

  return (
    <div className="surface p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <Icon className={cn("size-4", toneClass)} />
      </div>
      <p className={cn("mt-3 font-display text-2xl font-bold tabular-nums", toneClass)}>
        {formatCurrency(value)}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
