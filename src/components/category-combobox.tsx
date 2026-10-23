import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GAAP_TYPES, GAAP_TYPE_LABELS, type GaapType } from "@/api/gaap";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; type: GaapType };

/** Searchable category picker grouped by GAAP type; the current type's group is listed first. */
export function CategoryCombobox({
  categories,
  value,
  onChange,
  preferType,
}: {
  categories: Cat[];
  value: string;
  onChange: (id: string, cat: Cat | null) => void;
  preferType?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = categories.find((c) => c.id === value);
  const order = [...GAAP_TYPES].sort((a, b) => (a === preferType ? -1 : b === preferType ? 1 : 0));
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
          <span className="truncate">{selected?.name ?? "Uncategorized"}</span>
          <ChevronsUpDown className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Search categories…" />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Uncategorized none"
                onSelect={() => {
                  onChange("none", null);
                  setOpen(false);
                }}
              >
                <Check className={cn("size-4", value === "none" ? "opacity-100" : "opacity-0")} />{" "}
                Uncategorized
              </CommandItem>
            </CommandGroup>
            {order.map((t) => {
              const list = categories.filter((c) => c.type === t);
              if (!list.length) return null;
              return (
                <CommandGroup key={t} heading={GAAP_TYPE_LABELS[t]}>
                  {list.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${GAAP_TYPE_LABELS[t]} ${c.id}`}
                      onSelect={() => {
                        onChange(c.id, c);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn("size-4", value === c.id ? "opacity-100" : "opacity-0")}
                      />{" "}
                      {c.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
