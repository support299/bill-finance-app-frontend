import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { FileText, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { getProfileFn } from "@/api/app";
import { listLedgersFn } from "@/api/ledgers";
import {
  createProjectFn,
  deleteProjectFn,
  getProjectReportFn,
  listProjectsFn,
  PROJECT_ROLE_LABELS,
  updateProjectFn,
} from "@/api/projects";
import { formatCurrency, formatDate } from "@/lib/format";
import { downloadProjectPdf } from "@/lib/project-pdf";

export const Route = createFileRoute("/_authenticated/projects")({
  validateSearch: (raw: Record<string, unknown>): { id?: string } =>
    typeof raw["id"] === "string" ? { id: raw["id"] } : {},
  head: () => ({
    meta: [
      { title: "Projects — ImaxAccounting" },
      {
        name: "description",
        content: "Track the deposit, equipment, labor and profit of every job.",
      },
    ],
  }),
  component: ProjectsPage,
});

const money = (v: string | number) => formatCurrency(Number(v));

function ProjectsPage() {
  const { id } = Route.useSearch();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Tie deposits and costs to a job to see its profit when it&apos;s done.
        </p>
      </div>
      {id ? <ProjectDetail id={id} /> : <ProjectList />}
    </div>
  );
}

function ProjectList() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn({ data: undefined }),
  });
  const ledgers = useQuery({
    queryKey: ["ledgers-list"],
    queryFn: () => listLedgersFn({ data: undefined }),
  });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customer, setCustomer] = useState("none");
  const [budget, setBudget] = useState("");

  const create = useMutation({
    mutationFn: () =>
      createProjectFn({
        data: {
          name: name.trim(),
          ledgerId: customer === "none" ? null : customer,
          budget: budget === "" ? null : Number(budget),
        },
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
      setBudget("");
      navigate({ to: "/projects", search: { id: p.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = projects.data?.projects ?? [];
  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setOpen(true)}>
          <Plus className="size-4" /> New project
        </Button>
      </div>
      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">Costs</TableHead>
              <TableHead className="text-right">Profit</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No projects yet. Create one, then add transactions to it from Bank Transactions.
                </TableCell>
              </TableRow>
            )}
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "open" ? "default" : "outline"}>{p.status}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{money(p.totals.revenue)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {money(p.totals.total_costs)}
                </TableCell>
                <TableCell
                  className={`text-right font-semibold tabular-nums ${
                    Number(p.totals.profit) < 0 ? "text-destructive" : ""
                  }`}
                >
                  {money(p.totals.profit)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/projects" search={{ id: p.id }}>
                      Open
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                placeholder="Jim Smith – Kitchen remodel"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Customer (optional)</Label>
              <Select value={customer} onValueChange={setCustomer}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No customer</SelectItem>
                  {(ledgers.data?.ledgers ?? []).map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cost budget (optional)</Label>
              <Input
                type="number"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
              Create project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad" | undefined;
}) {
  return (
    <div className="surface p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-bold tabular-nums ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-destructive" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ProjectDetail({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ["project", id],
    queryFn: () => getProjectReportFn({ data: { id } }),
  });
  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => getProfileFn({ data: undefined }),
  });
  const ledgers = useQuery({
    queryKey: ["ledgers-list"],
    queryFn: () => listLedgersFn({ data: undefined }),
  });

  const update = useMutation({
    mutationFn: (v: { status: "open" | "finished" }) => updateProjectFn({ data: { id, ...v } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: () => deleteProjectFn({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      navigate({ to: "/projects", search: {} });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const data = query.data;
  if (!data) return <p className="text-sm text-muted-foreground">Project not found.</p>;
  const { project, report: r } = data;
  const customer =
    (ledgers.data?.ledgers ?? []).find((l) => l.id === project.ledger_id)?.label ?? null;
  const profit = Number(r.profit);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects" search={{}}>
              ← All projects
            </Link>
          </Button>
          <h2 className="text-lg font-semibold">{project.name}</h2>
          <Badge variant={project.status === "open" ? "default" : "outline"}>
            {project.status}
          </Badge>
          {customer && <span className="text-sm text-muted-foreground">for {customer}</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadProjectPdf(project, r, customer, profile.data?.profile?.business_name)
            }
          >
            <FileText className="size-4" /> Download PDF
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/transactions" search={{ project: project.id }}>
              View in Transactions
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              update.mutate({ status: project.status === "open" ? "finished" : "open" })
            }
          >
            {project.status === "open" ? "Mark finished" : "Reopen"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() =>
              window.confirm(
                "Delete this project? Its transactions are kept, just no longer tied to a project.",
              ) && remove.mutate()
            }
          >
            Delete
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Stat label="Deposits / revenue" value={money(r.revenue)} />
        <Stat label={PROJECT_ROLE_LABELS.equipment} value={`-${money(r.costs.equipment)}`} />
        <Stat label={PROJECT_ROLE_LABELS.labor} value={`-${money(r.costs.labor)}`} />
        <Stat label={PROJECT_ROLE_LABELS.other} value={`-${money(r.costs.other)}`} />
        <Stat label="Total costs" value={`-${money(r.total_costs)}`} />
        <Stat
          label={r.margin_pct === null ? "Profit" : `Profit · ${r.margin_pct.toFixed(1)}% margin`}
          value={money(r.profit)}
          tone={profit < 0 ? "bad" : profit > 0 ? "good" : undefined}
        />
      </div>
      {r.budget && (
        <p className="text-sm text-muted-foreground">
          Budget {money(r.budget)} · {(r.budget_used_pct ?? 0).toFixed(0)}% of it spent so far
        </p>
      )}
      {r.ignored_count > 0 && (
        <p className="text-xs text-muted-foreground">
          {r.ignored_count} transfer/balance-sheet transaction(s) on this project are not counted as
          income or cost.
        </p>
      )}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="text-right">Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.transactions.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nothing on this project yet. In Bank Transactions, select the deposit and the
                  costs, then choose &ldquo;Add to project…&rdquo;.
                </TableCell>
              </TableRow>
            )}
            {r.transactions.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="whitespace-nowrap">{formatDate(t.date)}</TableCell>
                <TableCell>{t.description}</TableCell>
                <TableCell className="text-muted-foreground">{t.category}</TableCell>
                <TableCell>{t.role ? PROJECT_ROLE_LABELS[t.role] : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{money(t.amount)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
