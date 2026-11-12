import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Eye, Search, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
import {
  listAgencyClientsFn,
  openAgencyClientFn,
  openAgencySession,
  type ClientStatus,
} from "@/api/agency";
import { ApiError } from "@/api/client";
import { getTokens, setTokens, startSupportSession, supportSession } from "@/api/session";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/agency")({
  validateSearch: (raw: Record<string, unknown>): { company?: string; token?: string } => ({
    ...(typeof raw["company"] === "string" ? { company: raw["company"] } : {}),
    ...(typeof raw["token"] === "string" ? { token: raw["token"] } : {}),
  }),
  head: () => ({ meta: [{ title: "Agency clients — iMax Profit Tracker" }] }),
  component: AgencyPage,
});

function AgencyPage() {
  const { company, token } = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<"signing-in" | "ready" | "error">("signing-in");
  const [error, setError] = useState("");
  // The token stays in memory only: it is removed from the address bar (history, screenshots, referrers).
  const credentials = useRef({ company, token });
  useEffect(() => {
    if (window.location.search.includes("token=")) {
      window.history.replaceState(null, "", `/agency?company=${encodeURIComponent(company ?? "")}`);
    }
  }, [company]);

  const signIn = useCallback(async () => {
    sessionStorage.setItem("ghl-embed", "1");
    setPhase("signing-in");
    try {
      const { company: c, token: t } = credentials.current;
      if (!c || !t) throw new Error("This link is missing the company or token.");
      const tokens = await openAgencySession({ companyId: c, token: t });
      queryClient.clear();
      setTokens({ access: tokens.access, refresh: tokens.refresh });
      setPhase("ready");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in.");
      setPhase("error");
    }
  }, [queryClient]);

  useEffect(() => {
    // Returning from a client ("Back to clients"): the agency session is already restored.
    if (getTokens() && !supportSession()) {
      listAgencyClientsFn({ data: { pageSize: 1 } })
        .then(() => setPhase("ready"))
        .catch(() => void signIn());
    } else {
      void signIn();
    }
  }, [signIn]);

  if (phase === "signing-in")
    return <p className="p-10 text-center text-sm text-muted-foreground">Signing you in…</p>;
  if (phase === "error")
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldCheck className="mx-auto size-8 text-primary" />
        <p className="mt-3 font-medium">Agency sign-in failed</p>
        <p className="mt-1 text-sm text-muted-foreground">{error}</p>
        <Button className="mt-4" variant="outline" onClick={() => void signIn()}>
          Try again
        </Button>
      </div>
    );
  return <Clients onOpened={() => navigate({ to: "/dashboard" })} />;
}

function Clients({ onOpened }: { onOpened: () => void }) {
  const queryClient = useQueryClient();
  const [opening, setOpening] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState<ClientStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Wait for a pause in typing before asking the server; any change to the search or filters restarts at page 1.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setDebounced(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ["agency-clients", debounced, status, page, pageSize],
    queryFn: () => listAgencyClientsFn({ data: { q: debounced, status, page, pageSize } }),
    placeholderData: keepPreviousData, // keep the old rows on screen while the next page loads
  });
  const clients = query.data?.clients ?? [];
  const counts = query.data?.counts;
  const total = query.data?.count ?? 0;
  const totalPages = query.data?.total_pages ?? 1;
  const from = total === 0 ? 0 : ((query.data?.page ?? 1) - 1) * pageSize + 1;
  const to = Math.min(from + clients.length - 1, total);
  const TABS: { value: ClientStatus; label: string }[] = [
    { value: "all", label: "All" },
    { value: "opened", label: "Opened the app" },
    { value: "not_opened", label: "Not opened yet" },
  ];

  async function open(locationId: string) {
    setOpening(locationId);
    try {
      const r = await openAgencyClientFn({ data: { locationId } });
      const agency = getTokens();
      queryClient.clear(); // never mix one client's cached data with another's
      startSupportSession(agency, { access: r.access, refresh: r.refresh }, r.client_name);
      onOpened();
    } catch (e) {
      toast.error(
        e instanceof ApiError || e instanceof Error ? e.message : "Could not open this client.",
      );
      setOpening(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Your clients</h1>
        <p className="text-sm text-muted-foreground">
          Every sub-account that installed iMax Profit Tracker. Opening one is read-only and is
          recorded.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all clients by name, email or id…"
            className="pl-9"
            aria-label="Search clients"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <Button
              key={t.value}
              size="sm"
              variant={status === t.value ? "default" : "outline"}
              onClick={() => {
                setStatus(t.value);
                setPage(1);
              }}
            >
              {t.label}
              {counts && <span className="ml-1.5 tabular-nums opacity-70">{counts[t.value]}</span>}
            </Button>
          ))}
        </div>
      </div>
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Banks</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  Loading clients…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && clients.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  {debounced || status !== "all"
                    ? "No clients match your search or filter."
                    : "No sub-accounts have installed the app yet."}
                </TableCell>
              </TableRow>
            )}
            {clients.map((c) => (
              <TableRow key={c.location_id}>
                <TableCell>
                  <p className="font-medium">{c.name ?? c.location_id}</p>
                  <p className="text-xs text-muted-foreground">{c.email ?? c.note ?? ""}</p>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.bank_count}</TableCell>
                <TableCell className="text-right tabular-nums">{c.transaction_count}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.last_access_at ? relativeTime(c.last_access_at) : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  {c.can_open ? (
                    <Button
                      size="sm"
                      disabled={opening === c.location_id}
                      onClick={() => open(c.location_id)}
                    >
                      <Eye className="size-4" /> View books
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">{c.note}</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {total === 0 ? "0 clients" : `Showing ${from}–${to} of ${total} clients`}
          {query.isFetching && !query.isLoading ? " · updating…" : ""}
        </span>
        <div className="flex items-center gap-2">
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
          >
            <SelectTrigger className="h-8 w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n} per page
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <span className="tabular-nums">
            Page {query.data?.page ?? page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {(query.data?.recent_activity.length ?? 0) > 0 && (
        <div className="surface p-5">
          <h2 className="mb-2 text-sm font-semibold">Recent access (audit log)</h2>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {query.data!.recent_activity.map((a, i) => (
              <li key={i}>
                {relativeTime(a.at)} ·{" "}
                {a.action === "agency_open_client"
                  ? `opened ${clients.find((c) => c.location_id === a.location_id)?.name ?? a.location_id}`
                  : "signed in"}
                {a.who ? ` · ${a.who}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
