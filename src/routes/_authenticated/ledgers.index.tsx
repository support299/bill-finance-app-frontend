import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { z } from "zod";

import { GhlHeaderButtons, GhlLinkPanel } from "@/components/ghl-connect";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ACCOUNT_CLASSES,
  ACCOUNT_CLASS_LABELS,
  createLedgerFn,
  deleteLedgerFn,
  ledgerSummariesFn,
  listLedgersFn,
} from "@/api/ledgers";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ledgers/")({
  validateSearch: z.object({ ghl_link: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Ledgers — ImaxAccounting" },
      {
        name: "description",
        content:
          "Create ledger accounts with contact details and track every transaction filed against them.",
      },
      { property: "og:title", content: "Ledgers — ImaxAccounting" },
      {
        property: "og:description",
        content: "Ledger accounts with contact details and linked bank transactions.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LedgersPage,
});

function LedgersPage() {
  const { ghl_link } = Route.useSearch();
  const queryClient = useQueryClient();
  const list = listLedgersFn;
  const summaries = ledgerSummariesFn;
  const create = createLedgerFn;
  const del = deleteLedgerFn;

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [accountClass, setAccountClass] = useState<(typeof ACCOUNT_CLASSES)[number] | "">("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const ledgers = useQuery({ queryKey: ["ledgers"], queryFn: () => list({ data: undefined }) });
  const stats = useQuery({
    queryKey: ["ledger-summaries"],
    queryFn: () => summaries({ data: undefined }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          label,
          accountClass: accountClass as (typeof ACCOUNT_CLASSES)[number],
          contactName,
          contactEmail,
          contactPhone,
        },
      }),
    onSuccess: () => {
      toast.success("Ledger account created");
      setLabel("");
      setAccountClass("");
      setContactName("");
      setContactEmail("");
      setContactPhone("");
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Ledger account deleted");
      queryClient.invalidateQueries({ queryKey: ["ledgers"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const allRows = ledgers.data?.ledgers ?? [];
  const allTags = [
    ...new Map(allRows.flatMap((l) => l.tags ?? []).map((t) => [t.id, t])).values(),
  ] as {
    id: string;
    name: string;
  }[];
  const q = search.trim().toLowerCase();
  const rows = allRows.filter((l) => {
    if (tagFilter && !(l.tags ?? []).some((t) => t.id === tagFilter)) return false;
    if (!q) return true;
    return (
      l.label.toLowerCase().includes(q) ||
      (l.contact_name ?? "").toLowerCase().includes(q) ||
      (l.tags ?? []).some((t) => t.name.toLowerCase().includes(q))
    );
  });
  const summaryMap = stats.data?.summaries ?? {};

  return (
    <div className="space-y-6">
      <GhlLinkPanel code={ghl_link} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Ledgers</h1>
          <p className="text-sm text-muted-foreground">
            Ledger accounts group transactions by counterparty. Add a label and, optionally, contact
            details.
          </p>
        </div>
        <div className="flex gap-2">
          <GhlHeaderButtons />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" /> New ledger account
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New ledger account</DialogTitle>
                <DialogDescription>
                  Label is required. Contact information is optional.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Label *</label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="e.g. Acme Supplies"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Account class *</label>
                  <Select
                    value={accountClass}
                    onValueChange={(v) => setAccountClass(v as typeof accountClass)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a class" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_CLASSES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {ACCOUNT_CLASS_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Contact name</label>
                  <Input value={contactName} onChange={(e) => setContactName(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Email</label>
                  <Input
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    type="email"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Phone</label>
                  <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={label.trim().length === 0 || !accountClass || createMutation.isPending}
                >
                  Create ledger
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by label, contact or tag"
          className="max-w-xs"
        />
        {allTags.map((t) => (
          <Badge
            key={t.id}
            variant={tagFilter === t.id ? "default" : "outline"}
            className="cursor-pointer"
            onClick={() => setTagFilter(tagFilter === t.id ? null : t.id)}
          >
            {t.name}
          </Badge>
        ))}
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Label</TableHead>
              <TableHead>Class</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Transactions</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No ledger accounts yet. Create one to start filing transactions against it.
                </TableCell>
              </TableRow>
            )}
            {rows.map((l) => {
              const s = summaryMap[l.id] ?? { count: 0, net: 0 };
              return (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/ledgers/$ledgerId"
                      params={{ ledgerId: l.id }}
                      className="underline-offset-4 hover:underline"
                    >
                      {l.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {ACCOUNT_CLASS_LABELS[l.account_class] ?? "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(l.tags ?? []).map((t) => (
                        <Badge key={t.id} variant="secondary">
                          {t.name}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>{l.contact_name ?? "—"}</TableCell>
                  <TableCell>{l.contact_email ?? "—"}</TableCell>
                  <TableCell>{l.contact_phone ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.count}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(l.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
