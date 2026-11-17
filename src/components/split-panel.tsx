import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Scissors, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Editable } from "@/components/editable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { listLedgersFn } from "@/api/ledgers";
import { listProjectsFn, PROJECT_ROLE_LABELS, PROJECT_ROLES } from "@/api/projects";
import {
  getSplitsFn,
  readSplitStatementFn,
  saveSplitsFn,
  type SplitLine,
} from "@/api/transactions";
import { formatCurrency } from "@/lib/format";

interface Category {
  id: string;
  name: string;
}

/** A line as typed: amounts are positive numbers (money in the direction of the transaction); a negative one is a credit. */
interface Row {
  key: number;
  amount: string;
  reference: string;
  categoryId: string;
  projectId: string;
  role: string;
  ledgerId: string;
}

const NONE = "none";
const blank = (key: number): Row => ({
  key,
  amount: "",
  reference: "",
  categoryId: NONE,
  projectId: NONE,
  role: "other",
  ledgerId: NONE,
});
const cents = (n: number) => Math.round(n * 100);

/**
 * Splits one transaction into parts (a check that pays many invoices, a deposit holding several clients' payments), each with its
 * own category, project and ledger. The parts must add up to the transaction's amount. Lines can be typed or read from a statement.
 */
export function SplitPanel({
  transactionId,
  amount,
  categories,
  splittable,
}: {
  transactionId: string;
  amount: number;
  categories: Category[];
  /** Transfers and GoHighLevel invoices/payments cannot be split. */
  splittable: boolean;
}) {
  const queryClient = useQueryClient();
  const key = ["splits", transactionId];
  const sign = amount < 0 ? -1 : 1;
  const total = Math.abs(amount);
  const [rows, setRows] = useState<Row[] | null>(null); // null = not editing
  const [statement, setStatement] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const nextKey = useRef(1);
  const file = useRef<HTMLInputElement>(null);

  const existing = useQuery({
    queryKey: key,
    queryFn: () => getSplitsFn({ data: { transactionId } }),
  });
  const projects = useQuery({
    queryKey: ["projects"],
    queryFn: () => listProjectsFn({ data: undefined }),
  });
  const ledgers = useQuery({ queryKey: ["ledgers"], queryFn: () => listLedgersFn() });
  const saved = existing.data?.lines ?? [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries(); // reports, project totals and the transaction list all change
  };
  const save = useMutation({
    mutationFn: (lines: SplitLine[]) => saveSplitsFn({ data: { transactionId, lines } }),
    onSuccess: (_d, lines) => {
      toast.success(lines.length ? "Split saved" : "Split removed");
      setRows(null);
      setStatement(null);
      setProblems([]);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const read = useMutation({
    mutationFn: (text: string) => readSplitStatementFn({ data: { transactionId, text } }),
    onSuccess: (r) => {
      setRows(
        r.lines.map((l) => ({
          key: nextKey.current++,
          amount: String(Number(l.amount) * sign),
          reference: l.reference,
          categoryId: l.category_id ?? NONE,
          projectId: l.project_id ?? NONE,
          role: l.project_role ?? "other",
          ledgerId: l.ledger_id ?? NONE,
        })),
      );
      setProblems(r.problems.map((p) => `Line ${p.line}: ${p.reason}`));
      setStatement(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const edit = () => {
    const start = saved.length
      ? saved.map((l): Row => ({
          key: nextKey.current++,
          amount: String(Number(l.amount) * sign),
          reference: l.reference,
          categoryId: l.category_id ?? NONE,
          projectId: l.project_id ?? NONE,
          role: l.project_role ?? "other",
          ledgerId: l.ledger_id ?? NONE,
        }))
      : [blank(nextKey.current++), blank(nextKey.current++)];
    setRows(start);
  };
  const patch = (k: number, change: Partial<Row>) =>
    setRows((rs) => (rs ?? []).map((r) => (r.key === k ? { ...r, ...change } : r)));

  const typed = (rows ?? []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const left = (cents(total) - cents(typed)) / 100;
  const ready =
    rows !== null && rows.length >= 2 && cents(left) === 0 && rows.every((r) => Number(r.amount));

  const submit = () =>
    save.mutate(
      (rows ?? []).map((r) => ({
        amount: (Number(r.amount) * sign).toFixed(2),
        reference: r.reference,
        category_id: r.categoryId === NONE ? null : r.categoryId,
        project_id: r.projectId === NONE ? null : r.projectId,
        project_role: r.projectId === NONE ? null : (r.role as SplitLine["project_role"]),
        ledger_id: r.ledgerId === NONE ? null : r.ledgerId,
      })),
    );

  if (!splittable) return null;

  if (rows === null) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Scissors className="size-4 text-muted-foreground" />
          <p className="text-sm font-medium">Split payment</p>
          {saved.length > 0 && <Badge variant="secondary">{saved.length} lines</Badge>}
        </div>
        {saved.length > 0 && (
          <ul className="space-y-1 text-sm">
            {saved.map((l) => (
              <li key={l.id} className="flex justify-between gap-3">
                <span className="truncate text-muted-foreground">
                  {l.reference || "—"}
                  {l.project ? ` · ${l.project}` : ""}
                  {l.category ? ` · ${l.category}` : ""}
                </span>
                <span className="tabular-nums">{formatCurrency(Math.abs(Number(l.amount)))}</span>
              </li>
            ))}
          </ul>
        )}
        <Editable>
          <Button variant="outline" size="sm" onClick={edit}>
            {saved.length ? "Edit the split" : "Split this transaction"}
          </Button>
        </Editable>
        {saved.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Use this when one check pays many invoices, or one deposit holds several clients'
            payments. Each line can have its own project.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Split {formatCurrency(total)} into lines</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setStatement(statement === null ? "" : null)}
        >
          <Upload className="mr-1 size-3.5" /> From a statement
        </Button>
      </div>

      {statement !== null && (
        <div className="space-y-2 rounded-md bg-muted/40 p-2">
          <p className="text-xs text-muted-foreground">
            Paste rows from the statement or choose its CSV. It needs an Amount column; Invoice,
            Project and Category columns are optional. Nothing is saved until you review it.
          </p>
          <textarea
            className="h-24 w-full rounded-md border bg-background p-2 text-xs"
            placeholder={"Invoice,Amount,Project\nINV-1001,600.00,Alpha"}
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!statement.trim() || read.isPending}
              onClick={() => read.mutate(statement)}
            >
              Read lines
            </Button>
            <input
              ref={file}
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) read.mutate(await f.text());
              }}
            />
            <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
              Choose CSV file
            </Button>
          </div>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="space-y-0.5 rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.key} className="space-y-1.5 rounded-md bg-muted/30 p-2">
            <div className="flex gap-2">
              <Input
                className="h-8 flex-1"
                placeholder="Invoice or note"
                value={r.reference}
                onChange={(e) => patch(r.key, { reference: e.target.value })}
                aria-label={`Line ${i + 1} invoice or note`}
              />
              <Input
                className="h-8 w-28 text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                value={r.amount}
                onChange={(e) => patch(r.key, { amount: e.target.value })}
                aria-label={`Line ${i + 1} amount`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Pick
                label="Category"
                value={r.categoryId}
                onChange={(v) => patch(r.key, { categoryId: v })}
                none="Same as transaction"
                options={categories.map((c) => ({ id: c.id, name: c.name }))}
              />
              <Pick
                label="Project"
                value={r.projectId}
                onChange={(v) => patch(r.key, { projectId: v })}
                none="No project"
                options={(projects.data?.projects ?? []).map((p) => ({ id: p.id, name: p.name }))}
              />
              <Pick
                label="Customer / vendor"
                value={r.ledgerId}
                onChange={(v) => patch(r.key, { ledgerId: v })}
                none="Same as transaction"
                options={(ledgers.data?.ledgers ?? []).map((l) => ({ id: l.id, name: l.label }))}
              />
              {r.projectId !== NONE && (
                <Select value={r.role} onValueChange={(v) => patch(r.key, { role: v })}>
                  <SelectTrigger
                    className="h-8 text-xs"
                    aria-label={`Line ${i + 1} project cost type`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {PROJECT_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={() => setRows([...rows, blank(nextKey.current++)])}
      >
        <Plus className="mr-1 size-3.5" /> Add line
      </Button>

      <p
        className={`text-sm font-medium ${cents(left) === 0 ? "text-income" : "text-destructive"}`}
        aria-live="polite"
      >
        {cents(left) === 0
          ? "The lines add up."
          : left > 0
            ? `${formatCurrency(left)} still to assign`
            : `${formatCurrency(-left)} too much`}
        <span className="ml-2 font-normal text-muted-foreground">
          {formatCurrency(typed)} of {formatCurrency(total)}
        </span>
      </p>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={!ready || save.isPending} onClick={submit}>
          Save split
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setRows(null)}>
          Cancel
        </Button>
        {saved.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive"
            disabled={save.isPending}
            onClick={() => save.mutate([])}
          >
            Remove split
          </Button>
        )}
      </div>
    </div>
  );
}

function Pick({
  label,
  value,
  onChange,
  none,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  none: string;
  options: { id: string; name: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{none}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.id} value={o.id}>
            {o.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
