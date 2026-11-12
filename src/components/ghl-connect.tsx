import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Link2, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  confirmGhlLinkFn,
  getGhlLinkOptionsFn,
  listGhlLinksFn,
  startGhlConnect,
  syncGhlInvoicesFn,
  type GhlLocationSummary,
} from "@/api/ghl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const LINKS_KEY = ["ghl-links"];

function useLinks() {
  return useQuery({ queryKey: LINKS_KEY, queryFn: () => listGhlLinksFn() });
}

/** Header buttons: "Connect GoHighLevel" until a location is linked, then "Sync invoices" + "Add location". */
export function GhlHeaderButtons() {
  const queryClient = useQueryClient();
  const links = useLinks();
  const sync = useMutation({
    mutationFn: () => syncGhlInvoicesFn(),
    onSuccess: (r) => {
      toast.success(`Synced ${r.synced} invoices${r.failed ? `, ${r.failed} failed` : ""}`);
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const linked = (links.data?.locations.length ?? 0) > 0;

  if (!linked) {
    return (
      <Button variant="outline" onClick={startGhlConnect} disabled={links.isLoading}>
        <Link2 className="mr-2 h-4 w-4" /> Connect GoHighLevel
      </Button>
    );
  }
  return (
    <>
      <Button variant="outline" onClick={() => sync.mutate()} disabled={sync.isPending}>
        <RefreshCw className={`mr-2 h-4 w-4 ${sync.isPending ? "animate-spin" : ""}`} />
        {sync.isPending ? "Syncing invoices…" : "Sync invoices"}
      </Button>
      <Button
        variant="ghost"
        onClick={startGhlConnect}
        title="Connect another GoHighLevel location"
      >
        <Plus className="mr-1 h-4 w-4" /> Add location
      </Button>
    </>
  );
}

/** Linked locations (with disconnect) and the confirmation dialog shown when GHL sends the user back with a link code. */
export function GhlLinkPanel({ code }: { code: string | undefined }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const links = useLinks();
  const [chosen, setChosen] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const dialogOpen = Boolean(code) && !dismissed;

  const options = useQuery({
    queryKey: ["ghl-link-options", code],
    queryFn: () => getGhlLinkOptionsFn({ data: { code: code! } }),
    enabled: dialogOpen,
    retry: false,
  });

  const close = () => {
    setDismissed(true);
    navigate({ to: "/ledgers", search: {}, replace: true });
  };

  const confirm = useMutation({
    mutationFn: (locationId: string | undefined) =>
      confirmGhlLinkFn({ data: { code: code!, locationId } }),
    onSuccess: (loc) => {
      toast.success(`${loc.name ?? "Location"} connected. Importing invoices…`);
      queryClient.invalidateQueries();
      close();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const choices = options.data?.locations ?? [];
  const single = options.data && !options.data.choose ? choices[0] : undefined;
  const selectable = choices.filter((l) => l.link_state !== "elsewhere");

  return (
    <>
      {(links.data?.locations.length ?? 0) > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {links.data!.locations.map((l: GhlLocationSummary) => (
            <Badge key={l.location_id} variant="secondary" className="gap-1.5 py-1">
              {l.name ?? l.location_id}
            </Badge>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect GoHighLevel location</DialogTitle>
            <DialogDescription>
              {options.isError
                ? "This connection link can no longer be used."
                : "Link a GoHighLevel location to this workspace. Its invoices will be imported into your ledgers."}
            </DialogDescription>
          </DialogHeader>

          {options.isLoading && (
            <p className="text-sm text-muted-foreground">Checking the connection…</p>
          )}
          {options.isError && (
            <p className="text-sm text-destructive">{(options.error as Error).message}</p>
          )}

          {single && (
            <div className="rounded-md border p-3 text-sm">
              <p className="font-medium">{single.name ?? single.location_id}</p>
              {single.email && <p className="text-muted-foreground">{single.email}</p>}
              {single.link_state === "elsewhere" && (
                <p className="mt-2 text-destructive">
                  This location is already linked to another workspace.
                </p>
              )}
              {single.link_state === "here" && (
                <p className="mt-2 text-muted-foreground">Already linked to this workspace.</p>
              )}
            </div>
          )}

          {options.data?.choose && (
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Location</label>
              <Select value={chosen} onValueChange={setChosen}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a location" />
                </SelectTrigger>
                <SelectContent>
                  {selectable.map((l) => (
                    <SelectItem key={l.location_id} value={l.location_id}>
                      {l.name ?? l.location_id}
                      {l.link_state === "here" ? " (linked)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectable.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No available locations were found for this installation.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button
              onClick={() => confirm.mutate(single ? undefined : chosen)}
              disabled={
                confirm.isPending ||
                options.isLoading ||
                options.isError ||
                single?.link_state === "elsewhere" ||
                (!single && !chosen)
              }
            >
              {confirm.isPending ? "Connecting…" : "Connect"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
