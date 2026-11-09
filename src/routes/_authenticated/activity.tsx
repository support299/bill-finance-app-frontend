import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

import { listActivityFn, type ActivityRow } from "@/api/access";
import { Button } from "@/components/ui/button";
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
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({ meta: [{ title: "Activity — ImaxAccounting" }] }),
  component: ActivityPage,
});

const ALL = "all";

const ACTION_LABEL: Record<string, string> = {
  ghl_sso_sign_in: "Opened the accounting page",
  ghl_sso_denied: "Tried to open the accounting page (no access)",
  ghl_link_sign_in: "Opened the accounting page (link)",
  member_access_changed: "Changed a user's access",
  transactions_bulk_deleted: "Deleted transactions",
  bank_history_from_changed: "Changed a bank's history start",
  transfers_detected: "Paired transfers",
  bulk_categorize: "Categorized transactions",
  recategorize_all: "Re-ran categorization",
};

function label(action: string) {
  return ACTION_LABEL[action] ?? action.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function details(row: ActivityRow) {
  const parts: string[] = [];
  if (row.entity) parts.push(row.entity.replace(/_/g, " "));
  const meta = row.metadata ?? {};
  for (const key of ["name", "email", "access", "count", "deleted", "paired", "history_from"]) {
    const v = meta[key];
    if (v !== undefined && v !== null && v !== "")
      parts.push(`${key.replace(/_/g, " ")}: ${String(v)}`);
  }
  return parts.join(" · ") || "—";
}

function ActivityPage() {
  const [actor, setActor] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["activity", { actor, from, to, q, page }],
    queryFn: () =>
      listActivityFn({
        data: { ...(actor === ALL ? {} : { actor }), from, to, q, page },
      }),
    placeholderData: keepPreviousData,
  });
  const rows = query.data?.rows ?? [];
  const pages = query.data?.total_pages ?? 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Activity</h1>
        <p className="text-sm text-muted-foreground">
          Who did what in this workspace. Entries made by automatic syncs and scheduled jobs show as
          “System”.
        </p>
      </div>

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <div>
          <label className="text-xs text-muted-foreground">Person</label>
          <Select
            value={actor}
            onValueChange={(v) => {
              setActor(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Everyone</SelectItem>
              <SelectItem value="system">System</SelectItem>
              {(query.data?.actors ?? []).map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name ?? a.email ?? a.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="min-w-48 flex-1">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input
            placeholder="Action, person or id"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>When</TableHead>
              <TableHead>Who</TableHead>
              <TableHead>What</TableHead>
              <TableHead className="hidden md:table-cell">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-muted-foreground">
                  Nothing recorded for these filters.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDate(r.at)}{" "}
                  <span className="text-xs">
                    {new Date(r.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {r.actor ? (
                    <>
                      <div className="font-medium">
                        {r.actor.name ?? r.actor.email ?? r.actor.id}
                      </div>
                      {r.actor.name && r.actor.email && (
                        <div className="text-xs text-muted-foreground">{r.actor.email}</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">System</span>
                  )}
                </TableCell>
                <TableCell>{label(r.action)}</TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {details(r)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {query.data?.count ?? 0} entries · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
