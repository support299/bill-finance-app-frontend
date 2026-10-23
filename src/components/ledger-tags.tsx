import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addLedgerTagFn, listTagsFn, removeLedgerTagFn } from "@/api/ledgers";

export function LedgerTags({
  ledgerId,
  tags,
}: {
  ledgerId: string;
  tags: { id: string; name: string }[];
}) {
  const qc = useQueryClient();
  const listTags = listTagsFn;
  const add = addLedgerTagFn;
  const remove = removeLedgerTagFn;
  const [name, setName] = useState("");
  const all = useQuery({ queryKey: ["ledger-tags"], queryFn: () => listTags({ data: undefined }) });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["ledger", ledgerId] });
    qc.invalidateQueries({ queryKey: ["ledgers"] });
    qc.invalidateQueries({ queryKey: ["ledger-tags"] });
  };
  const addM = useMutation({
    mutationFn: (n: string) => add({ data: { ledgerId, name: n } }),
    onSuccess: () => {
      setName("");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeM = useMutation({
    mutationFn: (tagId: string) => remove({ data: { ledgerId, tagId } }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const attached = new Set(tags.map((t) => t.id));
  const q = name.trim().toLowerCase();
  const suggestions = (all.data?.tags ?? [])
    .filter((t) => !attached.has(t.id) && (!q || t.name.toLowerCase().includes(q)))
    .slice(0, 8);
  const exact = (all.data?.tags ?? []).some((t) => t.name.toLowerCase() === q);

  return (
    <div className="space-y-3">
      <label className="text-xs text-muted-foreground">Tags</label>
      <div className="flex flex-wrap gap-2">
        {tags.length === 0 && <span className="text-xs text-muted-foreground">No tags yet.</span>}
        {tags.map((t) => (
          <Badge key={t.id} variant="secondary" className="gap-1">
            {t.name}
            <button
              type="button"
              aria-label={`Remove ${t.name}`}
              onClick={() => removeM.mutate(t.id)}
            >
              <X className="size-3" />
            </button>
          </Badge>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (q) addM.mutate(name.trim());
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Search or create a tag"
        />
        <Button type="submit" variant="outline" disabled={!q || addM.isPending}>
          <Plus className="size-4" /> {q && !exact ? "Create" : "Add"}
        </Button>
      </form>
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((t) => (
            <Badge
              key={t.id}
              variant="outline"
              className="cursor-pointer"
              onClick={() => addM.mutate(t.name)}
            >
              + {t.name}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
