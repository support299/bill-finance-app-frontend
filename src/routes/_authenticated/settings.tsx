import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { CategoriesPanel } from "@/components/categories-panel";
import { RulesPanel } from "@/components/rules-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { auth } from "@/api/auth";
import { getProfileFn, getSyncStatusFn, updateProfileFn } from "@/api/app";
import { formatDate, relativeTime } from "@/lib/format";
import { plaidConfigStatusFn } from "@/api/plaid";

const settingsSearchSchema = z.object({
  tab: z.enum(["general", "categories", "rules"]).default("general").catch("general"),
});

export const Route = createFileRoute("/_authenticated/settings")({
  validateSearch: settingsSearchSchema,
  head: () => ({
    meta: [
      { title: "Settings — ImaxAccounting" },
      {
        name: "description",
        content:
          "Manage your profile, categories, categorization rules, sync history and security.",
      },
      { property: "og:title", content: "Settings — ImaxAccounting" },
      {
        property: "og:description",
        content: "Profile, categories, rules, security and synchronization settings.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Profile, categories, categorization rules and synchronization.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({
            search: (prev) => ({ ...prev, tab: v as "general" | "categories" | "rules" }),
            replace: true,
          })
        }
      >
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6">
          <GeneralPanel />
        </TabsContent>
        <TabsContent value="categories" className="mt-6">
          <CategoriesPanel />
        </TabsContent>
        <TabsContent value="rules" className="mt-6">
          <RulesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GeneralPanel() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const profileFn = getProfileFn;
  const updateFn = updateProfileFn;
  const syncFn = getSyncStatusFn;
  const configFn = plaidConfigStatusFn;

  const profile = useQuery({
    queryKey: ["profile"],
    queryFn: () => profileFn({ data: undefined }),
  });
  const sync = useQuery({ queryKey: ["sync-status"], queryFn: () => syncFn({ data: undefined }) });
  const config = useQuery({
    queryKey: ["plaid-config"],
    queryFn: () => configFn({ data: undefined }),
  });

  const [fullName, setFullName] = useState("");
  useEffect(() => {
    if (profile.data?.profile?.full_name) setFullName(profile.data.profile.full_name as string);
  }, [profile.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateFn({ data: { fullName } }),
    onSuccess: () => {
      toast.success("Profile saved");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="space-y-6">
      <div className="surface max-w-xl space-y-4 p-5">
        <h2 className="text-sm font-semibold">Profile</h2>
        <div>
          <label className="text-xs text-muted-foreground">Email</label>
          <Input value={(profile.data?.profile?.email as string) ?? ""} disabled />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Full name</label>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
          Save profile
        </Button>
      </div>

      <div className="surface max-w-xl space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" /> Security
        </h2>
        <p className="text-sm text-muted-foreground">
          Bank credentials are never stored. Provider access tokens are encrypted with AES-256-GCM
          before being written to the database, and every query is scoped to your account by
          row-level security.
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline">Environment: {config.data?.environment ?? "—"}</Badge>
          <Badge variant={config.data?.configured ? "secondary" : "destructive"}>
            {config.data?.configured
              ? "Bank connection configured"
              : "Bank connection not configured"}
          </Badge>
          <Badge variant="outline">{sync.data?.transactionCount ?? 0} transactions stored</Badge>
        </div>
        <Button variant="outline" onClick={handleSignOut}>
          Sign out
        </Button>
      </div>

      <div className="surface overflow-x-auto">
        <h2 className="p-5 pb-0 text-sm font-semibold">Recent sync activity</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Added</TableHead>
              <TableHead className="text-right">Modified</TableHead>
              <TableHead className="text-right">Removed</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(sync.data?.logs ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  No syncs recorded yet.
                </TableCell>
              </TableRow>
            )}
            {(sync.data?.logs ?? []).map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">
                  {formatDate(l.sync_started_at)} · {relativeTime(l.sync_started_at)}
                </TableCell>
                <TableCell className="capitalize">{l.trigger_source ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={l.status === "success" ? "secondary" : "destructive"}>
                    {l.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.transactions_added}</TableCell>
                <TableCell className="text-right tabular-nums">{l.transactions_modified}</TableCell>
                <TableCell className="text-right tabular-nums">{l.transactions_removed}</TableCell>
                <TableCell className="max-w-60 truncate text-xs text-muted-foreground">
                  {l.error_message ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
