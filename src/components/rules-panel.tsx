import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RulePreview } from "@/components/rule-preview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Editable } from "@/components/editable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { deleteRuleFn, listCategoriesFn, listRulesFn, updateRuleFn } from "@/api/app";
import { listLedgersFn } from "@/api/ledgers";
import { createRuleFn } from "@/api/transactions";

export function RulesPanel() {
  const queryClient = useQueryClient();
  const list = listRulesFn;
  const cats = listCategoriesFn;
  const create = createRuleFn;
  const update = updateRuleFn;
  const del = deleteRuleFn;
  const ledgersFn = listLedgersFn;

  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "starts_with" | "exact" | "regex">(
    "contains",
  );
  const [categoryId, setCategoryId] = useState("");
  const [ledgerId, setLedgerId] = useState("");

  const rules = useQuery({ queryKey: ["rules"], queryFn: () => list({ data: undefined }) });
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => cats({ data: undefined }),
  });
  const ledgers = useQuery({
    queryKey: ["ledgers"],
    queryFn: () => ledgersFn({ data: undefined }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          keyword,
          matchType,
          categoryId: categoryId || null,
          ledgerId: ledgerId === "none" || !ledgerId ? null : ledgerId,
          applyToExisting: true,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Rule created · applied to ${r.applied} existing transactions`);
      setKeyword("");
      setLedgerId("");
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; active: boolean }) => update({ data: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rules"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Rule deleted");
      queryClient.invalidateQueries({ queryKey: ["rules"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Categorization rules</h2>
        <p className="text-sm text-muted-foreground">
          Rules take priority over provider categories. Lower priority numbers run first.
        </p>
      </div>

      <div className="surface flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <label className="text-xs text-muted-foreground">Keyword</label>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="e.g. Netflix"
          />
        </div>
        <Select
          value={matchType}
          onValueChange={(v) => setMatchType(v as "contains" | "starts_with" | "exact" | "regex")}
        >
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="contains">Contains</SelectItem>
            <SelectItem value="starts_with">Starts with</SelectItem>
            <SelectItem value="exact">Exact</SelectItem>
            <SelectItem value="regex">Regex</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Category (optional)" />
          </SelectTrigger>
          <SelectContent>
            {(categories.data?.categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name} · {c.type}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ledgerId} onValueChange={setLedgerId}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Ledger account (optional)" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No ledger</SelectItem>
            {(ledgers.data?.ledgers ?? []).map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Editable>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={
              keyword.trim().length < 2 ||
              (!categoryId && (!ledgerId || ledgerId === "none")) ||
              createMutation.isPending
            }
          >
            <Plus className="size-4" /> Create rule
          </Button>
        </Editable>
        <div className="w-full">
          <RulePreview keyword={keyword} matchType={matchType} categoryId={categoryId || null} />
        </div>
      </div>

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Keyword</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Ledger</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Active</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rules.data?.rules ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  No rules yet. Create one above, or let the app suggest rules when you recategorize
                  a transaction.
                </TableCell>
              </TableRow>
            )}
            {(rules.data?.rules ?? []).map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.keyword}</TableCell>
                <TableCell className="capitalize">{r.match_type.replace("_", " ")}</TableCell>
                <TableCell>{r.categories?.name ?? "—"}</TableCell>
                <TableCell>{r.ledgers?.label ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.source === "user" ? "default" : "secondary"}>{r.source}</Badge>
                </TableCell>
                <TableCell>{r.priority}</TableCell>
                <TableCell>
                  <Switch
                    checked={r.active}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: r.id, active: v })}
                  />
                </TableCell>
                <TableCell>
                  <Editable>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </Editable>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
