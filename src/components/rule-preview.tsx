import { useQuery } from "@tanstack/react-query";

import { previewRuleFn } from "@/api/transactions";
import { formatCurrency, formatDate } from "@/lib/format";

/** "This rule would change N existing transactions" — shown before a rule is saved. */
export function RulePreview({
  keyword,
  matchType = "contains",
  categoryId,
}: {
  keyword: string;
  matchType?: "contains" | "starts_with" | "exact" | "regex";
  categoryId?: string | null;
}) {
  const enabled = keyword.trim().length >= 2;
  const query = useQuery({
    queryKey: ["rule-preview", keyword.trim(), matchType, categoryId ?? null],
    queryFn: () => previewRuleFn({ data: { keyword: keyword.trim(), matchType, categoryId } }),
    enabled,
  });
  if (!enabled) return null;
  if (query.isLoading) return <p className="text-xs text-muted-foreground">Checking matches…</p>;
  const d = query.data;
  if (!d) return null;
  if (!d.previewable)
    return (
      <p className="text-xs text-muted-foreground">
        Regex rules are applied to new transactions only, so there is nothing to preview.
      </p>
    );
  return (
    <div className="space-y-1.5 rounded-md border bg-background/60 p-3 text-xs" role="status">
      <p className="font-medium">
        {d.matching === 0
          ? "No existing transactions match this keyword."
          : d.would_change === 0
            ? `${d.matching} existing transaction${d.matching === 1 ? "" : "s"} match, and already have this category.`
            : `${d.would_change} of ${d.matching} matching transaction${d.matching === 1 ? "" : "s"} will change.`}
      </p>
      {d.sample.length > 0 && (
        <ul className="space-y-0.5 text-muted-foreground">
          {d.sample.map((t) => (
            <li key={t.id} className="flex justify-between gap-3">
              <span className="truncate">
                {formatDate(t.date)} · {t.description} · {t.current_category ?? "Uncategorized"}
              </span>
              <span className="tabular-nums">{formatCurrency(Number(t.amount))}</span>
            </li>
          ))}
          {d.would_change > d.sample.length && (
            <li>…and {d.would_change - d.sample.length} more</li>
          )}
        </ul>
      )}
    </div>
  );
}
