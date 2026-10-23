import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { auth } from "@/api/auth";
import { AppShell } from "@/components/app-shell";
import { SessionKeepAlive } from "@/components/session-keepalive";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    if (!auth.hasSession()) throw redirect({ to: "/auth" });
    // Validates the stored tokens (refreshing them when needed). Network failures do not sign the user out.
    const user = await auth.getUser();
    if (!user) throw redirect({ to: "/auth" });
    return { user };
  },
  component: () => (
    <AppShell>
      <SessionKeepAlive />
      <Outlet />
    </AppShell>
  ),
});
