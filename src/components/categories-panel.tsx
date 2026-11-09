import { GAAP_TYPES, GAAP_TYPE_LABELS } from "@/api/gaap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Plus, Trash2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { deleteCategoryFn, listCategoriesFn, upsertCategoryFn } from "@/api/app";
import { detectTransfersFn, recategorizeAllFn } from "@/api/transactions";

const TYPES = GAAP_TYPES;

export function CategoriesPanel() {
  const queryClient = useQueryClient();
  const list = listCategoriesFn;
  const upsert = upsertCategoryFn;
  const del = deleteCategoryFn;
  const recategorize = recategorizeAllFn;

  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]>("operating_expense");

  const query = useQuery({ queryKey: ["categories"], queryFn: () => list({ data: undefined }) });

  const createMutation = useMutation({
    mutationFn: () => upsert({ data: { name, type } }),
    onSuccess: () => {
      toast.success("Category created");
      setName("");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Category deleted");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const recategorizeMutation = useMutation({
    mutationFn: () => recategorize({ data: undefined }),
    onSuccess: (r) => {
      toast.success(`${r.updated} transactions re-evaluated`);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const detectTransfersMutation = useMutation({
    mutationFn: () => detectTransfersFn({ data: undefined }),
    onSuccess: (r) => {
      toast.success(
        r.updated
          ? `${r.updated} transactions marked as transfers between your accounts`
          : "No new transfers between your accounts found",
      );
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const categories = query.data?.categories ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            US GAAP chart of accounts for small businesses, plus any custom categories you create.
          </p>
        </div>
        <Editable>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              title="Pairs money moved between your own accounts, like a card payment from checking, so it is not counted as an expense."
              onClick={() => detectTransfersMutation.mutate()}
              disabled={detectTransfersMutation.isPending}
            >
              <ArrowLeftRight className="size-4" /> Find transfers
            </Button>
            <Button
              variant="outline"
              onClick={() => recategorizeMutation.mutate()}
              disabled={recategorizeMutation.isPending}
            >
              <Wand2 className="size-4" /> Re-run categorization
            </Button>
          </div>
        </Editable>
      </div>

      <Editable>
        <div className="surface flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-48 flex-1">
            <label className="text-xs text-muted-foreground">New category name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Client software"
            />
          </div>
          <Select value={type} onValueChange={(v) => setType(v as (typeof TYPES)[number])}>
            <SelectTrigger className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {GAAP_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!name.trim() || createMutation.isPending}
          >
            <Plus className="size-4" /> Add category
          </Button>
        </div>
      </Editable>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {TYPES.map((t) => (
          <div key={t} className="surface p-5">
            <h3 className="mb-3 text-sm font-semibold">{GAAP_TYPE_LABELS[t]}</h3>
            <ul className="space-y-2">
              {categories
                .filter((c) => c.type === t)
                .map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-foreground/70" />
                      {c.name}
                    </span>
                    {c.is_system ? (
                      <Badge variant="outline" className="text-[10px]">
                        system
                      </Badge>
                    ) : (
                      <Editable>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate(c.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </Editable>
                    )}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
