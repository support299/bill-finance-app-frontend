import { GAAP_TYPE_LABELS, rowGaapType } from "@/api/gaap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Download, EyeOff, Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { TransactionDrawer } from "@/components/transaction-drawer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listCategoriesFn } from "@/api/app";
import { downloadCsv, formatCurrency, formatDate } from "@/lib/format";
import { getAccountsFn } from "@/api/plaid";
import type { GaapType, Transaction } from "@/api/types";
import {
  assignProjectFn,
  listProjectsFn,
  PROJECT_ROLE_LABELS,
  PROJECT_ROLES,
  type ProjectRole,
} from "@/api/projects";
import {
  bulkCategorizeFn,
  bulkDeleteTransactionsFn,
  exportTransactionsFn,
  listTransactionsFn,
  type TransactionFilters,
} from "@/api/transactions";

export const Route = createFileRoute("/_authenticated/transactions")({
  head: () => ({
    meta: [
      { title: "Bank Transactions — ImaxAccounting" },
      {
        name: "description",
        content: "Search, filter, categorize and export every imported bank transaction.",
      },
      { property: "og:title", content: "Bank Transactions — ImaxAccounting" },
      {
        property: "og:description",
        content: "Every synced bank transaction in one searchable table.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  // Set by drill-down links from the P&L (category + period + statement type).
  validateSearch: (raw: Record<string, unknown>): TransactionsSearch => {
    const s = raw as Partial<Record<keyof TransactionsSearch, unknown>>;
    return {
      ...(typeof s.from === "string" ? { from: s.from } : {}),
      ...(typeof s.to === "string" ? { to: s.to } : {}),
      ...(typeof s.category === "string" ? { category: s.category } : {}),
      ...(typeof s.project === "string" ? { project: s.project } : {}),
      ...(s.unlinked === true || s.unlinked === "true" ? { unlinked: true } : {}),
      ...(s.uncategorized === true || s.uncategorized === "true" ? { uncategorized: true } : {}),
      ...(typeof s.gaap === "string" ? { gaap: s.gaap } : {}),
      ...(typeof s.label === "string" ? { label: s.label } : {}),
    };
  },
  component: TransactionsPage,
});

export interface TransactionsSearch {
  from?: string;
  to?: string;
  category?: string;
  uncategorized?: boolean;
  unlinked?: boolean;
  project?: string;
  gaap?: string;
  label?: string;
}

function TransactionsPage() {
  const queryClient = useQueryClient();
  const drill = Route.useSearch();
  const navigate = Route.useNavigate();
  const [filters, setFilters] = useState<TransactionFilters>({
    ...(drill.from ? { from: drill.from } : {}),
    ...(drill.to ? { to: drill.to } : {}),
    ...(drill.category ? { categoryIds: [drill.category] } : {}),
    ...(drill.uncategorized ? { uncategorized: true } : {}),
    ...(drill.unlinked ? { unlinked: true } : {}),
    ...(drill.project ? { projectIds: [drill.project] } : {}),
    ...(drill.gaap ? { gaapType: drill.gaap as GaapType, reportable: true } : {}),
    direction: "all",
    status: "all",
    page: 1,
    pageSize: 50,
    sortBy: "transaction_date",
    sortDir: "desc",
    includeHidden: false,
  });
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [active, setActive] = useState<Transaction | null>(null);

  const list = listTransactionsFn;
  const exportFn = exportTransactionsFn;
  const bulk = bulkCategorizeFn;
  const bulkDelete = bulkDeleteTransactionsFn;
  const cats = listCategoriesFn;
  const getAccounts = getAccountsFn;

  const effective = useMemo(() => ({ ...filters, search: search || undefined }), [filters, search]);

  const query = useQuery({
    queryKey: ["transactions", effective],
    queryFn: () => list({ data: effective }),
  });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => cats({ data: undefined }),
  });
  const accounts = useQuery({
    queryKey: ["bank-accounts"],
    queryFn: () => getAccounts({ data: undefined }),
  });

  // "Select all N matching": applies to every page of the current filters, not just the visible rows.
  const [allMatching, setAllMatching] = useState(false);
  const scopeKey = JSON.stringify({ ...effective, page: 0, pageSize: 0, sortBy: 0, sortDir: 0 });
  useEffect(() => {
    setAllMatching(false);
    setSelected([]);
  }, [scopeKey]);

  const bulkMutation = useMutation({
    mutationFn: (categoryId: string) => {
      if (!allMatching) return bulk({ data: { ids: selected, categoryId } });
      const { page: _p, pageSize: _s, ...scope } = effective;
      return bulk({
        data: { categoryId, selectAll: { filters: scope, expectedCount: query.data?.total ?? 0 } },
      });
    },
    onSuccess: (r) => {
      toast.success(`${r.updated} transactions recategorized`);
      setSelected([]);
      setAllMatching(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn({ data: undefined }),
  });
  const [projectPick, setProjectPick] = useState("");
  const [rolePick, setRolePick] = useState<ProjectRole | "auto">("auto");
  const assignMutation = useMutation({
    mutationFn: () => {
      const projectId = projectPick === "none" ? null : projectPick;
      const role = rolePick === "auto" ? {} : { role: rolePick };
      if (!allMatching) return assignProjectFn({ data: { projectId, ids: selected, ...role } });
      const { page: _p, pageSize: _s, ...scope } = effective;
      return assignProjectFn({
        data: {
          projectId,
          ...role,
          selectAll: { filters: scope, expectedCount: query.data?.total ?? 0 },
        },
      });
    },
    onSuccess: (r) => {
      toast.success(`${r.updated} transactions updated`);
      setSelected([]);
      setAllMatching(false);
      setProjectPick("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => {
      if (!allMatching) return bulkDelete({ data: { ids: selected } });
      const { page: _p, pageSize: _s, ...scope } = effective;
      return bulkDelete({
        data: { selectAll: { filters: scope, expectedCount: query.data?.total ?? 0 } },
      });
    },
    onSuccess: (r) => {
      toast.success(
        r.skipped > 0
          ? `${r.deleted} deleted · ${r.skipped} skipped (still linked to a connected bank or GoHighLevel)`
          : `${r.deleted} transactions deleted`,
      );
      setSelected([]);
      setAllMatching(false);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const pageFullySelected = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const count = allMatching ? total : selected.length;

  function deleteSelected() {
    const n = allMatching ? total : selected.length;
    if (
      window.confirm(
        `Permanently delete ${n} transaction${n === 1 ? "" : "s"}? This cannot be undone.\n\nOnly transactions whose bank connection was removed (and manual entries) are deleted. Ones still linked to a connected bank are skipped — disconnect that bank with "delete data" instead.`,
      )
    )
      deleteMutation.mutate();
  }

  function applyCategory(categoryId: string) {
    if (
      allMatching &&
      !window.confirm(
        `Change the category of all ${total} matching transactions? This applies to every page, not just this one.`,
      )
    )
      return;
    bulkMutation.mutate(categoryId);
  }
  const pages = Math.max(1, Math.ceil(total / (filters.pageSize ?? 50)));

  async function handleExport() {
    const { rows: exportRows } = await exportFn({ data: effective });
    if (!exportRows.length) {
      toast.error("Nothing to export for these filters.");
      return;
    }
    downloadCsv(
      `imaxaccounting-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      exportRows.map((r) => ({
        date: r.transaction_date,
        merchant: r.merchant_name ?? "",
        description: r.description ?? "",
        account: r.plaid_account_id ?? "",
        amount: r.amount,
        currency: r.currency,
        type: GAAP_TYPE_LABELS[rowGaapType(r)],
        category: r.categories?.name ?? "Uncategorized",
        status: r.pending ? "pending" : "posted",
      })),
    );
  }

  function clearDrill() {
    setFilters((f) => {
      const {
        categoryIds: _c,
        uncategorized: _u,
        unlinked: _l,
        gaapType: _g,
        reportable: _r,
        ...rest
      } = f;
      return { ...rest, page: 1 };
    });
    setSelected([]);
    navigate({ search: {}, replace: true });
  }

  return (
    <div className="space-y-5">
      {(drill.label || drill.unlinked) &&
        (filters.categoryIds || filters.uncategorized || filters.unlinked) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/40 bg-accent px-4 py-2 text-sm">
            <span>
              {drill.unlinked ? (
                <strong>Transactions from disconnected banks</strong>
              ) : (
                <>
                  From your report: <strong>{drill.label}</strong>
                </>
              )}
              {drill.from && drill.to && ` · ${formatDate(drill.from)} – ${formatDate(drill.to)}`}
            </span>
            <Button variant="ghost" size="sm" onClick={clearDrill}>
              Clear filter
            </Button>
          </div>
        )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bank Transactions</h1>
          <p className="text-sm text-muted-foreground">{total} transactions match your filters.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters((s) => !s)}>
            <SlidersHorizontal className="size-4" /> Filters
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="size-4" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="surface p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search merchant, description or original description…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setFilters((f) => ({ ...f, page: 1 }));
            }}
          />
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-4">
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value, page: 1 }))}
            />
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value, page: 1 }))}
            />
            <Select
              value={filters.direction ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  direction: v as NonNullable<TransactionFilters["direction"]>,
                  page: 1,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="income">Income (revenue & other)</SelectItem>
                <SelectItem value="expense">Expenses (COGS, operating, other)</SelectItem>
                <SelectItem value="transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.status ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({
                  ...f,
                  status: v as NonNullable<TransactionFilters["status"]>,
                  page: 1,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="posted">Posted</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={filters.accountIds?.[0] ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, accountIds: v === "all" ? [] : [v], page: 1 }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                {(accounts.data?.accounts ?? []).map((a) => (
                  <SelectItem key={a.plaid_account_id} value={a.plaid_account_id}>
                    {a.account_name} {a.mask ? `••${a.mask}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filters.categoryIds?.[0] ?? "all"}
              onValueChange={(v) =>
                setFilters((f) => ({ ...f, categoryIds: v === "all" ? [] : [v], page: 1 }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {(categories.data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type="number"
              placeholder="Min amount"
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  minAmount: e.target.value === "" ? undefined : Number(e.target.value),
                  page: 1,
                }))
              }
            />
            <Input
              type="number"
              placeholder="Max amount"
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  maxAmount: e.target.value === "" ? undefined : Number(e.target.value),
                  page: 1,
                }))
              }
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(filters.includeHidden)}
                onCheckedChange={(v) =>
                  setFilters((f) => ({ ...f, includeHidden: Boolean(v), page: 1 }))
                }
              />
              Include hidden
            </label>
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <div className="surface flex flex-wrap items-center gap-3 p-4">
          <span className="text-sm font-medium">
            {allMatching ? `All ${total} matching transactions selected` : `${count} selected`}
          </span>
          {!allMatching && pageFullySelected && total > rows.length && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0"
              onClick={() => setAllMatching(true)}
            >
              Select all {total} matching
            </Button>
          )}
          <Select onValueChange={applyCategory}>
            <SelectTrigger className="w-60">
              <SelectValue placeholder="Set category…" />
            </SelectTrigger>
            <SelectContent>
              {(categories.data?.categories ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} · {c.type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Select value={projectPick} onValueChange={setProjectPick}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Add to project…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Remove from project</SelectItem>
                {(projects.data?.projects ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {projectPick && projectPick !== "none" && (
              <Select
                value={rolePick}
                onValueChange={(v) => setRolePick(v as ProjectRole | "auto")}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Role: automatic</SelectItem>
                  {PROJECT_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {PROJECT_ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {projectPick && (
              <Button
                size="sm"
                onClick={() => assignMutation.mutate()}
                disabled={assignMutation.isPending}
              >
                Apply
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={deleteSelected}
            disabled={deleteMutation.isPending}
          >
            Delete…
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSelected([]);
              setAllMatching(false);
            }}
          >
            Clear
          </Button>
        </div>
      )}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8">
                <Checkbox
                  checked={pageFullySelected}
                  onCheckedChange={(v) => {
                    setSelected(v ? rows.map((r) => r.id) : []);
                    if (!v) setAllMatching(false);
                  }}
                />
              </TableHead>
              <TableHead
                className="cursor-pointer"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    sortBy: "transaction_date",
                    sortDir: f.sortDir === "asc" ? "desc" : "asc",
                  }))
                }
              >
                Date
              </TableHead>
              <TableHead>Merchant</TableHead>
              <TableHead className="hidden md:table-cell">Description</TableHead>
              <TableHead className="hidden lg:table-cell">Account</TableHead>
              <TableHead
                className="cursor-pointer text-right"
                onClick={() =>
                  setFilters((f) => ({
                    ...f,
                    sortBy: "amount",
                    sortDir: f.sortDir === "asc" ? "desc" : "asc",
                  }))
                }
              >
                Amount
              </TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} className="py-10 text-center text-muted-foreground">
                  Transactions will appear here after your bank data is synchronized.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => setActive(t)}>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selected.includes(t.id)}
                    onCheckedChange={(v) =>
                      setSelected((s) => (v ? [...s, t.id] : s.filter((id) => id !== t.id)))
                    }
                  />
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(t.transaction_date)}
                </TableCell>
                <TableCell className="max-w-40 truncate font-medium">
                  {t.merchant_name ?? t.description ?? "—"}
                  {t.is_hidden && <EyeOff className="ml-1 inline size-3 text-muted-foreground" />}
                </TableCell>
                <TableCell className="hidden max-w-60 truncate text-muted-foreground md:table-cell">
                  {t.description}
                </TableCell>
                <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                  {(accounts.data?.accounts ?? []).find(
                    (a) => a.plaid_account_id === t.plaid_account_id,
                  )?.account_name ?? "—"}
                </TableCell>
                <TableCell
                  className={`text-right font-medium tabular-nums ${Number(t.amount) >= 0 ? "text-income" : "text-expense"}`}
                >
                  {formatCurrency(Number(t.amount), t.currency ?? "USD")}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={t.is_income ? "default" : t.is_transfer ? "secondary" : "outline"}
                  >
                    {GAAP_TYPE_LABELS[rowGaapType(t)]}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{t.categories?.name ?? "Uncategorized"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {t.pending ? "Pending" : "Posted"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Page {filters.page} of {pages}
          </p>
          <Select
            value={String(filters.pageSize ?? 50)}
            onValueChange={(v) => setFilters((f) => ({ ...f, pageSize: Number(v), page: 1 }))}
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 100, 200].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={(filters.page ?? 1) >= pages}
            onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
          >
            Next
          </Button>
        </div>
      </div>

      <TransactionDrawer
        transaction={active}
        categories={categories.data?.categories ?? []}
        onClose={() => setActive(null)}
      />
    </div>
  );
}
