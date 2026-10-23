import { GAAP_TYPES, GAAP_TYPE_LABELS, rowGaapType, type GaapType } from "@/api/gaap";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cleanMerchantKeyword } from "@/api/gaap";
import { formatCurrency, formatDate } from "@/lib/format";
import type { EndpointInput } from "@/api/client";
import type { Transaction } from "@/api/types";
import { createRuleFn, updateTransactionFn } from "@/api/transactions";

interface Category {
  id: string;
  name: string;
  type: string;
}

export function TransactionDrawer({
  transaction,
  categories,
  onClose,
}: {
  transaction: Transaction | null;
  categories: Category[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const update = updateTransactionFn;
  const createRule = createRuleFn;
  const [pendingCategory, setPendingCategory] = useState<Category | null>(null);

  const updateMutation = useMutation({
    mutationFn: (input: EndpointInput<typeof updateTransactionFn>) => update({ data: input }),
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });

  const ruleMutation = useMutation({
    mutationFn: (input: EndpointInput<typeof createRuleFn>) => createRule({ data: input }),
    onSuccess: (r) => {
      toast.success(`Rule saved · applied to ${r.applied} transactions`);
      setPendingCategory(null);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!transaction) return null;
  const keyword = cleanMerchantKeyword(transaction.merchant_name, transaction.description);

  return (
    <Sheet open={Boolean(transaction)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-3">
            {transaction.merchant_logo_url && (
              <img src={transaction.merchant_logo_url} alt="" className="size-8 rounded" />
            )}
            {transaction.merchant_name ?? transaction.description ?? "Transaction"}
          </SheetTitle>
          <SheetDescription>{transaction.description}</SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <p
            className={`font-display text-3xl font-bold tabular-nums ${Number(transaction.amount) >= 0 ? "text-income" : "text-expense"}`}
          >
            {formatCurrency(Number(transaction.amount), transaction.currency ?? "USD")}
          </p>

          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Detail label="Date" value={formatDate(transaction.transaction_date)} />
            <Detail label="Authorized" value={formatDate(transaction.authorized_date)} />
            <Detail label="Status" value={transaction.pending ? "Pending" : "Posted"} />
            <Detail label="Payment channel" value={transaction.payment_channel ?? "—"} />
            <Detail
              label="Location"
              value={
                [transaction.city, transaction.region, transaction.country]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
            <Detail
              label="Provider category"
              value={transaction.plaid_personal_finance_detailed_category ?? "—"}
            />
            <Detail label="Categorized by" value={transaction.category_source ?? "—"} />
            <Detail label="Confidence" value={transaction.categorization_confidence ?? "—"} />
          </dl>

          {transaction.website && (
            <a
              href={`https://${String(transaction.website).replace(/^https?:\/\//, "")}`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline"
            >
              {transaction.website}
            </a>
          )}

          <div className="space-y-2">
            <p className="text-sm font-medium">Category</p>
            <Select
              value={transaction.user_category_id ?? undefined}
              onValueChange={(v) => {
                const cat = categories.find((c) => c.id === v) ?? null;
                updateMutation.mutate({ id: transaction.id, categoryId: v });
                setPendingCategory(cat);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Uncategorized" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} · {c.type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {pendingCategory && keyword && (
            <div className="rounded-lg border border-primary/40 bg-accent/40 p-4">
              <p className="text-sm font-medium">
                Apply “{pendingCategory.name}” to future “{keyword}” transactions?
              </p>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() =>
                    ruleMutation.mutate({
                      keyword,
                      matchType: "contains",
                      categoryId: pendingCategory.id,
                      source: "learned",
                      applyToExisting: true,
                    })
                  }
                  disabled={ruleMutation.isPending}
                >
                  Yes, create rule
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setPendingCategory(null)}>
                  No thanks
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{GAAP_TYPE_LABELS[rowGaapType(transaction)]}</Badge>
            <Select
              value={rowGaapType(transaction)}
              onValueChange={(v) =>
                updateMutation.mutate({ id: transaction.id, classification: v as GaapType })
              }
            >
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAAP_TYPES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {GAAP_TYPE_LABELS[g]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                updateMutation.mutate({ id: transaction.id, isHidden: !transaction.is_hidden })
              }
            >
              {transaction.is_hidden ? "Unhide" : "Hide"} transaction
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium capitalize">{value}</dd>
    </div>
  );
}
