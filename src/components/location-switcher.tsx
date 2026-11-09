import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  listSwitchLocationsFn,
  openGhlSso,
  requestGhlUserData,
  stashedSsoPayload,
  stashSsoPayload,
} from "@/api/access";
import { auth } from "@/api/auth";
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
import { useAccess } from "@/hooks/use-access";
import { cn } from "@/lib/utils";

/** Agency staff: move between the agency's sub-accounts without leaving the page. */
export function LocationSwitcher() {
  const { can_switch, location } = useAccess();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["switch-locations"],
    queryFn: () => listSwitchLocationsFn({ data: undefined }),
    enabled: can_switch && open,
  });
  if (!can_switch) return null;

  async function switchTo(locationId: string) {
    setOpen(false);
    setSwitching(true);
    try {
      let payload = stashedSsoPayload();
      if (!payload) {
        payload = await requestGhlUserData();
        if (payload) stashSsoPayload(payload);
      }
      if (!payload)
        throw new Error("GoHighLevel did not confirm who you are. Reload the page and try again.");
      const session = await openGhlSso(payload, locationId);
      await queryClient.cancelQueries();
      queryClient.clear();
      auth.setSession({ access: session.access, refresh: session.refresh });
      toast.success(`Now viewing ${session.me.location?.name ?? "the sub-account"}`);
      navigate({ to: "/dashboard", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not switch sub-account.");
    } finally {
      setSwitching(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="max-w-56 gap-2"
          disabled={switching}
          title="Switch sub-account"
        >
          <Building2 className="size-4 shrink-0" />
          <span className="truncate">
            {location?.name ?? location?.location_id ?? "Sub-account"}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <Command>
          <CommandInput placeholder="Find a sub-account…" />
          <CommandList>
            <CommandEmpty>{query.isLoading ? "Loading…" : "No sub-accounts found."}</CommandEmpty>
            <CommandGroup heading="Your agency's sub-accounts">
              {(query.data?.locations ?? []).map((loc) => (
                <CommandItem
                  key={loc.location_id}
                  value={`${loc.name ?? ""} ${loc.location_id}`}
                  disabled={loc.current || !loc.can_open}
                  onSelect={() => switchTo(loc.location_id)}
                >
                  <Check className={cn("size-4", loc.current ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{loc.name ?? loc.location_id}</span>
                  {!loc.can_open && (
                    <span className="ml-auto text-xs text-muted-foreground">linked elsewhere</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
