import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { listMembersFn, setMemberAccessFn, type Member } from "@/api/access";
import { Badge } from "@/components/ui/badge";
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
import { useAccess } from "@/hooks/use-access";
import { relativeTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Users — ImaxAccounting" }] }),
  component: UsersPage,
});

const LEVEL_LABEL: Record<NonNullable<Member["access"]>, string> = {
  none: "No access",
  viewer: "View only",
  editor: "Can edit",
  admin: "Administrator",
};

const LEVEL_HELP: Record<NonNullable<Member["access"]>, string> = {
  none: "Cannot open the accounting page.",
  viewer: "Sees dashboards, transactions and reports. Cannot change anything.",
  editor: "Everything a viewer can, plus categorize, reconcile, connect banks and record entries.",
  admin: "Everything an editor can, plus manage users and read the activity log.",
};

const AUTO = "auto";

function ghlRole(m: Member) {
  if (!m.ghl_type) return "—";
  const who = m.ghl_type === "agency" ? "Agency" : "Account";
  return `${who} ${m.ghl_role === "admin" ? "admin" : "user"}`;
}

function UsersPage() {
  const queryClient = useQueryClient();
  const access = useAccess();
  const query = useQuery({
    queryKey: ["members"],
    queryFn: () => listMembersFn({ data: undefined }),
  });
  const setAccess = useMutation({
    mutationFn: (d: { m: Member; access: Member["access"] }) =>
      setMemberAccessFn({
        data: { locationId: d.m.location_id, ghlUserId: d.m.ghl_user_id, access: d.access },
      }),
    onSuccess: (row) => {
      toast.success(
        `${row.name ?? row.email ?? "User"}: ${row.access ? LEVEL_LABEL[row.access] : `automatic (${LEVEL_LABEL[row.effective_access]})`}`,
      );
      queryClient.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const members = query.data?.members ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="text-sm text-muted-foreground">
          Who can open {access.location?.name ?? "this sub-account"}&apos;s accounting. Access
          follows each person&apos;s GoHighLevel role (agency staff administer, account admins edit,
          other account users have no access) unless you set it here.
        </p>
      </div>

      {(query.data?.warnings ?? []).map((w) => (
        <div
          key={w}
          className="rounded-lg border border-primary/40 bg-accent px-4 py-3 text-sm text-foreground/80"
        >
          {w} Until then this list shows people who have opened the accounting page at least once.
        </div>
      ))}

      <div className="surface overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Person</TableHead>
              <TableHead>GoHighLevel role</TableHead>
              <TableHead>Access</TableHead>
              <TableHead className="hidden md:table-cell">Last opened</TableHead>
              <TableHead className="hidden lg:table-cell">Set by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {query.isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Loading…
                </TableCell>
              </TableRow>
            )}
            {!query.isLoading && members.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                  Nobody has opened this sub-account&apos;s accounting yet.
                </TableCell>
              </TableRow>
            )}
            {members.map((m) => (
              <TableRow key={`${m.location_id}:${m.ghl_user_id}`}>
                <TableCell>
                  <div className="font-medium">
                    {m.name ?? m.email ?? m.ghl_user_id}
                    {m.is_you && (
                      <Badge variant="outline" className="ml-2 text-[10px]">
                        you
                      </Badge>
                    )}
                  </div>
                  {m.name && m.email && (
                    <div className="text-xs text-muted-foreground">{m.email}</div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">{ghlRole(m)}</TableCell>
                <TableCell>
                  <Select
                    value={m.access ?? AUTO}
                    disabled={m.is_you || setAccess.isPending}
                    onValueChange={(v) =>
                      setAccess.mutate({ m, access: v === AUTO ? null : (v as Member["access"]) })
                    }
                  >
                    <SelectTrigger className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={AUTO}>
                        Automatic · {LEVEL_LABEL[m.default_access]}
                      </SelectItem>
                      {(Object.keys(LEVEL_LABEL) as NonNullable<Member["access"]>[]).map((l) => (
                        <SelectItem key={l} value={l}>
                          {LEVEL_LABEL[l]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
                  {m.last_seen_at ? relativeTime(m.last_seen_at) : "never"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {m.access_set_by
                    ? `${m.access_set_by}${m.access_set_at ? ` · ${relativeTime(m.access_set_at)}` : ""}`
                    : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="surface p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" /> Access levels
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {(Object.keys(LEVEL_LABEL) as NonNullable<Member["access"]>[]).map((l) => (
            <div key={l}>
              <dt className="font-medium">{LEVEL_LABEL[l]}</dt>
              <dd className="text-muted-foreground">{LEVEL_HELP[l]}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted-foreground">
          Changes apply immediately, even to people who are signed in right now. You cannot change
          your own access.
        </p>
      </div>
    </div>
  );
}
