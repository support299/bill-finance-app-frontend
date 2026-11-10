import { GAAP_TYPES, GAAP_TYPE_LABELS } from "@/api/gaap";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowLeftRight, ArrowUp, Plus, Trash2, Wand2 } from "lucide-react";
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
import {
  deleteCategoryFn,
  listCategoriesFn,
  reorderCategoriesFn,
  upsertCategoryFn,
} from "@/api/app";
import { orderWithChildren } from "@/lib/category-order";
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
  const [parentId, setParentId] = useState("none");

  const query = useQuery({ queryKey: ["categories"], queryFn: () => list({ data: undefined }) });

  const createMutation = useMutation({
    mutationFn: () =>
      upsert({ data: { name, type, ...(parentId !== "none" ? { parentId } : {}) } }),
    onSuccess: () => {
      toast.success(parentId !== "none" ? "Sub-category created" : "Category created");
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

  const reorderMutation = useMutation({
    mutationFn: (ids: string[]) => reorderCategoriesFn({ data: { ids } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["categories"] });
      queryClient.invalidateQueries({ queryKey: ["accounting"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Moves a category one step up or down among its siblings (same type and parent) and saves the order. */
  function move(id: string, dir: -1 | 1) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) return;
    const siblings = orderWithChildren(categories.filter((c) => c.type === cat.type))
      .filter((c) => (c.parent_category ?? null) === (cat.parent_category ?? null))
      .map((c) => c.id);
    const i = siblings.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= siblings.length) return;
    [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
    reorderMutation.mutate(siblings);
  }

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
  // Only top-level categories of the chosen type can be a parent (sub-categories go one level deep).
  const parentOptions = orderWithChildren(
    categories.filter((c) => c.type === type && !c.parent_category),
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Categories</h2>
          <p className="text-sm text-muted-foreground">
            US GAAP chart of accounts for small businesses, plus any custom categories you create.
            Use the arrows to set the order your Profit &amp; loss lists them in.
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
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v as (typeof TYPES)[number]);
              setParentId("none");
            }}
          >
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
          <div>
            <label className="text-xs text-muted-foreground">Under (optional)</label>
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="w-56" aria-label="Parent category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Top level</SelectItem>
                {parentOptions.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
              {orderWithChildren(categories.filter((c) => c.type === t)).map((c, _i, all) => {
                const sibs = all.filter(
                  (x) => (x.parent_category ?? null) === (c.parent_category ?? null),
                );
                const pos = sibs.findIndex((x) => x.id === c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2" style={{ paddingLeft: c.depth * 18 }}>
                      <span
                        className={`rounded-full bg-foreground/70 ${c.depth ? "size-1.5" : "size-2.5"}`}
                      />
                      {c.name}
                    </span>
                    <span className="flex items-center gap-1">
                      <Editable>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Move ${c.name} up`}
                          disabled={pos <= 0 || reorderMutation.isPending}
                          onClick={() => move(c.id, -1)}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Move ${c.name} down`}
                          disabled={pos >= sibs.length - 1 || reorderMutation.isPending}
                          onClick={() => move(c.id, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                      </Editable>
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
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
