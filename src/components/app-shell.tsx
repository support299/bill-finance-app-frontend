import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Building2,
  FileBarChart,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings,
  Table2,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { ConnectBankButton } from "@/components/connect-bank-button";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { auth } from "@/api/auth";
import { getProfileFn, listNotificationsFn, markNotificationsReadFn } from "@/api/app";
import { relativeTime } from "@/lib/format";
import { syncTransactionsFn } from "@/api/plaid";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/ledgers", label: "Ledgers", icon: BookOpen },
  { to: "/transactions", label: "Bank Transactions", icon: Table2 },
  { to: "/accounts", label: "Bank Accounts", icon: Building2 },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavLinks({
  onNavigate,
  orientation = "horizontal",
}: {
  onNavigate?: () => void;
  orientation?: "horizontal" | "vertical";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav
      className={cn(
        "flex gap-1",
        orientation === "horizontal" ? "flex-row items-center" : "flex-col",
      )}
    >
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/70 hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  // Embedded via a subaccount link (?id=...): hide the account menu (profile/sign out).
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    setEmbedded(
      new URLSearchParams(window.location.search).has("id") ||
        sessionStorage.getItem("ghl-embed") === "1",
    );
  }, []);

  const profile = getProfileFn;
  const notifications = listNotificationsFn;
  const markRead = markNotificationsReadFn;
  const sync = syncTransactionsFn;

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => profile({ data: undefined }),
  });
  const notifQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notifications({ data: undefined }),
    refetchInterval: 60_000,
  });

  const syncMutation = useMutation({
    mutationFn: () => sync({ data: {} }),
    onSuccess: (res) => {
      if (res.synced === 0 && res.skipped > 0)
        toast.info("Recently synced — try again in a minute.");
      else
        toast.success(
          `Sync complete · ${res.added} added, ${res.modified} updated, ${res.removed} removed`,
        );
      queryClient.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unread = (notifQuery.data?.notifications ?? []).filter((n) => !n.read).length;
  const lastSync = (notifQuery.data?.notifications ?? [])[0]?.created_at as string | undefined;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="no-print sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="xl:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-4">
              <div className="mt-8" onClick={() => setOpen(false)}>
                <NavLinks orientation="vertical" />
                <div className="mt-6">
                  <ConnectBankButton className="w-full" />
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Link to="/dashboard" className="flex items-center gap-2 font-display text-lg font-bold">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              i
            </span>
            <span className="hidden sm:inline">ImaxAccounting</span>
          </Link>

          <div className="ml-4 hidden xl:block">
            <NavLinks />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden xl:block">
              <ConnectBankButton />
            </div>
            <span className="hidden text-xs text-muted-foreground lg:inline">
              {syncMutation.isPending ? "Syncing…" : `Last activity ${relativeTime(lastSync)}`}
            </span>

            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              <RefreshCw className={cn("size-4", syncMutation.isPending && "animate-spin")} />
              Sync now
            </Button>

            <DropdownMenu
              onOpenChange={(o) =>
                o && unread > 0 && markRead({ data: undefined }).then(() => notifQuery.refetch())
              }
            >
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell className="size-5" />
                  {unread > 0 && (
                    <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground">
                      {unread}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {(notifQuery.data?.notifications ?? []).length === 0 && (
                  <div className="px-2 py-4 text-center text-sm text-muted-foreground">
                    Nothing yet.
                  </div>
                )}
                {(notifQuery.data?.notifications ?? []).slice(0, 8).map((n) => (
                  <div key={n.id} className="border-b border-border px-2 py-2 last:border-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.message}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {!embedded && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="grid size-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {(
                        profileQuery.data?.profile?.full_name ??
                        profileQuery.data?.profile?.email ??
                        "U"
                      )
                        .toString()
                        .charAt(0)
                        .toUpperCase()}
                    </span>
                    <span className="hidden max-w-32 truncate sm:inline">
                      {profileQuery.data?.profile?.full_name ??
                        profileQuery.data?.profile?.email ??
                        "Account"}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to="/settings">Profile & settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </header>

      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
